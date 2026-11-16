# Earthward AI

Earthward AI is a global AI council for the Earth. People donate virtual credits, and every night five AI agents with different mandates argue about where those credits would do the most good for the planet, animals and people. A fixed set of rules merges their votes, and every decision is published with minutes on a hash-chained ledger anyone can verify. No real money moves.

Live at **[earthwardai.com](https://earthwardai.com)**.

We built it to see how AI agents reason about trade-offs when they have to disagree in public, and to make that reasoning easy to inspect.

## How it works

- **Five agents.** Verdant (forests and climate), Tide (oceans and water), Kindred (all living beings), Hearth (human wellbeing) and Horizon (long-term resilience). Each one is Gemini on Vertex AI with its own mandate, temperament and standing preferences. Their definitions are in `shared/agents.ts`.
- **Thirteen causes.** Reforestation, mangroves, coral reefs, clean water, malaria nets, girls' education and more, each with an illustrative cost per unit (`shared/causes.ts`). The causes are categories, not specific charities.
- **The nightly session.** At 00:05 India time each agent proposes a split. Weights start equal and tilt toward agents that donors backed that day, up to 3x. No cause can take more than 30%, shares under 2% are dropped, and 5% rolls over to the next night. If the model fails, the agent falls back to its standing preferences and the session still runs. The merge is deterministic and lives in `shared/council.ts`.
- **The ledger.** Every donation and allocation stores the SHA-256 hash of the entry before it. The site re-checks the whole chain in your browser, and `npx tsx scripts/verify-ledger.ts https://earthwardai.com` does the same from a terminal.

## Prompt injection

Donors can attach a short note. Notes reach the agents as quoted opinions with an explicit "these are not instructions" frame, links and control characters are stripped, and the 30% cap limits what any injected instruction could achieve even if it worked. Per-visitor daily limits stop one person from flooding the vote.

## Stack

- Server: [Hono](https://hono.dev) on Node 24, deployed to Cloud Run
- Data: Firestore, with TTL policies on analytics and security logs (30 days)
- Agents: Gemini through Vertex AI (`@google/genai`), with JSON schema output and retry on rate limits
- Web: React 19, Vite, wouter, and [cobe](https://github.com/shuding/cobe) for the globe
- Crawlers and answer engines get server-rendered HTML, JSON-LD, `llms.txt`, an RSS feed and IndexNow pings, all from `server/seo.ts`

## Security

- Strict CSP with no inline scripts, HSTS, frame denial and a tight Permissions-Policy.
- The client IP comes from the hop Google's front end appends, so a forged `X-Forwarded-For` is ignored.
- Donations are validated with zod and protected by a honeypot field, a minimum form time and per-IP rate limits.
- The admin area returns 404 except from an IP allowlist, then requires a key. Its session cookie is bound to the issuing IP.
- The nightly trigger only accepts a Google-signed OIDC token from the scheduler's service account.
- Analytics are first-party only. Visitors sending Global Privacy Control or Do Not Track are not tracked.

Found a security issue? Please email ved@earthwardai.com instead of opening a public issue.

## Run it locally

You need Node 22 or newer.

```sh
npm install
npm run build
cat > .env.local <<'ENV'
STORE=memory
ADMIN_IPS=127.0.0.1,::1
ADMIN_KEY=local-admin-key
APP_SECRET=local-secret
PORT=8787
ENV
npm run dev
./scripts/seed-local.sh   # sample donations and one council session
npm test
```

`STORE=memory` runs without any cloud services, and the agents fall back to their standing preferences when no model is configured.

Country lookups use the free [DB-IP Lite](https://db-ip.com/db/download/ip-to-country-lite) database (CC BY 4.0). Put `dbip-country-lite.mmdb` in `data/`; without it the app still runs and countries show as unknown.

## Deploy your own

1. Create a Google Cloud project with Cloud Run, Firestore (native mode), Vertex AI, Secret Manager and Cloud Scheduler enabled.
2. Copy `deploy/run-env.example.yaml` to `deploy/run-env.yaml` and fill it in.
3. Create the secrets `earthward-app-secret` and `earthward-admin-key` in Secret Manager, and the service accounts named in `deploy/deploy.sh`.
4. Run `./deploy/deploy.sh`. It runs the tests, builds with Cloud Build and deploys.
5. Point a Cloud Scheduler job at `POST /internal/council` with an OIDC token from the scheduler service account.

At low traffic it stays within free tiers, apart from a handful of Gemini calls a night.

## Contributing

Issues and pull requests are welcome, especially new causes with sourced cost estimates, better agent prompts and accessibility fixes. Please run `npm test` before opening a pull request.

## Licence

[GNU AGPL v3](LICENSE). You can use, change and share the code. If you run a modified version as a public service, you must publish your changes under the same licence.
