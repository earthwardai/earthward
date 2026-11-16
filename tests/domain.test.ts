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

  it("caps daily writes per instance and resets the next day", async () => {
    const { DailyCap } = await import("../server/security");
    const cap = new DailyCap(2);
    const d1 = new Date("2026-11-20T10:00:00Z");
    expect([cap.take(d1), cap.take(d1), cap.take(d1)]).toEqual([true, true, false]);
    expect(cap.take(new Date("2026-11-21T00:00:01Z"))).toBe(true);
  });

  it("schedules sessions at local midnight in Kolkata", () => {
    const now = new Date("2026-11-12T10:00:00Z"); // 15:30 IST
    expect(dayKey(now, "Asia/Kolkata")).toBe("2026-11-12");
    expect(nextSessionAt(now, "Asia/Kolkata").toISOString()).toBe("2026-11-12T18:30:00.000Z");
    const justAfterMidnight = new Date("2026-11-12T18:35:00Z"); // 00:05 IST on the 13th
    expect(sessionDay(justAfterMidnight, "Asia/Kolkata")).toBe("2026-11-12");
  });
});

describe("agent standing", () => {
  it("stays neutral with little history and never moves a weight more than the cap", async () => {
    const { computeStanding } = await import("../server/reputation");
    const session = (day: string) =>
      ({
        day,
        endorsements: { tide: 3 },
        proposals: AGENT_IDS.map((id) => fallbackProposal(id, day)),
        allocations: [{ causeId: "water", credits: 10, share: 0.3, units: 1 }],
      }) as unknown as import("../shared/types").Session;
    const two = computeStanding([session("2026-11-01"), session("2026-11-02")], [{ total: 10, counts: { tide: 10 } }]);
    for (const id of AGENT_IDS) expect(two.agents[id].multiplier).toBe(1);

    const many = computeStanding(
      ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"].map(session),
      [{ total: 100, counts: { tide: 100 } }],
    );
    expect(many.agents.tide.multiplier).toBeCloseTo(1 + RULES.standingMax);
    for (const id of AGENT_IDS) {
      expect(many.agents[id].multiplier).toBeLessThanOrEqual(1 + RULES.standingMax + 1e-9);
      expect(many.agents[id].multiplier).toBeGreaterThanOrEqual(1 - RULES.standingMax - 1e-9);
    }

    const w = influence({}, { tide: 1.1, verdant: 0.9 });
    expect(w.tide).toBeGreaterThan(w.kindred);
    expect(w.verdant).toBeLessThan(w.kindred);
    const extreme = influence({}, { tide: 5 });
    expect(extreme.tide / extreme.kindred).toBeCloseTo(1 + RULES.standingMax);
  });
});

describe("nightly auto-post", () => {
  it("skips networks that aren't configured and posts to Mastodon when it is", async () => {
    const { announceSession, postText } = await import("../server/autopost");
    const session = {
      day: "2026-11-20",
      title: "Clean water leads the night",
      spent: 501,
      allocations: [
        { causeId: "water", credits: 100, share: 0.2, units: 8 },
        { causeId: "mangroves", credits: 80, share: 0.16, units: 100 },
      ],
    } as unknown as import("../shared/types").Session;
    expect([...postText(session)].length).toBeLessThanOrEqual(280);
    expect(postText(session)).toContain("/council/2026-11-20");

    const calls: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-token");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    process.env.MASTODON_URL = "https://mastodon.example";
    process.env.MASTODON_TOKEN = "test-token";
    const r = await announceSession(session, fake);
    delete process.env.MASTODON_URL;
    delete process.env.MASTODON_TOKEN;
    expect(r).toEqual({ bluesky: "skipped", mastodon: "posted" });
    expect(calls).toEqual(["POST https://mastodon.example/api/v1/statuses"]);
  });
});

describe("model arena", () => {
  it("runs the same night through other models without touching the ledger", async () => {
    const { MemoryStore } = await import("../server/store/memory");
    const { runCouncil, setLlm } = await import("../server/council");
    const { runArena } = await import("../server/arena");
    const store = new MemoryStore();
    await store.ensureGenesis(10_000);
    setLlm(null);
    const r = await runCouncil(store, "2026-11-20");
    if (r.status !== "created") throw new Error(r.status);
    const before = (await store.getTreasury()).balance;

    const echo = { provider: "openai" as const, model: "echo-1", generateJson: async <T,>() => ({ allocations: [{ causeId: "seeds", percent: 100 }], reasoning: "Seeds.", quote: "Seeds first." }) as T };
    const broken = { provider: "openai" as const, model: "broken-1", generateJson: async <T,>(): Promise<T> => { throw new Error("down"); } };
    const arena = await runArena(store, r.session, true, [{ label: "echo-1", llm: echo }, { label: "broken-1", llm: broken }, { label: "No model", llm: null }]);

    expect(arena!.entries.map((e) => e.label)).toEqual(["echo-1", "No model"]);
    expect(arena!.entries[0].quotes[0].quote).toBe("Seeds first.");
    expect(arena!.entries[0].agreement).toBeLessThan(arena!.entries[1].agreement);
    expect(arena!.entries[1].agreement).toBeCloseTo(1, 2);
    expect((await store.getTreasury()).balance).toBe(before);
    expect((await store.getArena("2026-11-20"))?.entries).toHaveLength(2);
  });
});
