import { useCallback, useEffect, useState } from "react";
import { AGENTS, agentById, type AgentId } from "../../../shared/agents";
import type { ArgueTally } from "../../../shared/types";
import { ApiError, api } from "../lib";
import { Sigil } from "./Sigil";

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

/** "Who argued best?" One vote per visitor per night; votes feed each agent's standing. */
export function ArgueVote({ day }: { day: string }) {
  const [tally, setTally] = useState<ArgueTally | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<ArgueTally>(`/api/sessions/${day}/votes`).then(setTally).catch(() => undefined), [day]);
  useEffect(() => {
    void load();
  }, [load]);

  async function vote(agentId: AgentId) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sessions/${day}/vote`, { method: "POST", body: JSON.stringify({ agentId }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Your vote didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const voted = Boolean(tally?.mine);
  return (
    <section className="argue" aria-labelledby="argue-title">
      <h2 id="argue-title">Who argued best?</h2>
      <p className="lede">
        {voted
          ? `You voted for ${agentById(tally!.mine!)?.name}. Votes build each agent's standing, which nudges its weight in future sessions.`
          : "Vote for the agent that made the most convincing case tonight. Votes build each agent's standing, which nudges its weight in future sessions."}
      </p>
      <div className="argue-options">
        {AGENTS.map((a) => {
          const n = tally?.counts[a.id] ?? 0;
          return (
            <button
              key={a.id}
              type="button"
              className={`argue-option${tally?.mine === a.id ? " on" : ""}`}
              style={{ ["--agent" as string]: `var(--${a.id})` }}
              disabled={busy || voted}
              onClick={() => vote(a.id as AgentId)}
              data-track="argue-vote"
              aria-pressed={tally?.mine === a.id}
            >
              <Sigil agent={a.id as AgentId} />
              <span className="name">{a.name}</span>
              {voted ? <span className="num share">{pct(n, tally!.total)}</span> : null}
              {voted ? (
                <span className="track" aria-hidden="true">
                  <span className="fill" style={{ width: pct(n, tally!.total) }} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {voted && tally ? (
        <p className="hint num">
          {tally.total} {tally.total === 1 ? "vote" : "votes"} so far.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
