import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { OAuth2Client } from "google-auth-library";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { AGENTS, AGENT_IDS } from "../shared/agents";
import { CAUSES } from "../shared/causes";
import { dayKey, nextSessionAt, sessionDay } from "../shared/council";
import { computeImpact } from "../shared/impact";
import type { ImpactResponse, PublicDonation, StateResponse, TrackBatch } from "../shared/types";
import { config } from "./config";
import { AskUnavailableError, askCouncil } from "./ask";
import { runCouncil } from "./council";
import { councilImage, impactImage } from "./og";
import { centroidOf, countryOf } from "./geo";
import { clearInsights, getInsights } from "./insights";
import { feedXml, injectPage, llmsTxt, pingIndexNow, renderRoute, type RenderedPage } from "./seo";
import {
  cleanText,
  clientIp,
  dailyCaps,
  hashId,
  hashIp,
  isAdminIp,
  issueAdminToken,
  limiters,
  safeEqual,
  securityHeaders,
  stripLinks,
  verifyAdminToken,
} from "./security";
import { QuotaExceededError, type DonationRecord, type SecurityEvent, type Store } from "./store/types";

const startedAt = new Date().toISOString();

const toPublic = (d: DonationRecord): PublicDonation => ({
  id: d.id,
  amount: d.amount,
  name: d.name,
  message: d.message,
  agentId: d.agentId,
  country: d.country,
  location: d.location,
  at: d.at,
  seq: d.seq,
});

const DonationSchema = z.object({
  amount: z.number().int().min(config.limits.minDonation).max(config.limits.maxDonation),
  name: z.string().max(80).optional(),
  message: z.string().max(400).optional(),
  agentId: z.enum(AGENT_IDS as [string, ...string[]]).nullable().optional(),
  website: z.string().max(200).optional(),
  elapsed: z.number().int().min(0).max(86_400_000),
});

