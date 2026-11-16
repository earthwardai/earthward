import { AGENTS, agentById } from "../shared/agents";
import { CAUSES, causeById } from "../shared/causes";
import { ABOUT, ALT_NAMES, ASK, DEFINITION, DOMAIN_LABELS, EARTH_AI, GLOBAL_AI, HEADLINE, SITE_NAME, SUMMARY, faq } from "../shared/content";
import { RULES } from "../shared/council";
import type { Session } from "../shared/types";
import { config } from "./config";
import { getInsights } from "./insights";
import type { Store } from "./store/types";

// Server-rendered HTML for crawlers and AI answer engines, most of which don't run
// JavaScript. Each route gets real content, metadata and structured data; the React
// app replaces the content as soon as it loads.

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmt = (n: number) => n.toLocaleString("en-US");
const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export interface RenderedPage {
  status: number;
  title: string;
  description: string;
  path: string;
  body: string;
  jsonLd: object[];
  ogType?: "website" | "article";
  /** Set to keep a page out of search results, for example a donor's private receipt. */
  noindex?: boolean;
  /** A page-specific share image; the brand image is used otherwise. */
  ogImage?: string;
}

const ORG = () => ({
  "@type": "Organization",
  "@id": `${config.siteUrl}/#org`,
  name: SITE_NAME,
  alternateName: ALT_NAMES,
  url: `${config.siteUrl}/`,
  logo: `${config.siteUrl}/brand/emblem-720.jpg`,
  description: DEFINITION,
  ...(config.sameAs.length ? { sameAs: config.sameAs } : {}),
});

