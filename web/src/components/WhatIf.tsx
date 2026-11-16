import { useMemo, useState } from "react";
import { AGENTS, type AgentId } from "../../../shared/agents";
import { causeById } from "../../../shared/causes";
import { mergeProposals } from "../../../shared/council";
import type { Session } from "../../../shared/types";
import { Share } from "./Share";
import { Sigil } from "./Sigil";

const pct = (x: number) => Math.round(x * 100);

/**
 * "What if you had the deciding vote?" Reweights the five agents and reruns that night's merge in
 * the browser with the same code the council uses (shared/council.ts), so the visitor can see
 * exactly how much the weights matter.
 */
export function WhatIf({ session }: { session: Session }) {
  const real = useMemo(() => Object.fromEntries(AGENTS.map((a) => [a.id, Math.round((session.influence[a.id] ?? 0.2) * 100)])) as Record<AgentId, number>, [session]);
  const [weights, setWeights] = useState<Record<AgentId, number>>(real);
  const changed = AGENTS.some((a) => weights[a.id] !== real[a.id]);

  const rows = useMemo(() => {
    const sum = AGENTS.reduce((s, a) => s + weights[a.id], 0);
    // Untouched sliders show the real night exactly, without rounding noise from the slider values.
    const yours = !changed ? Object.fromEntries(session.allocations.map((a) => [a.causeId, a.share])) : sum > 0 ? mergeProposals(session.proposals, Object.fromEntries(AGENTS.map((a) => [a.id, weights[a.id] / sum])) as Record<AgentId, number>) : {};
    const actual = Object.fromEntries(session.allocations.map((a) => [a.causeId, a.share]));
    const ids = new Set([...Object.keys(actual), ...Object.keys(yours)]);
    return [...ids]
      .map((id) => ({ id, actual: actual[id] ?? 0, yours: (yours as Record<string, number>)[id] ?? 0 }))
      .sort((a, b) => b.yours - a.yours || b.actual - a.actual)
      .slice(0, 8);
  }, [weights, session, changed]);

  const top = rows[0];
  const realTop = session.allocations[0];
  const only = (id: AgentId) => setWeights(Object.fromEntries(AGENTS.map((a) => [a.id, a.id === id ? 100 : 0])) as Record<AgentId, number>);

  return (
    <section className="whatif" aria-labelledby="whatif-title">
      <h2 id="whatif-title">What if you had the deciding vote?</h2>
      <p className="lede">
        Move the sliders to give each agent more or less say, and the night is recalculated with the council's own rules: the same proposals, the 30% cap per cause, the 2% floor.
      </p>
      <div className="whatif-grid">
        <div className="whatif-sliders">
          {AGENTS.map((a) => (
            <label key={a.id} className="whatif-slider" style={{ ["--agent" as string]: `var(--${a.id})` }}>
              <span className="whatif-name">
                <Sigil agent={a.id} />
                {a.name}
                <span className="num muted">{weights[a.id]}</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[a.id]}
                onChange={(e) => setWeights((w) => ({ ...w, [a.id]: Number(e.target.value) }))}
                aria-label={`${a.name}'s say`}
              />
              <button type="button" className="linkish small" onClick={() => only(a.id)}>
                Only {a.name}
              </button>
            </label>
          ))}
          <button type="button" className="btn ghost small" disabled={!changed} onClick={() => setWeights(real)}>
            Back to the real night
          </button>
        </div>
        <div>
          <table className="data whatif-table">
            <thead>
              <tr>
                <th>Cause</th>
                <th className="num">Real night</th>
                <th className="num">Your weights</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = pct(r.yours) - pct(r.actual);
                return (
                  <tr key={r.id}>
                    <td>{causeById(r.id)?.name ?? r.id}</td>
                    <td className="num">{pct(r.actual)}%</td>
                    <td className="num">
                      {pct(r.yours)}%{" "}
                      {d !== 0 ? (
                        <span className={d > 0 ? "delta up" : "delta down"}>
                          {d > 0 ? "+" : ""}
                          {d}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {changed && top && realTop && top.id !== realTop.causeId ? (
            <p className="whatif-verdict">
              With your weights, <strong>{causeById(top.id)?.name}</strong> would have led instead of {causeById(realTop.causeId)?.name}.
            </p>
          ) : changed ? (
            <p className="whatif-verdict muted">Same leader, different split. The cap keeps any one cause from running away with it.</p>
          ) : null}
          {changed && top ? (
            <Share
              path={`/council/${session.day}`}
              campaign="whatif"
              label="Share your version"
              text={`If I had the deciding vote on the Earthward AI council, ${causeById(top.id)?.name} would have led with ${pct(top.yours)}%. Try reweighting the agents yourself:`}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
