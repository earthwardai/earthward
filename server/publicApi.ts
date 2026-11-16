import { createHash, randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { AGENTS } from "../shared/agents";
import { CAUSES } from "../shared/causes";
import { RULES, dayKey, nextSessionAt } from "../shared/council";
import { AskUnavailableError, askCouncil } from "./ask";
import { config } from "./config";
import { cleanText, clientIp, dailyCaps, hashIp, limiters, stripLinks } from "./security";
import type { Store } from "./store/types";

/**
 * The public developer API, under /api/v1. Reading is open to anyone (CORS *). Asking the
 * council costs a model call, so it needs a free key, which has its own daily quota.
 */

export const API_ASK_QUOTA = 50;
const KEY_PREFIX = "ewk_";
export const keyHash = (key: string) => createHash("sha256").update(key).digest("hex");

const NewKeySchema = z.object({
  name: z.string().trim().min(2).max(60),
  use: z.string().trim().min(10).max(300),
});
const AskSchema = z.object({ question: z.string().trim().min(8).max(300) });

function bearer(c: Context): string | null {
  const h = c.req.header("authorization") ?? "";
  const m = h.match(/^Bearer\s+(ewk_[A-Za-z0-9_-]{20,64})$/);
  return m ? m[1] : null;
}

export function publicApi(store: Store) {
  const v1 = new Hono();

  v1.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Access-Control-Allow-Headers", "authorization, content-type");
    c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.header("Access-Control-Max-Age", "86400");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  const cached = (c: Context, seconds: number) => c.header("Cache-Control", `public, max-age=${seconds}`);

  v1.get("/", (c) => {
    cached(c, 3600);
    return c.json({
      name: "Earthward AI public API",
      docs: `${config.siteUrl}/developers`,
      openapi: `${config.siteUrl}/api/v1/openapi.json`,
      endpoints: ["GET /api/v1/council", "GET /api/v1/state", "GET /api/v1/sessions", "GET /api/v1/sessions/latest", "GET /api/v1/sessions/{day}", "GET /api/v1/ledger", "POST /api/v1/ask", "POST /api/v1/keys"],
    });
  });

  v1.get("/council", (c) => {
    cached(c, 3600);
    return c.json({
      agents: AGENTS.map(({ id, name, mandate, temperament, leanings }) => ({ id, name, mandate, temperament, leanings, url: `${config.siteUrl}/agents/${id}` })),
      causes: CAUSES.map(({ id, name, domain, place, creditsPerUnit, unit, summary }) => ({ id, name, champion: domain, place, creditsPerUnit, unit, summary, url: `${config.siteUrl}/causes/${id}` })),
      rules: RULES,
      schedule: { timeZone: config.timeZone, at: "00:05" },
    });
  });

  v1.get("/state", async (c) => {
    const now = new Date();
    const today = dayKey(now, config.timeZone);
    const [treasury, summary, latest] = await Promise.all([store.getTreasury(), store.getDaySummary(today), store.listSessions(1)]);
    let next = nextSessionAt(now, config.timeZone);
    if (latest[0]?.day === today) next = new Date(next.getTime() + 86_400_000);
    cached(c, 15);
    return c.json({
      treasury: { balance: treasury.balance, totalDonated: treasury.totalDonated, totalAllocated: treasury.totalAllocated, donations: treasury.donations },
      today: { day: today, donations: summary.donations, credits: summary.credits, endorsements: summary.endorsements },
      nextSessionAt: next.toISOString(),
      latestSession: latest[0] ? { day: latest[0].day, title: latest[0].title, url: `${config.siteUrl}/council/${latest[0].day}` } : null,
    });
  });

  v1.get("/sessions", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 30) || 30, 1), 100);
    cached(c, 60);
    return c.json({ sessions: await store.listSessions(limit) });
  });

  v1.get("/sessions/latest", async (c) => {
    const [s] = await store.listSessions(1);
    cached(c, 60);
    return s ? c.json({ session: s, arena: await store.getArena(s.day) }) : c.json({ error: "No sessions yet." }, 404);
  });

  v1.get("/sessions/:day", async (c) => {
    const day = c.req.param("day");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json({ error: "Use a day like 2026-11-16." }, 400);
    const s = await store.getSession(day);
    if (!s) return c.json({ error: "No session that day." }, 404);
    cached(c, 300);
    return c.json({ session: s, arena: await store.getArena(day) });
  });

  v1.get("/ledger", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
    const raw = c.req.query("before");
    const before = raw === undefined ? undefined : Number(raw);
    if (before !== undefined && (!Number.isInteger(before) || before < 0)) return c.json({ error: "before must be a sequence number." }, 400);
    const entries = await store.listLedger(limit, before);
    const last = entries.at(-1);
    cached(c, 15);
    return c.json({ entries, nextBefore: last && last.seq > 0 && entries.length === limit ? last.seq : null });
  });

  v1.post("/keys", async (c) => {
    const ipHash = hashIp(clientIp(c));
    if (!limiters.apiKey.take(ipHash)) return c.json({ error: "You've created a few keys already. Try again tomorrow." }, 429);
    const parsed = NewKeySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Give your project a name and tell us in a sentence what you're building." }, 400);
    if (!dailyCaps.apiKeys.take()) return c.json({ error: "We've issued all the keys we can today. Try again tomorrow." }, 503);
    const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
    await store.createApiKey({
      hash: keyHash(key),
      name: stripLinks(cleanText(parsed.data.name, 60)) ?? "",
      use: stripLinks(cleanText(parsed.data.use, 300)) ?? "",
      createdAt: new Date().toISOString(),
      ipHash,
    });
    return c.json({ key, quota: { askPerDay: API_ASK_QUOTA }, note: "Store this key now. We only keep a hash of it, so it can't be shown again." }, 201);
  });

  v1.post("/ask", async (c) => {
    const key = bearer(c);
    if (!key) return c.json({ error: `Asking needs a free API key. Get one at ${config.siteUrl}/developers and send it as "Authorization: Bearer ewk_...".` }, 401);
    const hash = keyHash(key);
    const rec = await store.getApiKey(hash);
    if (!rec || rec.disabled) return c.json({ error: "That API key isn't valid." }, 401);
    const parsed = AskSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Send {\"question\": \"...\"} with 8 to 300 characters." }, 400);
    const question = stripLinks(cleanText(parsed.data.question, 300));
    if (!question || question.length < 8) return c.json({ error: "Send a question with 8 to 300 characters." }, 400);
    const day = dayKey(new Date(), config.timeZone);
    if (!(await store.useApiKey(hash, day, API_ASK_QUOTA))) {
      return c.json({ error: `This key has used its ${API_ASK_QUOTA} questions for today. The quota resets at midnight India time.` }, 429);
    }
    if (!dailyCaps.ask.take()) return c.json({ error: "The council has answered all the questions it can for today." }, 503);
    try {
      const answer = await askCouncil(question);
      store.bumpStats(day, { asks: 1 }).catch(() => undefined);
      return c.json(answer);
    } catch (err) {
      if (err instanceof AskUnavailableError) return c.json({ error: "The council isn't taking questions right now." }, 503);
      console.error("api ask failed", err);
      return c.json({ error: "The council couldn't agree on an answer. Try again in a moment." }, 502);
    }
  });

  v1.get("/openapi.json", (c) => {
    cached(c, 3600);
    return c.json(openApiSpec());
  });

  return v1;
}