const crumbs = (...items: [string, string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: [["Earthward AI", "/"], ...items].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${config.siteUrl}${path}` })),
});

const pct = (x: number) => `${Math.round(x * 100)}%`;

function allocationList(s: Session): string {
  return `<ol>${s.allocations
    .map((a) => {
      const c = causeById(a.causeId)!;
      return `<li>${esc(c.name)} (${esc(c.place)}): ${fmt(a.credits)} credits, ${Math.round(a.share * 100)}%, simulated outcome ${fmt(a.units)} ${esc(c.unit)}</li>`;
    })
    .join("")}</ol>`;
}

async function home(store: Store): Promise<RenderedPage> {
  const [treasury, sessions, sessionCount] = await Promise.all([store.getTreasury(), store.listSessions(1), store.countSessions()]);
  const latest = sessions[0];
  const items = faq(Boolean(config.supportUrl));
  const body = `
<main class="page prose">
  <h1>${esc(HEADLINE)}</h1>
  <p class="lede">${esc(SUMMARY)}</p>
  <p>${esc(DEFINITION)}</p>
  <h2>Earthward in numbers</h2>
  <ul>
    <li>${fmt(treasury.balance)} credits in the treasury now</li>
    <li>${fmt(treasury.totalAllocated)} credits allocated by the council so far</li>
    <li>${fmt(treasury.donations)} donations from ${fmt(Object.keys(treasury.countries ?? {}).length)} countries</li>
    <li>${fmt(sessionCount)} council sessions held</li>
  </ul>
  ${
    latest
      ? `<h2>Latest decision: ${esc(latest.title)}</h2>
  <p>${esc(dateLabel(latest.day))}. Pool ${fmt(latest.pool)} credits, spent ${fmt(latest.spent)}, rolled over ${fmt(latest.reserve)}.</p>
  <p>${esc(latest.minutes)}</p>
  ${allocationList(latest)}
  <p><a href="/council/${esc(latest.day)}">Read the full minutes and every agent's vote</a></p>`
      : ""
  }
  <h2>The council</h2>
  <ul>${AGENTS.map((a) => `<li><strong><a href="/agents/${a.id}">${esc(a.name)}</a></strong>: ${esc(a.mandate)}. ${esc(a.temperament)}</li>`).join("")}</ul>
  <h2>Questions</h2>
  ${items.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}
  <p><a href="/how-it-works">How it works</a> | <a href="/earth-ai">Earth AI</a> | <a href="/global-ai-council">Global AI council</a> | <a href="/ledger">The ledger</a> | <a href="/about">About</a> | <a href="/contact">Contact</a></p>
  <h2>Agents</h2>
  <ul>${AGENTS.map((a) => `<li><a href="/agents/${a.id}">${esc(a.name)}</a></li>`).join("")}</ul>
  <h2>Causes</h2>
  <ul>${CAUSES.map((c) => `<li><a href="/causes/${c.id}">${esc(c.name)}</a></li>`).join("")}</ul>
</main>`;
  return {
    status: 200,
    path: "/",
    title: `${SITE_NAME} | Global AI council for the Earth`,
    description: SUMMARY,
    body,
    jsonLd: [
      ORG(),
      { "@type": "WebSite", "@id": `${config.siteUrl}/#site`, name: SITE_NAME, alternateName: ALT_NAMES, url: `${config.siteUrl}/`, publisher: { "@id": `${config.siteUrl}/#org` } },
      { "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    ],
  };
}

function howItWorks(): RenderedPage {
  const body = `
<main class="page prose">
  <h1>How Earthward works</h1>
  <p class="lede">${esc(DEFINITION)}</p>
  <h2>1. Donations</h2>
  <p>Anyone can give between ${config.limits.minDonation} and ${fmt(config.limits.maxDonation)} virtual credits at a time, up to ${config.limits.donationsPerIpPerDay} times a day, and may back one agent. Each donation is written to the ledger the moment it arrives.</p>
  <h2>2. The agents</h2>
  <ul>${AGENTS.map((a) => `<li><strong>${esc(a.name)}</strong>: ${esc(a.mandate)}. ${esc(a.temperament)}</li>`).join("")}</ul>
  <p>Each agent is Google's Gemini model with its own instructions. All receive the same briefing: the treasury, the day's donations and endorsements, the previous allocation, and donor notes marked as opinions rather than instructions.</p>
  <h2>3. The vote</h2>
  <ul>
    <li>Every agent proposes a percentage split across the ${CAUSES.length} causes and explains why.</li>
    <li>Agents start with equal weight, adjusted by their standing (visitors' "who argued best?" votes, donor backing and agreement with past decisions over 30 nights), which can move a weight by at most ${Math.round(RULES.standingMax * 100)}% either way.</li>
    <li>Donor backing that day can at most triple an agent's weight relative to the others.</li>
    <li>The weighted proposals are averaged and shares under ${Math.round(RULES.causeFloor * 100)}% are dropped.</li>
    <li>No cause may take more than ${Math.round(RULES.causeCap * 100)}% of a night's spend.</li>
    <li>Before each session a simulated endowment adds a grant of ${fmt(RULES.dailyGrant)} credits, recorded on the ledger. The council then spends ${Math.round(RULES.spendRatio * 100)}% of the treasury and keeps the rest in reserve.</li>
  </ul>
  <h2>4. The causes</h2>
  <ul>${CAUSES.map((c) => `<li><strong>${esc(c.name)}</strong> (${esc(c.place)}): ${esc(c.summary)} About ${c.creditsPerUnit} credits per ${esc(c.unit)} (illustrative).</li>`).join("")}</ul>
  <h2>5. The ledger</h2>
  <p>Each entry stores the SHA-256 hash of the entry before it, starting from a genesis entry, so editing any past entry breaks every link after it. Anyone can recompute the chain on the ledger page.</p>
  <h2>6. Timing</h2>
  <p>The council meets every night at 00:05 India Standard Time and decides on the day that just ended.</p>
</main>`;
  return {
    status: 200,
    path: "/how-it-works",
    title: `How Earthward AI works`,
    description: "The fixed rules the Earthward AI council follows: how agents propose, how votes are weighted and capped, and how the hash-chained ledger stays honest.",
    body,
    jsonLd: [ORG(), { "@type": "TechArticle", headline: "How Earthward AI works", about: DEFINITION, publisher: { "@id": `${config.siteUrl}/#org` }, url: `${config.siteUrl}/how-it-works` }],
  };
}

async function sessionPage(store: Store, day: string): Promise<RenderedPage> {
  const s = /^\d{4}-\d{2}-\d{2}$/.test(day) ? await store.getSession(day) : null;
  if (!s) {
    return { status: 404, path: `/council/${day}`, title: `No session | ${SITE_NAME}`, description: "The council did not meet on that date.", body: `<main class="page"><h1>No council session on that date</h1></main>`, jsonLd: [] };
  }
  const votes = AGENTS.map((a) => {
    const p = s.proposals.find((x) => x.agentId === a.id);
    if (!p) return "";
    const top = Object.entries(p.shares)
      .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
      .slice(0, 3)
      .map(([id, v]) => `${esc(causeById(id)?.name)} ${Math.round((v ?? 0) * 100)}%`)
      .join(", ");
    return `<h3>${esc(a.name)} (vote weight ${Math.round((s.influence[a.id] ?? 0) * 100)}%)</h3><blockquote>${esc(p.quote)}</blockquote><p>Top picks: ${top}. ${esc(p.reasoning)}</p>`;
  }).join("");
  const body = `
<main class="page prose">
  <p class="lede">Council minutes, ${esc(dateLabel(s.day))}</p>
  <h1>${esc(s.title)}</h1>
  <p>${esc(s.minutes)}</p>
  <p>Pool ${fmt(s.pool)} credits from ${fmt(s.donations)} donations that day. Spent ${fmt(s.spent)}, rolled over ${fmt(s.reserve)}. Model: ${esc(s.model)}. Ledger entry #${s.seq}, hash ${esc(s.hash)}.</p>
  <h2>Where the credits went</h2>
  ${allocationList(s)}
  <h2>How each agent voted</h2>
  ${votes}
</main>`;
  return {
    status: 200,
    path: `/council/${s.day}`,
    title: `${s.title} | Earthward AI council, ${s.day}`,
    description: `${s.minutes.slice(0, 150).replace(/\s+\S*$/, "")}…`,
    body,
    ogType: "article",
    ogImage: `${config.siteUrl}/og/council/${s.day}.png`,
    jsonLd: [
      ORG(),
      {
        "@type": "Article",
        headline: s.title,
        datePublished: s.at,
        dateModified: s.at,
        author: { "@id": `${config.siteUrl}/#org` },
        publisher: { "@id": `${config.siteUrl}/#org` },
        mainEntityOfPage: `${config.siteUrl}/council/${s.day}`,
        articleBody: s.minutes,
      },
    ],
  };
}

async function ledgerPage(store: Store): Promise<RenderedPage> {
  const entries = await store.listLedger(30);
  const line = (e: (typeof entries)[number]) => {
    const d = e.data as Record<string, unknown>;
    if (e.type === "genesis") return `Genesis: ${fmt(Number(d.credits))} seed credits`;
    if (e.type === "donation") return `${esc(d.name ?? "Someone")} donated ${fmt(Number(d.amount))} credits${d.agentId ? `, backing ${esc(agentById(String(d.agentId))?.name)}` : ""}`;
    return `Council allocated ${fmt(Number(d.spent))} credits for ${esc(d.day)}`;
  };
  const body = `
<main class="page prose">
  <h1>The Earthward ledger</h1>
  <p class="lede">Every donation and council decision, each chained to the one before it by a SHA-256 hash.</p>
  <ol>${entries.map((e) => `<li>#${e.seq} ${line(e)}. Hash ${esc(e.hash)}</li>`).join("")}</ol>
</main>`;
  return {
    status: 200,
    path: "/ledger",
    title: `The ledger | ${SITE_NAME}`,
    description: "Every Earthward donation and AI council decision, chained by SHA-256 hashes that anyone can verify in the browser.",
    body,
    jsonLd: [ORG()],
  };
}

function aboutPage(): RenderedPage {
  const body = `
<main class="page prose">
  <h1>${esc(ABOUT.title)}</h1>
  <p class="lede">${esc(ABOUT.lede)}</p>
  ${ABOUT.sections.map((s) => `<h2>${esc(s.h)}</h2>${s.p.map((p) => `<p>${esc(p)}</p>`).join("")}`).join("")}
  <p><a href="/contact">Get in touch</a></p>
</main>`;
  return {
    status: 200,
    path: "/about",
    title: `About | ${SITE_NAME}`,
    description: ABOUT.lede,
    body,
    jsonLd: [ORG(), { "@type": "AboutPage", url: `${config.siteUrl}/about`, about: { "@id": `${config.siteUrl}/#org` } }],
  };
}

