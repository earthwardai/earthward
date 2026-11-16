import type { AgentId } from "../../shared/agents";
import type { LedgerEntry } from "../../shared/ledger";
import type { Nomination, NominationRound, Session, TrackEvent, Treasury } from "../../shared/types";

export interface DonationRecord {
  id: string;
  amount: number;
  name: string | null;
  message: string | null;
  agentId: AgentId | null;
  country: string | null;
  location: [number, number] | null;
  at: string;
  day: string;
  seq: number;
  ipHash: string;
  vid: string | null;
}

export type NewDonation = Omit<DonationRecord, "id" | "seq" | "at">;

export interface DaySummary {
  day: string;
  donations: number;
  credits: number;
  endorsements: Partial<Record<AgentId, number>>;
}

export interface AnalyticsBatch {
  at: string;
  ip: string;
  ipHash: string;
  country: string | null;
  ua: string;
  vid: string;
  sid: string;
  events: TrackEvent[];
  screen: { w: number; h: number } | null;
  tz: string | null;
  lang: string | null;
}

export interface DayStats {
  day: string;
  views: number;
  clicks: number;
  batches: number;
  uniques: number;
  donations: number;
  paths: Record<string, number>;
  targets: Record<string, number>;
  countries: Record<string, number>;
  referrers: Record<string, number>;
  campaigns: Record<string, number>;
  /** Views and unique visitors that look like people rather than bots. */
  humanViews?: number;
  humanUniques?: number;
  /** Questions put to the council. */
  asks?: number;
}

export interface StatsIncrement {
  views: number;
  clicks: number;
  paths: Record<string, number>;
  targets: Record<string, number>;
  country: string | null;
  referrers: Record<string, number>;
  campaigns: Record<string, number>;
  /** False for batches that look automated. */
  human: boolean;
}

export interface SecurityEvent {
  at: string;
  kind: "rate_limited" | "honeypot" | "too_fast" | "quota" | "admin_denied" | "admin_login_failed" | "bad_input";
  ip: string;
  ipHash: string;
  path: string;
  detail?: string;
}

export interface ContactMessage {
  at: string;
  /** suggestion, question, feedback, bug or partnership. */
  kind?: string;
  /** The page the visitor was on when they wrote. */
  page?: string | null;
  name: string | null;
  email: string | null;
  message: string;
  ip: string;
  ipHash: string;
  country: string | null;
  ua: string;
}

/** One visitor's guess at which cause will top tonight's decision. */
export interface PredictionRecord {
  day: string;
  vidHash: string;
  causeId: string;
  name: string | null;
  at: string;
}

/** A visitor's running record in the prediction game. */
export interface PredictorRecord {
  vidHash: string;
  name: string | null;
  total: number;
  correct: number;
  streak: number;
  best: number;
  lastDay: string | null;
  lastCorrect: boolean | null;
}

export class QuotaExceededError extends Error {}
export class SessionExistsError extends Error {}

export interface Store {
  /** Creates the genesis entry and seeds the treasury once. Safe to call on every boot. */
  ensureGenesis(credits: number): Promise<void>;
  getTreasury(): Promise<Treasury>;
  getHead(): Promise<{ seq: number; hash: string } | null>;

  /** Records a donation, its ledger entry and the daily totals in one atomic step. */
  donate(input: NewDonation, dailyLimit: number): Promise<{ donation: DonationRecord; entry: LedgerEntry }>;
  listDonations(limit: number): Promise<DonationRecord[]>;
  getDonation(id: string): Promise<DonationRecord | null>;
  getDaySummary(day: string): Promise<DaySummary>;
  dayMessages(day: string, limit: number): Promise<{ name: string | null; message: string; agentId: AgentId | null }[]>;

  listLedger(limit: number, beforeSeq?: number): Promise<LedgerEntry[]>;

  /** Adds the endowment's daily grant for `day` once, with its own ledger entry. Returns null if already granted. */
  grant(day: string, credits: number): Promise<LedgerEntry | null>;

  getSession(day: string): Promise<Session | null>;
  listSessions(limit: number): Promise<Session[]>;
  countSessions(): Promise<number>;
  /** Writes the session, its ledger entry and the treasury update atomically. */
  commitSession(session: Omit<Session, "seq" | "hash">): Promise<Session>;

  recordAnalytics(batch: AnalyticsBatch, inc: StatsIncrement, day: string, vidHash: string): Promise<void>;
  listAnalytics(limit: number): Promise<AnalyticsBatch[]>;
  getStats(days: string[]): Promise<DayStats[]>;
  /** Adds to simple daily counters such as questions asked. */
  bumpStats(day: string, inc: { asks?: number }): Promise<void>;

  addMessage(m: ContactMessage): Promise<void>;
  listMessages(limit: number): Promise<ContactMessage[]>;

  recordSecurity(event: SecurityEvent): Promise<void>;

  /** Saves a prediction unless this visitor already predicted that day. */
  predict(p: PredictionRecord): Promise<"created" | "exists">;
  getPrediction(day: string, vidHash: string): Promise<PredictionRecord | null>;
  predictionCrowd(day: string): Promise<{ total: number; counts: Record<string, number> }>;
  listPredictions(day: string, limit: number): Promise<PredictionRecord[]>;
  getPredictor(vidHash: string): Promise<PredictorRecord | null>;
  savePredictor(p: PredictorRecord): Promise<void>;
  topPredictors(limit: number): Promise<PredictorRecord[]>;
  /** One "who argued best?" vote per visitor per night. */
  voteArgue(day: string, vidHash: string, agentId: string): Promise<"created" | "exists">;
  argueVote(day: string, vidHash: string): Promise<string | null>;
  argueTallies(days: string[]): Promise<{ day: string; total: number; counts: Record<string, number> }[]>;
  addNomination(n: Nomination & { email: string | null; ipHash: string }): Promise<void>;
  /** Public list: approved and chosen nominations. Admin passes "all". */
  listNominations(scope: "public" | "all", limit: number): Promise<(Nomination & { email?: string | null })[]>;
  setNominationStatus(id: string, status: Nomination["status"]): Promise<boolean>;
  upvoteNomination(id: string, vidHash: string): Promise<"created" | "exists" | "missing">;
  saveRound(round: NominationRound): Promise<void>;
  latestRound(): Promise<NominationRound | null>;
  /** Claims the right to score a day's predictions. True only for the first caller. */
  claimScoring(day: string): Promise<boolean>;
  listSecurity(limit: number): Promise<SecurityEvent[]>;
}