function openApiSpec() {
  const ok = (description: string) => ({ "200": { description, content: { "application/json": {} } } });
  return {
    openapi: "3.1.0",
    info: {
      title: "Earthward AI public API",
      version: "1.0.0",
      description:
        "Read the Earthward AI council's decisions, treasury and ledger, and put questions to its five AI agents. Reading needs no key. Asking needs a free key from https://earthwardai.com/developers.",
      license: { name: "AGPL-3.0", url: "https://github.com/earthwardai/earthward/blob/main/LICENSE" },
    },
    servers: [{ url: `${config.siteUrl}/api/v1` }],
    components: { securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "A key that starts with ewk_" } } },
    paths: {
      "/council": { get: { summary: "The agents, causes and rules", responses: ok("Agents, causes and rules") } },
      "/state": { get: { summary: "Treasury, today's donations and the next session", responses: ok("Live state") } },
      "/sessions": {
        get: {
          summary: "Recent council sessions, newest first",
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } }],
          responses: ok("Sessions"),
        },
      },
      "/sessions/latest": { get: { summary: "The latest session and its model arena", responses: ok("Session") } },
      "/sessions/{day}": {
        get: {
          summary: "One session and its model arena",
          parameters: [{ name: "day", in: "path", required: true, schema: { type: "string", example: "2026-11-15" } }],
          responses: ok("Session"),
        },
      },
      "/ledger": {
        get: {
          summary: "The hash-chained public ledger, newest first",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
            { name: "before", in: "query", schema: { type: "integer" }, description: "Page backwards from this sequence number" },
          ],
          responses: ok("Ledger entries"),
        },
      },
      "/ask": {
        post: {
          summary: "Ask the five agents a question",
          security: [{ apiKey: [] }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["question"], properties: { question: { type: "string", minLength: 8, maxLength: 300 } } } } } },
          responses: ok("Each agent's answer and the council's verdict"),
        },
      },
      "/keys": {
        post: {
          summary: "Create a free API key",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["name", "use"], properties: { name: { type: "string" }, use: { type: "string", description: "What you're building" } } } } },
          },
          responses: { "201": { description: "The key, shown once" } },
        },
      },
    },
  };
}
