import { FieldValue, Firestore, Timestamp, type DocumentReference } from "@google-cloud/firestore";
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

const DAY_MS = 24 * 60 * 60 * 1000;
const seqId = (seq: number) => String(seq).padStart(12, "0");
/** Firestore treats dots in map keys as paths, so keys are reduced to a safe alphabet. */
const safeKey = (k: string) => k.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "_";

const emptyTreasury = (): Treasury => ({
  balance: 0,
  totalDonated: 0,
  totalAllocated: 0,
  donations: 0,
  lastSessionDay: null,
  updatedAt: new Date(0).toISOString(),
});

export class FirestoreStore implements Store {
  private db: Firestore;
  private retentionDays: number;

  constructor(projectId: string, retentionDays: number) {
    this.db = new Firestore({ projectId, ignoreUndefinedProperties: true });
    this.retentionDays = retentionDays;
  }

  private get treasuryRef() {
    return this.db.doc("meta/treasury");
  }
  private get headRef() {
    return this.db.doc("meta/ledger");
  }
  private ledgerRef(seq: number) {
    return this.db.collection("ledger").doc(seqId(seq));
  }
  private expireAt() {
    return Timestamp.fromMillis(Date.now() + this.retentionDays * DAY_MS);
  }

  async ensureGenesis(credits: number) {
    await this.db.runTransaction(async (tx) => {
      const head = await tx.get(this.headRef);
      if (head.exists) return;
      const entry = await makeEntry(null, "genesis", {
        credits,
        note: "Seed credits that start the simulation. No real money is involved.",
      });
      tx.set(this.ledgerRef(0), entry);
      tx.set(this.headRef, { seq: entry.seq, hash: entry.hash });
      tx.set(this.treasuryRef, { ...emptyTreasury(), balance: credits, updatedAt: entry.at });
    });
  }

  async getTreasury() {
    const snap = await this.treasuryRef.get();
    return { ...emptyTreasury(), ...(snap.data() as Partial<Treasury> | undefined) };
  }

  async getHead() {
    const snap = await this.headRef.get();
    return snap.exists ? (snap.data() as { seq: number; hash: string }) : null;
  }

  async donate(input: NewDonation, dailyLimit: number) {
    const donationRef = this.db.collection("donations").doc();
    const dayRef = this.db.collection("days").doc(input.day);
    const quotaRef = this.db.collection("quota").doc(`${input.day}_${input.ipHash}`);
    const statsRef = this.db.collection("stats").doc(input.day);
    return this.db.runTransaction(async (tx) => {
      const [headSnap, treasurySnap, quotaSnap] = await tx.getAll(this.headRef, this.treasuryRef, quotaRef);
      const used = (quotaSnap.data()?.count as number | undefined) ?? 0;
      if (used >= dailyLimit) throw new QuotaExceededError("daily donation limit reached");
      if (!headSnap.exists) throw new Error("ledger not initialised");
      const head = headSnap.data() as { seq: number; hash: string };
      const treasury = { ...emptyTreasury(), ...(treasurySnap.data() as Partial<Treasury>) };

      const entry = await makeEntry(head, "donation", {
        donationId: donationRef.id,
        amount: input.amount,
        name: input.name,
        agentId: input.agentId,
        country: input.country,
      });
      const donation: DonationRecord = { ...input, id: donationRef.id, seq: entry.seq, at: entry.at };

      tx.set(donationRef, donation);
      tx.set(this.ledgerRef(entry.seq), entry);
      tx.set(this.headRef, { seq: entry.seq, hash: entry.hash });
      tx.set(this.treasuryRef, {
        ...treasury,
        balance: treasury.balance + input.amount,
        totalDonated: treasury.totalDonated + input.amount,
        donations: treasury.donations + 1,
        updatedAt: entry.at,
        countries: input.country
          ? { ...treasury.countries, [input.country]: (treasury.countries?.[input.country] ?? 0) + 1 }
          : (treasury.countries ?? {}),
      });
      tx.set(quotaRef, { count: used + 1, expireAt: Timestamp.fromMillis(Date.now() + 2 * DAY_MS) });
      tx.set(
        dayRef,
        {
          day: input.day,
          donations: FieldValue.increment(1),
          credits: FieldValue.increment(input.amount),
          ...(input.agentId ? { endorsements: { [input.agentId]: FieldValue.increment(1) } } : {}),
        },
        { merge: true },
      );
      tx.set(statsRef, { day: input.day, donations: FieldValue.increment(1) }, { merge: true });
      return { donation, entry };
    });
  }

