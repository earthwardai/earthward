import { AGENT_IDS, type AgentId } from "../shared/agents";
import { CAUSES, type CauseId } from "../shared/causes";
import type { Insights } from "../shared/types";
import type { Store } from "./store/types";

let cache: { at: number; value: Insights } | null = null;
const TTL_MS = 5 * 60_000;

/** Totals per cause and per agent across the last 90 sessions, cached for five minutes. */
export async function getInsights(store: Store): Promise<Insights> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const [sessions, treasury] = await Promise.all([store.listSessions(90), store.getTreasury()]);

  const causes: Insights["causes"] = {};
  for (const c of CAUSES) causes[c.id] = { credits: 0, units: 0, sessions: 0, history: [], backers: [] };
  const agents: Insights["agents"] = {};
  const shareSums: Record<string, Record<string, number>> = {};
  for (const id of AGENT_IDS) {
    agents[id] = { avgWeight: 0, endorsements: 0, quotes: [], preferences: [] };
    shareSums[id] = {};
  }

  for (const s of sessions) {
    for (const a of s.allocations) {
      const c = causes[a.causeId];
      if (!c) continue;
      c.credits += a.credits;
      c.units += a.units;
      c.sessions += 1;
      if (c.history.length < 30) c.history.push({ day: s.day, credits: a.credits });
    }
    for (const id of AGENT_IDS) {
      const ag = agents[id];
      ag.avgWeight += (s.influence[id] ?? 0) / sessions.length;
      ag.endorsements += s.endorsements[id] ?? 0;
      const p = s.proposals.find((x) => x.agentId === id);
      if (p) {
        if (ag.quotes.length < 8 && p.quote) ag.quotes.push({ day: s.day, quote: p.quote });
        for (const [cid, share] of Object.entries(p.shares)) shareSums[id][cid] = (shareSums[id][cid] ?? 0) + (share ?? 0);
      }
    }
  }

  const n = Math.max(1, sessions.length);
  for (const id of AGENT_IDS) {
    agents[id].preferences = Object.entries(shareSums[id])
      .map(([causeId, sum]) => ({ causeId: causeId as CauseId, avgShare: sum / n }))
      .sort((a, b) => b.avgShare - a.avgShare);
    for (const pref of agents[id].preferences) causes[pref.causeId]?.backers.push({ agentId: id as AgentId, avgShare: pref.avgShare });
  }
  for (const c of Object.values(causes)) c.backers.sort((a, b) => b.avgShare - a.avgShare);

  const value: Insights = {
    generatedAt: new Date().toISOString(),
    sessions: sessions.length,
    causes,
    agents,
    countries: Object.entries(treasury.countries ?? {})
      .map(([code, donations]) => ({ code, donations }))
      .sort((a, b) => b.donations - a.donations),
  };
  cache = { at: Date.now(), value };
  return value;
}

export const clearInsights = () => {
  cache = null;
};
