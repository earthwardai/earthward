import { causeById } from "../shared/causes";
import type { Session } from "../shared/types";
import { config } from "./config";

// A README badge and an embeddable "last night's decision" card. Both are plain server-rendered
// markup with no JavaScript, so they are safe to show on other people's sites.

const COLORS: Record<string, string> = { verdant: "#5fa05a", tide: "#3f8fd2", kindred: "#d5658f", hearth: "#c97d22", horizon: "#9085e9" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Rough width of 11px Verdana, the badge convention, so the text fits without measuring.
const textWidth = (s: string) => Math.round([...s].reduce((w, ch) => w + (/[ilI.,:'|]/.test(ch) ? 3.2 : /[mwMW%]/.test(ch) ? 9.5 : /[A-Z0-9]/.test(ch) ? 7.4 : 6.4), 0));

export function badgeSvg(session: Session | null): string {
  const left = "Earthward AI council";
  const top = session?.allocations[0];
  const right = top ? `last night: ${causeById(top.causeId)?.name ?? top.causeId} ${Math.round(top.share * 100)}%` : "meets nightly";
  const color = top ? (COLORS[causeById(top.causeId)?.domain ?? ""] ?? "#8a6d2f") : "#8a6d2f";
  const lw = textWidth(left) + 14;
  const rw = textWidth(right) + 14;
  const w = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(`${left}: ${right}`)}">
<title>${esc(`${left}: ${right}`)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#2b2925"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(left)}</text><text x="${lw / 2}" y="14">${esc(left)}</text>
<text x="${lw + rw / 2}" y="15" fill="#010101" fill-opacity=".3">${esc(right)}</text><text x="${lw + rw / 2}" y="14">${esc(right)}</text>
</g></svg>`;
}

const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function embedHtml(session: Session | null, theme: "dark" | "light"): string {
  const link = `${config.siteUrl}/?utm_source=embed&utm_campaign=widget`;
  const rows = (session?.allocations ?? []).slice(0, 5).map((a) => {
    const c = causeById(a.causeId);
    const pct = Math.round(a.share * 100);
    const width = Math.max(2, Math.round((a.share / (session!.allocations[0].share || 1)) * 100));
    return `<li><span class="name">${esc(c?.name ?? a.causeId)}</span><span class="pct">${pct}%</span><svg class="bar" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="${width}" height="6" rx="3" fill="${COLORS[c?.domain ?? ""] ?? "#d9b97a"}"/></svg></li>`;
  });
  return `<!doctype html>
<html lang="en" class="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Earthward AI council: last night's decision</title>
<link rel="stylesheet" href="/embed.css" />
</head>
<body>
<a class="card" href="${link}" target="_blank" rel="noopener">
<p class="label">Earthward AI council${session ? `, ${esc(dateLabel(session.day))}` : ""}</p>
<p class="title">${esc(session?.title ?? "Five AI agents decide every night where giving does the most good")}</p>
${rows.length ? `<ol>${rows.join("")}</ol>` : ""}
<p class="foot"><span>Five AI agents decide every night</span><span class="cta">earthwardai.com</span></p>
</a>
</body>
</html>`;
}
