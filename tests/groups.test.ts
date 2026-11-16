import { describe, expect, it } from "vitest";
import { AGENTS, AGENT_IDS } from "../shared/agents";
import { CAUSES } from "../shared/causes";
import { templateById } from "../shared/templates";
import { createApp } from "../server/app";
import { setLlm } from "../server/council";
import { conveneGroup } from "../server/groups";
import type { Llm } from "../server/llm";
import { MemoryStore } from "../server/store/memory";
import type { GroupCouncil } from "../shared/types";

const group = (id: string, template: string): GroupCouncil => ({
  id,
  name: `${template} test`,
  template,
  budget: 1000,
  spec: templateById(template)!.spec,
  createdAt: "2026-11-16T00:00:00Z",
  pledges: [],
  sessions: [],
  lastConvenedAt: null,
});

describe("group councils", () => {
  it("keeps concurrent councils in their own worlds", async () => {
    // A slow fake model that proposes the first cause it is offered, after yielding to other work.
    const seen: string[] = [];
    const slow: Llm = {
      provider: "openai",
      model: "fake",
      async generateJson<T>(_system: string, prompt: string, schema: object) {
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        const first = prompt.match(/^- ([a-z-]+):/m)?.[1] ?? "";
        seen.push(first);
        if ("properties" in schema && "title" in (schema as { properties: object }).properties) return { title: "Done", minutes: "Minutes." } as T;
        return { allocations: [{ causeId: first, percent: 60 }, { causeId: prompt.match(/^- ([a-z-]+):/gm)![1].slice(2, -1), percent: 40 }], reasoning: "r", quote: "q" } as T;
      },
    };
    setLlm(slow);
    try {
      const [school, work] = await Promise.all([conveneGroup(group("a", "classroom")), conveneGroup(group("b", "workplace"))]);
      const schoolCauses = new Set(templateById("classroom")!.spec.causes.map((c) => c.id));
      const workCauses = new Set(templateById("workplace")!.spec.causes.map((c) => c.id));
      expect(school.proposals.map((p) => p.agentId)).toEqual(["page", "kindly", "sprout", "bridge", "spark"]);
      expect(work.proposals.map((p) => p.agentId)).toEqual(["neighbour", "atlas", "canopy", "ladder", "shelter"]);
      expect(school.allocations.every((a) => schoolCauses.has(a.causeId))).toBe(true);
      expect(work.allocations.every((a) => workCauses.has(a.causeId))).toBe(true);
      expect(school.proposals.every((p) => p.source === "model")).toBe(true);
      // Group councils spend the whole budget, up to what the per-cause cap allows.
      expect(school.spent + school.reserve).toBe(1000);
      expect(seen).toContain("library");
      expect(seen).toContain("foodbank");
    } finally {
      setLlm(null);
    }
    // Outside a group council, the Earthward council is untouched.
    expect(AGENT_IDS).toEqual(["verdant", "tide", "kindred", "hearth", "horizon"]);
    expect(CAUSES).toHaveLength(13);
    expect(AGENTS[0].name).toBe("Verdant");
  });

  it("creates, takes backing once per visitor, and lets only the owner convene", async () => {
    const app = createApp(new MemoryStore());
    const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

    expect((await post("/api/groups", { name: "Class 7B", template: "nope" })).status).toBe(400);
    const made = await post("/api/groups", { name: "Class 7B", template: "classroom", budget: 2000 });
    expect(made.status).toBe(201);
    const { id, ownerToken } = (await made.json()) as { id: string; ownerToken: string };

    const vid = { "x-ew-vid": "visitor-0001" };
    expect((await post(`/api/groups/${id}/pledge`, { agentId: "verdant" }, vid)).status).toBe(400);
    expect((await post(`/api/groups/${id}/pledge`, { agentId: "sprout", name: "Asha", message: "We need shade by the playground" }, vid)).status).toBe(201);
    expect((await post(`/api/groups/${id}/pledge`, { agentId: "page" }, vid)).status).toBe(409);

    const view = (await (await app.request(`/api/groups/${id}`, { headers: vid })).json()) as { group: GroupCouncil & { ownerHash?: string }; owner: boolean; backed: boolean };
    expect(view.owner).toBe(false);
    expect(view.backed).toBe(true);
    expect(view.group.ownerHash).toBeUndefined();
    expect(view.group.pledges).toHaveLength(1);

    expect((await post(`/api/groups/${id}/convene`, {})).status).toBe(403);
    const met = await post(`/api/groups/${id}/convene`, {}, { "x-ew-owner": ownerToken });
    expect(met.status).toBe(201);
    const { session } = (await met.json()) as { session: { n: number; spent: number; backers: number } };
    expect(session.n).toBe(1);
    expect(session.backers).toBe(1);
    expect(session.spent).toBeGreaterThan(0);
    // Too soon for another session.
    expect((await post(`/api/groups/${id}/convene`, {}, { "x-ew-owner": ownerToken })).status).toBe(429);
    const after = (await (await app.request(`/api/groups/${id}`)).json()) as { group: GroupCouncil };
    expect(after.group.pledges).toHaveLength(0);
    expect(after.group.sessions).toHaveLength(1);

    const custom = await post("/api/groups", { name: "Custom", template: "custom", spec: { agents: [], causes: [] } });
    expect(custom.status).toBe(400);
    expect(((await custom.json()) as { error: string }).error).toMatch(/Invalid council config/);
  });
});
