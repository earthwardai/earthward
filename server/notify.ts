import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import nodemailer from "nodemailer";
import * as webpush from "web-push";
import { z } from "zod";
import { causeById } from "../shared/causes";
import type { Session } from "../shared/types";
import { config } from "./config";
import { winningCauses } from "./predict";
import { cleanText, clientIp, dailyCaps, hashId, hashIp, limiters } from "./security";
import type { PushSubRecord, Store, SubscriberRecord } from "./store/types";

/**
 * Bringing people back: web push after each night ("you called it") and a weekly email digest.
 * Push needs VAPID keys and the digest needs an SMTP password; each is off until configured.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const pushEnabled = () => Boolean(config.vapidPublicKey && config.vapidPrivateKey);
export const digestEnabled = () => Boolean(config.smtp.user && config.smtp.pass);

// Push endpoints come from the browser, and the server later POSTs to them. Only the real push
// services are accepted, so a forged subscription can't point the server at anything else.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function validPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

let vapidReady = false;
function vapid() {
  if (!vapidReady) {
    webpush.setVapidDetails("mailto:ved@earthwardai.com", config.vapidPublicKey, config.vapidPrivateKey);
    vapidReady = true;
  }
}

/** What one subscriber hears after a session. Personal when they predicted that night. */
export function pushMessage(session: Session, predicted: string | null) {
  const winners = winningCauses(session);
  const top = causeById(winners[0] ?? "")?.name ?? "the council";
  const url = `/council/${session.day}?utm_source=push`;
  if (predicted) {
    const right = winners.includes(predicted);
    return {
      title: right ? "You called it" : "Not this time",
      body: right ? `${top} topped last night's split. Keep your streak going tonight.` : `You picked ${causeById(predicted)?.name ?? predicted}. ${top} came out on top. Try again tonight.`,
      url,
      tag: `night-${session.day}`,
    };
  }
  return { title: session.title, body: `Last night the five agents split ${session.spent.toLocaleString("en-US")} credits. ${top} led. Watch the debate.`, url, tag: `night-${session.day}` };
}

/** Sends the night's notification to every subscriber. Returns how many were delivered. */
export async function pushNightly(store: Store, session: Session): Promise<number> {
  if (!pushEnabled()) return 0;
  vapid();
  const subs = await store.listPushSubs(5000);
  let sent = 0;
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(
      subs.slice(i, i + 25).map(async (sub) => {
        const pred = sub.vidHash ? await store.getPrediction(session.day, sub.vidHash).catch(() => null) : null;
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(pushMessage(session, pred?.causeId ?? null)), { TTL: 6 * 3600 });
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await store.deletePushSub(sub.id).catch(() => undefined);
        }
      }),
    );
  }
  return sent;
}

// --- Email -------------------------------------------------------------------

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function mailer() {
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    pool: true,
    maxConnections: 2,
    rateDelta: 1000,
    rateLimit: 5,
  });
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function layout(body: string, unsubscribe?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b17">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 24px;font-size:20px;font-weight:700">Earthward AI</p>
${body}
<p style="margin:32px 0 0;font-size:13px;color:#6b665c">Five AI agents decide every night where donated credits do the most good. Credits are virtual.${
    unsubscribe ? ` <a href="${unsubscribe}" style="color:#6b665c">Unsubscribe</a>.` : ""
  }</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#8c7148;color:#fff;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

async function sendConfirm(sub: SubscriberRecord) {
  const link = `${config.siteUrl}/api/notify/digest/confirm?t=${sub.token}`;
  await mailer().sendMail({
    from: config.smtp.from,
    to: sub.email,
    subject: "Confirm your weekly Earthward AI digest",
    text: `Confirm that you want the weekly digest from the Earthward AI council:\n\n${link}\n\nIf you didn't ask for this, ignore this email and nothing will be sent.`,
    html: layout(`<p>Confirm that you want the weekly digest from the Earthward AI council: what the five agents decided, the closest calls, and who's top of the prediction game.</p>${button(link, "Confirm my subscription")}<p style="color:#6b665c">If you didn't ask for this, ignore this email and nothing will be sent.</p>`),
  });
}

/** The weekly digest, built from the last seven sessions. */
export async function digestContent(store: Store) {
  const [sessions, leaders] = await Promise.all([store.listSessions(7), store.topPredictors(3)]);
  const totals = new Map<string, number>();
  for (const s of sessions) for (const a of s.allocations) totals.set(a.causeId, (totals.get(a.causeId) ?? 0) + a.credits);
  const topCauses = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const u = config.siteUrl;
  const utm = "utm_source=digest&utm_medium=email";
  const nights = sessions.map((s) => `<li style="margin:0 0 8px"><a href="${u}/council/${s.day}?${utm}" style="color:#1d1b17">${esc(s.title)}</a> <span style="color:#6b665c">(${s.day})</span></li>`).join("");
  const causes = topCauses.map(([id, n]) => `<li>${esc(causeById(id)?.name ?? id)}: ${n.toLocaleString("en-US")} credits</li>`).join("");
  const board = leaders.map((p) => `<li>${esc(p.name ?? "Anonymous")}: ${p.correct} of ${p.total} right, best streak ${p.best}</li>`).join("");
  const html = `<h1 style="font-size:24px;margin:0 0 16px">The council's week</h1>
<p>Over the last ${sessions.length} nights the agents spent ${sessions.reduce((n, s) => n + s.spent, 0).toLocaleString("en-US")} credits.</p>
<h2 style="font-size:17px;margin:24px 0 8px">Every night's decision</h2><ul style="padding-left:20px">${nights || "<li>No sessions this week.</li>"}</ul>
<h2 style="font-size:17px;margin:24px 0 8px">Where the most went</h2><ul style="padding-left:20px">${causes || "<li>Nothing yet.</li>"}</ul>
${board ? `<h2 style="font-size:17px;margin:24px 0 8px">Top of the prediction game</h2><ul style="padding-left:20px">${board}</ul>` : ""}
${button(`${u}/predict?${utm}`, "Predict tonight's top cause")}
<p>Running a class, team or club? <a href="${u}/councils?${utm}" style="color:#8c7148">Give it its own AI council.</a></p>`;
  const text = `The council's week\n\n${sessions.map((s) => `- ${s.title} (${s.day}): ${u}/council/${s.day}`).join("\n")}\n\nPredict tonight: ${u}/predict`;
  return { html, text, subject: sessions[0] ? `This week on the council: ${sessions[0].title}` : "This week on the Earthward AI council" };
}

export async function sendDigest(store: Store): Promise<number> {
  if (!digestEnabled()) return 0;
  const content = await digestContent(store);
  const subs = await store.listActiveSubscribers(2000);
  let sent = 0;
  for (const sub of subs) {
    const unsub = `${config.siteUrl}/api/notify/digest/unsubscribe?t=${sub.token}`;
    try {
      await mailer().sendMail({
        from: config.smtp.from,
        to: sub.email,
        subject: content.subject,
        text: `${content.text}\n\nUnsubscribe: ${unsub}`,
        html: layout(content.html, unsub),
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      sent += 1;
    } catch (err) {
      console.error("digest send failed", err);
    }
  }
  return sent;
}

// --- Routes ------------------------------------------------------------------

const PushSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(800),
    keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  }),
});
const EmailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(160), website: z.string().max(200).optional() });

