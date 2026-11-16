import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { StayInTouch } from "../components/StayInTouch";
import { CAUSES, causeById } from "../../../shared/causes";
import type { LeaderRow, PredictionMe } from "../../../shared/types";
import { ApiError, api, countdown, credits, longDate, useLiveState, useNow, usePageMeta } from "../lib";

const causeName = (id: string) => causeById(id)?.name ?? id;
const domainColor = (id: string) => `var(--${causeById(id)?.domain ?? "gold"})`;
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

/** Pick tonight's top cause, see the crowd, and come back for the result. */
export function PredictCard({ heading = true }: { heading?: boolean }) {
  const [me, setMe] = useState<PredictionMe | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useLiveState();
  const now = useNow(1000);

  const load = useCallback(() => api<PredictionMe>("/api/predictions/me").then(setMe).catch(() => undefined), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function lockIn() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/predictions", { method: "POST", body: JSON.stringify({ causeId: pick, name: name.trim() || undefined }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const left = state ? new Date(state.nextSessionAt).getTime() - now : null;
  const crowd = me?.today.crowd;
  const ranked = crowd ? Object.entries(crowd.counts).sort((a, b) => b[1] - a[1]).slice(0, 5) : [];

  return (
    <div className="predict">
      {heading ? (
        <div className="section-head">
          <div>
            <h2 id="predict-title">Predict tonight's top cause</h2>
            <p className="lede">Which cause will get the biggest share when the council meets at midnight? Call it, build a streak, and climb the leaderboard.</p>
          </div>
        </div>
      ) : null}

      {me?.last ? (
        <p className={`predict-result ${me.last.correct ? "won" : "lost"}`} role="status">
          {me.last.correct
            ? `You called it. ${causeName(me.last.mine)} topped the council on ${longDate(me.last.day)}.${me.stats && me.stats.streak > 1 ? ` That's ${me.stats.streak} in a row.` : ""}`
            : `On ${longDate(me.last.day)} the top cause was ${me.last.winners.map(causeName).join(" and ")}. You picked ${causeName(me.last.mine)}.`}{" "}
          <Link href={`/council/${me.last.day}#replay`}>Watch how they decided</Link>
        </p>
      ) : null}

      {me?.today.mine ? (
        <div className="predict-locked">
          <p>
            Your pick for tonight: <strong style={{ color: domainColor(me.today.mine) }}>{causeName(me.today.mine)}</strong>.
            {left !== null && left > 0 ? (
              <>
                {" "}
                The council meets in <span className="num">{countdown(left)}</span>.
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="predict-form">
          <div className="predict-grid" role="radiogroup" aria-label="Causes">
            {CAUSES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={pick === c.id}
                className={`predict-option${pick === c.id ? " on" : ""}`}
                style={{ ["--c" as string]: domainColor(c.id) }}
                onClick={() => setPick(c.id)}
              >
                <span className="dot" aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </div>
          <div className="predict-actions">
            <input className="text-input" maxLength={24} placeholder="Name for the leaderboard (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name for the leaderboard (optional)" />
            <button type="button" className="btn" disabled={!pick || busy} onClick={lockIn} data-track="predict-submit">
              {busy ? "Locking in…" : pick ? `Lock in ${causeName(pick)}` : "Pick a cause"}
            </button>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}

      {crowd && crowd.total > 0 ? (
        <div className="predict-crowd">
          <p className="hint num">
            {credits(crowd.total)} {crowd.total === 1 ? "prediction" : "predictions"} for tonight so far{me?.today.mine ? "" : ". Pick yours to join them"}.
          </p>
          {me?.today.mine ? (
            <ol>
              {ranked.map(([id, n]) => (
                <li key={id}>
                  <span>{causeName(id)}</span>
                  <span className="num muted">{pct(n, crowd.total)}</span>
                  <span className="track" aria-hidden="true">
                    <span className="fill" style={{ width: pct(n, crowd.total), background: domainColor(id) }} />
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {me?.stats ? (
        <p className="hint num">
          Your record: {me.stats.correct} of {me.stats.total} right, best streak {me.stats.best}. <Link href="/predict">Leaderboard</Link>
        </p>
      ) : (
        <p className="hint">
          <Link href="/predict">See the leaderboard and how scoring works</Link>
        </p>
      )}
    </div>
  );
}

export function PredictPage() {
  usePageMeta("Predict tonight's top cause", "Guess which cause the five AI agents will fund most tonight, build a streak, and climb the leaderboard.");
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    api<{ rows: LeaderRow[] }>("/api/predictions/leaderboard")
      .then((r) => setRows(r.rows))
      .catch(() => setRows([]));
  }, []);
  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>Predict tonight's top cause</h1>
        <p className="lede">
          Every night at 00:05 India time the five agents split the treasury. Guess which cause gets the biggest share. A correct call adds to your streak; a miss resets it. One
          prediction per person per night.
        </p>
      </div>
      <section aria-labelledby="predict-title" style={{ padding: 0 }}>
        <PredictCard heading={false} />
      </section>
      <section aria-labelledby="leaders-title" style={{ padding: 0, marginTop: 48 }}>
        <h2 id="leaders-title">Leaderboard</h2>
        {rows === null ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No correct calls yet. The first council night with predictions will fill this in.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Correct</th>
                  <th>Current streak</th>
                  <th>Best streak</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`}>
                    <td className="num">{i + 1}</td>
                    <td>{r.name}</td>
                    <td className="num">
                      {r.correct} of {r.total}
                    </td>
                    <td className="num">{r.streak}</td>
                    <td className="num">{r.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Names are optional and chosen by players. Predictions are tied to your browser, not an account, and nothing personal is stored.</p>
      </section>
      <StayInTouch title="Find out if you were right" />
    </main>
  );
}