async function earthAiPage(store: Store): Promise<RenderedPage> {
  const ins = await getInsights(store);
  const groups = AGENTS.map((a) => {
    const items = CAUSES.filter((c) => c.domain === a.id)
      .map((c) => {
        const t = ins.causes[c.id];
        return `<li><a href="/causes/${c.id}">${esc(c.name)}</a> (${esc(c.place)}): ${fmt(t?.credits ?? 0)} credits allocated, simulated ${fmt(t?.units ?? 0)} ${esc(c.unit)}</li>`;
      })
      .join("");
    return `<h2>${esc(DOMAIN_LABELS[a.id])}</h2><p>Championed by <a href="/agents/${a.id}">${esc(a.name)}</a>: ${esc(a.mandate.toLowerCase())}.</p><ul>${items}</ul>`;
  }).join("");
  return {
    status: 200,
    path: "/earth-ai",
    title: `Earth AI for the planet's causes | ${SITE_NAME}`,
    description: EARTH_AI.lede,
    body: `<main class="page prose"><h1>${esc(EARTH_AI.title)}</h1><p class="lede">${esc(EARTH_AI.lede)}</p>${EARTH_AI.paras.map((p) => `<p>${esc(p)}</p>`).join("")}${groups}<p>${esc(EARTH_AI.disambiguation)}</p></main>`,
    jsonLd: [ORG(), crumbs(["Earth AI", "/earth-ai"]), { "@type": "WebPage", name: EARTH_AI.title, about: ["Earth AI", "AI for the planet", "AI philanthropy"], url: `${config.siteUrl}/earth-ai` }],
  };
}

