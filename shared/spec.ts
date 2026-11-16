import { z } from "zod";
import { AGENTS, AGENT_IDS, type Agent, type AgentId } from "./agents";
import { CAUSES, CAUSE_IDS, type Cause, type CauseId } from "./causes";

/**
 * Bring your own council: a JSON file that replaces the five agents and thirteen causes, so the
 * same engine can run a council for a city, a school or a club. Used by `npm run council -- --config`
 * and by the server when COUNCIL_CONFIG is set. The web app's copy stays Earthward-specific.
 */
const slug = z.string().regex(/^[a-z][a-z0-9-]{1,23}$/, "ids are 2 to 24 lowercase letters, digits or dashes");

export const CouncilSpecSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    agents: z
      .array(
        z.object({
          id: slug,
          name: z.string().min(1).max(40),
          mandate: z.string().min(3).max(120),
          temperament: z.string().max(160).default(""),
          voice: z.string().max(400).default(""),
          leanings: z.record(z.string(), z.number().min(0).max(10)).default({}),
        }),
      )
      .min(2)
      .max(8),
    causes: z
      .array(
        z.object({
          id: slug,
          name: z.string().min(1).max(60),
          domain: slug,
          place: z.string().max(60).default(""),
          location: z.tuple([z.number(), z.number()]).default([0, 0]),
          creditsPerUnit: z.number().positive(),
          unit: z.string().min(1).max(60),
          summary: z.string().max(300).default(""),
        }),
      )
      .min(2)
      .max(40),
  })
  .superRefine((spec, ctx) => {
    const agentIds = new Set(spec.agents.map((a) => a.id));
    const causeIds = new Set(spec.causes.map((c) => c.id));
    if (agentIds.size !== spec.agents.length) ctx.addIssue({ code: "custom", message: "agent ids must be unique" });
    if (causeIds.size !== spec.causes.length) ctx.addIssue({ code: "custom", message: "cause ids must be unique" });
    for (const c of spec.causes) if (!agentIds.has(c.domain)) ctx.addIssue({ code: "custom", message: `cause "${c.id}" has domain "${c.domain}", which is not an agent id` });
    for (const a of spec.agents) for (const k of Object.keys(a.leanings)) if (!causeIds.has(k)) ctx.addIssue({ code: "custom", message: `agent "${a.id}" leans toward "${k}", which is not a cause id` });
  });

export type CouncilSpec = z.infer<typeof CouncilSpecSchema>;

/** Parses and checks a council file, with readable errors. */
export function parseSpec(json: unknown): CouncilSpec {
  const r = CouncilSpecSchema.safeParse(json);
  if (!r.success) throw new Error(`Invalid council config:\n${r.error.issues.map((i) => `- ${i.path.join(".") || "config"}: ${i.message}`).join("\n")}`);
  return r.data;
}

const DEFAULTS = { agents: [...AGENTS], causes: [...CAUSES] };

/**
 * Swaps the active agents and causes in place, so every module that imported AGENTS or CAUSES
 * sees the new council. Server and CLI only; call before running a session.
 */
export function configureCouncil(spec: CouncilSpec) {
  AGENTS.splice(0, AGENTS.length, ...(spec.agents as unknown as Agent[]));
  AGENT_IDS.splice(0, AGENT_IDS.length, ...(spec.agents.map((a) => a.id) as AgentId[]));
  CAUSES.splice(0, CAUSES.length, ...(spec.causes as unknown as Cause[]));
  CAUSE_IDS.splice(0, CAUSE_IDS.length, ...(spec.causes.map((c) => c.id) as CauseId[]));
}

/** Restores the Earthward council (used by tests). */
export function resetCouncil() {
  configureCouncil({ agents: DEFAULTS.agents, causes: DEFAULTS.causes } as unknown as CouncilSpec);
}