const ContactSchema = z.object({
  kind: z.enum(["suggestion", "question", "feedback", "bug", "partnership"]).optional(),
  page: z.string().max(200).optional(),
  name: z.string().max(80).optional(),
  email: z.string().max(160).optional(),
  message: z.string().min(1).max(4000),
  website: z.string().max(200).optional(),
  elapsed: z.number().int().min(0).max(86_400_000),
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const TrackSchema = z.object({
  vid: z.string().min(8).max(64),
  sid: z.string().min(8).max(64),
  events: z
    .array(
      z.object({
        t: z.enum(["view", "click", "scroll", "leave"]),
        p: z.string().max(200),
        at: z.number(),
        target: z.string().max(80).optional(),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        depth: z.number().min(0).max(100).optional(),
        ms: z.number().min(0).max(86_400_000).optional(),
        ref: z.string().max(300).optional(),
        utm: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(60),
  screen: z.object({ w: z.number().int().min(0).max(20000), h: z.number().int().min(0).max(20000) }).optional(),
  tz: z.string().max(64).optional(),
  lang: z.string().max(35).optional(),
  wd: z.boolean().optional(),
});

const BOT_UA = /HeadlessChrome|bot\b|bot\/|crawl|spider|slurp|preview|lighthouse|python|curl|wget|go-http|okhttp|axios|node-fetch|phantom|puppeteer|playwright/i;

const oauth = new OAuth2Client();

export function createApp(store: Store) {
  const app = new Hono();
  let stateCache: { at: number; body: StateResponse } | null = null;

  // Star count for the Star on GitHub button. Unauthenticated API calls are limited to 60 an hour,
  // so the count is refreshed at most every 15 minutes and a failure keeps the last known value.
  let stars: { at: number; count: number | null; forks?: number; issues?: number } = { at: 0, count: null };
  const githubStars = async (): Promise<number | null> => {
    if (!config.githubRepo || process.env.VITEST) return stars.count;
    if (Date.now() - stars.at < 15 * 60_000) return stars.count;
    stars = { ...stars, at: Date.now() };
    try {
      const res = await fetch(`https://api.github.com/repos/${config.githubRepo}`, {
        headers: { accept: "application/vnd.github+json", "user-agent": "earthwardai.com" },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const r = (await res.json()) as { stargazers_count?: number; forks_count?: number; open_issues_count?: number };
        stars = { at: Date.now(), count: Number(r.stargazers_count ?? 0), forks: r.forks_count, issues: r.open_issues_count };
      }
    } catch {
      /* keep the last known count */
    }
    return stars.count;
  };
  const pageCache = new Map<string, { at: number; page: RenderedPage | null }>();
  const STATE_TTL_MS = 8_000;

  const security = (c: Context, kind: SecurityEvent["kind"], detail?: string) => {
    // A flood of blocked requests must not turn into a flood of database writes.
    if (!dailyCaps.securityLog.take()) return;
    const ip = clientIp(c);
    store
      .recordSecurity({ at: new Date().toISOString(), kind, ip, ipHash: hashIp(ip), path: c.req.path, detail })
      .catch((err) => console.error("security log failed", err));
  };

  app.use("*", securityHeaders);

  // One canonical host: www and the raw Cloud Run address redirect permanently to the main
  // domain, so search engines consolidate every signal on it. Cloud Scheduler still calls
  // /internal/ on the run.app address, and health checks may use it too.
  app.use("*", async (c, next) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    const alias = host.startsWith("www.") || (host.endsWith(".run.app") && !c.req.path.startsWith("/internal/") && c.req.path !== "/api/health");
    if (alias && (c.req.method === "GET" || c.req.method === "HEAD")) {
      const url = new URL(c.req.url);
      return c.redirect(`${config.siteUrl}${url.pathname}${url.search}`, 301);
    }
    await next();
  });

  app.use("/api/*", async (c, next) => {
    // Crawlers may fetch the API to render pages, but the JSON itself should never be indexed.
    c.header("X-Robots-Tag", "noindex");
    const ip = clientIp(c);
    if (!limiters.api.take(hashIp(ip))) {
      security(c, "rate_limited", "api");
      c.header("Retry-After", String(limiters.api.retryAfter(hashIp(ip))));
      return c.json({ error: "Too many requests. Wait a minute and try again." }, 429);
    }
    await next();
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  });

  app.use("/api/*", bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ error: "Request body is too large." }, 413) }));

  // --- Public API -----------------------------------------------------------

  app.get("/api/health", (c) => c.json({ status: "ok", version: config.version, startedAt }));

  app.get("/api/state", async (c) => {
    if (!stateCache || Date.now() - stateCache.at > STATE_TTL_MS) {
      const now = new Date();
      const today = dayKey(now, config.timeZone);
      const [treasury, summary, recent, sessions, head, sessionCount, [todayStats]] = await Promise.all([
        store.getTreasury(),
        store.getDaySummary(today),
        store.listDonations(24),
        store.listSessions(1),
        store.getHead(),
        store.countSessions(),
        store.getStats([today]),
      ]);
      const latest = sessions[0] ?? null;
      // A session decides on the day that just ended. If today's already happened
      // (run early by an admin), the next real one is a day later.
      let next = nextSessionAt(now, config.timeZone);
      if (latest?.day === today) next = new Date(next.getTime() + 86_400_000);
      const body: StateResponse = {
        treasury,
        today: { day: today, donations: summary.donations, credits: summary.credits, asks: todayStats?.asks ?? 0 },
        nextSessionAt: next.toISOString(),
        timeZone: config.timeZone,
        agents: AGENTS.map((a) => {
          const p = latest?.proposals.find((x) => x.agentId === a.id);
          const top = p ? (Object.entries(p.shares).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0]?.[0] ?? null) : null;
          return {
            id: a.id,
            endorsementsToday: summary.endorsements[a.id] ?? 0,
            lastQuote: p?.quote ?? null,
            lastTopCause: (top as StateResponse["agents"][number]["lastTopCause"]) ?? null,
          };
        }),
        recent: recent.map(toPublic),
        latestSession: latest,
        head,
        stats: { sessions: sessionCount, countries: Object.keys(treasury.countries ?? {}).length },
        links: {
          support: config.supportUrl,
          github: config.githubRepo ? { url: `https://github.com/${config.githubRepo}`, stars: await githubStars() } : null,
        },
        health: { status: "ok", version: config.version, startedAt, lastSessionAt: latest?.at ?? null },
      };
      stateCache = { at: Date.now(), body };
    }
    c.header("Cache-Control", "public, max-age=5, s-maxage=5");
    return c.json(stateCache.body);
  });

  /** The visitor's own country, used to start the scroll story where they are. Country level only. */
  app.get("/api/me", (c) => {
    const country = countryOf(clientIp(c));
    return c.json({ country, location: centroidOf(country) });
  });

  app.get("/api/ledger", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 200);
    const beforeRaw = c.req.query("before");
    const before = beforeRaw === undefined ? undefined : Number(beforeRaw);
    if (before !== undefined && (!Number.isInteger(before) || before < 0)) return c.json({ error: "before must be a sequence number." }, 400);
    const entries = await store.listLedger(limit, before);
    const last = entries.at(-1);
    return c.json({ entries, nextBefore: last && last.seq > 0 && entries.length === limit ? last.seq : null });
  });

  app.get("/api/sessions", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 14), 1), 60);
    return c.json({ sessions: await store.listSessions(limit) });
  });

  app.get("/api/sessions/:day", async (c) => {
    const day = c.req.param("day");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.json({ error: "Use a date like 2026-11-12." }, 400);
    const session = await store.getSession(day);
    return session ? c.json({ session }) : c.json({ error: "No council session on that date." }, 404);
  });

  app.post("/api/donations", async (c) => {
    const ip = clientIp(c);
    const ipHash = hashIp(ip);
    if (!limiters.donateBurst.take(ipHash) || !limiters.donateHour.take(ipHash)) {
      security(c, "rate_limited", "donate");
      return c.json({ error: "You're donating faster than the council allows. Try again in a few minutes." }, 429);
    }
    const parsed = DonationSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      security(c, "bad_input", "donate");
      return c.json({ error: `Enter a whole number of credits between ${config.limits.minDonation} and ${config.limits.maxDonation}.` }, 400);
    }
    const body = parsed.data;
    if (body.website) {
      security(c, "honeypot");
      return c.json({ error: "This request was rejected." }, 400);
    }
    if (body.elapsed < 1200) {
      security(c, "too_fast", String(body.elapsed));
      return c.json({ error: "That was quicker than a person can fill the form. Try again." }, 400);
    }
    if (!dailyCaps.donations.take()) {
      return c.json({ error: "The council has taken all the donations it can for today. Please come back tomorrow." }, 503);
    }
    const country = countryOf(ip);
    const vid = cleanText(c.req.header("x-ew-vid"), 64);
    try {
      const { donation, entry } = await store.donate(
        {
          amount: body.amount,
          name: stripLinks(cleanText(body.name, 32)),
          message: stripLinks(cleanText(body.message, 140)),
          agentId: (body.agentId ?? null) as DonationRecord["agentId"],
          country,
          location: centroidOf(country),
          day: dayKey(new Date(), config.timeZone),
          ipHash,
          vid,
        },
        config.limits.donationsPerIpPerDay,
      );
      stateCache = null;
      return c.json({ donation: toPublic(donation), entry }, 201);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        security(c, "quota");
        return c.json({ error: `Each visitor can donate ${config.limits.donationsPerIpPerDay} times a day. Come back after the council meets.` }, 429);
      }
      throw err;
    }
  });

  app.post("/api/contact", async (c) => {
    const ip = clientIp(c);
    const ipHash = hashIp(ip);
    if (!limiters.contact.take(ipHash)) {
      security(c, "rate_limited", "contact");
      return c.json({ error: "You've sent a few messages already. Try again in an hour." }, 429);
    }
    const parsed = ContactSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Write a message before sending." }, 400);
    const body = parsed.data;
    if (body.website) {
      security(c, "honeypot", "contact");
      return c.json({ error: "This request was rejected." }, 400);
    }
    if (body.elapsed < 2000) {
      security(c, "too_fast", "contact");
      return c.json({ error: "That was quicker than a person can type. Try again." }, 400);
    }
    const email = cleanText(body.email, 160);
    if (email && !EMAIL.test(email)) return c.json({ error: "That email address doesn't look right." }, 400);
    const message = cleanText(body.message, 4000);
    if (!message || message.length < 10) return c.json({ error: "Write at least a sentence so we can reply." }, 400);
    if (!dailyCaps.contact.take()) return c.json({ error: "We've had a lot of messages today. Please write again tomorrow, or email ved@earthwardai.com." }, 503);
    await store.addMessage({
      at: new Date().toISOString(),
      kind: body.kind ?? "feedback",
      page: cleanText(body.page, 200),
      name: cleanText(body.name, 80),
      email,
      message,
      ip,
      ipHash,
      country: countryOf(ip),
      ua: (c.req.header("user-agent") ?? "").slice(0, 300),
    });
    return c.json({ sent: true }, 201);
  });

  // --- Ask the council -------------------------------------------------------

  const AskSchema = z.object({ question: z.string().trim().min(8).max(300) });

  app.post("/api/ask", async (c) => {
    const ip = clientIp(c);
    if (!limiters.ask.take(hashIp(ip))) {
      security(c, "rate_limited", "ask");
      return c.json({ error: "You've asked the council a few questions already. Try again in an hour." }, 429);
    }
    const parsed = AskSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Ask a question between 8 and 300 characters." }, 400);
    const question = stripLinks(cleanText(parsed.data.question, 300));
    if (!question || question.length < 8) return c.json({ error: "Ask a question between 8 and 300 characters." }, 400);
    if (!dailyCaps.ask.take()) return c.json({ error: "The council has answered all the questions it can for today. Come back tomorrow." }, 503);
    try {
      const answer = await askCouncil(question);
      store.bumpStats(dayKey(new Date(), config.timeZone), { asks: 1 }).catch(() => undefined);
      return c.json(answer);
    } catch (err) {
      if (err instanceof AskUnavailableError) return c.json({ error: "The council isn't taking questions right now." }, 503);
      console.error("ask failed", err);
      return c.json({ error: "The council couldn't agree on an answer. Try asking again in a moment." }, 502);
    }
  });

  // --- Share images ----------------------------------------------------------

  const ogCache = new Map<string, Buffer>();
  const png = (c: Context, buf: Buffer, maxAge: number) => {
    c.header("Content-Type", "image/png");
    c.header("Cache-Control", `public, max-age=${maxAge}`);
    return c.body(new Uint8Array(buf));
  };
  const remember = (key: string, buf: Buffer) => {
    if (ogCache.size >= 300) ogCache.delete(ogCache.keys().next().value as string);
    ogCache.set(key, buf);
    return buf;
  };

  app.get("/og/council/:file", async (c) => {
    const day = c.req.param("file").replace(/\.png$/, "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return c.text("Not found", 404);
    const key = `council:${day}`;
    const hit = ogCache.get(key);
    if (hit) return png(c, hit, 86_400);
    const session = await store.getSession(day);
    if (!session) return c.text("Not found", 404);
    if (!dailyCaps.og.take()) return c.redirect("/brand/og.jpg", 302);
    return png(c, remember(key, await councilImage(session)), 86_400);
  });

  app.get("/og/impact/:file", async (c) => {
    const id = c.req.param("file").replace(/\.png$/, "");
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return c.text("Not found", 404);
    const donation = await store.getDonation(id);
    if (!donation) return c.text("Not found", 404);
    const session = await store.getSession(donation.day);
    if (!session) return c.redirect("/brand/og.jpg", 302);
    const key = `impact:${id}`;
    const hit = ogCache.get(key);
    if (hit) return png(c, hit, 86_400);
    if (!dailyCaps.og.take()) return c.redirect("/brand/og.jpg", 302);
    const { items } = computeImpact(donation.amount, session);
    return png(c, remember(key, await impactImage(donation.amount, items)), 86_400);
  });

  // --- A donor's receipt: where their credits went ---------------------------

  app.get("/api/donations/:id/impact", async (c) => {
    const id = c.req.param("id");
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return c.json({ error: "Not found" }, 404);
    const donation = await store.getDonation(id);
    if (!donation) return c.json({ error: "Not found" }, 404);
    const session = await store.getSession(donation.day);
    c.header("Cache-Control", "public, max-age=60");
    if (!session) {
      // Not decided yet: the donation is counted at the next session.
      return c.json({ status: "pending", donation: toPublic(donation), nextSessionAt: nextSessionAt(new Date(), config.timeZone).toISOString() } satisfies ImpactResponse);
    }
    const impact = computeImpact(donation.amount, session);
    return c.json({
      status: "allocated",
      donation: toPublic(donation),
      session: { day: session.day, title: session.title, pool: session.pool, spent: session.spent },
      ...impact,
    } satisfies ImpactResponse);
  });

  app.get("/sitemap.xml", async (c) => {
    const sessions = await store.listSessions(60);
    const today = new Date().toISOString().slice(0, 10);
    const latest = sessions[0]?.at.slice(0, 10) ?? today;
    const urls: [string, string][] = [
      ["/", latest],
      ["/earth-ai", latest],
      ["/global-ai-council", latest],
      ["/ask", today],
      ["/how-it-works", today],
      ["/ledger", latest],
      ["/about", today],
      ...AGENTS.map((a): [string, string] => [`/agents/${a.id}`, latest]),
      ...CAUSES.map((c): [string, string] => [`/causes/${c.id}`, latest]),
      ["/contact", today],
      ["/privacy", today],
      ["/terms", today],
      ...sessions.map((s): [string, string] => [`/council/${s.day}`, s.at.slice(0, 10)]),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(([u, d]) => `  <url><loc>${config.siteUrl}${u}</loc><lastmod>${d}</lastmod></url>`)
      .join("\n")}\n</urlset>\n`;
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(body, 200, { "content-type": "application/xml; charset=utf-8" });
  });

  app.get("/api/insights", async (c) => {
    c.header("Cache-Control", "public, max-age=300, s-maxage=300");
    return c.json(await getInsights(store));
  });

  app.get("/llms.txt", async (c) => {
    c.header("Cache-Control", "public, max-age=3600");
    return c.text(await llmsTxt(store));
  });

  app.get("/feed.xml", async (c) => {
    c.header("Cache-Control", "public, max-age=1800");
    return c.body(await feedXml(store), 200, { "content-type": "application/rss+xml; charset=utf-8" });
  });

  if (config.indexNowKey) app.get(`/${config.indexNowKey}.txt`, (c) => c.text(config.indexNowKey));

  app.post("/api/t", async (c) => {
    const ip = clientIp(c);
    const ipHash = hashIp(ip);
    if (!limiters.track.take(ipHash)) return c.body(null, 204);
    let raw: unknown;
    try {
      raw = JSON.parse(await c.req.text());
    } catch {
      return c.body(null, 204);
    }
    const parsed = TrackSchema.safeParse(raw);
    if (!parsed.success) return c.body(null, 204);
    const batch = parsed.data as TrackBatch;
    // Analytics are best-effort: past the daily ceiling, accept and drop.
    if (!dailyCaps.analytics.take()) return c.body(null, 204);
    const now = new Date();
    const host = new URL(c.req.url).host;
    const ua = c.req.header("user-agent") ?? "";
    const human = !batch.wd && !BOT_UA.test(ua) && batch.tz !== "Etc/Unknown";
    const inc = { human, views: 0, clicks: 0, paths: {} as Record<string, number>, targets: {} as Record<string, number>, referrers: {} as Record<string, number>, campaigns: {} as Record<string, number>, country: countryOf(ip) };
    for (const e of batch.events) {
      if (e.t === "view") {
        inc.views += 1;
        if (e.utm) {
          const q = new URLSearchParams(e.utm);
          const key = `${q.get("source") ?? "unknown"}:${q.get("campaign") ?? "none"}`.slice(0, 60);
          inc.campaigns[key] = (inc.campaigns[key] ?? 0) + 1;
        }
        inc.paths[e.p] = (inc.paths[e.p] ?? 0) + 1;
        if (e.ref) {
          try {
            const refHost = new URL(e.ref).host;
            if (refHost && refHost !== host) inc.referrers[refHost] = (inc.referrers[refHost] ?? 0) + 1;
          } catch {
            /* not a URL */
          }
        }
      } else if (e.t === "click" && e.target) {
        inc.clicks += 1;
        inc.targets[e.target] = (inc.targets[e.target] ?? 0) + 1;
      }
    }
    await store.recordAnalytics(
      {
        at: now.toISOString(),
        ip,
        ipHash,
        country: inc.country,
        ua: ua.slice(0, 300),
        vid: batch.vid,
        sid: batch.sid,
        events: batch.events,
        screen: batch.screen ?? null,
        tz: batch.tz ?? null,
        lang: batch.lang ?? null,
      },
      inc,
      dayKey(now, config.timeZone),
      hashId(batch.vid),
    );
    return c.body(null, 204);
  });

  // --- Scheduler hook -------------------------------------------------------

  app.post("/internal/council", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !config.schedulerEmail || !config.schedulerAudience) return c.json({ error: "Not found" }, 404);
    try {
      const ticket = await oauth.verifyIdToken({ idToken: token, audience: config.schedulerAudience });
      const p = ticket.getPayload();
      if (!p?.email_verified || p.email !== config.schedulerEmail) throw new Error("unexpected caller");
    } catch {
      security(c, "admin_denied", "scheduler token");
      return c.json({ error: "Not found" }, 404);
    }
    await store.ensureGenesis(config.genesisCredits);
    const result = await runCouncil(store, sessionDay(new Date(), config.timeZone));
    stateCache = null;
    pageCache.clear();
    clearInsights();
    if (result.status === "created") void pingIndexNow(["/", `/council/${result.session.day}`, "/ledger", "/earth-ai", "/global-ai-council"]);
    return c.json(result.status === "created" ? { status: "created", day: result.session.day, spent: result.session.spent } : result);
  });

  // --- Admin (VPN only) -----------------------------------------------------

  const ADMIN_COOKIE = "ew_admin";
  const digest = (s: string) => createHash("sha256").update(s).digest("hex");

  app.use("/api/admin/*", async (c, next) => {
    const ip = clientIp(c);
    if (!isAdminIp(ip)) {
      security(c, "admin_denied");
      return c.json({ error: "Not found" }, 404);
    }
    if (c.req.path === "/api/admin/login" || c.req.path === "/api/admin/whoami") return next();
    if (!verifyAdminToken(getCookie(c, ADMIN_COOKIE), ip)) return c.json({ error: "Sign in with the admin key." }, 401);
    await next();
  });

  app.get("/api/admin/whoami", (c) => {
    const ip = clientIp(c);
    return c.json({ ip, signedIn: verifyAdminToken(getCookie(c, ADMIN_COOKIE), ip) });
  });

  app.post("/api/admin/login", async (c) => {
    const ip = clientIp(c);
    if (!limiters.adminLogin.take(hashIp(ip))) return c.json({ error: "Too many attempts. Wait 15 minutes." }, 429);
    const body = (await c.req.json().catch(() => ({}))) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key : "";
    if (!config.adminKey || !safeEqual(digest(key), digest(config.adminKey))) {
      security(c, "admin_login_failed");
      return c.json({ error: "That key is not right." }, 401);
    }
    setCookie(c, ADMIN_COOKIE, issueAdminToken(ip), { httpOnly: true, secure: true, sameSite: "Strict", path: "/", maxAge: 12 * 60 * 60 });
    return c.json({ signedIn: true });
  });

  app.post("/api/admin/logout", (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: "/", secure: true });
    return c.json({ signedIn: false });
  });

  app.get("/api/admin/overview", async (c) => {
    const now = Date.now();
    const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(now - i * 86_400_000), config.timeZone)).reverse();
    const [stats, visits, donations, securityEvents, treasury, sessions, messages] = await Promise.all([
      store.getStats(days),
      store.listAnalytics(300),
      store.listDonations(60),
      store.listSecurity(100),
      store.getTreasury(),
      store.listSessions(7),
      store.listMessages(50),
    ]);
    await githubStars();
    const github = config.githubRepo ? { repo: config.githubRepo, stars: stars.count, forks: stars.forks ?? null, issues: stars.issues ?? null } : null;
    return c.json({ stats, visits, donations, security: securityEvents, treasury, sessions, messages, github, timeZone: config.timeZone });
  });

  app.post("/api/admin/council", async (c) => {
    await store.ensureGenesis(config.genesisCredits);
    const day = dayKey(new Date(), config.timeZone);
    const result = await runCouncil(store, day);
    stateCache = null;
    pageCache.clear();
    clearInsights();
    if (result.status === "created") void pingIndexNow(["/", `/council/${result.session.day}`, "/ledger", "/earth-ai", "/global-ai-council"]);
    return c.json(result);
  });

  // --- Web app --------------------------------------------------------------

  app.use("/admin", async (c, next) => (isAdminIp(clientIp(c)) ? next() : c.text("Not found", 404)));
  app.use("/admin/*", async (c, next) => (isAdminIp(clientIp(c)) ? next() : c.text("Not found", 404)));

  app.use(
    "/assets/*",
    serveStatic({
      root: config.staticDir,
      onFound: (_p, c) => {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  // Only real files (with an extension) come from disk; every other path gets the app shell.
  const files = serveStatic({ root: config.staticDir });
  app.use("*", (c, next) => (/\.[a-z0-9]{2,5}$/i.test(c.req.path) ? files(c, next) : next()));

  let indexHtml: string | null = null;
  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/") || c.req.path.startsWith("/internal/")) return c.json({ error: "Not found" }, 404);
    if (!indexHtml || !config.production) indexHtml = await readFile(join(config.staticDir, "index.html"), "utf8").catch(() => null);
    if (!indexHtml) return c.text("Web build missing. Run npm run build:web.", 500);
    c.header("Cache-Control", "no-cache");
    // Readable HTML for crawlers, cached briefly so bots don't multiply database reads.
    const path = c.req.path.replace(/\/+$/, "") || "/";
    let cached = pageCache.get(path);
    if (!cached || Date.now() - cached.at > 60_000) {
      const page = await renderRoute(store, path);
      cached = { at: Date.now(), page };
      if (pageCache.size > 500) pageCache.clear();
      pageCache.set(path, cached);
    }
    if (!cached.page) return c.html(indexHtml, path === "/admin" ? 200 : 404);
    return c.html(injectPage(indexHtml, cached.page), cached.page.status as 200 | 404);
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Something went wrong on our side. Try again shortly." }, 500);
  });

  return app;
}