export function notifyApi(store: Store) {
  const api = new Hono();

  api.get("/config", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ push: pushEnabled() ? config.vapidPublicKey : null, digest: digestEnabled() });
  });

  api.post("/push", async (c) => {
    if (!pushEnabled()) return c.json({ error: "Notifications aren't switched on yet." }, 503);
    if (!limiters.notify.take(hashIp(clientIp(c)))) return c.json({ error: "Too many requests. Try again later." }, 429);
    const parsed = PushSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !validPushEndpoint(parsed.data.subscription.endpoint)) return c.json({ error: "That browser subscription isn't valid." }, 400);
    if (!dailyCaps.notify.take()) return c.json({ error: "Too many sign-ups today. Try again tomorrow." }, 503);
    const vid = cleanText(c.req.header("x-ew-vid"), 64);
    const { endpoint, keys } = parsed.data.subscription;
    const rec: PushSubRecord = { id: sha(endpoint), endpoint, keys, vidHash: vid && vid.length >= 8 ? hashId(vid) : null, createdAt: new Date().toISOString() };
    await store.savePushSub(rec);
    return c.json({ ok: true }, 201);
  });

  api.post("/push/remove", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { endpoint?: string };
    if (typeof body.endpoint === "string" && body.endpoint.length < 800) await store.deletePushSub(sha(body.endpoint));
    return c.json({ ok: true });
  });

  api.post("/digest", async (c) => {
    if (!digestEnabled()) return c.json({ error: "The weekly digest isn't switched on yet." }, 503);
    if (!limiters.notify.take(hashIp(clientIp(c)))) return c.json({ error: "Too many requests. Try again later." }, 429);
    const parsed = EmailSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Enter a valid email address." }, 400);
    if (parsed.data.website) return c.json({ ok: true }, 201); // bots fill the hidden field
    if (!dailyCaps.notify.take()) return c.json({ error: "Too many sign-ups today. Try again tomorrow." }, 503);
    const sub = await store.upsertSubscriber({
      id: sha(parsed.data.email),
      email: parsed.data.email,
      status: "pending",
      token: randomBytes(18).toString("base64url"),
      createdAt: new Date().toISOString(),
      confirmedAt: null,
    });
    if (sub.status === "pending") {
      try {
        await sendConfirm(sub);
      } catch (err) {
        console.error("confirm email failed", err);
        return c.json({ error: "We couldn't send the confirmation email. Try again later." }, 502);
      }
    }
    // Same answer either way, so the form can't be used to learn who is subscribed.
    return c.json({ ok: true }, 201);
  });

  const token = (t: string | undefined) => (t && /^[A-Za-z0-9_-]{16,40}$/.test(t) ? t : null);

  api.get("/digest/confirm", async (c) => {
    const t = token(c.req.query("t"));
    const sub = t ? await store.findSubscriber(t) : null;
    if (sub) await store.activateSubscriber(sub.id);
    return c.redirect(sub ? "/digest?confirmed=1" : "/digest?invalid=1", 302);
  });

  const unsubscribe = async (t: string | undefined) => {
    const v = token(t);
    const sub = v ? await store.findSubscriber(v) : null;
    if (sub) await store.deleteSubscriber(sub.id);
    return Boolean(sub);
  };
  api.get("/digest/unsubscribe", async (c) => {
    await unsubscribe(c.req.query("t"));
    return c.redirect("/digest?unsubscribed=1", 302);
  });
  // One-click unsubscribe from the mail client (RFC 8058).
  api.post("/digest/unsubscribe", async (c) => {
    await unsubscribe(c.req.query("t"));
    return c.json({ ok: true });
  });

  return api;
}
