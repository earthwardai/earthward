import { describe, expect, it } from "vitest";
import { openAiCompatible, parseJsonReply } from "../server/llm";

const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe("OpenAI-compatible provider", () => {
  it("sends a JSON schema request and parses the reply", async () => {
    const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
      return reply('{"title":"Reefs first"}');
    }) as typeof fetch;
    const llm = openAiCompatible({ baseUrl: "http://localhost:11434/v1/", apiKey: "k", model: "llama3.2", fetchImpl });
    const out = await llm.generateJson<{ title: string }>("system", "prompt", { type: "object" });
    expect(out.title).toBe("Reefs first");
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer k");
    expect(calls[0].body.model).toBe("llama3.2");
    expect((calls[0].body.response_format as { type: string }).type).toBe("json_schema");
  });

  it("falls back to plain JSON mode when the server rejects JSON schema", async () => {
    const formats: (string | undefined)[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      formats.push(body.response_format?.type);
      if (body.response_format?.type === "json_schema") return new Response("response_format not supported", { status: 400 });
      return reply('Sure! ```json\n{"ok":true}\n```');
    }) as typeof fetch;
    const llm = openAiCompatible({ baseUrl: "https://example.test/v1", model: "m", fetchImpl });
    expect(await llm.generateJson<{ ok: boolean }>("s", "p", {})).toEqual({ ok: true });
    // The working format is remembered for the next call.
    await llm.generateJson("s", "p", {});
    expect(formats).toEqual(["json_schema", "json_object", "json_object"]);
  });

  it("does not retry on an auth error", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response("bad key", { status: 401 });
    }) as typeof fetch;
    const llm = openAiCompatible({ baseUrl: "https://example.test/v1", model: "m", fetchImpl });
    await expect(llm.generateJson("s", "p", {})).rejects.toThrow(/401/);
    expect(n).toBe(1);
  });
});

describe("parseJsonReply", () => {
  it("accepts bare JSON, fenced JSON and JSON inside a sentence", () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonReply('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonReply('Here you go: {"a":3} hope that helps')).toEqual({ a: 3 });
    expect(() => parseJsonReply("no json here")).toThrow();
  });
});
