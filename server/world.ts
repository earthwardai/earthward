import { AsyncLocalStorage } from "node:async_hooks";
import type { Agent } from "../shared/agents";
import type { Cause } from "../shared/causes";
import type { CouncilSpec } from "../shared/spec";
import { setWorldSource, type World } from "../shared/world";

const current = new AsyncLocalStorage<World>();
setWorldSource(() => current.getStore());

export function worldOf(spec: CouncilSpec): World {
  return {
    agents: spec.agents as unknown as Agent[],
    causes: spec.causes as unknown as Cause[],
    agentIds: spec.agents.map((a) => a.id),
    causeIds: spec.causes.map((c) => c.id),
  };
}

/** Runs `fn` with this council's agents and causes in AGENTS and CAUSES, including across awaits. */
export const inWorld = <T>(world: World, fn: () => Promise<T>): Promise<T> => current.run(world, fn);
