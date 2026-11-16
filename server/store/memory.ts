import { randomUUID } from "node:crypto";
import { makeEntry, type LedgerEntry } from "../../shared/ledger";
import type { Session, Treasury } from "../../shared/types";
import {
  QuotaExceededError,
  SessionExistsError,
  type AnalyticsBatch,
  type ContactMessage,
  type DaySummary,
  type DayStats,
  type DonationRecord,
  type NewDonation,
  type SecurityEvent,
  type StatsIncrement,
  type Store,
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
}
