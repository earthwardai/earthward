import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AGENTS, agentById, type AgentId } from "../../../shared/agents";
import { CAUSES, causeById } from "../../../shared/causes";
import { DOMAIN_LABELS, EARTH_AI, GLOBAL_AI } from "../../../shared/content";
import type { Insights } from "../../../shared/types";
import { Sigil } from "../components/Sigil";
import { api, countryName, credits, longDate, useLiveState, usePageMeta } from "../lib";
import { NotFound } from "./Pages";

let cached: Insights | null = null;
function useInsights(): Insights | null {
  const [data, setData] = useState(cached);
  useEffect(() => {
    api<Insights>("/api/insights")
      .then((d) => {
        cached = d;
        setData(d);
      })
      .catch(() => undefined);
  }, []);
  return data;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const agentStyle = (id: string) => ({ ["--agent" as string]: `var(--${id})` });

export function EarthAiPage() {
  usePageMeta("Earth AI for the planet's causes", EARTH_AI.lede);
  const ins = useInsights();
  return (
    <main id="main" className="page prose">
      <h1>{EARTH_AI.title}</h1>
      <p className="lede">{EARTH_AI.lede}</p>
      {EARTH_AI.paras.map((p) => (
        <p key={p.slice(0, 20)}>{p}</p>
      ))}
      {AGENTS.map((a) => (
        <section key={a.id} style={{ width: "auto", padding: 0 }}>
          <h2 style={agentStyle(a.id)}>{DOMAIN_LABELS[a.id]}</h2>
          <p>
            Championed by <Link href={`/agents/${a.id}`}>{a.name}</Link>: {a.mandate.toLowerCase()}.
          </p>
          <ul>
            {CAUSES.filter((c) => c.domain === a.id).map((c) => (
              <li key={c.id}>
                <Link href={`/causes/${c.id}`}>{c.name}</Link> ({c.place}):{" "}
                <span className="num">
                  {credits(ins?.causes[c.id]?.credits ?? 0)} credits allocated, simulated {credits(ins?.causes[c.id]?.units ?? 0)} {c.unit}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="hint" style={{ marginTop: 40 }}>
        {EARTH_AI.disambiguation}
      </p>
    </main>
  );
}

export function GlobalAiPage() {
  usePageMeta("Global AI council for the Earth", GLOBAL_AI.lede);
  const ins = useInsights();
  const state = useLiveState();
  return (
    <main id="main" className="page prose">
      <h1>{GLOBAL_AI.title}</h1>
      <p className="lede">{GLOBAL_AI.lede}</p>
      {GLOBAL_AI.paras.map((p) => (
        <p key={p.slice(0, 20)}>{p}</p>
      ))}
      <dl className="metrics num" style={{ marginTop: 32 }}>
        <div>
          <dt>Countries giving</dt>
          <dd>{ins ? credits(ins.countries.length) : "…"}</dd>
        </div>
        <div>
          <dt>Donations</dt>
          <dd>{state ? credits(state.treasury.donations) : "…"}</dd>
        </div>
        <div>
          <dt>Sessions held</dt>
          <dd>{state ? credits(state.stats.sessions) : "…"}</dd>
        </div>
        <div>
          <dt>Credits allocated</dt>
          <dd>{state ? credits(state.treasury.totalAllocated) : "…"}</dd>
        </div>
      </dl>
      <h2>Where support comes from</h2>
      {ins?.countries.length ? (
        <ul>
          {ins.countries.slice(0, 40).map((c) => (
            <li key={c.code} className="num">
              {countryName(c.code) ?? c.code}: {credits(c.donations)} {c.donations === 1 ? "donation" : "donations"}
            </li>
          ))}
        </ul>
      ) : (
        <p>The first donations are arriving now. Yours could put a new country on the map.</p>
      )}
      <h2>Where decisions send credits</h2>
      <ul>
        {CAUSES.map((c) => (
          <li key={c.id}>
            <Link href={`/causes/${c.id}`}>{c.name}</Link>, {c.place}
          </li>
        ))}
      </ul>
    </main>
  );
}

export function AgentPage({ id }: { id: string }) {
  const a = agentById(id);
  usePageMeta(a ? `${a.name}, the AI agent for ${a.mandate.toLowerCase()}` : "Agent not found", a ? `${a.mandate}. ${a.temperament}` : undefined);
  const ins = useInsights();
  if (!a) return <NotFound />;
  const st = ins?.agents[a.id];
  return (
    <main id="main" className="page prose" style={agentStyle(a.id)}>
      <p className="lede">An agent of the Earthward AI council</p>
      <h1 style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Sigil agent={a.id as AgentId} className="sigil" />
        {a.name}
      </h1>
      <p className="lede">
        {a.mandate}. {a.temperament}
      </p>
      {st ? (
        <>
          <dl className="facts num">
            <div>
              <dt>Average vote weight</dt>
              <dd>{pct(st.avgWeight)}</dd>
            </div>
            <div>
              <dt>Donor backings</dt>
              <dd>{credits(st.endorsements)}</dd>
            </div>
            <div>
              <dt>Sessions</dt>
              <dd>{credits(ins!.sessions)}</dd>
            </div>
          </dl>
          {st.preferences.length ? (
            <>
              <h2>What {a.name} pushes for</h2>
              <ul>
                {st.preferences.slice(0, 6).map((p) => (
                  <li key={p.causeId} className="num">
                    <Link href={`/causes/${p.causeId}`}>{causeById(p.causeId)?.name}</Link>: {pct(p.avgShare)} of its proposals on average
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {st.quotes.length ? (
            <>
              <h2>Recent words in the council</h2>
              <ul>
                {st.quotes.map((q) => (
                  <li key={q.day}>
                    <Link href={`/council/${q.day}`}>{longDate(q.day)}</Link>: “{q.quote}”
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
      <p style={{ marginTop: 40 }}>
        Other agents:{" "}
        {AGENTS.filter((x) => x.id !== a.id).map((x, i, arr) => (
          <span key={x.id}>
            <Link href={`/agents/${x.id}`}>{x.name}</Link>
            {i < arr.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </main>
  );
}

export function CausePage({ id }: { id: string }) {
  const c = causeById(id);
  usePageMeta(c ? `${c.name} (${c.place})` : "Cause not found", c?.summary);
  const ins = useInsights();
  if (!c) return <NotFound />;
  const t = ins?.causes[c.id];
  const champion = agentById(c.domain)!;
  return (
    <main id="main" className="page prose" style={agentStyle(c.domain)}>
      <p className="lede">A cause on the Earthward AI council</p>
      <h1>{c.name}</h1>
      <p className="lede">
        {c.place}. {c.summary}
      </p>
      <dl className="facts num">
        <div>
          <dt>Credits allocated</dt>
          <dd>{credits(t?.credits ?? 0)}</dd>
        </div>
        <div>
          <dt>Sessions funded</dt>
          <dd>{credits(t?.sessions ?? 0)}</dd>
        </div>
        <div>
          <dt>Simulated outcome</dt>
          <dd>
            {credits(t?.units ?? 0)} {c.unit}
          </dd>
        </div>
      </dl>
      <p>
        Part of {DOMAIN_LABELS[c.domain].toLowerCase()}, championed by <Link href={`/agents/${champion.id}`}>{champion.name}</Link>. Illustrative rate: about {c.creditsPerUnit} credits per{" "}
        {c.unit.replace(/s(?= |$)/, "")}.
      </p>
      {t?.backers.length ? (
        <>
          <h2>Which agents back it</h2>
          <ul>
            {t.backers.slice(0, 5).map((b) => (
              <li key={b.agentId} className="num">
                <Link href={`/agents/${b.agentId}`}>{agentById(b.agentId)?.name}</Link>: {pct(b.avgShare)} of its proposals on average
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {t?.history.length ? (
        <>
          <h2>Recent sessions</h2>
          <ul>
            {t.history.slice(0, 15).map((h) => (
              <li key={h.day} className="num">
                <Link href={`/council/${h.day}`}>{longDate(h.day)}</Link>: {credits(h.credits)} credits
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p style={{ marginTop: 40 }}>
        See every cause on the <Link href="/earth-ai">Earth AI page</Link>.
      </p>
    </main>
  );
}
