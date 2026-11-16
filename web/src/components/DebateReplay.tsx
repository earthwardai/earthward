import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { agentById, type AgentId } from "../../../shared/agents";
import { causeById } from "../../../shared/causes";
import { RULES } from "../../../shared/council";
import type { Session } from "../../../shared/types";
import { credits, useReducedMotion } from "../lib";
import { Sigil } from "./Sigil";

const STAGE_MS = 4200;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A bar that grows from zero when it first appears. */
function Grow({ share, max, color, label, value }: { share: number; max: number; color: string; label: string; value: string }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(Math.max(2, (share / (max || 1)) * 100)));
    return () => cancelAnimationFrame(id);
  }, [share, max]);
  return (
    <li className="grow">
      <span>{label}</span>
      <span className="num muted">{value}</span>
      <span className="track" aria-hidden="true">
        <span className="fill" style={{ width: `${w}%`, background: color }} />
      </span>
    </li>
  );
}

const agentColor = (id: string) => `var(--${id})`;
const causeColor = (causeId: string) => `var(--${causeById(causeId)?.domain ?? "gold"})`;

/** Plays one council night as a short sequence: convene, five speeches, the merge, the decision. */
export function DebateReplay({ session }: { session: Session }) {
  const reduced = useReducedMotion();
  const proposals = session.proposals;
  const stages = 2 + proposals.length + 1; // convene, speeches, merge, decision
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Arriving from "Watch the debate": the minutes load after the page, so scroll once they're here.
  useEffect(() => {
    if (window.location.hash === "#replay") document.getElementById("replay")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [reduced]);

  useEffect(() => {
    if (!playing) return;
    if (stage >= stages - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStage((s) => s + 1), STAGE_MS);
    return () => clearTimeout(t);
  }, [playing, stage, stages]);

  const play = () => {
    if (stage >= stages - 1) setStage(0);
    setPlaying(true);
  };

  const backing = Object.entries(session.endorsements ?? {}).filter(([, n]) => (n ?? 0) > 0);
  let body: ReactNode;
  if (stage === 0) {
    body = (
      <div className="replay-stage">
        <p className="replay-kicker">The council convenes</p>
        <p className="replay-big num">{credits(session.pool)} credits on the table</p>
        <p className="muted">
          {session.donations > 0 ? `${credits(session.donations)} ${session.donations === 1 ? "donation" : "donations"} arrived that day. ` : "No donations arrived that day. "}
          The council will spend {pct(RULES.spendRatio)} and keep the rest in reserve.
        </p>
        <ul className="replay-weights">
          {proposals.map((p) => (
            <li key={p.agentId} style={{ ["--agent" as string]: agentColor(p.agentId) }}>
              <Sigil agent={p.agentId as AgentId} />
              <span>{agentById(p.agentId)?.name}</span>
              <span className="num muted">{pct(session.influence[p.agentId] ?? 0)} of the vote</span>
            </li>
          ))}
        </ul>
        {backing.length ? <p className="hint">Donor backing tilted the vote toward {backing.map(([id]) => agentById(id)?.name).join(" and ")}.</p> : null}
        {session.standing && Object.values(session.standing).some((m) => Math.abs(m - 1) > 0.001) ? (
          <p className="hint">Standing from past nights adjusted the base weights by up to {pct(Math.max(...Object.values(session.standing).map((m) => Math.abs(m - 1))))}.</p>
        ) : null}
      </div>
    );
  } else if (stage <= proposals.length) {
    const p = proposals[stage - 1];
    const a = agentById(p.agentId)!;
    const top = Object.entries(p.shares)
      .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
      .slice(0, 4);
    body = (
      <div className="replay-stage replay-speech" key={p.agentId} style={{ ["--agent" as string]: agentColor(p.agentId) }}>
        <p className="replay-kicker">
          <Sigil agent={p.agentId as AgentId} /> {a.name}, {a.mandate.toLowerCase()} <span className="num muted">({pct(session.influence[p.agentId] ?? 0)} of the vote)</span>
        </p>
        {p.quote ? <blockquote className="replay-quote">“{p.quote}”</blockquote> : null}
        {p.reasoning ? <p className="muted">{p.reasoning}</p> : null}
        <ol className="replay-bars">
          {top.map(([id, sh]) => (
            <Grow key={id} share={sh ?? 0} max={top[0][1] ?? 1} color={agentColor(p.agentId)} label={causeById(id)?.name ?? id} value={pct(sh ?? 0)} />
          ))}
        </ol>
      </div>
    );
  } else if (stage === proposals.length + 1) {
    const top = session.allocations.slice(0, 6);
    body = (
      <div className="replay-stage" key="merge">
        <p className="replay-kicker">The rules merge the votes</p>
        <p className="muted">
          Weighted average of the five proposals. No cause may take more than {pct(RULES.causeCap)}, and shares under {pct(RULES.causeFloor)} are dropped.
        </p>
        <ol className="replay-bars">
          {top.map((al) => (
            <Grow key={al.causeId} share={al.share} max={top[0].share} color={causeColor(al.causeId)} label={causeById(al.causeId)?.name ?? al.causeId} value={`${credits(al.credits)} credits`} />
          ))}
        </ol>
      </div>
    );
  } else {
    body = (
      <div className="replay-stage" key="decision">
        <p className="replay-kicker">The decision</p>
        <p className="replay-title">{session.title}</p>
        <p className="muted num">
          {credits(session.spent)} credits spent across {session.allocations.length} causes. {credits(session.reserve)} kept in reserve. Recorded as ledger entry {session.seq}.
        </p>
        <p>
          <Link href="/ask">Ask the council your own question</Link>
        </p>
      </div>
    );
  }

  return (
    <section className="replay" id="replay" aria-labelledby="replay-title" aria-live={playing ? "polite" : "off"}>
      <div className="replay-head">
        <h2 id="replay-title">Watch the debate</h2>
        <div className="replay-controls">
          <button type="button" className="btn ghost small" onClick={() => setStage((s) => Math.max(0, s - 1))} disabled={stage === 0} aria-label="Previous step">
            ‹
          </button>
          {playing ? (
            <button type="button" className="btn small" onClick={() => setPlaying(false)} data-track="replay-pause">
              Pause
            </button>
          ) : (
            <button type="button" className="btn small" onClick={play} data-track="replay-play">
              {stage === 0 ? "Play the debate" : stage >= stages - 1 ? "Play again" : "Resume"}
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={() => setStage((s) => Math.min(stages - 1, s + 1))} disabled={stage >= stages - 1} aria-label="Next step">
            ›
          </button>
        </div>
      </div>
      <div className={`replay-body${reduced ? " still" : ""}`}>{body}</div>
      <ol className="replay-dots" aria-label="Steps">
        {Array.from({ length: stages }, (_, i) => (
          <li key={i}>
            <button type="button" aria-label={`Step ${i + 1}`} aria-current={i === stage ? "step" : undefined} onClick={() => setStage(i)} />
          </li>
        ))}
      </ol>
    </section>
  );
}
