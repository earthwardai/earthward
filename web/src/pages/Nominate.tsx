import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { agentById, type AgentId } from "../../../shared/agents";
import type { Nomination, NominationRound } from "../../../shared/types";
import { Sigil } from "../components/Sigil";
import { ApiError, api, usePageMeta } from "../lib";

const VOTED_KEY = "ew_nominations_voted";
const readVoted = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(VOTED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

export function NominatePage() {
  usePageMeta("Nominate a cause", "Propose a cause for the Earthward AI council. Once a month the five agents debate the most supported nominations and recommend one.");
  const [list, setList] = useState<{ nominations: Nomination[]; round: NominationRound | null } | null>(null);
  const [voted, setVoted] = useState<string[]>(readVoted);
  const openedAt = useRef(Date.now());
  const [form, setForm] = useState({ name: "", place: "", summary: "", email: "" });
  const [status, setStatus] = useState<{ state: "idle" | "busy" | "sent" | "error"; text?: string }>({ state: "idle" });

  const load = useCallback(() => api<{ nominations: Nomination[]; round: NominationRound | null }>("/api/nominations").then(setList).catch(() => setList({ nominations: [], round: null })), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trap = new FormData(e.currentTarget).get("website");
    setStatus({ state: "busy" });
    try {
      await api("/api/nominations", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          place: form.place.trim() || undefined,
          summary: form.summary,
          email: form.email.trim() || undefined,
          website: typeof trap === "string" && trap ? trap : undefined,
          elapsed: Date.now() - openedAt.current,
        }),
      });
      setStatus({ state: "sent" });
      setForm({ name: "", place: "", summary: "", email: "" });
    } catch (err) {
      setStatus({ state: "error", text: err instanceof ApiError ? err.message : "That didn't send. Try again." });
    }
  }

  async function upvote(id: string) {
    try {
      await api(`/api/nominations/${id}/upvote`, { method: "POST" });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) return;
    }
    const next = [...new Set([...voted, id])];
    setVoted(next);
    try {
      localStorage.setItem(VOTED_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the server still enforces one vote */
    }
    void load();
  }

  const round = list?.round;
  const nameOf = (id: string) => round?.candidates.find((c) => c.id === id)?.name ?? "";

  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>Nominate a cause</h1>
        <p className="lede">
          Think the council is missing something? Nominate a cause. We review every nomination, approved ones go on the shortlist below, and once a month the five agents
          debate the most supported and recommend one for the catalogue.
        </p>
      </div>

      {round ? (
        <section className="round" aria-labelledby="round-title" style={{ padding: 0 }}>
          <h2 id="round-title">The council's pick for {new Date(`${round.month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</h2>
          <p className="ask-verdict">{round.statement}</p>
          <div className="ask-views">
            {round.views.map((v) => (
              <article key={v.agentId} className="ask-view" style={{ ["--agent" as string]: `var(--${v.agentId})` }}>
                <header>
                  <Sigil agent={v.agentId as AgentId} />
                  <span>{agentById(v.agentId)?.name}</span>
                  <span className="stance">{nameOf(v.pick)}</span>
                </header>
                <p>{v.say}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="shortlist-title" style={{ padding: 0, marginTop: 40 }}>
        <h2 id="shortlist-title">The shortlist</h2>
        {!list ? (
          <p className="muted">Loading…</p>
        ) : list.nominations.length === 0 ? (
          <p className="muted">No nominations on the shortlist yet. Yours could be the first.</p>
        ) : (
          <ol className="nominations">
            {list.nominations.map((n) => (
              <li key={n.id}>
                <div>
                  <p className="nom-name">
                    {n.name}
                    {n.place ? <span className="muted">, {n.place}</span> : null}
                    {n.status === "chosen" ? <span className="stance for">Chosen by the council</span> : null}
                  </p>
                  <p className="muted">{n.summary}</p>
                </div>
                <button type="button" className="btn ghost small" disabled={voted.includes(n.id)} onClick={() => upvote(n.id)} data-track="nomination-upvote">
                  {voted.includes(n.id) ? "Supported" : "Support"} <span className="num">{n.votes}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="nominate-title" style={{ padding: 0, marginTop: 48 }}>
        <h2 id="nominate-title">Nominate a cause</h2>
        {status.state === "sent" ? (
          <p className="form-ok" role="status">
            Thank you. We'll review it, and if it's approved it joins the shortlist.
          </p>
        ) : (
          <form className="contact-form" onSubmit={submit} noValidate>
            <div className="row">
              <div>
                <label className="field-label" htmlFor="n-name">
                  Cause
                </label>
                <input id="n-name" className="text-input" maxLength={60} required placeholder="Soil restoration" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="n-place">
                  Where (optional)
                </label>
                <input id="n-place" className="text-input" maxLength={60} placeholder="The Sahel" value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="n-summary">
                What it does and why the council should fund it
              </label>
              <textarea id="n-summary" className="text-input" maxLength={400} required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="n-email">
                Email, if you'd like to hear what happens (never shown)
              </label>
              <input id="n-email" className="text-input" type="email" maxLength={160} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="trap" aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            {status.state === "error" ? (
              <p className="form-error" role="alert">
                {status.text}
              </p>
            ) : null}
            <div>
              <button type="submit" className="btn" disabled={status.state === "busy"} data-track="nomination-submit">
                {status.state === "busy" ? "Sending…" : "Nominate"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
