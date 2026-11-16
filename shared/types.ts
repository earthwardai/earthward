import type { AgentId } from "./agents";
import type { CauseId } from "./causes";
import type { Allocation, Proposal } from "./council";
import type { LedgerEntry } from "./ledger";
import type { CouncilSpec } from "./spec";

export interface Treasury {
  balance: number;
  totalDonated: number;
  totalAllocated: number;
  donations: number;
  lastSessionDay: string | null;
  updatedAt: string;
  /** Donations per ISO country code. */
  countries?: Record<string, number>;
  /** Credits added by the endowment's daily grants. */
  totalGranted?: number;
}

export interface PublicDonation {
  id: string;
  amount: number;
  name: string | null;
  message: string | null;
  agentId: AgentId | null;
  country: string | null;
  location: [number, number] | null;
  at: string;
  seq: number;
}

export interface Session {
  day: string;
  at: string;
  pool: number;
  spent: number;
  reserve: number;
  donations: number;
  endorsements: Partial<Record<AgentId, number>>;
  influence: Record<AgentId, number>;
  /** Reputation multipliers applied to each agent's base weight that night (absent on older sessions). */
  standing?: Record<AgentId, number>;
  proposals: Proposal[];
  allocations: Allocation[];
  title: string;
  minutes: string;
  model: string;
  seq: number;
  hash: string;
}

export interface AgentLive {
  id: AgentId;
  endorsementsToday: number;
  lastQuote: string | null;
  lastTopCause: CauseId | null;
}

export interface StateResponse {
  treasury: Treasury;
  today: { day: string; donations: number; credits: number; asks: number };
  nextSessionAt: string;
  timeZone: string;
  agents: AgentLive[];
  recent: PublicDonation[];
  latestSession: Session | null;
  head: { seq: number; hash: string } | null;
  stats: { sessions: number; countries: number };
  links: { support: string | null; github: { url: string; stars: number | null } | null };
  health: { status: "ok"; version: string; startedAt: string; lastSessionAt: string | null };
}

export interface DonationRequest {
  amount: number;
  name?: string;
  message?: string;
  agentId?: AgentId | null;
  /** Honeypot. Real people never see this field. */
  website?: string;
  /** Milliseconds the form was open before submitting. */
  elapsed: number;
}

export interface DonationReceipt {
  donation: PublicDonation;
  entry: LedgerEntry;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  nextBefore: number | null;
}

export interface TrackEvent {
  t: "view" | "click" | "scroll" | "leave";
  p: string;
  at: number;
  target?: string;
  x?: number;
  y?: number;
  depth?: number;
  ms?: number;
  ref?: string;
  utm?: string;
}

export interface TrackBatch {
  vid: string;
  sid: string;
  events: TrackEvent[];
  screen?: { w: number; h: number };
  tz?: string;
  lang?: string;
  /** navigator.webdriver: true for automated browsers, which are not counted as people. */
  wd?: boolean;
}

/** Aggregates across recent council sessions, for the cause, agent and topic pages. */
export interface Insights {
  generatedAt: string;
  sessions: number;
  causes: Record<string, { credits: number; units: number; sessions: number; history: { day: string; credits: number }[]; backers: { agentId: AgentId; avgShare: number }[] }>;
  agents: Record<string, { avgWeight: number; endorsements: number; quotes: { day: string; quote: string }[]; preferences: { causeId: CauseId; avgShare: number }[] }>;
  countries: { code: string; donations: number }[];
}

export interface AskView {
  agentId: AgentId;
  stance: "for" | "against" | "mixed";
  say: string;
}

/** One question put to the council, answered by all five agents. */
export interface AskResponse {
  question: string;
  views: AskView[];
  verdict: string;
  model: string;
}

export interface ImpactItem {
  causeId: string;
  credits: number;
  units: number;
}

/** Where one donation's credits went, for the donor's receipt page. */
export type ImpactResponse =
  | { status: "pending"; donation: PublicDonation; nextSessionAt: string }
  | {
      status: "allocated";
      donation: PublicDonation;
      session: { day: string; title: string; pool: number; spent: number };
      share: number;
      spent: number;
      reserve: number;
      items: ImpactItem[];
    };

/** The prediction game, from one visitor's point of view. */
export interface PredictionMe {
  today: { day: string; mine: string | null; crowd: { total: number; counts: Record<string, number> } };
  /** The visitor's prediction for the most recent council night, once it has been decided. */
  last: { day: string; mine: string; winners: string[]; correct: boolean } | null;
  stats: { name: string | null; total: number; correct: number; streak: number; best: number } | null;
}

export interface LeaderRow {
  name: string;
  correct: number;
  total: number;
  streak: number;
  best: number;
}

/** How each agent's reputation is built, for the agent pages and the rules. */
export interface Standing {
  sessions: number;
  agents: Record<string, { multiplier: number; votes: number; votesShare: number; backingShare: number; consensus: number }>;
}

/** "Who argued best?" votes for one night. */
export interface ArgueTally {
  day: string;
  total: number;
  counts: Record<string, number>;
  mine: string | null;
}

/** A cause proposed by a visitor. Only approved nominations are public. */
export interface Nomination {
  id: string;
  name: string;
  place: string | null;
  summary: string;
  status: "pending" | "approved" | "rejected" | "chosen";
  votes: number;
  at: string;
}

/** The council's monthly debate over the top nominations. */
export interface NominationRound {
  month: string;
  at: string;
  candidates: { id: string; name: string; votes: number }[];
  views: { agentId: string; pick: string; say: string }[];
  winner: string;
  statement: string;
  model: string;
}

/** The same night decided by other models, for comparison. Not part of the ledger. */
export interface ArenaEntry {
  label: string;
  model: string;
  allocations: { causeId: string; share: number; credits: number }[];
  quotes: { agentId: string; quote: string }[];
  /** How close this split is to the official one, from 0 to 1. */
  agreement: number;
  /** Agents that fell back to standing preferences because the model failed. */
  fallbacks: number;
}

export interface ArenaResult {
  day: string;
  at: string;
  official: string;
  entries: ArenaEntry[];
}

// --- Group councils ----------------------------------------------------------

/** A member backing one agent before the next session, with an optional note. */
export interface GroupPledge {
  id: string;
  name: string | null;
  agentId: string;
  message: string | null;
  at: string;
}

export interface GroupSession {
  n: number;
  at: string;
  budget: number;
  backers: number;
  influence: Record<string, number>;
  proposals: Proposal[];
  allocations: Allocation[];
  spent: number;
  reserve: number;
  title: string;
  minutes: string;
  model: string;
}

/** A council a class, team or neighbourhood runs from a shareable link. */
export interface GroupCouncil {
  id: string;
  name: string;
  template: string;
  budget: number;
  spec: CouncilSpec;
  createdAt: string;
  /** Backing since the last session. Cleared when the council meets. */
  pledges: GroupPledge[];
  /** Newest last, at most ten. */
  sessions: GroupSession[];
  lastConvenedAt: string | null;
}
