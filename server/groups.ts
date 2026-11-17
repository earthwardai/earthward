import { createHash, randomBytes } from "node:crypto";
import { Hono, type Context as HonoContext } from "hono";
import { z } from "zod";
import { dayKey, influence } from "../shared/council";
import { parseSpec, type CouncilSpec } from "../shared/spec";
import { templateById } from "../shared/templates";
import type { GroupCouncil, GroupPledge, GroupSession } from "../shared/types";
import { config } from "./config";
import { deliberate, type Context } from "./council";
import { getCookie } from "hono/cookie";
import { ACCOUNT_COOKIE, currentAccount, readSession } from "./accounts";
import { cleanText, clientIp, dailyCaps, hashId, hashIp, limiters, safeEqual, stripLinks } from "./security";
import type { GroupRecord, Store } from "./store/types";
import { inWorld, worldOf } from "./world";

/**
 * Group councils: a class, team or neighbourhood sets up its own council from a template, shares
 * the link, members back agents with notes, and whoever created it convenes the council. The same
 * engine and rules as the nightly council, run inside the group's own world (server/world.ts).
 */

/** Minimum time between two sessions of one group council. */
export const CONVENE_GAP_MS = 10 * 60_000;
const ownerHash = (token: string) => createHash("sha256").update(`group-owner:${token}`).digest("hex");
const newId = () => randomBytes(8).toString("base64url").replace(/[-_]/g, "").slice(0, 10).toLowerCase();

const CreateSchema = z.object({
  name: z.string().trim().min(3).max(60),
  template: z.string().max(24),
  budget: z.number().int().min(100).max(100_000).default(1000),
  spec: z.unknown().optional(),
});
const PledgeSchema = z.object({
  agentId: z.string().max(24),
  name: z.string().max(40).optional(),
  message: z.string().max(200).optional(),
});

const text = (s: string, max: number) => stripLinks(cleanText(s, max)) ?? "";

/** Cleans every free-text field of a custom spec, since it is shown to visitors and sent to the model. */
function cleanSpec(spec: CouncilSpec): CouncilSpec {
  return {
    name: spec.name ? text(spec.name, 80) : undefined,
    agents: spec.agents.map((a) => ({ ...a, name: text(a.name, 40), mandate: text(a.mandate, 120), temperament: text(a.temperament, 160), voice: text(a.voice, 400) })),
    causes: spec.causes.map((c) => ({ ...c, name: text(c.name, 60), place: text(c.place, 60), unit: text(c.unit, 60) || "units", summary: text(c.summary, 300) })),
  };
}

export function publicGroup(g: GroupRecord): GroupCouncil {
  const { ownerHash: _o, pledgeVids: _v, ipHash: _i, ownerAccountId: _a, ...rest } = g;
  return rest;
}

/** Runs one session of a group council. Pure apart from the model calls; saving is the caller's job. */
export async function conveneGroup(group: GroupCouncil, now = new Date()): Promise<GroupSession> {
  return inWorld(worldOf(group.spec), async () => {
    const endorsements: Record<string, number> = {};
    for (const p of group.pledges) endorsements[p.agentId] = (endorsements[p.agentId] ?? 0) + 1;
    const n = (group.sessions.at(-1)?.n ?? 0) + 1;
    const ctx: Context = {
      day: dayKey(now, config.timeZone),
      pool: group.budget,
      donations: group.pledges.length,
      credits: 0,
      endorsements,
      messages: group.pledges
        .filter((p) => p.message)
        .slice(-12)
        .map((p) => ({ name: p.name, message: p.message! })),
      previous: group.sessions.at(-1)?.allocations ?? null,
      team: { name: group.name, session: n },
    };
    const weights = influence(endorsements);
    const r = await deliberate(ctx, weights, { seed: `${group.id}:${n}`, spendRatio: 1, parallel: true });
    return { n, at: now.toISOString(), budget: group.budget, backers: group.pledges.length, influence: weights, ...r };
  });
}

