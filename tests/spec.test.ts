import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { AGENTS, AGENT_IDS } from "../shared/agents";
import { CAUSES, causeById } from "../shared/causes";
import { allocateCredits, fallbackProposal, influence, mergeProposals } from "../shared/council";
import { configureCouncil, parseSpec, resetCouncil } from "../shared/spec";

afterAll(() => resetCouncil());

describe("bring your own council", () => {
  it("rejects configs that don't hang together", () => {
    expect(() => parseSpec({ agents: [], causes: [] })).toThrow(/Invalid council config/);
    const bad = JSON.parse(readFileSync(new URL("../examples/bengaluru.json", import.meta.url), "utf8"));
    bad.causes[0].domain = "nobody";
    expect(() => parseSpec(bad)).toThrow(/not an agent id/);
  });

  it("runs the example council end to end with the shared rules", () => {
    const spec = parseSpec(JSON.parse(readFileSync(new URL("../examples/bengaluru.json", import.meta.url), "utf8")));
    configureCouncil(spec);
    expect(AGENTS.map((a) => a.id)).toEqual(["lakes", "canopy", "commons", "transit", "futures"]);
    expect(AGENT_IDS).toHaveLength(5);
    expect(causeById("street-trees")?.name).toBe("Street trees");

    const proposals = AGENT_IDS.map((id) => fallbackProposal(id, "2026-11-20"));
    const shares = mergeProposals(proposals, influence({ canopy: 2 } as Record<string, number>));
    const { allocations, spent, reserve } = allocateCredits(1000, shares);
    expect(spent + reserve).toBe(1000);
    expect(allocations.every((a) => CAUSES.some((c) => c.id === a.causeId))).toBe(true);
    expect(Math.max(...allocations.map((a) => a.share))).toBeLessThanOrEqual(0.3 + 1e-9);

    resetCouncil();
    expect(AGENTS.map((a) => a.id)).toContain("verdant");
    expect(causeById("reforest")).toBeDefined();
  });
});
