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
