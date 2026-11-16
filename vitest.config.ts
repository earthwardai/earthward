import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      STORE: "memory",
      COUNCIL_LLM: "off",
      APP_SECRET: "test-secret",
      ADMIN_KEY: "test-admin-key",
      ADMIN_IPS: "203.0.113.7",
      TRUSTED_PROXY_HOPS: "1",
      COUNCIL_TZ: "Asia/Kolkata",
    },
  },
});
