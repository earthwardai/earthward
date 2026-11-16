import type { AgentId } from "../../shared/agents";
import type { LedgerEntry } from "../../shared/ledger";
import type { Session, TrackEvent, Treasury } from "../../shared/types";

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
}

export interface StatsIncrement {
  views: number;
  clicks: number;
  paths: Record<string, number>;
  targets: Record<string, number>;
  country: string | null;
  referrers: Record<string, number>;
  campaigns: Record<string, number>;
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
  name: string | null;
  email: string | null;
  message: string;
  ip: string;
  ipHash: string;
  country: string | null;
  ua: string;
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
  getDaySummary(day: string): Promise<DaySummary>;
  dayMessages(day: string, limit: number): Promise<{ name: string | null; message: string; agentId: AgentId | null }[]>;

  listLedger(limit: number, beforeSeq?: number): Promise<LedgerEntry[]>;

  getSession(day: string): Promise<Session | null>;
  listSessions(limit: number): Promise<Session[]>;
  countSessions(): Promise<number>;
  /** Writes the session, its ledger entry and the treasury update atomically. */
  commitSession(session: Omit<Session, "seq" | "hash">): Promise<Session>;

  recordAnalytics(batch: AnalyticsBatch, inc: StatsIncrement, day: string, vidHash: string): Promise<void>;
  listAnalytics(limit: number): Promise<AnalyticsBatch[]>;
  getStats(days: string[]): Promise<DayStats[]>;

  addMessage(m: ContactMessage): Promise<void>;
  listMessages(limit: number): Promise<ContactMessage[]>;

  recordSecurity(event: SecurityEvent): Promise<void>;
  listSecurity(limit: number): Promise<SecurityEvent[]>;
}
