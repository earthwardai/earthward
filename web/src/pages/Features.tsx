import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { agentById, type AgentId } from "../../../shared/agents";
import { causeById } from "../../../shared/causes";
import { ASK } from "../../../shared/content";
import type { AskResponse, ImpactResponse } from "../../../shared/types";
import { Share } from "../components/Share";
import { Sigil } from "../components/Sigil";
import { ApiError, api, countdown, credits, longDate, useNow, usePageMeta } from "../lib";

const STANCE: Record<AskResponse["views"][number]["stance"], string> = { for: "For", against: "Against", mixed: "It depends" };
const agentStyle = (id: string) => ({ ["--agent" as string]: `var(--${id})` });
const units = (n: number) => (n < 10 ? n.toLocaleString("en-US", { maximumFractionDigits: 1 }) : Math.round(n).toLocaleString("en-US"));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// --- Ask the council ----------------------------------------------------------

export function AskPage() {
  usePageMeta(ASK.title, ASK.lede);
  const [question, setQuestion] = useState(() => new URLSearchParams(window.location.search).get("q")?.slice(0, 300) ?? "");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    const q = question.trim();
    if (q.length < 8) {
      setError("Ask a full question, at least a few words.");
      return;
    }
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      setAnswer(await api<AskResponse>("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The council couldn't be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>{ASK.title}</h1>
        <p className="lede">{ASK.lede}</p>
      </div>
      <form className="ask-form" onSubmit={ask}>
        <label className="field-label" htmlFor="ask-q">
          Your question
        </label>
        <textarea
          id="ask-q"
          className="text-input"
          maxLength={300}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Should we plant new forests or protect the old ones first?"
        />
        <div className="ask-suggest" aria-label="Example questions">
          {ASK.suggestions.map((s) => (
            <button key={s} type="button" className="ask-chip" onClick={() => setQuestion(s)} data-track="ask-suggestion">
              {s}
            </button>
          ))}
        </div>
        <button type="submit" className="btn" disabled={busy} data-track="ask-submit">
          {busy ? "The council is deliberating…" : "Ask the council"}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {answer ? (
        <section className="ask-answer" aria-live="polite" aria-labelledby="verdict-title">
          <h2 id="verdict-title">The verdict</h2>
          <p className="ask-verdict">{answer.verdict}</p>
          <div className="ask-views">
            {answer.views.map((v) => {
              const a = agentById(v.agentId)!;
              return (
                <article key={v.agentId} className="ask-view" style={agentStyle(v.agentId)}>
                  <header>
                    <Sigil agent={v.agentId as AgentId} />
                    <Link href={`/agents/${v.agentId}`}>{a.name}</Link>
                    <span className={`stance ${v.stance}`}>{STANCE[v.stance]}</span>
                  </header>
                  <p>{v.say}</p>
                </article>
              );
            })}
          </div>
          <div style={{ marginTop: 28 }}>
            <Share path="/ask" campaign="ask" label="Share this verdict" text={clip(`I asked the Earthward AI council: "${answer.question}" Their verdict: ${answer.verdict}`, 240)} />
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** A short invitation on the home page. */
export function AskTeaser() {
  return (
    <section id="ask" aria-labelledby="ask-title">
      <div className="section-head">
        <div>
          <h2 id="ask-title">Ask the council</h2>
          <p className="lede">Bring your own dilemma. All five agents answer from their mandates, and the council gives a verdict in seconds.</p>
        </div>
      </div>
      <div className="ask-suggest">
        {ASK.suggestions.slice(0, 3).map((s) => (
          <Link key={s} className="ask-chip" href={`/ask?q=${encodeURIComponent(s)}`} data-track="home-ask-suggestion">
            {s}
          </Link>
        ))}
      </div>
      <Link className="btn" href="/ask" data-track="home-ask">
        Ask your own question
      </Link>
    </section>
  );
}

// --- A donor's receipt ----------------------------------------------------------

export function ImpactPage({ id }: { id: string }) {
  usePageMeta("Where your credits went", "See exactly what your share of the Earthward AI council's decision funded.");
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const now = useNow(1000);

  useEffect(() => {
    api<ImpactResponse>(`/api/donations/${encodeURIComponent(id)}/impact`)
      .then(setData)
      .catch(() => setMissing(true));
  }, [id]);

  if (missing)
    return (
      <main id="main" className="page prose">
        <h1>We couldn't find that donation</h1>
        <p className="lede">Check the link from your receipt, or browse every entry on the <Link href="/ledger">ledger</Link>.</p>
      </main>
    );
  if (!data)
    return (
      <main id="main" className="page prose">
        <p className="lede">Finding your donation on the ledger…</p>
      </main>
    );

  const d = data.donation;
  const backing = d.agentId ? `, backing ${agentById(d.agentId)?.name}` : "";

  if (data.status === "pending") {
    const left = new Date(data.nextSessionAt).getTime() - now;
    return (
      <main id="main" className="page prose">
        <h1>Your {credits(d.amount)} credits are in tonight's pool</h1>
        <p className="lede">
          You gave {credits(d.amount)} credits{backing}. The council meets in <span className="num">{countdown(Math.max(0, left))}</span>. Come back after it meets to see
          exactly what your share funded.
        </p>
        <Share path={`/impact/${id}`} campaign="impact" label="Invite others to give" text={`I just gave ${credits(d.amount)} credits to the Earthward AI council. Tonight five AI agents decide where they do the most good.`} />
      </main>
    );
  }

  const top = data.items.slice(0, 2).map((i) => {
    const c = causeById(i.causeId)!;
    return `${units(i.units)} ${c.unit}`;
  });
  return (
    <main id="main" className="page">
      <div className="prose">
        <p className="lede">Your receipt</p>
        <h1>Where your {credits(d.amount)} credits went</h1>
        <p className="lede">
          On {longDate(data.session.day)} the council met with {credits(data.session.pool)} credits, and your donation{backing} was{" "}
          {(data.share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% of the pool. Your share of tonight's spending was {units(data.spent)} credits; the other{" "}
          {units(data.reserve)} stay in reserve for future nights.
        </p>
      </div>
      <ol className="impact-list">
        {data.items.map((i) => {
          const c = causeById(i.causeId)!;
          return (
            <li key={i.causeId} style={agentStyle(c.domain)}>
              <Link href={`/causes/${c.id}`}>{c.name}</Link>
              <span className="num credits">{units(i.credits)} credits</span>
              <span className="num outcome">
                about {units(i.units)} {c.unit}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="hint">Outcomes are illustrative estimates. No real money moves.</p>
      <div className="session-nav" style={{ marginTop: 24 }}>
        <Link className="btn ghost" href={`/council/${data.session.day}`}>
          Read that night's minutes
        </Link>
      </div>
      <div style={{ marginTop: 24 }}>
        <Share
          path={`/impact/${id}`}
          campaign="impact"
          label="Share your impact"
          text={`My ${credits(d.amount)} credits on the Earthward AI council funded about ${top.join(" and ")}. Five AI agents decided where.`}
        />
      </div>
    </main>
  );
}
