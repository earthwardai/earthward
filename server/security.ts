import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { config } from "./config";

// --- Client identity --------------------------------------------------------

/**
 * Client IP as seen by the closest trusted proxy. Google's front end appends the
 * real address to X-Forwarded-For, so anything to the left of the trusted hops
 * can be forged by the client and is ignored.
 */
export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const pick = parts[parts.length - config.proxyHops] ?? parts[0];
    if (pick) return pick;
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress?.replace(/^::ffff:/, "") ?? "0.0.0.0";
}

const derive = (label: string) => createHmac("sha256", config.appSecret).update(label).digest();

const ipKey = derive("ip-hash");
/** Stable pseudonymous id for an IP. The raw IP cannot be recovered from it. */
export const hashIp = (ip: string) => createHmac("sha256", ipKey).update(ip).digest("hex").slice(0, 24);
export const hashId = (id: string) => createHmac("sha256", ipKey).update(`id:${id}`).digest("hex").slice(0, 24);

// --- Rate limiting ----------------------------------------------------------

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter per key, held in memory. Each Cloud Run instance keeps its
 * own counts, so the effective limit is per instance; the instance cap bounds it.
 */
export class RateLimiter {
  private hits = new Map<string, Window>();
  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const w = this.hits.get(key);
    if (!w || w.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 50_000) this.sweep(now);
      return true;
    }
    w.count += 1;
    return w.count <= this.limit;
  }

  retryAfter(key: string, now = Date.now()): number {
    const w = this.hits.get(key);
    return w ? Math.max(1, Math.ceil((w.resetAt - now) / 1000)) : 1;
  }

  private sweep(now: number) {
    for (const [k, w] of this.hits) if (w.resetAt <= now) this.hits.delete(k);
  }
}

/**
 * A hard ceiling on database writes per instance per UTC day. Per-IP limits stop one visitor;
 * this stops a flood from many addresses from running up the bill. With at most three instances,
 * the worst case is three times each limit.
 */
export class DailyCap {
  private day = "";
  private used = 0;
  constructor(readonly limit: number) {}

  take(now = new Date()): boolean {
    const d = now.toISOString().slice(0, 10);
    if (d !== this.day) {
      this.day = d;
      this.used = 0;
    }
    this.used += 1;
    return this.used <= this.limit;
  }
}

export const dailyCaps = {
  analytics: new DailyCap(20_000),
  donations: new DailyCap(5_000),
  contact: new DailyCap(200),
  securityLog: new DailyCap(2_000),
  /** Each question is one model call, so this also bounds the model bill. */
  ask: new DailyCap(300),
  /** Share images rendered from scratch (cache misses). */
  og: new DailyCap(1_500),
  predictions: new DailyCap(10_000),
  argue: new DailyCap(10_000),
};

export const limiters = {
  api: new RateLimiter(240, 60_000),
  donateBurst: new RateLimiter(5, 60_000),
  donateHour: new RateLimiter(20, 60 * 60_000),
  track: new RateLimiter(60, 60_000),
  adminLogin: new RateLimiter(5, 15 * 60_000),
  contact: new RateLimiter(3, 60 * 60_000),
  ask: new RateLimiter(6, 60 * 60_000),
  predict: new RateLimiter(20, 60 * 60_000),
  argue: new RateLimiter(30, 60 * 60_000),
};

// --- Response headers -------------------------------------------------------

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // The globe library rewrites its own <style> tag with a constant ":root{}" (empty for an
  // instant in between); allow exactly those two contents and nothing else.
  "style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-h3GYPBFE6Av6zUWOZYeC83lN95g5tnhsj1pyM3woz/c='",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// The embeddable card is the one page other sites may frame. It has no scripts at all.
const EMBED_CSP = CSP.replace("frame-ancestors 'none'", "frame-ancestors *").replace("script-src 'self'", "script-src 'none'");

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const h = c.res.headers;
  const embeddable = c.req.path === "/embed";
  h.set("Content-Security-Policy", embeddable ? EMBED_CSP : CSP);
  h.set("Strict-Transport-Security", "max-age=31536000");
  h.set("X-Content-Type-Options", "nosniff");
  if (!embeddable) h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  // Badges and share images are fetched by other sites (GitHub, social networks).
  h.set("Cross-Origin-Resource-Policy", embeddable || /^\/(badge\.svg|og\/)/.test(c.req.path) ? "cross-origin" : "same-origin");
  h.delete("X-Powered-By");
};

// --- Admin sessions ---------------------------------------------------------

const sessionKey = derive("admin-session");

/** Token format: <expiry ms>.<hmac>. Bound to the IP it was issued to. */
export function issueAdminToken(ip: string, ttlMs = 12 * 60 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const mac = createHmac("sha256", sessionKey).update(`${exp}:${ip}`).digest("hex");
  return `${exp}.${mac}`;
}

export function verifyAdminToken(token: string | undefined, ip: string): boolean {
  if (!token) return false;
  const [expRaw, mac] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() || !mac) return false;
  const expected = createHmac("sha256", sessionKey).update(`${exp}:${ip}`).digest("hex");
  return safeEqual(mac, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const isAdminIp = (ip: string) => config.adminIps.includes(ip);

// --- Input hygiene ----------------------------------------------------------

/** Removes control characters and collapses whitespace. */
export function cleanText(input: string | undefined, max: number): string | null {
  if (!input) return null;
  const s = input
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return s.length ? s : null;
}

/** Drops links from donor text so the public feed cannot be used for spam. */
export const stripLinks = (s: string | null) =>
  s ? s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "").replace(/\s+/g, " ").trim() || null : null;
