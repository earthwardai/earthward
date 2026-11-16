import { serve } from "@hono/node-server";
import { RULES, dayKey } from "../shared/council";
import { createApp } from "./app";
import { assertProductionConfig, config } from "./config";
import { initGeo } from "./geo";
import { FirestoreStore } from "./store/firestore";
import { MemoryStore } from "./store/memory";
import type { Store } from "./store/types";

assertProductionConfig();
await initGeo();

const store: Store =
  config.store === "firestore" ? new FirestoreStore(config.project, config.limits.analyticsRetentionDays) : new MemoryStore();
await store.ensureGenesis(config.genesisCredits);
// Today's endowment grant is normally added when the council meets; doing it at boot too means the
// treasury shows the day's budget straight away. It is idempotent, so restarts never add it twice.
await store.grant(dayKey(new Date(), config.timeZone), RULES.dailyGrant).catch((err) => console.error("grant failed", err));

const app = createApp(store);
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`earthward listening on :${info.port} (store=${config.store}, llm=${config.llm}${config.model ? `:${config.model}` : ""})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
