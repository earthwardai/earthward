import { serve } from "@hono/node-server";
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

const app = createApp(store);
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`earthward listening on :${info.port} (store=${config.store}, model=${config.model})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
