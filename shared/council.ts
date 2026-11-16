import { AGENTS, AGENT_IDS, type AgentId } from "./agents";
import { CAUSES, CAUSE_IDS, type CauseId } from "./causes";

export type Shares = Partial<Record<CauseId, number>>;

export interface Proposal {
  agentId: AgentId;
  /** Fractions per cause, summing to 1. */
  shares: Shares;
  reasoning: string;
  quote: string;
  source: "model" | "fallback";
}

export interface Allocation {
  causeId: CauseId;
  credits: number;
  share: number;
  units: number;
}

export const RULES = {
  /** Fraction of the pool the council may spend each session. The rest stays in reserve. */
  spendRatio: 0.5,
  /**
   * Credits a simulated endowment adds to the treasury once per session day, recorded on the
   * ledger like everything else. It keeps the council funded on nights with few donations.
   */
  dailyGrant: 1000,
  /** How far reputation can move an agent's base weight, either way. */
  standingMax: 0.1,
  /** No cause may take more than this share of the spend. */
  causeCap: 0.3,
  /** Shares below this are dropped and redistributed. */
  causeFloor: 0.02,
  /** Extra weight an agent can earn from donor endorsements (0 = none). */
  endorsementBoost: 2,
};

/** Keeps known causes with positive weight and scales them to sum to 1. */
export function normalizeShares(weights: Record<string, unknown>): Shares {
  const clean: Shares = {};
  let total = 0;
  for (const id of CAUSE_IDS) {
    const v = Number(weights[id]);
    if (Number.isFinite(v) && v > 0) {
      clean[id] = v;
      total += v;
    }
  }
  if (total <= 0) return {};
  for (const id of Object.keys(clean) as CauseId[]) clean[id] = clean[id]! / total;
  return clean;
}

/** Voting weight per agent. Every agent starts equal; endorsements tilt it. */
/**
 * Vote weights for one night. Every agent starts equal, adjusted by its standing (a reputation
 * multiplier within plus or minus RULES.standingMax), then tilted toward agents donors backed that day.
 */
export function influence(endorsements: Partial<Record<AgentId, number>>, standing: Partial<Record<AgentId, number>> = {}): Record<AgentId, number> {
  const total = AGENT_IDS.reduce((s, id) => s + (endorsements[id] ?? 0), 0);
  const clampStanding = (x: number | undefined) => Math.min(1 + RULES.standingMax, Math.max(1 - RULES.standingMax, x ?? 1));
  const raw = Object.fromEntries(
    AGENT_IDS.map((id) => [id, clampStanding(standing[id]) * (1 + (total > 0 ? (RULES.endorsementBoost * (endorsements[id] ?? 0)) / total : 0))]),
  ) as Record<AgentId, number>;
  const sum = AGENT_IDS.reduce((s, id) => s + raw[id], 0);
  for (const id of AGENT_IDS) raw[id] = raw[id] / sum;
  return raw;
}

function applyCap(shares: Shares, cap: number): Shares {
  const out = { ...shares };
  for (let pass = 0; pass < 20; pass++) {
    const ids = Object.keys(out) as CauseId[];
    const over = ids.filter((id) => out[id]! > cap + 1e-12);
    if (over.length === 0) break;
    let excess = 0;
    for (const id of over) {
      excess += out[id]! - cap;
      out[id] = cap;
    }
    const under = ids.filter((id) => out[id]! < cap - 1e-12);
    const underTotal = under.reduce((s, id) => s + out[id]!, 0);
    if (underTotal <= 0) break;
    for (const id of under) out[id] = out[id]! + (excess * out[id]!) / underTotal;
  }
  return out;
}

/** Weighted average of the proposals, then the council's rules. */
export function mergeProposals(proposals: Proposal[], weights: Record<AgentId, number>): Shares {
  const merged: Record<string, number> = {};
  let weightSum = 0;
  for (const p of proposals) {
    const w = weights[p.agentId] ?? 0;
    weightSum += w;
    for (const [id, share] of Object.entries(p.shares)) merged[id] = (merged[id] ?? 0) + w * (share ?? 0);
  }
  if (weightSum <= 0) return {};
  let shares = normalizeShares(merged);
  const kept = Object.fromEntries(Object.entries(shares).filter(([, v]) => (v ?? 0) >= RULES.causeFloor));
  shares = normalizeShares(kept);
  return applyCap(shares, RULES.causeCap);
}

