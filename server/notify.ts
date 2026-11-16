import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import nodemailer from "nodemailer";
import * as webpush from "web-push";
import { z } from "zod";
import { causeById } from "../shared/causes";
import { givingFor } from "../shared/giving";
import type { Session } from "../shared/types";
import { config } from "./config";
import { winningCauses } from "./predict";
import { cleanText, clientIp, DailyCap, dailyCaps, hashId, hashIp, limiters } from "./security";
import type { EmailFrequency, PushSubRecord, Store, SubscriberRecord } from "./store/types";

/**
 * Bringing people back: web push after each night ("you called it"), a nightly or weekly email, and
 * visitors' messages forwarded to the team. Push needs VAPID keys and email needs an SMTP password;
 * each is off until configured.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const pushEnabled = () => Boolean(config.vapidPublicKey && config.vapidPrivateKey);
export const emailEnabled = () => Boolean(config.smtp.user && config.smtp.pass);

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
/** Tests swap in a transport that records messages instead of sending them. */
export function setMailTransport(t: ReturnType<typeof nodemailer.createTransport> | null) {
  transport = t;
}
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

type Mail = Parameters<ReturnType<typeof nodemailer.createTransport>["sendMail"]>[0];
const mailBudget = new DailyCap(config.smtp.dailyLimit);

/** Sends one email within the mailbox's daily allowance. False when email is off or the allowance is spent. */
async function send(mail: Mail): Promise<boolean> {
  if (!emailEnabled()) return false;
  if (!mailBudget.take()) {
    console.warn("email skipped: daily sending limit reached");
    return false;
  }
  await mailer().sendMail({ from: config.smtp.from, ...mail });
  return true;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function layout(body: string, manage?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f4ef;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1b17;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 24px;font-size:20px;font-weight:700">Earthward AI</p>
${body}
<p style="margin:32px 0 0;font-size:13px;color:#6b665c">Five AI agents decide every night where donated credits do the most good. Credits are virtual.${
    manage ? ` <a href="${manage}" style="color:#6b665c">Change how often you hear from us, or unsubscribe</a>.` : ""
  }</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#8c7148;color:#fff;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;

const manageUrl = (sub: SubscriberRecord) => `${config.siteUrl}/digest?manage=${sub.token}`;
const oneClickUrl = (sub: SubscriberRecord) => `${config.siteUrl}/api/notify/digest/unsubscribe?t=${sub.token}`;
const listHeaders = (sub: SubscriberRecord) => ({ "List-Unsubscribe": `<${oneClickUrl(sub)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
const frequencyOf = (sub: Pick<SubscriberRecord, "frequency">): EmailFrequency => sub.frequency ?? "weekly";

async function sendConfirm(sub: SubscriberRecord) {
  // The link opens a page with a button, so mail scanners that follow links can't confirm on their own.
  const link = `${config.siteUrl}/digest?confirm=${sub.token}`;
  const what = frequencyOf(sub) === "daily" ? "an email after each night's council" : "the weekly roundup";
  await send({
    to: sub.email,
    subject: frequencyOf(sub) === "daily" ? "Confirm your nightly Earthward AI email" : "Confirm your weekly Earthward AI roundup",
    text: `Confirm that you want ${what} from the Earthward AI council:\n\n${link}\n\nIf you didn't ask for this, ignore this email and nothing will be sent.`,
    html: layout(`<p>Confirm that you want ${what} from the Earthward AI council: what the five agents decided, the closest calls, and how your predictions did.</p>${button(link, "Confirm my subscription")}<p style="color:#6b665c">If you didn't ask for this, ignore this email and nothing will be sent.</p>`),
  });
}

/** One night's decision, personal when the subscriber predicted that night. */
export function nightlyContent(session: Session, predicted: string | null) {
  const u = config.siteUrl;
  const utm = "utm_source=nightly&utm_medium=email";
  const top = session.allocations.slice(0, 5);
  const winners = winningCauses(session);
  const name = (id: string) => causeById(id)?.name ?? id;
  let verdict = "";
  if (predicted) {
    verdict = winners.includes(predicted)
      ? `<p style="padding:12px 16px;border-radius:12px;background:#e6efe1;margin:0 0 16px"><strong>You called it.</strong> You picked ${esc(name(predicted))}, and it came out on top.</p>`
      : `<p style="padding:12px 16px;border-radius:12px;background:#efe9df;margin:0 0 16px"><strong>Not this time.</strong> You picked ${esc(name(predicted))}; ${esc(name(winners[0] ?? ""))} came out on top.</p>`;
  }
  const rows = top
    .map(
      (a) => `<tr><td style="padding:6px 12px 6px 0">${esc(name(a.causeId))}</td><td style="padding:6px 0;width:45%"><div style="height:8px;border-radius:4px;background:#8c7148;width:${Math.max(4, Math.round(a.share * 100 * 3))}%"></div></td><td style="padding:6px 0 6px 12px;text-align:right;font-variant-numeric:tabular-nums">${Math.round(a.share * 100)}%</td></tr>`,
    )
    .join("");
  const excerpt = session.minutes.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/).slice(0, 2).join(" ");
  const give = givingFor(winners[0] ?? "");
  const giveBlock = give
    ? `<p style="margin:24px 0 0;font-size:15px">Want to back ${esc(name(winners[0]!))} with real money? <a href="${give.url}" style="color:#8c7148">${esc(give.org)}</a> (${esc(give.credential)}) takes donations through Every.org, a nonprofit platform. We never touch the money.</p>`
    : "";
  const html = `<p style="margin:0 0 4px;color:#6b665c;font-size:14px">The council's decision for ${esc(session.day)}</p>
<h1 style="font-size:24px;line-height:1.25;margin:0 0 16px">${esc(session.title)}</h1>
${verdict}<p>The five agents split ${session.spent.toLocaleString("en-US")} credits. Where most of it went:</p>
<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}</table>
${excerpt ? `<p style="margin:20px 0 0;color:#3d392f;font-style:italic">${esc(excerpt)}</p>` : ""}
${button(`${u}/council/${session.day}?${utm}`, "Watch the debate")}
<p style="margin:0">Think you know what they'll pick tonight? <a href="${u}/predict?${utm}" style="color:#8c7148">Make your prediction</a>.</p>
${giveBlock}`;
  const lines = top.map((a) => `- ${name(a.causeId)}: ${Math.round(a.share * 100)}%`).join("\n");
  const youText = predicted ? (winners.includes(predicted) ? `You called it: ${name(predicted)} came out on top.\n\n` : `Not this time: you picked ${name(predicted)}.\n\n`) : "";
  const text = `${session.title}\n\n${youText}The five agents split ${session.spent.toLocaleString("en-US")} credits:\n${lines}\n\nWatch the debate: ${u}/council/${session.day}\nPredict tonight: ${u}/predict`;
  const subject = predicted ? (winners.includes(predicted) ? `You called it: ${session.title}` : `Not this time: ${session.title}`) : session.title;
  return { subject, html, text };
}

