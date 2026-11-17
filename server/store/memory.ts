import { randomUUID } from "node:crypto";
import { makeEntry, type LedgerEntry } from "../../shared/ledger";
import type { ArenaResult, GroupPledge, GroupSession, Nomination, NominationRound, Session, Treasury } from "../../shared/types";
import {
  QuotaExceededError,
  SessionExistsError,
  type AnalyticsBatch,
  type ContactMessage,
  type DaySummary,
  type DayStats,
  type DonationRecord,
  type NewDonation,
  type PredictionRecord,
  type PredictorRecord,
  type SecurityEvent,
  type StatsIncrement,
  type Store,
  type ApiKeyRecord,
  type GroupRecord,
  type PushSubRecord,
  type AccountRecord,
  type EmailFrequency,
  type LoginTokenRecord,
  type SubscriberRecord,
  type PledgeResult,
  GROUP_PLEDGE_LIMIT,
} from "./types";

const emptyStats = (day: string): DayStats => ({
  day,
  views: 0,
  clicks: 0,
  batches: 0,
  uniques: 0,
  donations: 0,
  paths: {},
  targets: {},
  countries: {},
  referrers: {},
  campaigns: {},
});

const addAll = (into: Record<string, number>, from: Record<string, number>) => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
};

/** In-process store for local development and tests. Not durable. */
export class MemoryStore implements Store {
  private treasury: Treasury = {
    balance: 0,
    totalDonated: 0,
    totalAllocated: 0,
    donations: 0,
    lastSessionDay: null,
    updatedAt: new Date(0).toISOString(),
  };
  private ledger: LedgerEntry[] = [];
  private donations: DonationRecord[] = [];
  private days = new Map<string, DaySummary>();
  private sessions = new Map<string, Session>();
  private quotas = new Map<string, number>();
  private grants = new Set<string>();
  private predictions = new Map<string, PredictionRecord>();
  private predictors = new Map<string, PredictorRecord>();
  private scored = new Set<string>();
  private argue = new Map<string, { day: string; agentId: string }>();
  private nominations = new Map<string, Nomination & { email: string | null; ipHash: string }>();
  private nominationVotes = new Set<string>();
  private rounds: NominationRound[] = [];
  private arena = new Map<string, ArenaResult>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private apiUse = new Map<string, number>();
  private groups = new Map<string, GroupRecord>();
  private pushSubs = new Map<string, PushSubRecord>();
  private subscribers = new Map<string, SubscriberRecord>();
  private accounts = new Map<string, AccountRecord>();
  private loginTokens = new Map<string, LoginTokenRecord>();
  private analytics: AnalyticsBatch[] = [];
  private stats = new Map<string, DayStats>();
  private visitors = new Set<string>();
  private security: SecurityEvent[] = [];
  private messages: ContactMessage[] = [];
  private lock: Promise<unknown> = Promise.resolve();

