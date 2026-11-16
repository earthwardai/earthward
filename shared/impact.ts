import { causeById } from "./causes";
import type { ImpactItem, Session } from "./types";

/**
 * A donation's share of one night's decision. Donations are pooled, so a donor's share of every
 * allocation is their amount divided by the pool the council met with.
 */
export function computeImpact(amount: number, session: Pick<Session, "pool" | "spent" | "allocations">) {
  const share = session.pool > 0 ? Math.min(1, amount / session.pool) : 0;
  const items: ImpactItem[] = session.allocations
    .map((a) => {
      const cause = causeById(a.causeId);
      const credits = a.credits * share;
      return { causeId: a.causeId, credits: Math.round(credits * 10) / 10, units: cause ? Math.round((credits / cause.creditsPerUnit) * 10) / 10 : 0 };
    })
    .filter((i) => i.credits >= 0.1)
    .sort((x, y) => y.credits - x.credits);
  const spent = Math.round(session.spent * share * 10) / 10;
  return { share, spent, reserve: Math.round((amount - spent) * 10) / 10, items };
}