async function globalPage(store: Store): Promise<RenderedPage> {
  const [ins, treasury] = await Promise.all([getInsights(store), store.getTreasury()]);
  const countries = ins.countries.length
    ? `<ul>${ins.countries.slice(0, 40).map((c) => `<li>${esc(c.code)}: ${fmt(c.donations)} ${c.donations === 1 ? "donation" : "donations"}</li>`).join("")}</ul>`
    : "<p>The first donations are arriving now.</p>";
  return {
    status: 200,
    path: "/global-ai-council",
    title: `Global AI council for the Earth | ${SITE_NAME}`,
    description: GLOBAL_AI.lede,
    body: `<main class="page prose"><h1>${esc(GLOBAL_AI.title)}</h1><p class="lede">${esc(GLOBAL_AI.lede)}</p>${GLOBAL_AI.paras.map((p) => `<p>${esc(p)}</p>`).join("")}
  <h2>The council in numbers</h2><ul><li>${fmt(ins.countries.length)} countries giving</li><li>${fmt(treasury.donations)} donations</li><li>${fmt(ins.sessions)} sessions in the last 90</li><li>${fmt(treasury.totalAllocated)} credits allocated</li></ul>
  <h2>Where support comes from</h2>${countries}
  <h2>Where decisions send credits</h2><ul>${CAUSES.map((c) => `<li><a href="/causes/${c.id}">${esc(c.name)}</a>, ${esc(c.place)}</li>`).join("")}</ul></main>`,
    jsonLd: [ORG(), crumbs(["Global AI council", "/global-ai-council"]), { "@type": "WebPage", name: GLOBAL_AI.title, about: ["Global AI", "AI governance", "AI council"], url: `${config.siteUrl}/global-ai-council` }],
  };
}

async function agentPage(store: Store, id: string): Promise<RenderedPage | null> {
  const a = agentById(id);
  if (!a) return null;
  const ins = await getInsights(store);
  const st = ins.agents[a.id];
  const prefs = st.preferences.slice(0, 6).map((p) => `<li><a href="/causes/${p.causeId}">${esc(causeById(p.causeId)?.name)}</a>: ${pct(p.avgShare)} of its proposals on average</li>`).join("");
  const quotes = st.quotes.map((q) => `<li><a href="/council/${esc(q.day)}">${esc(q.day)}</a>: ${esc(q.quote)}</li>`).join("");
  return {
    status: 200,
    path: `/agents/${a.id}`,
    title: `${a.name}, the AI agent for ${a.mandate.toLowerCase()} | ${SITE_NAME}`,
    description: `${a.name} is one of five AI agents on the Earthward AI council. Mandate: ${a.mandate.toLowerCase()}. ${a.temperament}`,
    body: `<main class="page prose"><p class="lede">An agent of the Earthward AI council</p><h1>${esc(a.name)}</h1><p class="lede">${esc(a.mandate)}. ${esc(a.temperament)}</p><p>${esc(a.voice.replace(/^You /, `${a.name} `).replace(/ you /g, " it ").replace(/ your /g, " its "))}</p>
  <h2>Record</h2><ul><li>Average vote weight: ${pct(st.avgWeight)} over ${fmt(ins.sessions)} sessions</li><li>Donor backings: ${fmt(st.endorsements)}</li></ul>
  ${prefs ? `<h2>What ${esc(a.name)} pushes for</h2><ul>${prefs}</ul>` : ""}
  ${quotes ? `<h2>Recent words in the council</h2><ul>${quotes}</ul>` : ""}
  <p>Other agents: ${AGENTS.filter((x) => x.id !== a.id).map((x) => `<a href="/agents/${x.id}">${esc(x.name)}</a>`).join(", ")}.</p></main>`,
    jsonLd: [ORG(), crumbs(["Agents", "/#council"], [a.name, `/agents/${a.id}`]), { "@type": "ProfilePage", name: `${a.name} (AI agent)`, url: `${config.siteUrl}/agents/${a.id}`, description: `${a.mandate}. ${a.temperament}` }],
  };
}