/** After each night: the decision to everyone who asked for daily email. */
export async function sendNightlyEmails(store: Store, session: Session): Promise<number> {
  if (!emailEnabled()) return 0;
  const subs = (await store.listActiveSubscribers(5000)).filter((s) => frequencyOf(s) === "daily");
  let sent = 0;
  for (const sub of subs) {
    const pred = sub.vidHash ? await store.getPrediction(session.day, sub.vidHash).catch(() => null) : null;
    const content = nightlyContent(session, pred?.causeId ?? null);
    try {
      if (!(await send({ to: sub.email, subject: content.subject, text: `${content.text}\n\nManage or unsubscribe: ${manageUrl(sub)}`, html: layout(content.html, manageUrl(sub)), headers: listHeaders(sub) }))) break;
      sent += 1;
    } catch (err) {
      console.error("nightly email failed", err);
    }
  }
  return sent;
}

/** The weekly roundup, built from the last seven sessions. */
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
  if (!emailEnabled()) return 0;
  const content = await digestContent(store);
  const subs = (await store.listActiveSubscribers(5000)).filter((s) => frequencyOf(s) === "weekly");
  let sent = 0;
  for (const sub of subs) {
    try {
      if (!(await send({ to: sub.email, subject: content.subject, text: `${content.text}\n\nManage or unsubscribe: ${manageUrl(sub)}`, html: layout(content.html, manageUrl(sub)), headers: listHeaders(sub) }))) break;
      sent += 1;
    } catch (err) {
      console.error("digest send failed", err);
    }
  }
  return sent;
}

// --- Forwarding visitors' messages to the team -------------------------------

const inboxCap = new DailyCap(120);

