import { createHash, createHmac, randomBytes } from "node:crypto";
import { Hono, type Context as HonoContext } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { config } from "./config";
import { button, emailEnabled, esc, layout, send } from "./notify";
import { cleanText, clientIp, dailyCaps, hashId, hashIp, limiters, safeEqual } from "./security";
import type { AccountRecord, Store } from "./store/types";

/**
 * Sign-in by email link. No passwords: we email a one-time link, the visitor presses a button on the
 * page it opens, and gets a signed session cookie. An account remembers the browsers it signed in on
 * (so predictions follow the person), owns group councils, and manages email updates.
 */

export const ACCOUNT_COOKIE = "ew_acct";
const SESSION_MS = 30 * 24 * 60 * 60_000;
const LINK_MS = 20 * 60_000;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const accountIdFor = (email: string) => sha(email.trim().toLowerCase());
export const ownerHashFor = (token: string) => sha(`group-owner:${token}`);
const sessionKey = () => createHmac("sha256", config.appSecret).update("account-session").digest();

/** <account id>.<expiry ms>.<hmac> */
export function issueSession(accountId: string, now = Date.now()): string {
  const exp = now + SESSION_MS;
  const mac = createHmac("sha256", sessionKey()).update(`${accountId}.${exp}`).digest("base64url");
  return `${accountId}.${exp}.${mac}`;
}

export function readSession(token: string | undefined, now = Date.now()): string | null {
  if (!token || token.length > 200) return null;
  const [id, expRaw, mac] = token.split(".");
  const exp = Number(expRaw);
  if (!id || !/^[a-f0-9]{64}$/.test(id) || !Number.isFinite(exp) || exp < now || !mac) return null;
  const expected = createHmac("sha256", sessionKey()).update(`${id}.${exp}`).digest("base64url");
  return safeEqual(mac, expected) ? id : null;
}

export async function currentAccount(c: HonoContext, store: Store): Promise<AccountRecord | null> {
  const id = readSession(getCookie(c, ACCOUNT_COOKIE));
  return id ? store.getAccount(id) : null;
}

/** Only paths on this site, so the link can't send anyone elsewhere. */
const safeNext = (next: string | undefined | null) => (next && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) && next.length < 200 ? next : null);

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  next: z.string().max(200).optional(),
  website: z.string().max(200).optional(),
});
const TokenSchema = z.object({ t: z.string().regex(/^[A-Za-z0-9_-]{24,64}$/) });
const FrequencySchema = z.object({ frequency: z.enum(["daily", "weekly", "none"]) });
const ClaimSchema = z.object({ councils: z.array(z.object({ id: z.string().max(16), token: z.string().min(20).max(64) })).max(50) });

async function sendSignInLink(email: string, token: string) {
  const link = `${config.siteUrl}/signin?t=${token}`;
  return send({
    to: email,
    subject: "Your Earthward AI sign-in link",
    text: `Use this link to sign in to Earthward AI. It works once, for the next 20 minutes:\n\n${link}\n\nIf you didn't ask for it, ignore this email; nobody can sign in without the link.`,
    html: layout(
      `<p>Use this link to sign in to Earthward AI. It works once, for the next 20 minutes.</p>${button(link, "Sign in")}<p style="color:#6b665c">If you didn't ask for it, ignore this email; nobody can sign in without the link.</p><p style="color:#6b665c;font-size:13px">Or paste this into your browser: ${esc(link)}</p>`,
    ),
  });
}

