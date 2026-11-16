import { useEffect, useState } from "react";
import { causeById } from "../../../shared/causes";
import type { ArenaEntry, ArenaResult, Session } from "../../../shared/types";
import { api } from "../lib";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Split({ allocations }: { allocations: ArenaEntry["allocations"] }) {
  const top = [...allocations].sort((a, b) => b.share - a.share).slice(0, 4);
  const max = top[0]?.share || 1;
  return (
    <ul className="arena-split">
      {top.map((a) => {
        const cause = causeById(a.causeId);
        return (
          <li key={a.causeId} style={{ ["--agent" as string]: `var(--${cause?.domain ?? "verdant"})` }}>
            <span className="name">{cause?.name ?? a.causeId}</span>
            <span className="num">{pct(a.share)}</span>
            <span className="track" aria-hidden="true">
              <span className="fill" style={{ width: `${(a.share / max) * 100}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The same night decided by other models, next to the official decision. */
export function ModelArena({ session }: { session: Session }) {
  const [arena, setArena] = useState<ArenaResult | null>(null);
  useEffect(() => {
    api<ArenaResult>(`/api/sessions/${session.day}/arena`).then(setArena).catch(() => setArena(null));
  }, [session.day]);
  if (!arena || !arena.entries.length) return null;

  return (
    <section className="arena" aria-labelledby="arena-title">
      <h2 id="arena-title">Same night, other models</h2>
      <p className="lede">
        After the council met, the same briefing and the same rules went to other models. Their splits never touch the ledger. They show how much
        tonight&apos;s decision depends on which model the agents run on.
      </p>
      <div className="arena-grid">
        <article className="arena-card official">
          <p className="arena-label">The council&apos;s decision</p>
          <p className="arena-model">{session.model === "fallback" ? "Standing preferences" : session.model}</p>
          <Split allocations={session.allocations} />
        </article>
        {arena.entries.map((e) => (
          <article className="arena-card" key={e.label}>
            <p className="arena-label">{e.model === "none" ? "No model at all" : "Same briefing"}</p>
            <p className="arena-model">{e.label}</p>
            <p className="arena-agree">
              <strong>{pct(e.agreement)}</strong> the same as the council&apos;s split
            </p>
            <Split allocations={e.allocations} />
            {e.quotes[0] ? <blockquote className="arena-quote">&ldquo;{e.quotes[0].quote}&rdquo;</blockquote> : null}
            {e.fallbacks ? <p className="muted small">{e.fallbacks} of the agents fell back to standing preferences.</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
