import { causeById } from "../shared/causes";
import { dayKey } from "../shared/council";
import { config } from "./config";
import { esc, layout, send } from "./notify";
import type { DayStats, Store } from "./store/types";

/**
 * The morning report: one email to the team inbox at 09:00 India time with yesterday's numbers,
 * so the daily check doesn't need the admin page (which only opens from the VPN).
 */

const DAY = 86_400_000;

const top = (rec: Record<string, number> | undefined, n: number) =>
  Object.entries(rec ?? {})
    .filter(([k]) => k)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);

const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

async function getJson<T>(f: typeof fetch, url: string): Promise<T | null> {
  try {
    const res = await f(url, { headers: { accept: "application/json", "user-agent": "earthward-report" }, signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface Report {
  day: string;
  subject: string;
  text: string;
  html: string;
}

export async function buildReport(store: Store, now = new Date(), f: typeof fetch = fetch): Promise<Report> {
  const tz = config.timeZone;
  const day = dayKey(new Date(now.getTime() - DAY), tz);
  const since = new Date(now.getTime() - DAY).toISOString();
  const days = Array.from({ length: 8 }, (_, i) => dayKey(new Date(now.getTime() - (8 - i) * DAY), tz));

  const handle = process.env.BLUESKY_HANDLE;
  const [stats, growth, messages, security, sessions, crowd, push, bsky, gh] = await Promise.all([
    store.getStats(days),
    store.growth(since),
    store.listMessages(100),
    store.listSecurity(300),
    store.listSessions(1),
    store.predictionCrowd(day),
    store.countPushSubs(),
    handle ? getJson<{ followersCount?: number }>(f, `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`) : null,
    config.githubRepo ? getJson<{ stargazers_count?: number; forks_count?: number }>(f, `https://api.github.com/repos/${config.githubRepo}`) : null,
  ]);

  const empty: DayStats = { day, views: 0, clicks: 0, batches: 0, uniques: 0, donations: 0, paths: {}, targets: {}, countries: {}, referrers: {}, campaigns: {} };
  const y = stats.find((s) => s.day === day) ?? empty;
  const before = stats.filter((s) => s.day !== day);
  const avg = before.length ? Math.round(before.reduce((n, s) => n + (s.humanUniques ?? 0), 0) / 7) : 0;
  const people = y.humanUniques ?? 0;

  const recent = messages.filter((m) => m.at >= since);
  const notes = recent.filter((m) => m.kind !== "ask");
  const asks = recent.filter((m) => m.kind === "ask");
  const events = security.filter((e) => e.at >= since);
  const byKind = top(
    events.reduce<Record<string, number>>((acc, e) => ((acc[e.kind] = (acc[e.kind] ?? 0) + 1), acc),
    {}),
    6,
  );
  const signups = growth.accounts.added + growth.subscribers.added;
  const last = sessions[0] ?? null;
  const lead = last?.allocations[0];

  const subject = `Earthward daily, ${shortDate(day)}: ${people} ${people === 1 ? "person" : "people"}, ${signups} new sign-up${signups === 1 ? "" : "s"}${notes.length ? `, ${notes.length} message${notes.length === 1 ? "" : "s"} to answer` : ""}`;

  const list = (rows: [string, number][]) => (rows.length ? rows.map(([k, v]) => `${k} ${v}`).join(", ") : "none");
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: `Visitors on ${shortDate(day)}`,
      rows: [
        ["People", `${people} (7-day average ${avg})`],
        ["Page views by people", String(y.humanViews ?? 0)],
        ["All visitors, bots included", String(y.uniques)],
        ["From", list(top(y.referrers, 5))],
        ["Campaigns", list(top(y.campaigns, 5))],
        ["Countries", list(top(y.countries, 5))],
        ["Pages", list(top(y.paths, 6))],
      ],
    },
    {
      title: "Sign-ups (last 24 hours, and total)",
      rows: [
        ["Accounts", `+${growth.accounts.added}, ${growth.accounts.total} in all`],
        ["Email subscribers", `+${growth.subscribers.added}, ${growth.subscribers.total} active`],
        ["Group councils", `+${growth.groups.added}, ${growth.groups.total} in all`],
        ["Push subscribers", String(push)],
      ],
    },
    {
      title: "What people did",
      rows: [
        ["Questions to the council", String(y.asks ?? 0)],
        ["Predictions", String(crowd.total)],
        ["Donations of credits", String(y.donations)],
        ["Clicks tracked", String(y.clicks)],
      ],
    },
    {
      title: "Council and community",
      rows: [
        ["Last session", last ? `${last.day}: ${last.title} (${last.spent.toLocaleString("en-US")} credits${lead ? `, ${causeById(lead.causeId)?.name ?? lead.causeId} ${Math.round(lead.share * 100)}%` : ""})` : "none yet"],
        ["Bluesky followers", bsky?.followersCount == null ? "unavailable" : String(bsky.followersCount)],
        ["GitHub stars", gh?.stargazers_count == null ? "unavailable" : `${gh.stargazers_count} (${gh.forks_count ?? 0} forks)`],
        ["Blocked or limited requests", list(byKind)],
      ],
    },
  ];

  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const who = (m: (typeof recent)[number]) => [m.name, m.email, m.country].filter(Boolean).join(", ") || "anonymous";
  const noteLines = notes.map((m) => `- ${m.kind ?? "message"} from ${who(m)}: ${clip(m.message.replace(/\s+/g, " "), 200)}`);
  const askLines = asks.map((m) => `- ${clip(m.message.replace(/\s+/g, " "), 160)}`);

  const text = [
    subject,
    ...sections.map((s) => `\n${s.title}\n${s.rows.map(([k, v]) => `  ${k}: ${v}`).join("\n")}`),
    notes.length ? `\nMessages (reply from the forwarded email; it goes straight to the visitor)\n${noteLines.join("\n")}` : "\nNo messages in the last 24 hours.",
    asks.length ? `\nQuestions people asked\n${askLines.join("\n")}` : "",
    `\nAdmin (VPN): ${config.siteUrl}/admin\nStatus: ${config.siteUrl}/status`,
  ].join("\n");

  const table = (rows: [string, string][]) =>
    `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows
      .map(([k, v]) => `<tr><td style="padding:5px 12px 5px 0;color:#6b665c;vertical-align:top;width:40%">${esc(k)}</td><td style="padding:5px 0">${esc(v)}</td></tr>`)
      .join("")}</table>`;
  const ul = (lines: string[]) => `<ul style="padding-left:18px;font-size:14px">${lines.map((l) => `<li style="margin:0 0 6px">${esc(l.slice(2))}</li>`).join("")}</ul>`;
  const html = layout(
    `<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">${esc(subject)}</h1>
${sections.map((s) => `<h2 style="font-size:15px;margin:24px 0 6px">${esc(s.title)}</h2>${table(s.rows)}`).join("\n")}
<h2 style="font-size:15px;margin:24px 0 6px">Messages</h2>
${notes.length ? `<p style="font-size:14px;margin:0 0 6px">Reply from the forwarded email; it goes straight to the visitor.</p>${ul(noteLines)}` : `<p style="font-size:14px;color:#6b665c">None in the last 24 hours.</p>`}
${asks.length ? `<h2 style="font-size:15px;margin:24px 0 6px">Questions people asked</h2>${ul(askLines)}` : ""}
<p style="font-size:13px;color:#6b665c;margin:24px 0 0"><a href="${config.siteUrl}/status" style="color:#8c7148">Status</a> · <a href="${config.siteUrl}/admin" style="color:#8c7148">Admin</a> (VPN only)</p>`,
  );
  return { day, subject, text, html };
}

/** Sends the report once per day. Returns what happened, for the log. */
export async function sendReport(store: Store, now = new Date(), f: typeof fetch = fetch): Promise<string> {
  const report = await buildReport(store, now, f);
  if (!(await store.claimTask(`report-${report.day}`))) return "already sent";
  const ok = await send({ to: config.smtp.inbox, subject: report.subject, text: report.text, html: report.html });
  return ok ? `sent for ${report.day}` : "email off or over the daily limit";
}
