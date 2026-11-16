import type { Session } from "../shared/types";
import type { PredictorRecord, Store } from "./store/types";

/** The causes that tied for the largest share of a night. Any of them counts as a correct call. */
export function winningCauses(session: Pick<Session, "allocations">): string[] {
  const top = Math.max(0, ...session.allocations.map((a) => a.share));
  return top > 0 ? session.allocations.filter((a) => Math.abs(a.share - top) < 1e-9).map((a) => a.causeId) : [];
}

export const previousDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Scores every prediction for a night once the council has decided. Safe to call more than once:
 * only the first call for a day does the work.
 */
export async function scorePredictions(store: Store, session: Session): Promise<number> {
  const winners = winningCauses(session);
  if (!winners.length || !(await store.claimScoring(session.day))) return 0;
  const predictions = await store.listPredictions(session.day, 20_000);
  for (const p of predictions) {
    const prev: PredictorRecord = (await store.getPredictor(p.vidHash)) ?? {
      vidHash: p.vidHash,
      name: null,
      total: 0,
      correct: 0,
      streak: 0,
      best: 0,
      lastDay: null,
      lastCorrect: null,
    };
    const correct = winners.includes(p.causeId);
    const continues = prev.lastDay === previousDay(session.day) && prev.lastCorrect === true;
    const streak = correct ? (continues ? prev.streak + 1 : 1) : 0;
    await store.savePredictor({
      ...prev,
      name: p.name ?? prev.name,
      total: prev.total + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak,
      best: Math.max(prev.best, streak),
      lastDay: session.day,
      lastCorrect: correct,
    });
  }
  return predictions.length;
}
