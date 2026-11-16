import { describe, expect, it } from "vitest";
import { AGENT_IDS } from "../shared/agents";
import {
  RULES,
  allocateCredits,
  dayKey,
  fallbackProposal,
  influence,
  mergeProposals,
  nextSessionAt,
  normalizeShares,
  sessionDay,
} from "../shared/council";
import { canonicalJson, makeEntry, verifyEntries } from "../shared/ledger";

describe("ledger", () => {
  it("hashes independently of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
  });

  it("verifies an untouched chain and catches edits", async () => {
    const g = await makeEntry(null, "genesis", { credits: 100 });
    const a = await makeEntry(g, "donation", { amount: 5 });
    const b = await makeEntry(a, "donation", { amount: 7 });
    expect(await verifyEntries([b, g, a])).toEqual({ checked: 3, ok: true });

    const edited = { ...a, data: { amount: 500 } };
    const res = await verifyEntries([g, edited, b]);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(1);

    const relinked = await makeEntry(g, "donation", { amount: 500 });
    const res2 = await verifyEntries([g, relinked, b]);
    expect(res2).toMatchObject({ ok: false, brokenAt: 2 });
  });
});

describe("council rules", () => {
  it("normalises and ignores unknown causes", () => {
    const s = normalizeShares({ reforest: 3, reefs: 1, bogus: 10, water: -2 });
    expect(Object.keys(s).sort()).toEqual(["reefs", "reforest"]);
    expect(s.reforest).toBeCloseTo(0.75);
  });

  it("gives every agent equal weight without endorsements and caps the boost", () => {
    const w = influence({});
    for (const id of AGENT_IDS) expect(w[id]).toBeCloseTo(0.2);
    const tilted = influence({ kindred: 10 });
    expect(tilted.kindred).toBeCloseTo(3 / 7);
    expect(Object.values(tilted).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("caps any single cause and holds back what the cap cannot place", () => {
    const narrow = AGENT_IDS.map((id) => ({ ...fallbackProposal(id, "2026-11-12"), shares: { reforest: 0.9, water: 0.1 } }));
    const merged = mergeProposals(narrow, influence({}));
    expect(merged.reforest).toBeCloseTo(RULES.causeCap);
    expect(merged.water).toBeCloseTo(RULES.causeCap);
    const { spent, reserve } = allocateCredits(1000, merged);
    expect(spent).toBe(Math.floor(1000 * RULES.spendRatio * 0.6));
    expect(spent + reserve).toBe(1000);

    const wide = mergeProposals(AGENT_IDS.map((id) => fallbackProposal(id, "2026-11-12")), influence({}));
    expect(Object.values(wide).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1);
    for (const v of Object.values(wide)) {
      expect(v).toBeLessThanOrEqual(RULES.causeCap + 1e-9);
      expect(v).toBeGreaterThanOrEqual(RULES.causeFloor - 1e-9);
    }
  });

  it("allocates whole credits that add up exactly", () => {
    const shares = mergeProposals(AGENT_IDS.map((id) => fallbackProposal(id, "2026-11-12")), influence({}));
    const { allocations, spent, reserve } = allocateCredits(10_007, shares);
    expect(spent).toBe(Math.floor(10_007 * RULES.spendRatio));
    expect(spent + reserve).toBe(10_007);
    expect(allocations.reduce((s, a) => s + a.credits, 0)).toBe(spent);
    expect(allocations.every((a) => Number.isInteger(a.credits) && a.units >= 0)).toBe(true);
    expect(allocateCredits(0, shares)).toEqual({ allocations: [], spent: 0, reserve: 0 });
  });

  it("adds the endowment grant once per day, on the ledger, before the council spends", async () => {
    const { MemoryStore } = await import("../server/store/memory");
    const { runCouncil, setLlm } = await import("../server/council");
    setLlm(null);
    const store = new MemoryStore();
    await store.ensureGenesis(0);
    const day = "2026-11-20";
    expect(await store.grant(day, RULES.dailyGrant)).not.toBeNull();
    expect(await store.grant(day, RULES.dailyGrant)).toBeNull();
    expect((await store.getTreasury()).balance).toBe(RULES.dailyGrant);

    // A session on a day already granted does not add a second grant.
    const r = await runCouncil(store, day);
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.session.pool).toBe(RULES.dailyGrant);
    expect(r.session.spent).toBe(Math.floor(RULES.dailyGrant * RULES.spendRatio));

    // The next day's session brings its own grant even with no donations.
    const next = await runCouncil(store, "2026-11-21");
    expect(next.status === "created" && next.session.pool).toBe(RULES.dailyGrant - r.session.spent + RULES.dailyGrant);

    const chain = await store.listLedger(50);
    expect(chain.filter((e) => e.type === "grant")).toHaveLength(2);
    expect(await verifyEntries(chain)).toMatchObject({ ok: true });
  });

  it("schedules sessions at local midnight in Kolkata", () => {
    const now = new Date("2026-11-12T10:00:00Z"); // 15:30 IST
    expect(dayKey(now, "Asia/Kolkata")).toBe("2026-11-12");
    expect(nextSessionAt(now, "Asia/Kolkata").toISOString()).toBe("2026-11-12T18:30:00.000Z");
    const justAfterMidnight = new Date("2026-11-12T18:35:00Z"); // 00:05 IST on the 13th
    expect(sessionDay(justAfterMidnight, "Asia/Kolkata")).toBe("2026-11-12");
  });
});
