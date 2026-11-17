import type { AgentId } from "../../shared/agents";
import type { LedgerEntry } from "../../shared/ledger";
import type { ArenaResult, GroupCouncil, GroupPledge, GroupSession, Nomination, NominationRound, Session, TrackEvent, Treasury } from "../../shared/types";

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
  /** For questions put to the council: its verdict, so the inbox shows what the visitor saw. */
  answer?: string | null;
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
  /** suggestion, question, feedback, bug, partnership, or "ask" for a question put to the council. */
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
  /** For questions put to the council: its verdict, so the inbox shows what the visitor saw. */
  answer?: string | null;
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

export interface ApiKeyRecord {
  hash: string;
  name: string;
  use: string;
  createdAt: string;
  ipHash: string;
  disabled?: boolean;
}

export interface GroupRecord extends GroupCouncil {
  ownerHash: string;
  /** The signed-in account that owns it, so it can be managed from any device. */
  ownerAccountId?: string | null;
  /** Hashed visitor ids that have backed an agent since the last session. */
  pledgeVids: string[];
  ipHash: string;
}

export interface PushSubRecord {
  /** SHA-256 of the push endpoint. */
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Hashed visitor id, so the nightly message can say how their prediction did. */
  vidHash: string | null;
  createdAt: string;
}

export interface SubscriberRecord {
  /** SHA-256 of the lowercased email. */
  id: string;
  email: string;
  status: "pending" | "active";
  token: string;
  createdAt: string;
  confirmedAt: string | null;
  /** "daily" gets each night's decision, "weekly" the Monday roundup. Older records are weekly. */
  frequency?: EmailFrequency;
  /** Links the subscriber to their predictions, so the nightly email can say whether they were right. */
  vidHash?: string | null;
}

export type EmailFrequency = "daily" | "weekly";

/** Someone who signed in with an email link. */
export interface AccountRecord {
  /** SHA-256 of the lowercased email, the same id the subscriber record uses. */
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt: string;
  /** Hashed visitor ids of the browsers they signed in on, so predictions follow the person. */
  vidHashes: string[];
}

/** A one-time sign-in link. Only the hash of the token is stored. */
export interface LoginTokenRecord {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  /** Where to go after signing in (a path on this site). */
  next: string | null;
}

export type PledgeResult = "ok" | "duplicate" | "full" | "missing";
/** Members who can back an agent between two sessions of one group council. */
export const GROUP_PLEDGE_LIMIT = 200;

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
  saveArena(result: ArenaResult): Promise<void>;
  /** Developer API keys, stored by the SHA-256 of the key. */
  createApiKey(key: ApiKeyRecord): Promise<void>;
  getApiKey(hash: string): Promise<ApiKeyRecord | null>;
  /** Counts one call against a key's daily quota. False once the quota is used up. */
  useApiKey(hash: string, day: string, limit: number): Promise<boolean>;
  countApiKeys(): Promise<number>;
  createGroup(group: GroupRecord): Promise<void>;
  getGroup(id: string): Promise<GroupRecord | null>;
  addGroupPledge(id: string, pledge: GroupPledge, vidHash: string): Promise<PledgeResult>;
  /** Appends a session if the latest one is still number `expected` (0 for none), so two convenes can't race. */
  saveGroupSession(id: string, session: GroupSession, expected: number): Promise<boolean>;
  countGroups(): Promise<number>;
  savePushSub(sub: PushSubRecord): Promise<void>;
  deletePushSub(id: string): Promise<void>;
  listPushSubs(limit: number): Promise<PushSubRecord[]>;
  countPushSubs(): Promise<number>;
  /** Creates or refreshes a pending subscriber. Returns the stored record (an active one stays active). */
  upsertSubscriber(sub: SubscriberRecord): Promise<SubscriberRecord>;
  findSubscriber(token: string): Promise<SubscriberRecord | null>;
  findSubscriberById(id: string): Promise<SubscriberRecord | null>;
  activateSubscriber(id: string): Promise<void>;
  setSubscriberFrequency(id: string, frequency: EmailFrequency): Promise<void>;
  saveLoginToken(t: LoginTokenRecord): Promise<void>;
  /** Marks a sign-in token used and returns it, or null if it's unknown, used or expired. */
  useLoginToken(id: string, now?: Date): Promise<LoginTokenRecord | null>;
  getAccount(id: string): Promise<AccountRecord | null>;
  /** Creates the account on first sign-in, records the login and remembers the browser. */
  signIn(email: string, id: string, vidHash: string | null): Promise<AccountRecord>;
  deleteAccount(id: string): Promise<void>;
  listGroupsByOwner(accountId: string, limit: number): Promise<GroupRecord[]>;
  setGroupOwner(groupId: string, accountId: string): Promise<void>;
  deleteSubscriber(id: string): Promise<void>;
  listActiveSubscribers(limit: number): Promise<SubscriberRecord[]>;
  countSubscribers(): Promise<number>;
  getArena(day: string): Promise<ArenaResult | null>;
  /** Claims the right to score a day's predictions. True only for the first caller. */
  claimScoring(day: string): Promise<boolean>;
  listSecurity(limit: number): Promise<SecurityEvent[]>;
}