/**
 * Splits whole credits by share using the largest-remainder method. Shares may sum
 * to less than 1 when the per-cause cap cannot be met (fewer than four causes);
 * whatever the cap holds back stays in the treasury.
 */
export function allocateCredits(pool: number, shares: Shares, spendRatio = RULES.spendRatio): { allocations: Allocation[]; spent: number; reserve: number } {
  const spend = Math.floor(pool * spendRatio);
  const ids = (Object.keys(shares) as CauseId[]).filter((id) => (shares[id] ?? 0) > 0);
  if (spend <= 0 || ids.length === 0) return { allocations: [], spent: 0, reserve: pool };
  const totalShare = Math.min(1, ids.reduce((s, id) => s + shares[id]!, 0));
  const target = Math.floor(spend * totalShare + 1e-9);
  const exact = ids.map((id) => ({ id, value: spend * shares[id]! }));
  const floored = exact.map((e) => ({ ...e, credits: Math.floor(e.value), rem: e.value - Math.floor(e.value) }));
  let left = target - floored.reduce((s, e) => s + e.credits, 0);
  for (const e of [...floored].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    e.credits += 1;
    left -= 1;
  }
  const allocations = floored
    .filter((e) => e.credits > 0)
    .map((e) => {
      const cause = CAUSES.find((c) => c.id === e.id)!;
      return { causeId: e.id, credits: e.credits, share: e.credits / spend, units: Math.floor(e.credits / cause.creditsPerUnit) };
    })
    .sort((a, b) => b.credits - a.credits);
  const spent = allocations.reduce((s, a) => s + a.credits, 0);
  return { allocations, spent, reserve: pool - spent };
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Proposal built from an agent's standing preferences, used when the model is unavailable. */
export function fallbackProposal(agentId: AgentId, day: string): Proposal {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  const rand = seededRandom(`${day}:${agentId}`);
  const weights: Record<string, number> = {};
  for (const [id, w] of Object.entries(agent.leanings)) weights[id] = (w ?? 0) * (0.8 + rand() * 0.4);
  const shares = normalizeShares(weights);
  const top = (Object.entries(shares) as [CauseId, number][]).sort((a, b) => b[1] - a[1])[0];
  const topName = CAUSES.find((c) => c.id === top?.[0])?.name ?? "my mandate";
  return {
    agentId,
    shares,
    reasoning: `Working from standing preferences tonight. ${topName} remains the strongest fit for my mandate.`,
    quote: `I hold to my mandate: ${agent.mandate.toLowerCase()}.`,
    source: "fallback",
  };
}

// --- Calendar ---------------------------------------------------------------

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Local calendar day (YYYY-MM-DD) in the council's time zone. */
export function dayKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** The council meets at local midnight. Returns the next meeting time. */
export function nextSessionAt(now: Date, timeZone: string): Date {
  const p = zonedParts(now, timeZone);
  const localAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.y, p.m - 1, p.d + 1) - offsetMs);
}

/** The day a session at `now` decides on: the local day that just ended. */
export function sessionDay(now: Date, timeZone: string): string {
  return dayKey(new Date(now.getTime() - 60 * 60 * 1000), timeZone);
}

/** 1 when two splits are identical, 0 when they share nothing. Both are normalised first. */
export function shareSimilarity(a: Partial<Record<string, number>>, b: Partial<Record<string, number>>): number {
  const norm = (x: Partial<Record<string, number>>) => {
    const t = Object.values(x).reduce((s: number, v) => s + (v ?? 0), 0) || 1;
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, (v ?? 0) / t]));
  };
  const na = norm(a);
  const nb = norm(b);
  let l1 = 0;
  for (const k of new Set([...Object.keys(na), ...Object.keys(nb)])) l1 += Math.abs((na[k] ?? 0) - (nb[k] ?? 0));
  return Math.max(0, 1 - l1 / 2);
}