  async getDonation(id: string) {
    const snap = await this.db.collection("donations").doc(id).get();
    return snap.exists ? (snap.data() as DonationRecord) : null;
  }

  async listDonations(limit: number) {
    const snap = await this.db.collection("donations").orderBy("seq", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as DonationRecord);
  }

  async getDaySummary(day: string): Promise<DaySummary> {
    const snap = await this.db.collection("days").doc(day).get();
    const d = snap.data() as Partial<DaySummary> | undefined;
    return { day, donations: d?.donations ?? 0, credits: d?.credits ?? 0, endorsements: d?.endorsements ?? {} };
  }

  async dayMessages(day: string, limit: number) {
    // Equality-only query so no composite index is needed; sorted here instead.
    const snap = await this.db.collection("donations").where("day", "==", day).limit(500).get();
    return snap.docs
      .map((d) => d.data() as DonationRecord)
      .filter((d) => d.message)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit)
      .map((d) => ({ name: d.name, message: d.message!, agentId: d.agentId }));
  }

  async listLedger(limit: number, beforeSeq?: number) {
    let q = this.db.collection("ledger").orderBy("seq", "desc");
    if (beforeSeq !== undefined) q = q.where("seq", "<", beforeSeq);
    const snap = await q.limit(limit).get();
    return snap.docs.map((d) => d.data() as LedgerEntry);
  }

  async grant(day: string, credits: number) {
    if (credits <= 0) return null;
    const grantRef = this.db.collection("grants").doc(day);
    return this.db.runTransaction(async (tx) => {
      const [grantSnap, headSnap, treasurySnap] = await tx.getAll(grantRef, this.headRef, this.treasuryRef);
      if (grantSnap.exists) return null;
      if (!headSnap.exists) throw new Error("ledger not initialised");
      const head = headSnap.data() as { seq: number; hash: string };
      const treasury = { ...emptyTreasury(), ...(treasurySnap.data() as Partial<Treasury>) };
      const entry = await makeEntry(head, "grant", { day, credits, note: "Daily grant from the simulated Earthward endowment. No real money is involved." });
      tx.set(grantRef, { day, credits, seq: entry.seq, at: entry.at });
      tx.set(this.ledgerRef(entry.seq), entry);
      tx.set(this.headRef, { seq: entry.seq, hash: entry.hash });
      tx.set(this.treasuryRef, { ...treasury, balance: treasury.balance + credits, totalGranted: (treasury.totalGranted ?? 0) + credits, updatedAt: entry.at });
      return entry;
    });
  }

  async getSession(day: string) {
    const snap = await this.db.collection("sessions").doc(day).get();
    return snap.exists ? (snap.data() as Session) : null;
  }

  async listSessions(limit: number) {
    const snap = await this.db.collection("sessions").orderBy("day", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as Session);
  }

  async countSessions() {
    const snap = await this.db.collection("sessions").count().get();
    return snap.data().count;
  }

  async commitSession(session: Omit<Session, "seq" | "hash">) {
    const sessionRef = this.db.collection("sessions").doc(session.day);
    return this.db.runTransaction(async (tx) => {
      const [sessionSnap, headSnap, treasurySnap] = await tx.getAll(sessionRef, this.headRef, this.treasuryRef);
      if (sessionSnap.exists) throw new SessionExistsError(session.day);
      if (!headSnap.exists) throw new Error("ledger not initialised");
      const head = headSnap.data() as { seq: number; hash: string };
      const treasury = { ...emptyTreasury(), ...(treasurySnap.data() as Partial<Treasury>) };
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
      tx.set(sessionRef, full);
      tx.set(this.ledgerRef(entry.seq), entry);
      tx.set(this.headRef, { seq: entry.seq, hash: entry.hash });
      tx.set(this.treasuryRef, {
        ...treasury,
        balance: treasury.balance - session.spent,
        totalAllocated: treasury.totalAllocated + session.spent,
        lastSessionDay: session.day,
        updatedAt: entry.at,
      });
      return full;
    });
  }

  async recordAnalytics(batch: AnalyticsBatch, inc: StatsIncrement, day: string, vidHash: string) {
    const statsRef = this.db.collection("stats").doc(day);
    const visitorRef = statsRef.collection("visitors").doc(vidHash);
    const write = this.db.batch();
    write.set(this.db.collection("analytics").doc(), { ...batch, expireAt: this.expireAt() });
    const nested = (m: Record<string, number>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [safeKey(k), FieldValue.increment(v)]));
    write.set(
      statsRef,
      {
        day,
        views: FieldValue.increment(inc.views),
        clicks: FieldValue.increment(inc.clicks),
        batches: FieldValue.increment(1),
        paths: nested(inc.paths),
        targets: nested(inc.targets),
        referrers: nested(inc.referrers),
        campaigns: nested(inc.campaigns),
        ...(inc.human ? { humanViews: FieldValue.increment(inc.views) } : {}),
        ...(inc.country ? { countries: { [safeKey(inc.country)]: FieldValue.increment(1) } } : {}),
      },
      { merge: true },
    );
    await write.commit();
    // Counting unique visitors needs a create-if-absent, which a batch cannot express.
    try {
      await visitorRef.create({ at: batch.at, expireAt: this.expireAt() });
      await statsRef.set({ uniques: FieldValue.increment(1), ...(inc.human ? { humanUniques: FieldValue.increment(1) } : {}) }, { merge: true });
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err; // 6 = ALREADY_EXISTS
    }
  }

  async bumpStats(day: string, inc: { asks?: number }) {
    const fields = Object.fromEntries(Object.entries(inc).filter(([, v]) => v).map(([k, v]) => [k, FieldValue.increment(v as number)]));
    if (Object.keys(fields).length) await this.db.collection("stats").doc(day).set({ day, ...fields }, { merge: true });
  }

  async listAnalytics(limit: number) {
    const snap = await this.db.collection("analytics").orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => {
      const { expireAt: _e, ...rest } = d.data();
      return rest as AnalyticsBatch;
    });
  }

  async getStats(days: string[]) {
    if (days.length === 0) return [];
    const refs: DocumentReference[] = days.map((d) => this.db.collection("stats").doc(d));
    const snaps = await this.db.getAll(...refs);
    return snaps.map((s, i) => {
      const d = (s.data() ?? {}) as Partial<DayStats>;
      return {
        day: days[i],
        views: d.views ?? 0,
        clicks: d.clicks ?? 0,
        batches: d.batches ?? 0,
        uniques: d.uniques ?? 0,
        donations: d.donations ?? 0,
        paths: d.paths ?? {},
        targets: d.targets ?? {},
        countries: d.countries ?? {},
        referrers: d.referrers ?? {},
        campaigns: d.campaigns ?? {},
        // Counters added later; absent on older days.
        ...(d.humanViews !== undefined ? { humanViews: d.humanViews } : {}),
        ...(d.humanUniques !== undefined ? { humanUniques: d.humanUniques } : {}),
        ...(d.asks !== undefined ? { asks: d.asks } : {}),
      };
    });
  }

  async addMessage(m: ContactMessage) {
    // Kept for 180 days, then removed by the TTL policy.
    await this.db.collection("messages").add({ ...m, expireAt: Timestamp.fromMillis(Date.now() + 180 * DAY_MS) });
  }

  async listMessages(limit: number) {
    const snap = await this.db.collection("messages").orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => {
      const { expireAt: _e, ...rest } = d.data();
      return rest as ContactMessage;
    });
  }

  async recordSecurity(event: SecurityEvent) {
    await this.db.collection("security").add({ ...event, expireAt: this.expireAt() });
  }

  async listSecurity(limit: number) {
    const snap = await this.db.collection("security").orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => {
      const { expireAt: _e, ...rest } = d.data();
      return rest as SecurityEvent;
    });
  }

  async predict(p: PredictionRecord) {
    const ref = this.db.collection("predictions").doc(`${p.day}_${p.vidHash}`);
    const crowd = this.db.collection("predictCrowd").doc(p.day);
    return this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return "exists" as const;
      tx.set(ref, { ...p, expireAt: Timestamp.fromMillis(Date.now() + 120 * DAY_MS) });
      tx.set(crowd, { day: p.day, total: FieldValue.increment(1), counts: { [safeKey(p.causeId)]: FieldValue.increment(1) } }, { merge: true });
      return "created" as const;
    });
  }

  async getPrediction(day: string, vidHash: string) {
    const snap = await this.db.collection("predictions").doc(`${day}_${vidHash}`).get();
    return snap.exists ? (snap.data() as PredictionRecord) : null;
  }

  async predictionCrowd(day: string) {
    const d = (await this.db.collection("predictCrowd").doc(day).get()).data() as { total?: number; counts?: Record<string, number> } | undefined;
    return { total: d?.total ?? 0, counts: d?.counts ?? {} };
  }

  async listPredictions(day: string, limit: number) {
    const snap = await this.db.collection("predictions").where("day", "==", day).limit(limit).get();
    return snap.docs.map((d) => d.data() as PredictionRecord);
  }

  async getPredictor(vidHash: string) {
    const snap = await this.db.collection("predictors").doc(vidHash).get();
    return snap.exists ? (snap.data() as PredictorRecord) : null;
  }

  async savePredictor(p: PredictorRecord) {
    await this.db.collection("predictors").doc(p.vidHash).set(p);
  }

  async topPredictors(limit: number) {
    const snap = await this.db.collection("predictors").orderBy("correct", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data() as PredictorRecord);
  }

  async claimTask(key: string) {
    try {
      await this.db.collection("tasksDone").doc(key.replace(/[/]/g, "_")).create({ key, at: new Date().toISOString() });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
      throw err;
    }
  }

  async claimScoring(day: string) {
    try {
      await this.db.collection("predictScored").doc(day).create({ day, at: new Date().toISOString() });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === 6) return false; // ALREADY_EXISTS
      throw err;
    }
  }

  async voteArgue(day: string, vidHash: string, agentId: string) {
    const ref = this.db.collection("argueVotes").doc(`${day}_${vidHash}`);
    const tally = this.db.collection("argueTally").doc(day);
    return this.db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return "exists" as const;
      tx.set(ref, { day, vidHash, agentId, at: new Date().toISOString(), expireAt: Timestamp.fromMillis(Date.now() + 120 * DAY_MS) });
      tx.set(tally, { day, total: FieldValue.increment(1), counts: { [safeKey(agentId)]: FieldValue.increment(1) } }, { merge: true });
      return "created" as const;
    });
  }

  async argueVote(day: string, vidHash: string) {
    const snap = await this.db.collection("argueVotes").doc(`${day}_${vidHash}`).get();
    return snap.exists ? ((snap.data() as { agentId: string }).agentId ?? null) : null;
  }

  async argueTallies(days: string[]) {
    if (!days.length) return [];
    const snaps = await this.db.getAll(...days.map((d) => this.db.collection("argueTally").doc(d)));
    return snaps.map((s, i) => {
      const d = s.data() as { total?: number; counts?: Record<string, number> } | undefined;
      return { day: days[i], total: d?.total ?? 0, counts: d?.counts ?? {} };
    });
  }

  async addNomination(n: Nomination & { email: string | null; ipHash: string }) {
    await this.db.collection("nominations").doc(n.id).set(n);
  }

  async listNominations(scope: "public" | "all", limit: number) {
    // Small collection; filter and sort here so no composite index is needed.
    const snap = await this.db.collection("nominations").orderBy("at", "desc").limit(500).get();
    return snap.docs
      .map((d) => d.data() as Nomination & { email: string | null; ipHash: string })
      .filter((n) => scope === "all" || n.status === "approved" || n.status === "chosen")
      .sort((a, b) => b.votes - a.votes || b.at.localeCompare(a.at))
      .slice(0, limit)
      .map(({ ipHash: _ip, ...rest }) => (scope === "all" ? rest : { ...rest, email: undefined }));
  }

  async setNominationStatus(id: string, status: Nomination["status"]) {
    const ref = this.db.collection("nominations").doc(id);
    if (!(await ref.get()).exists) return false;
    await ref.update({ status });
    return true;
  }

  async upvoteNomination(id: string, vidHash: string) {
    const ref = this.db.collection("nominations").doc(id);
    const vote = this.db.collection("nominationVotes").doc(`${id}_${vidHash}`);
    return this.db.runTransaction(async (tx) => {
      const [n, v] = await tx.getAll(ref, vote);
      const status = (n.data() as Nomination | undefined)?.status;
      if (!n.exists || (status !== "approved" && status !== "chosen")) return "missing" as const;
      if (v.exists) return "exists" as const;
      tx.set(vote, { id, vidHash, at: new Date().toISOString() });
      tx.update(ref, { votes: FieldValue.increment(1) });
      return "created" as const;
    });
  }

  async saveRound(round: NominationRound) {
    await this.db.collection("nominationRounds").doc(round.month).set(round);
  }

  async latestRound() {
    const snap = await this.db.collection("nominationRounds").orderBy("month", "desc").limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as NominationRound);
  }

  async saveArena(result: ArenaResult) {
    await this.db.collection("arena").doc(result.day).set(result);
  }

  async getArena(day: string) {
    const snap = await this.db.collection("arena").doc(day).get();
    return snap.exists ? (snap.data() as ArenaResult) : null;
  }

  async createApiKey(key: ApiKeyRecord) {
    await this.db.collection("apiKeys").doc(key.hash).create(key);
  }

  async getApiKey(hash: string) {
    const snap = await this.db.collection("apiKeys").doc(hash).get();
    return snap.exists ? (snap.data() as ApiKeyRecord) : null;
  }

  async useApiKey(hash: string, day: string, limit: number) {
    const ref = this.db.collection("apiKeyUse").doc(`${hash.slice(0, 32)}_${day}`);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const n = snap.exists ? Number(snap.get("count") ?? 0) : 0;
      if (n >= limit) return false;
      // expireAt lets a Firestore TTL policy clean these up.
      tx.set(ref, { count: n + 1, day, expireAt: new Date(Date.now() + 7 * 86_400_000) });
      return true;
    });
  }

  async countApiKeys() {
    const agg = await this.db.collection("apiKeys").count().get();
    return agg.data().count;
  }

  async createGroup(group: GroupRecord) {
    await this.db.collection("groups").doc(group.id).create(group);
  }

  async getGroup(id: string) {
    const snap = await this.db.collection("groups").doc(id).get();
    return snap.exists ? (snap.data() as GroupRecord) : null;
  }

  async addGroupPledge(id: string, pledge: GroupPledge, vidHash: string): Promise<PledgeResult> {
    const ref = this.db.collection("groups").doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "missing";
      const g = snap.data() as GroupRecord;
      if (g.pledgeVids.includes(vidHash)) return "duplicate";
      if (g.pledges.length >= GROUP_PLEDGE_LIMIT) return "full";
      tx.update(ref, { pledges: [...g.pledges, pledge], pledgeVids: [...g.pledgeVids, vidHash] });
      return "ok";
    });
  }

  async saveGroupSession(id: string, session: GroupSession, expected: number) {
    const ref = this.db.collection("groups").doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const g = snap.data() as GroupRecord;
      if ((g.sessions.at(-1)?.n ?? 0) !== expected) return false;
      tx.update(ref, { sessions: [...g.sessions, session].slice(-10), pledges: [], pledgeVids: [], lastConvenedAt: session.at });
      return true;
    });
  }

  async countGroups() {
    const agg = await this.db.collection("groups").count().get();
    return agg.data().count;
  }

  async savePushSub(sub: PushSubRecord) {
    await this.db.collection("pushSubs").doc(sub.id).set(sub);
  }

  async deletePushSub(id: string) {
    await this.db.collection("pushSubs").doc(id).delete();
  }

  async listPushSubs(limit: number) {
    const snap = await this.db.collection("pushSubs").limit(limit).get();
    return snap.docs.map((d) => d.data() as PushSubRecord);
  }

  async countPushSubs() {
    return (await this.db.collection("pushSubs").count().get()).data().count;
  }

  async upsertSubscriber(sub: SubscriberRecord) {
    const ref = this.db.collection("subscribers").doc(sub.id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as SubscriberRecord) : null;
      if (existing?.status === "active") return existing;
      tx.set(ref, sub);
      return sub;
    });
  }

  async findSubscriber(token: string) {
    const snap = await this.db.collection("subscribers").where("token", "==", token).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as SubscriberRecord);
  }

  async findSubscriberById(id: string) {
    const snap = await this.db.collection("subscribers").doc(id).get();
    return snap.exists ? (snap.data() as SubscriberRecord) : null;
  }

  async activateSubscriber(id: string) {
    await this.db.collection("subscribers").doc(id).update({ status: "active", confirmedAt: new Date().toISOString() });
  }

  async saveLoginToken(t: LoginTokenRecord) {
    // Removed by the TTL policy on expireAt a day after the link stops working.
    await this.db.collection("loginTokens").doc(t.id).set({ ...t, expireAt: Timestamp.fromMillis(Date.parse(t.expiresAt) + DAY_MS) });
  }

  async useLoginToken(id: string, now = new Date()) {
    const ref = this.db.collection("loginTokens").doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const t = snap.data() as LoginTokenRecord;
      if (t.used || Date.parse(t.expiresAt) < now.getTime()) return null;
      tx.update(ref, { used: true });
      return { id: t.id, email: t.email, createdAt: t.createdAt, expiresAt: t.expiresAt, used: true, next: t.next ?? null };
    });
  }

  async getAccount(id: string) {
    const snap = await this.db.collection("accounts").doc(id).get();
    return snap.exists ? (snap.data() as AccountRecord) : null;
  }

  async signIn(email: string, id: string, vidHash: string | null) {
    const ref = this.db.collection("accounts").doc(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = new Date().toISOString();
      const a: AccountRecord = snap.exists ? (snap.data() as AccountRecord) : { id, email, createdAt: now, lastLoginAt: now, vidHashes: [] };
      a.lastLoginAt = now;
      if (vidHash && !a.vidHashes.includes(vidHash)) a.vidHashes = [...a.vidHashes, vidHash].slice(-10);
      tx.set(ref, a);
      return a;
    });
  }

  async deleteAccount(id: string) {
    const owned = await this.db.collection("groups").where("ownerAccountId", "==", id).get();
    const batch = this.db.batch();
    for (const d of owned.docs) batch.update(d.ref, { ownerAccountId: null });
    batch.delete(this.db.collection("accounts").doc(id));
    await batch.commit();
  }

  async listGroupsByOwner(accountId: string, limit: number) {
    const snap = await this.db.collection("groups").where("ownerAccountId", "==", accountId).limit(limit).get();
    return snap.docs.map((d) => d.data() as GroupRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async setGroupOwner(groupId: string, accountId: string) {
    await this.db.collection("groups").doc(groupId).update({ ownerAccountId: accountId });
  }

  async setSubscriberFrequency(id: string, frequency: EmailFrequency) {
    await this.db.collection("subscribers").doc(id).update({ frequency });
  }

  async deleteSubscriber(id: string) {
    await this.db.collection("subscribers").doc(id).delete();
  }

  async listActiveSubscribers(limit: number) {
    const snap = await this.db.collection("subscribers").where("status", "==", "active").limit(limit).get();
    return snap.docs.map((d) => d.data() as SubscriberRecord);
  }

  async countSubscribers() {
    return (await this.db.collection("subscribers").where("status", "==", "active").count().get()).data().count;
  }
}
