const env = process.env;

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  port: Number(env.PORT ?? 8080),
  production: env.NODE_ENV === "production",
  version: env.APP_VERSION ?? "dev",
  project: env.GOOGLE_CLOUD_PROJECT ?? "",
  store: (env.STORE ?? (env.GOOGLE_CLOUD_PROJECT ? "firestore" : "memory")) as "memory" | "firestore",
  staticDir: env.STATIC_DIR ?? "dist/web",
  geoipDb: env.GEOIP_DB ?? "data/dbip-country-lite.mmdb",

  timeZone: env.COUNCIL_TZ ?? "Asia/Kolkata",
  /**
   * Which model the agents use: "vertex" (Gemini on Vertex AI), "openai" (any OpenAI-compatible API,
   * including Ollama and OpenRouter) or "off" (standing preferences only). Picked automatically when unset.
   */
  llm: (env.COUNCIL_LLM ?? (env.GOOGLE_CLOUD_PROJECT ? "vertex" : env.OPENAI_BASE_URL || env.OPENAI_API_KEY ? "openai" : "off")) as
    | "vertex"
    | "openai"
    | "off",
  model: env.COUNCIL_MODEL ?? (env.GOOGLE_CLOUD_PROJECT ? "gemini-3.5-flash" : ""),
  vertexLocation: env.VERTEX_LOCATION ?? "global",
  openaiBaseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  openaiApiKey: env.OPENAI_API_KEY ?? "",
  /**
   * Extra models for the nightly arena, comma separated. Gemini names run on Vertex AI; "openai:<model>"
   * uses OPENAI_BASE_URL and OPENAI_API_KEY. Set to "" to turn the arena off.
   */
  /** Web push. The private key comes from Secret Manager; without both, push is off. */
  vapidPublicKey: env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: env.VAPID_PRIVATE_KEY ?? "",
  /** The weekly digest's SMTP account. Without SMTP_PASS, the digest is off and its sign-up is hidden. */
  smtp: {
    host: env.SMTP_HOST ?? "smtp.titan.email",
    port: Number(env.SMTP_PORT ?? 465),
    user: env.SMTP_USER ?? "",
    pass: env.SMTP_PASS ?? "",
    from: env.DIGEST_FROM ?? "Earthward AI <ved@earthwardai.com>",
  },
  arenaModels: list(env.ARENA_MODELS ?? (env.GOOGLE_CLOUD_PROJECT ? "gemini-3.5-flash-lite" : "")),
  genesisCredits: Number(env.GENESIS_CREDITS ?? 10000),
  /** Public site address, used for the sitemap and share links. */
  siteUrl: (env.SITE_URL ?? "https://earthwardai.com").replace(/\/$/, ""),
  /** Optional "buy us a coffee" link. The support section stays hidden until it is set. */
  /** Public IndexNow key (served at /<key>.txt). Lets new pages reach Bing and others immediately. */
  indexNowKey: /^[a-f0-9]{32}$/.test(env.INDEXNOW_KEY ?? "") ? (env.INDEXNOW_KEY as string) : "",
  /** Official profiles (X, LinkedIn, GitHub...), comma separated; added to structured data as sameAs. */
  sameAs: list(env.SAME_AS).filter((u) => /^https:\/\//.test(u)),
  /** Public source repository ("owner/name"), shown as a Star on GitHub button. Set to "" to hide it. */
  githubRepo: /^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPO ?? "earthwardai/earthward") ? (env.GITHUB_REPO ?? "earthwardai/earthward") : "",
  supportUrl: env.SUPPORT_URL && /^https:\/\//.test(env.SUPPORT_URL) ? env.SUPPORT_URL : null,

  /** Public IPs allowed to reach the admin area (the VPN exit addresses). */
  adminIps: list(env.ADMIN_IPS),
  adminKey: env.ADMIN_KEY ?? "",
  /** Root secret for cookie signing and IP hashing. */
  appSecret: env.APP_SECRET ?? (env.NODE_ENV === "production" ? "" : "dev-only-secret"),

  /** How many proxies in front of us append to X-Forwarded-For. */
  proxyHops: Number(env.TRUSTED_PROXY_HOPS ?? 1),

  schedulerEmail: env.SCHEDULER_SA ?? "",
  schedulerAudience: env.SCHEDULER_AUDIENCE ?? "",

  limits: {
    minDonation: 1,
    maxDonation: 1000,
    donationsPerIpPerDay: 25,
    analyticsRetentionDays: 30,
  },
};

export function assertProductionConfig() {
  if (!config.production) return;
  const missing = [
    !config.appSecret && "APP_SECRET",
    !config.adminKey && "ADMIN_KEY",
    config.adminIps.length === 0 && "ADMIN_IPS",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(", ")}`);
}
