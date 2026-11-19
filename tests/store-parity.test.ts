import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Firestore store maps stats fields by hand, which once dropped newly added counters.
// Every optional counter on DayStats must be passed through by getStats.
describe("Firestore store", () => {
  it("passes every DayStats counter through getStats", () => {
    const types = readFileSync(new URL("../server/store/types.ts", import.meta.url), "utf8");
    const block = types.slice(types.indexOf("export interface DayStats"), types.indexOf("export interface StatsIncrement"));
    const fields = [...block.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    const getStats = readFileSync(new URL("../server/store/firestore.ts", import.meta.url), "utf8");
    const start = getStats.indexOf("async getStats");
    const end = getStats.indexOf("\n  async ", start + 1);
    const body = getStats.slice(start, end > 0 ? end : undefined);
    expect(body.length).toBeGreaterThan(100);
    // "day" comes from the requested key rather than the document.
    for (const f of fields.filter((x) => x !== "day")) expect(body, `getStats should return ${f}`).toContain(`d.${f}`);
  });
});

describe("Firestore stats writes", () => {
  it("never sends an empty map, which merge would treat as 'replace with nothing'", async () => {
    const { statsPatch } = await import("../server/store/firestore");
    const clicksOnly = statsPatch({ views: 0, clicks: 2, paths: {}, targets: { donate: 2 }, country: null, referrers: {}, campaigns: {}, human: true });
    expect(Object.keys(clicksOnly)).not.toContain("paths");
    expect(Object.keys(clicksOnly)).not.toContain("referrers");
    expect(Object.keys(clicksOnly)).not.toContain("campaigns");
    expect(Object.keys(clicksOnly)).toContain("targets");
    const view = statsPatch({ views: 1, clicks: 0, paths: { "/council/2026-11-18": 1 }, targets: {}, country: "IN", referrers: { "bsky.app": 1 }, campaigns: {}, human: false });
    expect(Object.keys(view["paths"] as object)).toEqual(["_council_2026-11-18"]);
    expect(Object.keys(view)).not.toContain("targets");
    expect(Object.keys(view)).not.toContain("humanViews");
  });
});
