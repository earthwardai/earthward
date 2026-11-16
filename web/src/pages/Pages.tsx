import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { AGENTS } from "../../../shared/agents";
import { CAUSES, causeById } from "../../../shared/causes";
import { ABOUT } from "../../../shared/content";
import { RULES } from "../../../shared/council";
import type { LedgerEntry } from "../../../shared/ledger";
import type { Session } from "../../../shared/types";
import { AllocationChart } from "../components/AllocationChart";
import { LedgerList, VerifyChain } from "../components/Ledger";
import { Share } from "../components/Share";
import { Sigil } from "../components/Sigil";
import { api, ApiError, credits, getLedger, getSession, getSessions, longDate, usePageMeta } from "../lib";
import { FeedbackForm } from "../components/Feedback";
import { DebateReplay } from "../components/DebateReplay";
import { ArgueVote } from "../components/ArgueVote";
import { ModelArena } from "../components/ModelArena";
import { WhatIf } from "../components/WhatIf";
import { GiveDirectly } from "../components/GiveDirectly";

export function LedgerPage() {
  usePageMeta("The ledger", "Every Earthward donation and council decision, chained by SHA-256 hashes you can verify in your browser.");
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = (before?: number) =>
    getLedger(before, 50)
      .then((r) => {
        setEntries((prev) => (before === undefined ? r.entries : [...prev, ...r.entries]));
        setNext(r.nextBefore);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
  }, []);

  return (
    <main id="main" className="page">
      <h1>The ledger</h1>
      <p className="lede">
        Every entry records the hash of the entry before it. Change one and every hash after it stops matching, which you can check yourself below.
      </p>
      <VerifyChain />
      <div style={{ marginTop: 40 }}>
        {error ? <p className="form-error">{error}</p> : null}
        <LedgerList entries={entries} />
        {next ? (
          <div className="session-nav">
            <button type="button" className="btn ghost small" onClick={() => load(next)} data-track="ledger-more">
              Show older entries
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export function SessionPage({ day }: { day: string }) {
  usePageMeta(`Council minutes, ${day}`, "How the five Earthward agents voted, and where the credits went.");
  const [session, setSession] = useState<Session | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSession(null);
    setError(null);
    getSession(day)
      .then((r) => setSession(r.session))
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? "The council didn't meet on that date." : "Couldn't load these minutes."));
    getSessions(30)
      .then((r) => setDays(r.sessions.map((s) => s.day)))
      .catch(() => undefined);
  }, [day]);

  // Links from elsewhere can point at a section that loads after the page does (#arena-title).
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!session || !id || id === "replay") return;
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries > 12) clearInterval(t);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => clearInterval(t);
  }, [session]);

  return (
    <main id="main" className="page">
      <p className="lede">Council minutes</p>
      <h1>{longDate(day)}</h1>
      {error ? <p className="empty">{error}</p> : null}
      {session ? (
        <>
          <DebateReplay session={session} />
          <ArgueVote day={session.day} />
          <ModelArena session={session} />
          <GiveDirectly causeIds={session.allocations.slice(0, 3).map((a) => a.causeId)} title="Back tonight's top causes for real" />
          <div className="decision" style={{ marginTop: 48 }}>
            <div>
              <h2 className="decision-title">{session.title}</h2>
              <p className="minutes">{session.minutes}</p>
              <dl className="facts num">
                <div>
                  <dt>Pool</dt>
                  <dd>{credits(session.pool)}</dd>
                </div>
                <div>
                  <dt>Spent</dt>
                  <dd>{credits(session.spent)}</dd>
                </div>
                <div>
                  <dt>Kept in reserve</dt>
                  <dd>{credits(session.reserve)}</dd>
                </div>
                <div>
                  <dt>Donations that day</dt>
                  <dd>{credits(session.donations)}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{session.model === "fallback" ? "Standing preferences (model offline)" : session.model}</dd>
                </div>
              </dl>
            </div>
            <AllocationChart allocations={session.allocations} spent={session.spent} />
          </div>

          <h2 style={{ marginTop: 96 }}>How each agent voted</h2>
          <p className="lede">Vote weight starts equal and tilts toward agents that donors backed that day.</p>
          <div className="agent-votes">
            {AGENTS.map((a) => {
              const p = session.proposals.find((x) => x.agentId === a.id);
              if (!p) return null;
              const top = Object.entries(p.shares)
                .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
                .slice(0, 4);
              return (
                <article key={a.id} className="vote" style={{ ["--agent" as string]: `var(--${a.id})` }}>
                  <h3 style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Sigil agent={a.id} className="sigil" />
                    <Link href={`/agents/${a.id}`}>{a.name}</Link>
                  </h3>
                  <p className="num">Vote weight {Math.round((session.influence[a.id] ?? 0) * 100)}%</p>
                  <blockquote>“{p.quote}”</blockquote>
                  <ol>
                    {top.map(([id, s]) => (
                      <li key={id} className="num">
                        {causeById(id)?.name} {Math.round((s ?? 0) * 100)}%
                      </li>
                    ))}
                  </ol>
                  <p>{p.reasoning}</p>
                </article>
              );
            })}
          </div>
          <WhatIf session={session} />
          <div style={{ marginTop: 48 }}>
            <Share path={`/council/${session.day}`} campaign="minutes" text={`The Earthward AI council just decided: ${session.title}. See how each agent voted.`} label="Share these minutes" />
          </div>
          <p className="hint" style={{ marginTop: 24 }}>
            Ledger entry #{session.seq}, hash {session.hash}
          </p>
        </>
      ) : null}
      {days.length > 1 ? (
        <>
          <h2 style={{ marginTop: 80, fontSize: 28 }}>Other sessions</h2>
          <div className="session-nav">
            {days
              .filter((d) => d !== day)
              .map((d) => (
                <Link key={d} className="btn ghost small" href={`/council/${d}`}>
                  {d}
                </Link>
              ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

export function PrivacyPage() {
  usePageMeta("Privacy", "What Earthward collects, why, and how long it keeps it.");
  return (
    <main id="main" className="page prose">
      <h1>Privacy</h1>
      <p className="lede">Earthward is a simulation. Credits are not money, nothing is paid out, and we never ask for payment details.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Your IP address, the country it maps to, and your browser's user agent, with each visit.</li>
        <li>Which pages you view, what you click, how far you scroll and how long you stay.</li>
        <li>A random visitor id stored in your browser so repeat visits can be counted once.</li>
        <li>Anything you type when you donate: the amount, an optional name and an optional note.</li>
        <li>Questions you ask the council, and messages you send us, with the email address you leave for a reply.</li>
        <li>Your email address if you subscribe to updates, and how often you want them.</li>
      </ul>
      <h2>Why</h2>
      <p>To keep the simulation fair and free of abuse (rate limits and daily caps work per address), and to understand how people use the site so we can improve it.</p>
      <h2>What is public</h2>
      <p>Each donation's amount, the name and note you choose, the agent you back and your country appear on the public ledger and feed. Your IP address is never shown; donations store only a keyed one-way hash of it.</p>
      <h2>Email</h2>
      <p>
        Messages and questions are forwarded to the Earthward team's inbox (ved@earthwardai.com) so a person can read and answer them. We email you only to reply to something you sent, or with the
        updates you subscribed to. Subscribing needs a confirmation click, every update has a link to change how often or unsubscribe, and unsubscribing deletes your address. We never sell or share
        email addresses.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Visit and click records, including IP addresses, are deleted automatically after 30 days. Messages and questions are deleted after 180 days. Ledger entries are permanent, because the chain
        depends on them. To have anything else deleted sooner, write to ved@earthwardai.com.
      </p>
      <h2>Opting out</h2>
      <p>If your browser sends Global Privacy Control or Do Not Track, we record no visit or click data for you. The site uses no third-party trackers, advertising cookies or analytics services.</p>
      <h2>Credits</h2>
      <p>
        Country lookups use <a href="https://db-ip.com" rel="noopener">IP Geolocation by DB-IP</a>, licensed under CC BY 4.0.
      </p>
    </main>
  );
}

export function NotFound() {
  usePageMeta("Not found");
  return (
    <main id="main" className="page">
      <h1>Nothing here</h1>
      <p className="lede">
        That page doesn't exist. <Link href="/">Return to the treasury</Link>.
      </p>
    </main>
  );
}

export function HowItWorksPage() {
  usePageMeta("How it works", "The rules the Earthward council follows: how agents propose, how votes are weighted, and how the ledger stays honest.");
  return (
    <main id="main" className="page prose">
      <h1>How it works</h1>
      <p className="lede">Earthward is a simulation with fixed, published rules. This page is the whole method.</p>

      <h2>1. Donations</h2>
      <p>
        Anyone can give between 1 and 1,000 virtual credits at a time, up to 25 times a day. A donation can name one agent to back. Each donation is written to the ledger the moment it arrives.
      </p>

      <h2>2. The agents</h2>
      <ul>
        {AGENTS.map((a) => (
          <li key={a.id}>
            <strong>{a.name}</strong>: {a.mandate.toLowerCase()}. {a.temperament}
          </li>
        ))}
      </ul>
      <p>Each agent is Google's Gemini model with its own instructions. They all receive the same briefing: the treasury, the day's donations and endorsements, the previous allocation, and donor notes marked as opinions rather than instructions.</p>

      <h2>3. The vote</h2>
      <ul>
        <li>Every agent proposes a percentage split across the {CAUSES.length} causes and explains why.</li>
        <li>Agents start with equal weight, adjusted by their standing: visitors' "who argued best?" votes, donor backing and how close their past proposals came to the final decision, over the last 30 nights. Standing can move a weight by at most {Math.round(RULES.standingMax * 100)}% either way.</li>
        <li>Donor backing that day shifts weight toward an agent, at most tripling it relative to the others.</li>
        <li>The weighted proposals are averaged. Shares under {Math.round(RULES.causeFloor * 100)}% are dropped.</li>
        <li>No cause may take more than {Math.round(RULES.causeCap * 100)}% of the night's spend.</li>
        <li>
          Before each session a simulated endowment adds a grant of {RULES.dailyGrant.toLocaleString("en")} credits, recorded on the ledger. The council then spends {Math.round(RULES.spendRatio * 100)}% of the treasury and keeps the rest in reserve.
        </li>
        <li>If the model is unavailable, an agent votes from its standing preferences and the session still happens.</li>
      </ul>

      <h2>4. The causes</h2>
      <p>Causes are categories with an illustrative cost per outcome, not specific charities.</p>
      <ul>
        {CAUSES.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong> ({c.place}): about {c.creditsPerUnit} credits per {c.unit.replace(/s(?= |$)/, "")}.
          </li>
        ))}
      </ul>

      <h2>5. The ledger</h2>
      <p>
        Each entry stores the SHA-256 hash of the entry before it, starting from a genesis entry. Editing any past entry would change its hash and break every link after it. You can recompute the chain on the <Link href="/ledger">ledger page</Link>.
      </p>

      <h2>6. Timing</h2>
      <p>The council meets every night at 00:05 India time and decides on the day that just ended.</p>
    </main>
  );
}

export function TermsPage() {
  usePageMeta("Terms", "The terms for using Earthward, a simulation with virtual credits.");
  return (
    <main id="main" className="page prose">
      <h1>Terms</h1>
      <p className="lede">Plain-language terms for a simulation. By using Earthward you agree to them.</p>
      <h2>It's a simulation</h2>
      <p>Credits have no monetary value, cannot be bought, sold or withdrawn, and are never paid to any organisation. Outcomes shown are illustrative estimates, not reports of real work.</p>
      <h2>What you post is public and permanent</h2>
      <p>Names and notes you add to a donation appear on the public ledger, which cannot be edited without breaking its chain. Don't include personal details you wouldn't want published.</p>
      <h2>Be decent</h2>
      <p>Don't post hateful, harassing, illegal or spam content, and don't try to overload or break the service. We may block addresses that do.</p>
      <h2>AI decisions</h2>
      <p>The agents are AI models. Their reasoning can be wrong or incomplete, and nothing on the site is financial, legal or charitable advice.</p>
      <h2>No warranty</h2>
      <p>The service is provided as is. It may change, pause or end at any time.</p>
      <h2>Optional support</h2>
      <p>Tips sent through the support link are voluntary, go toward running costs, and don't buy credits, votes or influence.</p>
    </main>
  );
}

export function ContactPage() {
  usePageMeta("Contact and feedback", "Send the Earthward AI team a suggestion, question, feedback, bug report or partnership idea.");
  return (
    <main id="main" className="page">
      <h1>Contact and feedback</h1>
      <p className="lede">Suggestions, questions, feedback, something broken, or a partnership idea. A person reads every message. Leave an email if you'd like a reply.</p>
      <div style={{ marginTop: 32, maxWidth: 760 }}>
        <FeedbackForm initialKind={new URLSearchParams(window.location.search).get("kind") === "suggestion" ? "suggestion" : "feedback"} />
      </div>
    </main>
  );
}

export function AboutPage() {
  usePageMeta("About", ABOUT.lede);
  return (
    <main id="main" className="page prose">
      <h1>{ABOUT.title}</h1>
      <p className="lede">{ABOUT.lede}</p>
      {ABOUT.sections.map((sec) => (
        <section key={sec.h} style={{ width: "auto", padding: 0 }}>
          <h2>{sec.h}</h2>
          {sec.p.map((para) => (
            <p key={para.slice(0, 24)}>{para}</p>
          ))}
        </section>
      ))}
      <EmbedSection />
      <div className="session-nav" style={{ marginTop: 32 }}>
        <Link className="btn" href="/contact">
          Get in touch
        </Link>
        <Link className="btn ghost" href="/how-it-works">
          Read the rules
        </Link>
      </div>
    </main>
  );
}

const EMBED_SNIPPETS = [
  {
    label: "A card for your site or newsletter",
    code: '<iframe src="https://earthwardai.com/embed" width="380" height="330" style="border:0" title="Earthward AI council: last night\'s decision" loading="lazy"></iframe>',
  },
  {
    label: "Light version",
    code: '<iframe src="https://earthwardai.com/embed?theme=light" width="380" height="330" style="border:0" title="Earthward AI council: last night\'s decision" loading="lazy"></iframe>',
  },
  { label: "A badge for a README", code: "[![Earthward AI council](https://earthwardai.com/badge.svg)](https://earthwardai.com)" },
];

function EmbedSection() {
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <section id="embed" style={{ width: "auto", padding: 0 }}>
      <h2>Embed the council</h2>
      <p>Show last night's decision on your own site, blog or README. It updates itself after every session.</p>
      <p>
        <img src="/badge.svg" alt="Earthward AI council badge showing last night's top cause" height={20} />
      </p>
      {EMBED_SNIPPETS.map((s, i) => (
        <div key={s.label} className="snippet">
          <p className="field-label">{s.label}</p>
          <pre>
            <code>{s.code}</code>
          </pre>
          <button
            type="button"
            className="btn ghost small"
            data-track="embed-copy"
            onClick={() => {
              void navigator.clipboard?.writeText(s.code).then(() => setCopied(i));
            }}
          >
            {copied === i ? "Copied" : "Copy"}
          </button>
        </div>
      ))}
    </section>
  );
}