export function groupsApi(store: Store) {
  const api = new Hono();
  const ipHashOf = (c: HonoContext) => hashIp(clientIp(c));

  api.post("/", async (c) => {
    const ipHash = ipHashOf(c);
    if (!limiters.groupCreate.take(ipHash)) return c.json({ error: "You've set up a few councils already. Try again in an hour." }, 429);
    const parsed = CreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Give the council a name (3 to 60 characters) and pick a template." }, 400);
    const name = text(parsed.data.name, 60);
    if (name.length < 3) return c.json({ error: "Give the council a name of at least 3 characters." }, 400);

    let spec: CouncilSpec;
    if (parsed.data.template === "custom") {
      try {
        spec = cleanSpec(parseSpec(parsed.data.spec));
      } catch (err) {
        return c.json({ error: (err as Error).message.slice(0, 600) }, 400);
      }
      if (spec.causes.length > 20) return c.json({ error: "A group council can have at most 20 causes." }, 400);
    } else {
      const t = templateById(parsed.data.template);
      if (!t) return c.json({ error: "Pick one of the templates." }, 400);
      spec = t.spec;
    }
    if (!dailyCaps.groups.take()) return c.json({ error: "We've set up all the councils we can today. Try again tomorrow." }, 503);

    const ownerToken = randomBytes(24).toString("base64url");
    const account = await currentAccount(c, store);
    const group: GroupRecord = {
      id: newId(),
      name,
      template: parsed.data.template,
      budget: parsed.data.budget,
      spec,
      createdAt: new Date().toISOString(),
      pledges: [],
      sessions: [],
      lastConvenedAt: null,
      ownerHash: ownerHash(ownerToken),
      ownerAccountId: account?.id ?? null,
      pledgeVids: [],
      ipHash,
    };
    await store.createGroup(group);
    return c.json({ id: group.id, ownerToken, url: `${config.siteUrl}/c/${group.id}` }, 201);
  });

  /** The owner link from the browser, or the signed-in account the council belongs to. */
  const isOwner = async (c: HonoContext, g: GroupRecord) => {
    const token = c.req.header("x-ew-owner");
    if (token && token.length <= 64 && safeEqual(ownerHash(token), g.ownerHash)) return true;
    if (!g.ownerAccountId) return false;
    return readSession(getCookie(c, ACCOUNT_COOKIE)) === g.ownerAccountId;
  };

  api.get("/:id", async (c) => {
    const g = await store.getGroup(c.req.param("id").slice(0, 16));
    if (!g) return c.json({ error: "There's no council at this link." }, 404);
    const vid = cleanText(c.req.header("x-ew-vid"), 64);
    return c.json({ group: publicGroup(g), owner: await isOwner(c, g), backed: Boolean(vid && g.pledgeVids.includes(hashId(`${g.id}:${vid}`))) });
  });

  api.post("/:id/pledge", async (c) => {
    if (!limiters.groupPledge.take(ipHashOf(c))) return c.json({ error: "Too many from your network. Try again later." }, 429);
    const vid = cleanText(c.req.header("x-ew-vid"), 64);
    if (!vid || vid.length < 8) return c.json({ error: "Your browser blocked the storage this needs. Try another browser." }, 400);
    const parsed = PledgeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Pick an agent to back." }, 400);
    const g = await store.getGroup(c.req.param("id").slice(0, 16));
    if (!g) return c.json({ error: "There's no council at this link." }, 404);
    if (!g.spec.agents.some((a) => a.id === parsed.data.agentId)) return c.json({ error: "Pick one of this council's agents." }, 400);
    if (!dailyCaps.groupPledges.take()) return c.json({ error: "Backing is full for today. Try again tomorrow." }, 503);
    const pledge: GroupPledge = {
      id: randomBytes(6).toString("base64url"),
      name: parsed.data.name ? stripLinks(cleanText(parsed.data.name, 40)) : null,
      agentId: parsed.data.agentId,
      message: parsed.data.message ? stripLinks(cleanText(parsed.data.message, 200)) : null,
      at: new Date().toISOString(),
    };
    const r = await store.addGroupPledge(g.id, pledge, hashId(`${g.id}:${vid}`));
    if (r === "duplicate") return c.json({ error: "You've already backed an agent for the next session." }, 409);
    if (r === "full") return c.json({ error: "This session already has as many backers as it can take." }, 409);
    if (r === "missing") return c.json({ error: "There's no council at this link." }, 404);
    return c.json({ ok: true }, 201);
  });

  api.post("/:id/convene", async (c) => {
    if (!limiters.groupConvene.take(ipHashOf(c))) return c.json({ error: "Too many sessions from your network. Try again later." }, 429);
    const g = await store.getGroup(c.req.param("id").slice(0, 16));
    if (!g) return c.json({ error: "There's no council at this link." }, 404);
    if (!(await isOwner(c, g))) return c.json({ error: "Only the person who set up this council can convene it." }, 403);
    const since = g.lastConvenedAt ? Date.now() - Date.parse(g.lastConvenedAt) : Infinity;
    if (since < CONVENE_GAP_MS) return c.json({ error: `The council met a few minutes ago. It can meet again in ${Math.ceil((CONVENE_GAP_MS - since) / 60_000)} minutes.` }, 429);
    if (!dailyCaps.groupConvenes.take()) return c.json({ error: "The councils have met as often as they can today. Try again tomorrow." }, 503);
    const session = await conveneGroup(publicGroup(g));
    const saved = await store.saveGroupSession(g.id, session, g.sessions.at(-1)?.n ?? 0);
    if (!saved) return c.json({ error: "The council was convened twice at once. Reload to see the session." }, 409);
    return c.json({ session }, 201);
  });

  return api;
}
