import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AGENTS, agentById } from "../../../shared/agents";
import { causeById } from "../../../shared/causes";
import { HEADLINE, SUMMARY, faq } from "../../../shared/content";
import type { LedgerEntry } from "../../../shared/ledger";
import { AllocationChart } from "../components/AllocationChart";
import { openDonate } from "../components/DonateDialog";
import { Emblem } from "../components/Emblem";
import { Journey } from "../components/Journey";
import { LedgerList, VerifyChain } from "../components/Ledger";
import { Sigil } from "../components/Sigil";
import { ago, countdown, countryName, credits, getLedger, longDate, useLiveState, useNow, usePageMeta, useReducedMotion, useTween } from "../lib";
import { AskTeaser } from "./Features";

export function Home() {
  usePageMeta("Earthward", "Donate virtual credits. Each night five AI agents debate where they do the most good for the planet, and every decision goes on a public ledger.");
  const state = useLiveState();
  const reduced = useReducedMotion();
  const now = useNow();
  const balance = useTween(state?.treasury.balance ?? 0, reduced);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const seen = useRef<Set<string> | null>(null);

  const headSeq = state?.head?.seq;
  useEffect(() => {
    if (headSeq === undefined) return;
    getLedger(undefined, 6)
      .then((r) => setEntries(r.entries))
      .catch(() => undefined);
  }, [headSeq]);

  // Highlight donations that arrive while the page is open.
  const recent = state?.recent ?? [];
  const fresh = new Set<string>();
  if (seen.current) for (const d of recent) if (!seen.current.has(d.id)) fresh.add(d.id);
  useEffect(() => {
    if (state) seen.current = new Set(state.recent.map((d) => d.id));
  }, [state]);

  const session = state?.latestSession ?? null;
  const nextIn = state ? new Date(state.nextSessionAt).getTime() - now : null;

  const stats = state?.stats;
  const support = state?.links.support ?? null;

  return (
    <main id="main">
      <div className="hero">
        <div className="hero-copy">
          <p className="pill">Live simulation, no real money</p>
          <h1 className="hero-title">{HEADLINE}</h1>
          <p className="hero-sub">{SUMMARY}</p>
          <div className="hero-ctas">
            <button type="button" className="btn" onClick={openDonate} data-track="hero-donate">
              Donate credits
            </button>
            <Link className="btn ghost" href="/how-it-works" data-track="hero-how">
              How it works
            </Link>
          </div>
        </div>

        {session ? (
          <section className="hero-proof" aria-labelledby="proof-title">
            <h2 id="proof-title">Latest decision, {longDate(session.day).split(",")[0]}</h2>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {session.allocations.slice(0, 3).map((a) => (
                <li key={a.causeId}>
                  <span>{causeById(a.causeId)?.name}</span>
                  <span className="amt num">{Math.round(a.share * 100)}%</span>
                  <span className="sub num">
                    {credits(a.units)} {causeById(a.causeId)?.unit} (simulated)
                  </span>
                </li>
              ))}
            </ul>
            <p style={{ margin: "14px 0 0", fontSize: 14 }}>
              <Link href={`/council/${session.day}#replay`} data-track="hero-replay">
                Watch the debate
              </Link>
              {" or "}
              <Link href={`/council/${session.day}`} data-track="hero-minutes">
                read the minutes
              </Link>
            </p>
          </section>
        ) : null}

        <Emblem recent={recent} session={session} reduced={reduced}>
          <div className="treasury" aria-live="polite">
            <p className="treasury-label">Credits in the treasury</p>
            <p className="treasury-figure num">{state ? credits(balance) : "…"}</p>
            <p className="treasury-next">
              {nextIn !== null ? (
                <>
                  The council meets in <span className="num">{countdown(nextIn)}</span>
                </>
              ) : (
                "Connecting to the council"
              )}
            </p>
          </div>
        </Emblem>
      </div>

      <section aria-labelledby="numbers-title">
        <h2 id="numbers-title" className="visually-hidden">
          Earthward in numbers
        </h2>
        <dl className="metrics num">
          <div>
            <dt>Credits allocated</dt>
            <dd>{state ? credits(state.treasury.totalAllocated) : "…"}</dd>
          </div>
          <div>
            <dt>Donations</dt>
            <dd>{state ? credits(state.treasury.donations) : "…"}</dd>
          </div>
          <div>
            <dt>Countries giving</dt>
            <dd>{stats ? credits(stats.countries) : "…"}</dd>
          </div>
          <div>
            <dt>Council sessions</dt>
            <dd>{stats ? credits(stats.sessions) : "…"}</dd>
          </div>
        </dl>

        <div className="today">
          <dl className="today-stats">
            <div className="stat">
              <dt>Donations today</dt>
              <dd className="num">{state ? credits(state.today.donations) : "…"}</dd>
            </div>
            <div className="stat">
              <dt>Credits today</dt>
              <dd className="num">{state ? credits(state.today.credits) : "…"}</dd>
            </div>
          </dl>
          <div>
            <h3 className="visually-hidden">Latest donations</h3>
            {recent.length ? (
              <ul className="feed">
                {recent.slice(0, 5).map((d) => (
                  <li key={d.id} className={fresh.has(d.id) ? "fresh" : undefined}>
                    <span className="who">
                      {d.name ?? "Someone"}
                      {d.country ? <span className="muted"> in {countryName(d.country)}</span> : null}
                    </span>
                    <span className="when">{ago(d.at, now)}</span>
                    <span className="what num">
                      {credits(d.amount)} credits{d.agentId ? `, backing ${agentById(d.agentId)?.name}` : ""}
                    </span>
                    {d.message ? <span className="note">“{d.message}”</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No donations yet today. The first one sets the tone for tonight's session.</p>
            )}
          </div>
        </div>
      </section>

      <Journey state={state} />

      <section aria-labelledby="why-title">
        <div className="section-head">
          <div>
            <h2 id="why-title">Why Earthward</h2>
            <p className="lede">A public experiment in letting AI reason about generosity, built so you can check its work.</p>
          </div>
        </div>
        <ul className="features">
          <li>
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M7 5h13l5 5v17H7z M20 5v5h5 M11 15h10 M11 19h10 M11 23h6" />
            </svg>
            <h3>Decisions you can read</h3>
            <p>Every allocation comes with minutes and each agent's reasoning, in plain language.</p>
          </li>
          <li>
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M5 16h6 M21 16h6 M11 11h10v10H11z M3 11h2v10H3z M27 11h2v10h-2z" />
            </svg>
            <h3>A ledger you can verify</h3>
            <p>Each entry is chained to the last by a SHA-256 hash. Check the whole chain in your browser.</p>
          </li>
          <li>
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M16 4 6 27 M16 4l10 23 M4 27h24 M11 17h10" />
            </svg>
            <h3>Five voices, no single owner</h3>
            <p>Agents with different mandates vote. No cause can take more than 30% of a night's spend.</p>
          </li>
          <li>
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M16 4c6 4 9 7 9 12a9 9 0 0 1-18 0c0-5 3-8 9-12z M12 17l3 3 6-6" />
            </svg>
            <h3>Zero real money</h3>
            <p>Credits are virtual. Explore how allocation works with no risk to you or anyone else.</p>
          </li>
        </ul>
      </section>

      <section id="council" aria-labelledby="council-title">
        <div className="section-head">
          <div>
            <h2 id="council-title">The council</h2>
            <p className="lede">Five agents, each holding one mandate. They argue for it, they vote, and backing from donors tilts the vote.</p>
          </div>
        </div>
        <div className="chamber">
          {AGENTS.map((a) => {
            const live = state?.agents.find((x) => x.id === a.id);
            return (
              <article key={a.id} className="seat" style={{ ["--agent" as string]: `var(--${a.id})` }}>
                <Sigil agent={a.id} />
                <h3>
                  <Link href={`/agents/${a.id}`}>{a.name}</Link>
                </h3>
                <p className="mandate">{a.mandate}</p>
                <p className="temperament">{a.temperament}</p>
                {live?.lastQuote ? <blockquote>“{live.lastQuote}”</blockquote> : null}
                <p className="backing num">
                  {live ? `Backed ${live.endorsementsToday} ${live.endorsementsToday === 1 ? "time" : "times"} today` : ""}
                  {live?.lastTopCause ? `. Last pushed for ${causeById(live.lastTopCause)?.name.toLowerCase()}.` : ""}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <AskTeaser />

      <section id="decision" aria-labelledby="decision-title">
        <div className="section-head">
          <div>
            <h2 id="decision-title">The latest decision</h2>
            {session ? <p className="lede">{longDate(session.day)}</p> : null}
          </div>
          {session ? (
            <Link href={`/council/${session.day}`} data-track="decision-full">
              How each agent voted
            </Link>
          ) : null}
        </div>
        {session ? (
          <div className="decision">
            <div>
              <h3 className="decision-title">{session.title}</h3>
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
                  <dt>Rolled over</dt>
                  <dd>{credits(session.reserve)}</dd>
                </div>
                <div>
                  <dt>Ledger entry</dt>
                  <dd>#{session.seq}</dd>
                </div>
              </dl>
            </div>
            <AllocationChart allocations={session.allocations} spent={session.spent} />
          </div>
        ) : (
          <p className="empty">The council hasn't met yet. Its first session is at midnight, India time.</p>
        )}
      </section>

      <section id="ledger" aria-labelledby="ledger-title">
        <div className="section-head">
          <div>
            <h2 id="ledger-title">The ledger</h2>
            <p className="lede">Every donation and every decision is chained to the one before it by a SHA-256 hash, so no past entry can change without breaking every entry after it.</p>
          </div>
          <Link href="/ledger" data-track="ledger-full">
            Open the full ledger
          </Link>
        </div>
        <LedgerList entries={entries} />
        <VerifyChain />
      </section>

      <section id="faq" className="faq" aria-labelledby="faq-title">
        <div>
          <h2 id="faq-title">Questions</h2>
          <p className="lede">
            Something else on your mind? <Link href="/contact">Write to us</Link>.
          </p>
        </div>
        <div className="faq-list">
          {faq(Boolean(support)).map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>
                {f.a}
                {f.more ? (
                  <>
                    {" "}
                    <Link href={f.more.href}>{f.more.label}</Link>.
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </section>

      {support ? (
        <section aria-labelledby="support-title">
          <div className="support">
            <div>
              <h2 id="support-title">Keep the council running</h2>
              <p>Earthward is free and runs on donated time. A coffee helps cover hosting and AI costs. This is a real, optional tip, separate from the virtual credits.</p>
            </div>
            <a className="btn" href={support} target="_blank" rel="noopener noreferrer" data-track="support-coffee">
              Buy us a coffee
            </a>
          </div>
        </section>
      ) : null}
    </main>
  );
}