/**
 * Forwards a visitor's message or question to the team's inbox. Replying in the mail client goes
 * straight to the visitor when they left an address. Never throws and never waits more than a few
 * seconds, because it runs inside the visitor's request.
 */
export async function notifyInbox(m: { subject: string; text: string; replyTo?: string | null }): Promise<boolean> {
  if (!emailEnabled() || !config.smtp.inbox || !inboxCap.take()) return false;
  const subject = `[Earthward] ${m.subject.replace(/[\r\n]+/g, " ").slice(0, 120)}`;
  const job = send({ to: config.smtp.inbox, subject, text: m.text, replyTo: m.replyTo ?? undefined }).catch((err) => {
    console.error("inbox notice failed", err);
    return false;
  });
  return Promise.race([job, new Promise<boolean>((r) => setTimeout(() => r(false), 6000))]);
}

// --- Routes ------------------------------------------------------------------

const PushSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(800),
    keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
  }),
});
const EmailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  frequency: z.enum(["daily", "weekly"]).default("weekly"),
  website: z.string().max(200).optional(),
});
const TokenSchema = z.object({ t: z.string().regex(/^[A-Za-z0-9_-]{16,40}$/) });
const FrequencySchema = TokenSchema.extend({ frequency: z.enum(["daily", "weekly"]) });

const maskEmail = (email: string) => {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
};

export function notifyApi(store: Store) {
  const api = new Hono();

  api.get("/config", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ push: pushEnabled() ? config.vapidPublicKey : null, digest: emailEnabled() });
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
    if (!emailEnabled()) return c.json({ error: "Email updates aren't switched on yet." }, 503);
    if (!limiters.notify.take(hashIp(clientIp(c)))) return c.json({ error: "Too many requests. Try again later." }, 429);
    const parsed = EmailSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Enter a valid email address." }, 400);
    if (parsed.data.website) return c.json({ ok: true }, 201); // bots fill the hidden field
    if (!dailyCaps.notify.take()) return c.json({ error: "Too many sign-ups today. Try again tomorrow." }, 503);
    const vid = cleanText(c.req.header("x-ew-vid"), 64);
    const sub = await store.upsertSubscriber({
      id: sha(parsed.data.email),
      email: parsed.data.email,
      status: "pending",
      token: randomBytes(18).toString("base64url"),
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      frequency: parsed.data.frequency,
      vidHash: vid && vid.length >= 8 ? hashId(vid) : null,
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

  const byToken = async (t: string | undefined) => {
    const parsed = TokenSchema.safeParse({ t });
    return parsed.success ? store.findSubscriber(parsed.data.t) : null;
  };

  // Links in emails open pages; the pages post here. Mail scanners follow links but don't press buttons.
  api.get("/digest/confirm", (c) => c.redirect(`/digest?confirm=${encodeURIComponent(c.req.query("t") ?? "")}`, 302));
  api.get("/digest/unsubscribe", (c) => c.redirect(`/digest?manage=${encodeURIComponent(c.req.query("t") ?? "")}&leave=1`, 302));

  api.post("/digest/confirm", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { t?: string };
    const sub = await byToken(body.t);
    if (!sub) return c.json({ error: "That link has expired or was already used." }, 404);
    if (sub.status !== "active") await store.activateSubscriber(sub.id);
    return c.json({ ok: true, frequency: frequencyOf(sub) });
  });

  api.get("/subscription", async (c) => {
    const sub = await byToken(c.req.query("t"));
    if (!sub) return c.json({ error: "That link has expired or the address was already removed." }, 404);
    c.header("Cache-Control", "no-store");
    return c.json({ email: maskEmail(sub.email), frequency: frequencyOf(sub), status: sub.status });
  });

  api.post("/subscription", async (c) => {
    const parsed = FrequencySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Pick daily or weekly." }, 400);
    const sub = await store.findSubscriber(parsed.data.t);
    if (!sub) return c.json({ error: "That link has expired or the address was already removed." }, 404);
    await store.setSubscriberFrequency(sub.id, parsed.data.frequency);
    return c.json({ ok: true, frequency: parsed.data.frequency });
  });

  // One-click unsubscribe from the mail client (RFC 8058), and the button on the manage page.
  api.post("/digest/unsubscribe", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { t?: string };
    const sub = await byToken(c.req.query("t") ?? body.t);
    if (sub) await store.deleteSubscriber(sub.id);
    return c.json({ ok: true });
  });

  return api;
}