export function accountApi(store: Store) {
  const api = new Hono();
  const vidHashOf = (c: HonoContext) => {
    const vid = cleanText(c.req.header("x-ew-vid"), 64);
    return vid && vid.length >= 8 ? hashId(vid) : null;
  };
  const setSession = (c: HonoContext, accountId: string) =>
    setCookie(c, ACCOUNT_COOKIE, issueSession(accountId), {
      httpOnly: true,
      secure: config.siteUrl.startsWith("https://"),
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_MS / 1000,
    });

  api.post("/login", async (c) => {
    if (!emailEnabled()) return c.json({ error: "Signing in by email isn't switched on yet." }, 503);
    if (!limiters.login.take(hashIp(clientIp(c)))) return c.json({ error: "Too many sign-in requests from your network. Try again in an hour." }, 429);
    const parsed = LoginSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Enter a valid email address." }, 400);
    if (parsed.data.website) return c.json({ ok: true }); // bots fill the hidden field
    const { email } = parsed.data;
    // Same answer whether or not we sent anything, so the form can't be used to probe or flood an inbox.
    if (!limiters.loginEmail.take(accountIdFor(email)) || !dailyCaps.logins.take()) return c.json({ ok: true });
    const token = randomBytes(24).toString("base64url");
    const now = Date.now();
    await store.saveLoginToken({ id: sha(token), email, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + LINK_MS).toISOString(), used: false, next: safeNext(parsed.data.next) });
    try {
      await sendSignInLink(email, token);
    } catch (err) {
      console.error("sign-in email failed", err);
      return c.json({ error: "We couldn't send the email. Try again in a minute." }, 502);
    }
    return c.json({ ok: true });
  });

  api.post("/verify", async (c) => {
    const parsed = TokenSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "That link isn't complete. Copy the whole link from the email." }, 400);
    const rec = await store.useLoginToken(sha(parsed.data.t));
    if (!rec) return c.json({ error: "That link has expired or was already used. Ask for a new one." }, 400);
    const account = await store.signIn(rec.email, accountIdFor(rec.email), vidHashOf(c));
    setSession(c, account.id);
    return c.json({ ok: true, next: rec.next ?? "/account" });
  });

  api.post("/logout", (c) => {
    deleteCookie(c, ACCOUNT_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  api.get("/me", async (c) => {
    c.header("Cache-Control", "no-store");
    const account = await currentAccount(c, store);
    if (!account) return c.json({ signedIn: false });
    // Remember this browser too, so a prediction made here counts for the person.
    const vh = vidHashOf(c);
    const acct = vh && !account.vidHashes.includes(vh) ? await store.signIn(account.email, account.id, vh) : account;
    const [groups, predictors, subscriber] = await Promise.all([
      store.listGroupsByOwner(acct.id, 50),
      Promise.all(acct.vidHashes.map((h) => store.getPredictor(h).catch(() => null))),
      store.findSubscriberById(acct.id),
    ]);
    const preds = predictors.filter((p) => p !== null);
    return c.json({
      signedIn: true,
      email: acct.email,
      createdAt: acct.createdAt,
      councils: groups.map((g) => ({
        id: g.id,
        name: g.name,
        template: g.template,
        createdAt: g.createdAt,
        sessions: g.sessions.length,
        lastConvenedAt: g.lastConvenedAt,
        backersWaiting: g.pledges.length,
        lastTitle: g.sessions.at(-1)?.title ?? null,
      })),
      predictions: {
        total: preds.reduce((n, p) => n + p.total, 0),
        correct: preds.reduce((n, p) => n + p.correct, 0),
        best: Math.max(0, ...preds.map((p) => p.best)),
        streak: Math.max(0, ...preds.map((p) => p.streak)),
      },
      subscription: subscriber && subscriber.status === "active" ? (subscriber.frequency ?? "weekly") : "none",
    });
  });

  // Signed in means the address is verified, so no confirmation email is needed here.
  api.post("/subscription", async (c) => {
    const account = await currentAccount(c, store);
    if (!account) return c.json({ error: "Sign in first." }, 401);
    const parsed = FrequencySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Pick every night, once a week or none." }, 400);
    const { frequency } = parsed.data;
    if (frequency === "none") {
      await store.deleteSubscriber(account.id);
      return c.json({ ok: true, subscription: "none" });
    }
    const existing = await store.findSubscriberById(account.id);
    if (existing?.status === "active") await store.setSubscriberFrequency(account.id, frequency);
    else {
      await store.deleteSubscriber(account.id);
      await store.upsertSubscriber({
        id: account.id,
        email: account.email,
        status: "active",
        token: randomBytes(18).toString("base64url"),
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
        frequency,
        vidHash: account.vidHashes.at(-1) ?? null,
      });
    }
    return c.json({ ok: true, subscription: frequency });
  });

  /** Moves councils created in this browser (whose owner links it holds) into the account. */
  api.post("/councils/claim", async (c) => {
    const account = await currentAccount(c, store);
    if (!account) return c.json({ error: "Sign in first." }, 401);
    const parsed = ClaimSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Nothing to add." }, 400);
    let claimed = 0;
    for (const { id, token } of parsed.data.councils) {
      const g = await store.getGroup(id);
      if (!g || !safeEqual(ownerHashFor(token), g.ownerHash)) continue;
      if (g.ownerAccountId && g.ownerAccountId !== account.id) continue;
      if (g.ownerAccountId !== account.id) {
        await store.setGroupOwner(id, account.id);
        claimed += 1;
      }
    }
    return c.json({ ok: true, claimed });
  });

  api.post("/delete", async (c) => {
    const account = await currentAccount(c, store);
    if (!account) return c.json({ error: "Sign in first." }, 401);
    await Promise.all([store.deleteAccount(account.id), store.deleteSubscriber(account.id)]);
    deleteCookie(c, ACCOUNT_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  return api;
}