  /** Serialises writes the way a Firestore transaction would. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private head() {
    return this.ledger.at(-1) ?? null;
  }

  ensureGenesis(credits: number) {
    return this.exclusive(async () => {
      if (this.ledger.length) return;
      const entry = await makeEntry(null, "genesis", {
        credits,
        note: "Seed credits that start the simulation. No real money is involved.",
      });
      this.ledger.push(entry);
      this.treasury = { ...this.treasury, balance: credits, updatedAt: entry.at };
    });
  }

  async getTreasury() {
    return { ...this.treasury };
  }

  async getHead() {
    const h = this.head();
    return h ? { seq: h.seq, hash: h.hash } : null;
  }

  donate(input: NewDonation, dailyLimit: number) {
    return this.exclusive(async () => {
      const quotaKey = `${input.day}:${input.ipHash}`;
      const used = this.quotas.get(quotaKey) ?? 0;
      if (used >= dailyLimit) throw new QuotaExceededError("daily donation limit reached");
      const head = this.head();
      if (!head) throw new Error("ledger not initialised");

      const id = randomUUID();
      const at = new Date();
      const entry = await makeEntry(
        head,
        "donation",
        { donationId: id, amount: input.amount, name: input.name, agentId: input.agentId, country: input.country },
        at,
      );
      const donation: DonationRecord = { ...input, id, seq: entry.seq, at: entry.at };
      this.ledger.push(entry);
      this.donations.push(donation);
      this.quotas.set(quotaKey, used + 1);
      this.treasury = {
        ...this.treasury,
        balance: this.treasury.balance + input.amount,
        totalDonated: this.treasury.totalDonated + input.amount,
        donations: this.treasury.donations + 1,
        updatedAt: entry.at,
        countries: input.country
          ? { ...this.treasury.countries, [input.country]: (this.treasury.countries?.[input.country] ?? 0) + 1 }
          : this.treasury.countries,
      };
      const d = this.days.get(input.day) ?? { day: input.day, donations: 0, credits: 0, endorsements: {} };
      d.donations += 1;
      d.credits += input.amount;
      if (input.agentId) d.endorsements[input.agentId] = (d.endorsements[input.agentId] ?? 0) + 1;
      this.days.set(input.day, d);
      const s = this.stats.get(input.day) ?? emptyStats(input.day);
      s.donations += 1;
      this.stats.set(input.day, s);
      return { donation, entry };
    });
  }

  async getDonation(id: string) {
    return this.donations.find((d) => d.id === id) ?? null;
  }

  async listDonations(limit: number) {
    return this.donations.slice(-limit).reverse();
  }

  async getDaySummary(day: string) {
    const d = this.days.get(day);
    return d ? { ...d, endorsements: { ...d.endorsements } } : { day, donations: 0, credits: 0, endorsements: {} };
  }

  async dayMessages(day: string, limit: number) {
    return this.donations
      .filter((d) => d.day === day && d.message)
      .slice(-limit)
      .map((d) => ({ name: d.name, message: d.message!, agentId: d.agentId }));
  }

  async listLedger(limit: number, beforeSeq?: number) {
    const pool = beforeSeq === undefined ? this.ledger : this.ledger.filter((e) => e.seq < beforeSeq);
    return pool.slice(-limit).reverse();
  }

  grant(day: string, credits: number) {
    return this.exclusive(async () => {
      if (this.grants.has(day) || credits <= 0) return null;
      const head = this.head();
      if (!head) throw new Error("ledger not initialised");
      const entry = await makeEntry(head, "grant", { day, credits, note: "Daily grant from the simulated Earthward endowment. No real money is involved." });
      this.ledger.push(entry);
      this.grants.add(day);
      this.treasury = { ...this.treasury, balance: this.treasury.balance + credits, totalGranted: (this.treasury.totalGranted ?? 0) + credits, updatedAt: entry.at };
      return entry;
    });
  }

  async getSession(day: string) {
    return this.sessions.get(day) ?? null;
  }

  async listSessions(limit: number) {
    return [...this.sessions.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, limit);
  }

  async countSessions() {
    return this.sessions.size;
  }

  commitSession(session: Omit<Session, "seq" | "hash">) {
    return this.exclusive(async () => {
      if (this.sessions.has(session.day)) throw new SessionExistsError(session.day);
      const head = this.head();
      if (!head) throw new Error("ledger not initialised");
      const entry = await makeEntry(
        head,
        "allocation",
        {
          day: session.day,
          pool: session.pool,
          spent: session.spent,
          reserve: session.reserve,
          allocations: session.allocations.map((a) => ({ causeId: a.causeId, credits: a.credits })),
        },
        new Date(session.at),
      );
      const full: Session = { ...session, seq: entry.seq, hash: entry.hash };
      this.ledger.push(entry);
      this.sessions.set(session.day, full);
      this.treasury = {
        ...this.treasury,
        balance: this.treasury.balance - session.spent,
        totalAllocated: this.treasury.totalAllocated + session.spent,
        lastSessionDay: session.day,
        updatedAt: entry.at,
      };
      return full;
    });
  }

  async recordAnalytics(batch: AnalyticsBatch, inc: StatsIncrement, day: string, vidHash: string) {
    this.analytics.push(batch);
    if (this.analytics.length > 5000) this.analytics.shift();
    const s = this.stats.get(day) ?? emptyStats(day);
    s.views += inc.views;
    s.clicks += inc.clicks;
    s.batches += 1;
    addAll(s.paths, inc.paths);
    addAll(s.targets, inc.targets);
    addAll(s.referrers, inc.referrers);
    addAll(s.campaigns, inc.campaigns);
    if (inc.country) s.countries[inc.country] = (s.countries[inc.country] ?? 0) + 1;
    if (inc.human) s.humanViews = (s.humanViews ?? 0) + inc.views;
    const vKey = `${day}:${vidHash}`;
    if (!this.visitors.has(vKey)) {
      this.visitors.add(vKey);
      s.uniques += 1;
      if (inc.human) s.humanUniques = (s.humanUniques ?? 0) + 1;
    }
    this.stats.set(day, s);
  }

  async bumpStats(day: string, inc: { asks?: number }) {
    const s = this.stats.get(day) ?? emptyStats(day);
    if (inc.asks) s.asks = (s.asks ?? 0) + inc.asks;
    this.stats.set(day, s);
  }

  async listAnalytics(limit: number) {
    return this.analytics.slice(-limit).reverse();
  }

  async getStats(days: string[]) {
    return days.map((d) => structuredClone(this.stats.get(d) ?? emptyStats(d)));
  }

  async addMessage(m: ContactMessage) {
    this.messages.push(m);
  }

  async listMessages(limit: number) {
    return this.messages.slice(-limit).reverse();
  }

  async recordSecurity(event: SecurityEvent) {
    this.security.push(event);
    if (this.security.length > 2000) this.security.shift();
  }

  async listSecurity(limit: number) {
    return this.security.slice(-limit).reverse();
  }

  async predict(p: PredictionRecord) {
    const key = `${p.day}_${p.vidHash}`;
    if (this.predictions.has(key)) return "exists" as const;
    this.predictions.set(key, { ...p });
    return "created" as const;
  }

  async getPrediction(day: string, vidHash: string) {
    return this.predictions.get(`${day}_${vidHash}`) ?? null;
  }

  async predictionCrowd(day: string) {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const p of this.predictions.values()) {
      if (p.day !== day) continue;
      counts[p.causeId] = (counts[p.causeId] ?? 0) + 1;
      total += 1;
    }
    return { total, counts };
  }

  async listPredictions(day: string, limit: number) {
    return [...this.predictions.values()].filter((p) => p.day === day).slice(0, limit);
  }

  async getPredictor(vidHash: string) {
    const p = this.predictors.get(vidHash);
    return p ? { ...p } : null;
  }

  async savePredictor(p: PredictorRecord) {
    this.predictors.set(p.vidHash, { ...p });
  }

  async topPredictors(limit: number) {
    return [...this.predictors.values()].sort((a, b) => b.correct - a.correct || b.streak - a.streak).slice(0, limit);
  }

  private tasks = new Set<string>();
  async claimTask(key: string) {
    if (this.tasks.has(key)) return false;
    this.tasks.add(key);
    return true;
  }

  async claimScoring(day: string) {
    if (this.scored.has(day)) return false;
    this.scored.add(day);
    return true;
  }

  async voteArgue(day: string, vidHash: string, agentId: string) {
    const key = `${day}_${vidHash}`;
    if (this.argue.has(key)) return "exists" as const;
    this.argue.set(key, { day, agentId });
    return "created" as const;
  }

  async argueVote(day: string, vidHash: string) {
    return this.argue.get(`${day}_${vidHash}`)?.agentId ?? null;
  }

  async argueTallies(days: string[]) {
    return days.map((day) => {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const v of this.argue.values()) {
        if (v.day !== day) continue;
        counts[v.agentId] = (counts[v.agentId] ?? 0) + 1;
        total += 1;
      }
      return { day, total, counts };
    });
  }

  async addNomination(n: Nomination & { email: string | null; ipHash: string }) {
    this.nominations.set(n.id, { ...n });
  }

  async listNominations(scope: "public" | "all", limit: number) {
    return [...this.nominations.values()]
      .filter((n) => scope === "all" || n.status === "approved" || n.status === "chosen")
      .sort((a, b) => b.votes - a.votes || b.at.localeCompare(a.at))
      .slice(0, limit)
      .map(({ ipHash: _ip, ...rest }) => (scope === "all" ? rest : { ...rest, email: undefined }));
  }

  async setNominationStatus(id: string, status: Nomination["status"]) {
    const n = this.nominations.get(id);
    if (!n) return false;
    n.status = status;
    return true;
  }

  async upvoteNomination(id: string, vidHash: string) {
    const n = this.nominations.get(id);
    if (!n || (n.status !== "approved" && n.status !== "chosen")) return "missing" as const;
    const key = `${id}_${vidHash}`;
    if (this.nominationVotes.has(key)) return "exists" as const;
    this.nominationVotes.add(key);
    n.votes += 1;
    return "created" as const;
  }

  async saveRound(round: NominationRound) {
    this.rounds = [...this.rounds.filter((r) => r.month !== round.month), round];
  }

  async latestRound() {
    return [...this.rounds].sort((a, b) => b.month.localeCompare(a.month))[0] ?? null;
  }

  async saveArena(result: ArenaResult) {
    this.arena.set(result.day, result);
  }

  async getArena(day: string) {
    return this.arena.get(day) ?? null;
  }

  async createApiKey(key: ApiKeyRecord) {
    this.apiKeys.set(key.hash, key);
  }

  async getApiKey(hash: string) {
    return this.apiKeys.get(hash) ?? null;
  }

  async useApiKey(hash: string, day: string, limit: number) {
    const k = `${hash}:${day}`;
    const n = this.apiUse.get(k) ?? 0;
    if (n >= limit) return false;
    this.apiUse.set(k, n + 1);
    return true;
  }

  async countApiKeys() {
    return this.apiKeys.size;
  }

  async createGroup(group: GroupRecord) {
    if (this.groups.has(group.id)) throw new Error("group exists");
    this.groups.set(group.id, structuredClone(group));
  }

  async getGroup(id: string) {
    const g = this.groups.get(id);
    return g ? structuredClone(g) : null;
  }

  async addGroupPledge(id: string, pledge: GroupPledge, vidHash: string): Promise<PledgeResult> {
    const g = this.groups.get(id);
    if (!g) return "missing";
    if (g.pledgeVids.includes(vidHash)) return "duplicate";
    if (g.pledges.length >= GROUP_PLEDGE_LIMIT) return "full";
    g.pledges.push(pledge);
    g.pledgeVids.push(vidHash);
    return "ok";
  }

  async saveGroupSession(id: string, session: GroupSession, expected: number) {
    const g = this.groups.get(id);
    if (!g || (g.sessions.at(-1)?.n ?? 0) !== expected) return false;
    g.sessions = [...g.sessions, session].slice(-10);
    g.pledges = [];
    g.pledgeVids = [];
    g.lastConvenedAt = session.at;
    return true;
  }

  async countGroups() {
    return this.groups.size;
  }

  async savePushSub(sub: PushSubRecord) {
    this.pushSubs.set(sub.id, sub);
  }

  async deletePushSub(id: string) {
    this.pushSubs.delete(id);
  }

  async listPushSubs(limit: number) {
    return [...this.pushSubs.values()].slice(0, limit);
  }

  async countPushSubs() {
    return this.pushSubs.size;
  }

  async upsertSubscriber(sub: SubscriberRecord) {
    const existing = this.subscribers.get(sub.id);
    if (existing?.status === "active") return existing;
    this.subscribers.set(sub.id, sub);
    return sub;
  }

  async findSubscriber(token: string) {
    return [...this.subscribers.values()].find((s) => s.token === token) ?? null;
  }

  async findSubscriberById(id: string) {
    const s = this.subscribers.get(id);
    return s ? { ...s } : null;
  }

  async activateSubscriber(id: string) {
    const s = this.subscribers.get(id);
    if (s) this.subscribers.set(id, { ...s, status: "active", confirmedAt: new Date().toISOString() });
  }

  async saveLoginToken(t: LoginTokenRecord) {
    this.loginTokens.set(t.id, { ...t });
  }

  async useLoginToken(id: string, now = new Date()) {
    const t = this.loginTokens.get(id);
    if (!t || t.used || Date.parse(t.expiresAt) < now.getTime()) return null;
    t.used = true;
    return { ...t };
  }

  async getAccount(id: string) {
    const a = this.accounts.get(id);
    return a ? structuredClone(a) : null;
  }

  async signIn(email: string, id: string, vidHash: string | null) {
    const now = new Date().toISOString();
    const a = this.accounts.get(id) ?? { id, email, createdAt: now, lastLoginAt: now, vidHashes: [] };
    a.lastLoginAt = now;
    if (vidHash && !a.vidHashes.includes(vidHash)) a.vidHashes = [...a.vidHashes, vidHash].slice(-10);
    this.accounts.set(id, a);
    return structuredClone(a);
  }

  async deleteAccount(id: string) {
    this.accounts.delete(id);
    for (const g of this.groups.values()) if (g.ownerAccountId === id) g.ownerAccountId = null;
  }

  async listGroupsByOwner(accountId: string, limit: number) {
    return [...this.groups.values()].filter((g) => g.ownerAccountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map((g) => structuredClone(g));
  }

  async setGroupOwner(groupId: string, accountId: string) {
    const g = this.groups.get(groupId);
    if (g) g.ownerAccountId = accountId;
  }

  async setSubscriberFrequency(id: string, frequency: EmailFrequency) {
    const s = this.subscribers.get(id);
    if (s) this.subscribers.set(id, { ...s, frequency });
  }

  async deleteSubscriber(id: string) {
    this.subscribers.delete(id);
  }

  async listActiveSubscribers(limit: number) {
    return [...this.subscribers.values()].filter((s) => s.status === "active").slice(0, limit);
  }

  async countSubscribers() {
    return [...this.subscribers.values()].filter((s) => s.status === "active").length;
  }
}