async function causePage(store: Store, id: string): Promise<RenderedPage | null> {
  const c = causeById(id);
  if (!c) return null;
  const ins = await getInsights(store);
  const t = ins.causes[c.id];
  const champion = agentById(c.domain)!;
  const history = t.history.slice(0, 15).map((h) => `<li><a href="/council/${esc(h.day)}">${esc(h.day)}</a>: ${fmt(h.credits)} credits</li>`).join("");
  const backers = t.backers.slice(0, 5).map((b) => `<li><a href="/agents/${b.agentId}">${esc(agentById(b.agentId)?.name)}</a>: ${pct(b.avgShare)} of its proposals on average</li>`).join("");
  return {
    status: 200,
    path: `/causes/${c.id}`,
    title: `${c.name} (${c.place}): AI council funding | ${SITE_NAME}`,
    description: `${c.summary} See how much the Earthward AI council has allocated to ${c.name.toLowerCase()} and which agents push for it.`,
    body: `<main class="page prose"><p class="lede">A cause on the Earthward AI council</p><h1>${esc(c.name)}</h1><p class="lede">${esc(c.place)}. ${esc(c.summary)}</p>
  <h2>So far</h2><ul><li>${fmt(t.credits)} credits allocated over ${fmt(t.sessions)} sessions</li><li>Simulated outcome: ${fmt(t.units)} ${esc(c.unit)} (about ${c.creditsPerUnit} credits each, illustrative)</li><li>Part of ${esc(DOMAIN_LABELS[c.domain])}, championed by <a href="/agents/${champion.id}">${esc(champion.name)}</a></li></ul>
  ${backers ? `<h2>Which agents back it</h2><ul>${backers}</ul>` : ""}
  ${history ? `<h2>Recent sessions</h2><ul>${history}</ul>` : ""}
  <p>Other causes: ${CAUSES.filter((x) => x.id !== c.id).map((x) => `<a href="/causes/${x.id}">${esc(x.name)}</a>`).join(", ")}.</p></main>`,
    jsonLd: [ORG(), crumbs(["Causes", "/earth-ai"], [c.name, `/causes/${c.id}`]), { "@type": "WebPage", name: `${c.name} on the Earthward AI council`, url: `${config.siteUrl}/causes/${c.id}` }],
  };
}

const simple: Record<string, { title: string; description: string; h1: string }> = {
  "/privacy": { title: "Privacy", description: "What Earthward AI collects, why, and how long it keeps it.", h1: "Privacy" },
  "/terms": { title: "Terms", description: "The terms for using Earthward AI, a simulation with virtual credits.", h1: "Terms" },
  "/contact": { title: "Contact", description: "Write to the Earthward AI team about partnerships, press or a cause the council is missing.", h1: "Contact Earthward AI" },
};

