import type { AgentId } from "./agents";
import type { CauseId } from "./causes";
import type { Allocation, Proposal } from "./council";
import type { LedgerEntry } from "./ledger";

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
