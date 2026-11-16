import { useState } from "react";
import { Link } from "wouter";
import { AGENTS, AGENT_IDS } from "../../../shared/agents";
import { causeById } from "../../../shared/causes";
import type { Allocation } from "../../../shared/council";
import { credits } from "../lib";

const agentColor = (id: string) => ({ ["--agent" as string]: `var(--${id})` });

/**
 * One stacked bar of the night's spend. Segments are grouped by the agent whose
 * mandate covers the cause, always in council order, so neighbouring colours
 * keep the separation they were validated for.
 */
export function AllocationChart({ allocations, spent }: { allocations: Allocation[]; spent: number }) {
  const [active, setActive] = useState<number | null>(null);
  const ordered = [...allocations].sort((a, b) => {
    const da = AGENT_IDS.indexOf(causeById(a.causeId)!.domain);
    const db = AGENT_IDS.indexOf(causeById(b.causeId)!.domain);
    return da - db || b.credits - a.credits;
  });
  if (!ordered.length) return <p className="empty">Nothing was allocated in this session.</p>;

  let cursor = 0;
  const centers = ordered.map((a) => {
    const c = cursor + a.share / 2;
    cursor += a.share;
    return c;
  });
  const shown = active === null ? null : ordered[active];
  const shownCause = shown ? causeById(shown.causeId) : null;

  return (
    <div className="alloc">
      <ul className="legend" aria-label="Colour key: the agent whose mandate covers each cause">
        {AGENTS.filter((a) => ordered.some((x) => causeById(x.causeId)?.domain === a.id)).map((a) => (
          <li key={a.id} style={agentColor(a.id)}>
            <span className="swatch" aria-hidden="true" />
            {a.name}
          </li>
        ))}
      </ul>
      <div className="alloc-bar-wrap">
      <div className="alloc-bar" role="group" aria-label={`Allocation of ${credits(spent)} credits`} onMouseLeave={() => setActive(null)}>
        {ordered.map((a, i) => {
          const cause = causeById(a.causeId)!;
          return (
            <button
              key={a.causeId}
              type="button"
              style={{ ...agentColor(cause.domain), ["--share" as string]: a.share }}
              aria-label={`${cause.name}: ${credits(a.credits)} credits, ${Math.round(a.share * 100)} percent`}
              aria-pressed={active === i}
              data-track={`alloc:${a.causeId}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === i ? null : i)}
            />
          );
        })}
      </div>
      {shown && shownCause ? (
        <div className="tip" style={{ left: `${Math.min(88, Math.max(12, centers[active!] * 100))}%`, top: 0 }} role="status">
          <strong>{shownCause.name}</strong>
          <span className="num">
            {credits(shown.credits)} credits, {(shown.share * 100).toFixed(1)}%
          </span>
          <span className="num">
            Simulated: {credits(shown.units)} {shownCause.unit}
          </span>
        </div>
      ) : null}
      </div>

      <table className="alloc-table">
        <thead>
          <tr>
            <th scope="col">Cause</th>
            <th scope="col" className="r">
              Credits
            </th>
            <th scope="col" className="r">
              Simulated outcome
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((a) => {
            const cause = causeById(a.causeId)!;
            return (
              <tr key={a.causeId}>
                <td>
                  <span className="cause" style={agentColor(cause.domain)}>
                    <span className="swatch" aria-hidden="true" />
                    <span>
                      <Link href={`/causes/${cause.id}`}>{cause.name}</Link>
                      <span className="place">{cause.place}</span>
                    </span>
                  </span>
                </td>
                <td className="r num">{credits(a.credits)}</td>
                <td className="r num">
                  {credits(a.units)} <span className="muted">{cause.unit}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