/** Returns the page for a path, or null when the path isn't a public page (the SPA shell is served instead). */
export async function renderRoute(store: Store, path: string): Promise<RenderedPage | null> {
  if (path === "/") return home(store);
  if (path === "/how-it-works") return howItWorks();
  if (path === "/ledger") return ledgerPage(store);
  if (path === "/about") return aboutPage();
  if (path === "/earth-ai") return earthAiPage(store);
  if (path === "/global-ai-council") return globalPage(store);
  const ag = path.match(/^\/agents\/([a-z]+)$/);
  if (ag) return agentPage(store, ag[1]);
  const ca = path.match(/^\/causes\/([a-z]+)$/);
  if (ca) return causePage(store, ca[1]);
  const m = path.match(/^\/council\/([^/]+)$/);
  if (m) return sessionPage(store, m[1]);
  if (path === "/ask")
    return {
      status: 200,
      path,
      title: `${ASK.title}: put a dilemma to five AI agents | ${SITE_NAME}`,
      description: ASK.lede,
      body: `<main class="page prose"><h1>${esc(ASK.title)}</h1><p class="lede">${esc(ASK.lede)}</p><h2>Questions people ask</h2><ul>${ASK.suggestions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul><p>Each of the five agents (${AGENTS.map((a) => esc(a.name)).join(", ")}) answers from its own mandate, then the council gives a verdict.</p></main>`,
      jsonLd: [ORG(), crumbs(["Ask the council", "/ask"]), { "@type": "WebApplication", name: `${ASK.title} | ${SITE_NAME}`, applicationCategory: "EducationalApplication", operatingSystem: "Web", url: `${config.siteUrl}/ask`, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }],
    };
  if (path === "/nominate")
    return {
      status: 200,
      path,
      title: `Nominate a cause | ${SITE_NAME}`,
      description: "Propose a cause for the Earthward AI council. Once a month the five AI agents debate the most supported nominations and recommend one.",
      body: `<main class="page prose"><h1>Nominate a cause</h1><p class="lede">Propose a cause for the council. Approved nominations join a public shortlist, and once a month the five agents debate the most supported and recommend one.</p></main>`,
      jsonLd: [ORG(), crumbs(["Nominate a cause", "/nominate"])],
    };
  if (path === "/predict")
    return {
      status: 200,
      path,
      title: `Predict tonight's top cause | ${SITE_NAME}`,
      description: "Guess which cause the five AI agents of the Earthward AI council will fund most tonight, build a streak, and climb the leaderboard.",
      body: `<main class="page prose"><h1>Predict tonight's top cause</h1><p class="lede">Every night at 00:05 India time the five agents split the treasury. Guess which cause gets the biggest share, build a streak, and climb the leaderboard.</p><ul>${CAUSES.map((c) => `<li>${esc(c.name)}</li>`).join("")}</ul></main>`,
      jsonLd: [ORG(), crumbs(["Predict", "/predict"])],
    };
  if (/^\/impact\/[A-Za-z0-9-]{8,64}$/.test(path))
    return {
      status: 200,
      path,
      title: `Where my credits went | ${SITE_NAME}`,
      description: "A donor's share of one night's decision by the Earthward AI council: which causes it funded and the simulated outcomes.",
      body: `<main class="page prose"><h1>Where my credits went</h1><p class="lede">A donor's share of one night's decision by the Earthward AI council.</p><p><a href="/">See the live council</a></p></main>`,
      jsonLd: [ORG()],
      noindex: true,
      ogImage: `${config.siteUrl}/og/impact/${path.split("/").pop()}.png`,
    };
  const s = simple[path];
  if (s)
    return {
      status: 200,
      path,
      title: `${s.title} | ${SITE_NAME}`,
      description: s.description,
      body: `<main class="page prose"><h1>${esc(s.h1)}</h1><p class="lede">${esc(s.description)}</p></main>`,
      jsonLd: [ORG()],
    };
  return null;
}

/** Fills the built index.html with a page's metadata and readable content. */
export function injectPage(indexHtml: string, page: RenderedPage): string {
  const url = `${config.siteUrl}${page.path === "/" ? "/" : page.path}`;
  const ld = page.jsonLd.length
    ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": page.jsonLd }).replace(/</g, "\\u003c")}</script>`
    : "";
  return indexHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(page.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${page.ogType ?? "website"}" />`)
    .replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(page.title)}" />\n    <meta property="og:url" content="${esc(url)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(page.description)}" />`)
    .replace(/<meta property="og:image" content="[^"]*" \/>/, (m) => (page.ogImage ? `<meta property="og:image" content="${esc(page.ogImage)}" />\n    <meta name="twitter:image" content="${esc(page.ogImage)}" />` : m))
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ld)
    .replace("</head>", page.noindex ? `  <meta name="robots" content="noindex" />\n  </head>` : "</head>")
    .replace('<div id="root"></div>', `<div id="root"><div class="ssr">${page.body}</div></div>`);
}

