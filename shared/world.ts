import type { Agent } from "./agents";
import type { Cause } from "./causes";

/**
 * The agents and causes a council runs with. Outside any world, that is Earthward's own five agents
 * and thirteen causes. The server runs group councils (server/teams.ts) inside their own world, and
 * because the active world follows the async call chain, several councils can deliberate at once.
 */
export interface World {
  agents: Agent[];
  causes: Cause[];
  agentIds: string[];
  causeIds: string[];
}

let source: () => World | undefined = () => undefined;

/** The server points this at an AsyncLocalStorage. The browser never sets it. */
export function setWorldSource(fn: () => World | undefined) {
  source = fn;
}

export const activeWorld = () => source();

/** An array that reads from the active world, or from `base` outside one. */
export function worldScoped<T>(base: T[], pick: (w: World) => unknown[]): T[] {
  const active = (): T[] => {
    const w = source();
    return w ? (pick(w) as T[]) : base;
  };
  return new Proxy(base, {
    get(_t, prop) {
      const arr = active();
      const v = Reflect.get(arr, prop, arr);
      return typeof v === "function" ? v.bind(arr) : v;
    },
    set: (_t, prop, value) => Reflect.set(active(), prop, value),
    has: (_t, prop) => Reflect.has(active(), prop),
    ownKeys: () => Reflect.ownKeys(active()),
    getOwnPropertyDescriptor: (_t, prop) => Reflect.getOwnPropertyDescriptor(active(), prop),
  });
}
