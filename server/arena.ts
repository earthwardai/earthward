import { AGENTS } from "../shared/agents";
import { allocateCredits, fallbackProposal, mergeProposals, shareSimilarity } from "../shared/council";
import type { ArenaEntry, ArenaResult, Session } from "../shared/types";
import { config } from "./config";
import { getLlm, propose, type Context } from "./council";
import { openAiCompatible, vertex, type Llm } from "./llm";
import type { Store } from "./store/types";

/**
 * The model arena: after each night, the same briefing goes to other models (and to no model at
 * all), and their splits are published next to the official one. It never touches the ledger.
 */

export function arenaModels(): { label: string; llm: Llm | null }[] {
  const models = config.arenaModels.map((m) => {
    if (m.startsWith("openai:")) {
      const model = m.slice("openai:".length);
      return { label: model, llm: openAiCompatible({ baseUrl: config.openaiBaseUrl, apiKey: config.openaiApiKey, model }) };
    }
    return { label: m, llm: config.project ? vertex(m) : null };
  });
  return [...models.filter((m) => m.llm), { label: "No model (standing preferences)", llm: null }];
}

async function contextFor(store: Store, session: Session): Promise<Context> {
  const [summary, messages, recent] = await Promise.all([store.getDaySummary(session.day), store.dayMessages(session.day, 12), store.listSessions(10)]);
  const previous = recent.find((s) => s.day < session.day);
  return {
    day: session.day,
    pool: session.pool,
    donations: summary.donations,
    credits: summary.credits,
    endorsements: summary.endorsements,
    messages,
    previous: previous?.allocations ?? null,
  };
}

export async function runArena(store: Store, session: Session, force = false, models = arenaModels()): Promise<ArenaResult | null> {
  if (!force && (await store.getArena(session.day))) return store.getArena(session.day);
  const ctx = await contextFor(store, session);
  const official: Record<string, number> = Object.fromEntries(session.allocations.map((a) => [a.causeId, a.share]));
  const entries: ArenaEntry[] = [];

  for (const { label, llm } of models) {
    let fallbacks = 0;
    const proposals = [];
    for (const agent of AGENTS) {
      if (!llm) {
        proposals.push(fallbackProposal(agent.id, session.day));
        continue;
      }
      try {
        proposals.push(await propose(agent, ctx, llm));
      } catch {
        fallbacks += 1;
        proposals.push(fallbackProposal(agent.id, session.day));
      }
    }
    // A model that failed for every agent says nothing about the model, so it is left out.
    if (llm && fallbacks === AGENTS.length) continue;
    const { allocations } = allocateCredits(session.pool, mergeProposals(proposals, session.influence));
    entries.push({
      label,
      model: llm?.model ?? "none",
      allocations: allocations.map((a) => ({ causeId: a.causeId, share: a.share, credits: a.credits })),
      quotes: proposals.filter((p) => p.source === "model").map((p) => ({ agentId: p.agentId, quote: p.quote })),
      agreement: Math.round(shareSimilarity(Object.fromEntries(allocations.map((a) => [a.causeId, a.share])), official) * 1000) / 1000,
      fallbacks,
    });
  }

  const result: ArenaResult = { day: session.day, at: new Date().toISOString(), official: session.model === "fallback" ? "none" : (getLlm()?.model ?? session.model), entries };
  await store.saveArena(result);
  return result;
}
