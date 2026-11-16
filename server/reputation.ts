import { AGENT_IDS, type AgentId } from "../shared/agents";
import { RULES } from "../shared/council";
import type { Session, Standing } from "../shared/types";
import type { Store } from "./store/types";

/**
 * Each agent's standing over the last 30 council nights, from three signals:
 *  - 50%: visitors' "who argued best?" votes
 *  - 30%: donor backing
 *  - 20%: consensus, how close the agent's proposal was to what the council decided
 * A standing above the average raises the agent's base vote weight, below lowers it, never by
 * more than RULES.standingMax. With fewer than three nights of history everyone stays at 1.
 */
const WINDOW = 30;
const MIN_SESSIONS = 3;

function shareOf(totals: Record<string, number>): Record<string, number> {
  const sum = AGENT_IDS.reduce((s, id) => s + (totals[id] ?? 0), 0);
  return Object.fromEntries(AGENT_IDS.map((id) => [id, sum > 0 ? (totals[id] ?? 0) / sum : 1 / AGENT_IDS.length]));
}

/** 1 when an agent proposed exactly the final split, 0 when nothing overlapped. */
function similarity(proposal: Partial<Record<string, number>>, final: Session["allocations"]): number {
  const finalShares: Record<string, number> = {};
  const spent = final.reduce((s, a) => s + a.share, 0) || 1;
  for (const a of final) finalShares[a.causeId] = a.share / spent;
  const ids = new Set([...Object.keys(proposal), ...Object.keys(finalShares)]);
  let l1 = 0;
  for (const id of ids) l1 += Math.abs((proposal[id] ?? 0) - (finalShares[id] ?? 0));
  return Math.max(0, 1 - l1 / 2);
}

export function computeStanding(sessions: Session[], tallies: { total: number; counts: Record<string, number> }[]): Standing {
  const votes: Record<string, number> = {};
  const backing: Record<string, number> = {};
  const consensus: Record<string, number> = {};
  for (const t of tallies) for (const [id, n] of Object.entries(t.counts)) votes[id] = (votes[id] ?? 0) + n;
  for (const s of sessions) {
    for (const [id, n] of Object.entries(s.endorsements ?? {})) backing[id] = (backing[id] ?? 0) + (n ?? 0);
    for (const p of s.proposals) consensus[p.agentId] = (consensus[p.agentId] ?? 0) + similarity(p.shares, s.allocations) / sessions.length;
  }
  const v = shareOf(votes);
  const b = shareOf(backing);
  const c = shareOf(consensus);
  const even = 1 / AGENT_IDS.length;
  const agents: Standing["agents"] = {};
  for (const id of AGENT_IDS) {
    const raw = 0.5 * v[id] + 0.3 * b[id] + 0.2 * c[id];
    const enough = sessions.length >= MIN_SESSIONS;
    const multiplier = enough ? 1 + Math.max(-RULES.standingMax, Math.min(RULES.standingMax, (raw / even - 1) * 0.5)) : 1;
    agents[id] = {
      multiplier: Math.round(multiplier * 1000) / 1000,
      votes: votes[id] ?? 0,
      votesShare: Math.round(v[id] * 1000) / 1000,
      backingShare: Math.round(b[id] * 1000) / 1000,
      consensus: Math.round((consensus[id] ?? 0) * 1000) / 1000,
    };
  }
  return { sessions: sessions.length, agents };
}

let cache: { at: number; standing: Standing } | null = null;

export async function getStanding(store: Store): Promise<Standing> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.standing;
  const sessions = await store.listSessions(WINDOW);
  const tallies = await store.argueTallies(sessions.map((s) => s.day));
  cache = { at: Date.now(), standing: computeStanding(sessions, tallies) };
  return cache.standing;
}

export function clearStanding() {
  cache = null;
}

export const multipliers = (s: Standing) => Object.fromEntries(AGENT_IDS.map((id) => [id, s.agents[id]?.multiplier ?? 1])) as Record<AgentId, number>;