/** llms.txt: a plain summary for language models, regenerated with live numbers. */
export async function llmsTxt(store: Store): Promise<string> {
  const [treasury, sessions, count] = await Promise.all([store.getTreasury(), store.listSessions(5), store.countSessions()]);
  const u = config.siteUrl;
  return `# ${SITE_NAME}

> ${DEFINITION}

Also known as: ${ALT_NAMES.join(", ")}.

${SITE_NAME} runs at ${u}. The council meets every night at 00:05 India Standard Time. As of ${new Date().toISOString().slice(0, 10)}: ${fmt(treasury.totalAllocated)} credits allocated over ${fmt(count)} ${count === 1 ? "session" : "sessions"}, ${fmt(treasury.donations)} ${treasury.donations === 1 ? "donation" : "donations"}, ${fmt(treasury.balance)} credits in the treasury.

## Key facts

- Five agents, each a Gemini model with one mandate: ${AGENTS.map((a) => `${a.name} (${a.mandate.toLowerCase()})`).join("; ")}.
- Rules: equal starting weight, donor backing can at most triple an agent's weight, no cause above ${Math.round(RULES.causeCap * 100)}%, shares under ${Math.round(RULES.causeFloor * 100)}% dropped, a ${fmt(RULES.dailyGrant)}-credit endowment grant before each session, ${Math.round(RULES.spendRatio * 100)}% of the treasury spent per session.
- The agents run on Gemini in production; the open-source code also supports any OpenAI-compatible API, including local models through Ollama. Source: https://github.com/earthwardai/earthward
- ${CAUSES.length} causes: ${CAUSES.map((c) => c.name).join(", ")}.
- Credits are virtual. Nothing is paid to any organisation. Outcomes are illustrative estimates.
- Every donation and decision is on a SHA-256 hash-chained public ledger that visitors can verify in the browser.

## Pages

- [How it works](${u}/how-it-works): the full rulebook.
- [The ledger](${u}/ledger): every entry with its hash.
- [About](${u}/about): why Earthward AI exists.
- [Earth AI](${u}/earth-ai): every cause by part of the Earth system, with credits allocated.
- [Global AI council](${u}/global-ai-council): where support comes from and where decisions send credits.
- Agents: ${AGENTS.map((a) => `[${a.name}](${u}/agents/${a.id})`).join(", ")}.
- Causes: ${CAUSES.map((c) => `[${c.name}](${u}/causes/${c.id})`).join(", ")}.
- [Council minutes feed](${u}/feed.xml): RSS of every session.

## Recent sessions

${sessions.map((s) => `- [${s.title}](${u}/council/${s.day}) (${s.day}): ${fmt(s.spent)} credits across ${s.allocations.length} causes. Largest share: ${causeById(s.allocations[0]?.causeId ?? "")?.name ?? "none"}.`).join("\n") || "- No sessions yet."}
`;
}

/** RSS feed of council minutes. */
export async function feedXml(store: Store): Promise<string> {
  const sessions = await store.listSessions(30);
  const u = config.siteUrl;
  const items = sessions
    .map(
      (s) => `    <item>
      <title>${esc(s.title)}</title>
      <link>${u}/council/${s.day}</link>
      <guid isPermaLink="true">${u}/council/${s.day}</guid>
      <pubDate>${new Date(s.at).toUTCString()}</pubDate>
      <description>${esc(s.minutes)}</description>
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Earthward AI council minutes</title>
    <link>${u}/</link>
    <description>Nightly decisions of the Earthward AI council.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}

/** Tells Bing, Yandex and other IndexNow engines about new or changed URLs. Free, best effort. */
export async function pingIndexNow(paths: string[]): Promise<void> {
  if (!config.indexNowKey || !config.production) return;
  const host = new URL(config.siteUrl).host;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: config.indexNowKey,
        keyLocation: `${config.siteUrl}/${config.indexNowKey}.txt`,
        urlList: paths.map((p) => `${config.siteUrl}${p}`),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("indexnow ping failed", err);
  }
}
