import { GoogleGenAI } from "@google/genai";
import { config } from "./config";

/**
 * The council talks to a model through this one function, so any provider that can return JSON works.
 *
 * - "vertex": Gemini on Vertex AI (needs GOOGLE_CLOUD_PROJECT and application default credentials).
 * - "openai": any OpenAI-compatible chat completions API: OpenAI, Ollama, LM Studio, OpenRouter,
 *   Groq, Together, vLLM. Set OPENAI_BASE_URL (and OPENAI_API_KEY when the server needs one).
 * - "off": no model; agents use their standing preferences.
 */
export interface Llm {
  provider: "vertex" | "openai";
  model: string;
  generateJson<T>(system: string, prompt: string, schema: object): Promise<T>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries rate limits (429) and overload (503); free tiers and new projects have small quotas. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 5, baseMs = 2000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (i >= attempts || (status !== 429 && status !== 503)) throw err;
      await sleep(baseMs * 2 ** (i - 1) + Math.random() * 500);
    }
  }
}

/** Pulls the JSON object out of a reply, tolerating code fences or a sentence around it. */
export function parseJsonReply<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
    throw new LlmError("model reply was not JSON");
  }
}

export function vertex(model: string): Llm {
  let client: GoogleGenAI | null = null;
  return {
    provider: "vertex",
    model,
    async generateJson<T>(system: string, prompt: string, schema: object) {
      client ??= new GoogleGenAI({ vertexai: true, project: config.project, location: config.vertexLocation });
      const res = await withRetry(() =>
        client!.models.generateContent({
          model,
          contents: prompt,
          config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.8, maxOutputTokens: 4096 },
        }),
      );
      if (!res.text) throw new LlmError("empty model response");
      return parseJsonReply<T>(res.text);
    },
  };
}

type ResponseFormat = "json_schema" | "json_object" | "none";

export function openAiCompatible(opts: { baseUrl: string; apiKey?: string; model: string; fetchImpl?: typeof fetch }): Llm {
  const base = opts.baseUrl.replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;
  // Not every server supports JSON schema output. Step down once and remember what worked.
  let format: ResponseFormat = "json_schema";

  async function call(system: string, prompt: string, schema: object, fmt: ResponseFormat): Promise<string> {
    const body: Record<string, unknown> = {
      model: opts.model,
      temperature: 0.8,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `${prompt}\n\nReply with a single JSON object that matches this JSON schema, and nothing else:\n${JSON.stringify(schema)}` },
      ],
    };
    if (fmt === "json_schema") body.response_format = { type: "json_schema", json_schema: { name: "reply", schema } };
    if (fmt === "json_object") body.response_format = { type: "json_object" };
    const res = await doFetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new LlmError(`${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new LlmError("empty model response");
    return text;
  }

  return {
    provider: "openai",
    model: opts.model,
    async generateJson<T>(system: string, prompt: string, schema: object) {
      for (;;) {
        try {
          const text = await withRetry(() => call(system, prompt, schema, format));
          return parseJsonReply<T>(text);
        } catch (err) {
          const status = (err as LlmError).status;
          if (status === 400 && format !== "none") {
            format = format === "json_schema" ? "json_object" : "none";
            continue;
          }
          throw err;
        }
      }
    },
  };
}

/** The configured model, or null when the council should run on standing preferences only. */
export function createLlm(): Llm | null {
  if (config.llm === "vertex" && config.project) return vertex(config.model);
  if (config.llm === "openai" && config.model) {
    return openAiCompatible({ baseUrl: config.openaiBaseUrl, apiKey: config.openaiApiKey, model: config.model });
  }
  return null;
}
