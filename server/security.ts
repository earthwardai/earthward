import { BlockList, isIP } from "node:net";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { config } from "./config";

// --- Client identity --------------------------------------------------------

/**
 * Client IP as seen by the closest trusted proxy. Google's front end appends the
 * real address to X-Forwarded-For, so anything to the left of the trusted hops
 * can be forged by the client and is ignored.
 */
/**
 * Cloudflare's published edge ranges (https://www.cloudflare.com/ips/). Checked 2026-11-16; they
 * change rarely. Only these addresses may tell us who the visitor is.
 */
const CLOUDFLARE = new BlockList();
for (const cidr of [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
]) {
  const [net, bits] = cidr.split("/");
  CLOUDFLARE.addSubnet(net, Number(bits), net.includes(":") ? "ipv6" : "ipv4");
}
const fromCloudflare = (ip: string) => {
  const kind = isIP(ip);
  return kind !== 0 && CLOUDFLARE.check(ip, kind === 6 ? "ipv6" : "ipv4");
};

let sawCloudflare = false;

export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  let peer: string | undefined;
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    peer = parts[parts.length - config.proxyHops] ?? parts[0];
  }
  if (!peer) {
    const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
    peer = incoming?.socket?.remoteAddress?.replace(/^::ffff:/, "") ?? "0.0.0.0";
  }
  // Behind Cloudflare, Google's front end sees a Cloudflare address and Cloudflare names the visitor
  // in CF-Connecting-IP (a header its customers can't set). Requests that go around Cloudflare
  // arrive from some other address, so their CF-Connecting-IP is ignored.
  if (fromCloudflare(peer)) {
    const visitor = c.req.header("cf-connecting-ip")?.trim();
    if (visitor && isIP(visitor)) {
      if (!sawCloudflare) {
        sawCloudflare = true;
        console.log(JSON.stringify({ severity: "INFO", message: "client address: first request through Cloudflare on this instance" }));
      }
      return visitor;
    }
  }
  return peer;
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
  nominations: new DailyCap(200),
  apiKeys: new DailyCap(100),
  groups: new DailyCap(300),
  groupPledges: new DailyCap(5_000),
  /** Each session is six model calls. */
  groupConvenes: new DailyCap(100),
  notify: new DailyCap(2_000),
  /** Sign-in links sent per instance per day. */
  logins: new DailyCap(500),
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
  nominate: new RateLimiter(3, 60 * 60_000),
  apiKey: new RateLimiter(3, 24 * 60 * 60_000),
  groupCreate: new RateLimiter(5, 60 * 60_000),
  groupPledge: new RateLimiter(120, 60 * 60_000), // a whole class often shares one school IP
  groupConvene: new RateLimiter(10, 60 * 60_000),
  notify: new RateLimiter(10, 60 * 60_000),
  login: new RateLimiter(6, 60 * 60_000),
  /** Per email address, so the form can't be used to flood someone's inbox. */
  loginEmail: new RateLimiter(3, 60 * 60_000),
  lead: new RateLimiter(3, 60 * 60_000),
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
