import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { MemoryStore } from "../server/store/memory";

// These read dist/web/index.html, so run `npm run build:web` first (the deploy script does).
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  const store = new MemoryStore();
  await store.ensureGenesis(10_000);
  app = createApp(store);
});

const get = (path: string, host = "earthwardai.com") => app.request(path, { headers: { host, "x-forwarded-for": "192.0.2.10" } });

describe("pages for crawlers and answer engines", () => {
  it("serves readable HTML with metadata and FAQ structured data on the home page", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<h1>Earthward AI is a global AI council for the Earth.</h1>");
    expect(html).toContain("<title>Earthward AI | Global AI council for the Earth</title>");
    expect(html).toContain('"alternateName":["Earthward","EarthwardAI"');
    expect(html).toContain('<link rel="canonical" href="https://earthwardai.com/" />');
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain("10,000 credits in the treasury now");
  });

  it("gives the rulebook its own title and content", async () => {
    const html = await (await get("/how-it-works")).text();
    expect(html).toContain("<title>How Earthward AI works</title>");
    expect(html).toContain("No cause may take more than 30%");
  });

  it("serves topic, agent and cause pages, and 404s for unknown ones", async () => {
    const earth = await get("/earth-ai");
    expect(earth.status).toBe(200);
    expect(await earth.text()).toContain("<h1>Earth AI that decides how to help the planet</h1>");
    expect(await (await get("/global-ai-council")).text()).toContain('"@type":"BreadcrumbList"');
    expect((await get("/agents/verdant")).status).toBe(200);
    expect((await get("/causes/reefs")).status).toBe(200);
    expect((await get("/agents/nobody")).status).toBe(404);
    expect((await get("/causes/nothing")).status).toBe(404);
    const xml = await (await get("/sitemap.xml")).text();
    expect(xml).toMatch(/<loc>https:\/\/earthwardai\.com\/causes\/reefs<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("returns 404 for unknown pages and missing sessions", async () => {
    expect((await get("/council/2001-01-01")).status).toBe(404);
    expect((await get("/no-such-page")).status).toBe(404);
  });

  it("redirects www to the main domain", async () => {
    const res = await get("/ledger?x=1", "www.earthwardai.com");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://earthwardai.com/ledger?x=1");
  });

  it("redirects the raw Cloud Run address but keeps the scheduler and health check working", async () => {
    const runApp = "earthward-000000000000.us-central1.run.app";
    const res = await get("/earth-ai", runApp);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://earthwardai.com/earth-ai");
    expect((await get("/api/health", runApp)).status).toBe(200);
    const council = await app.request("/internal/council", { method: "POST", headers: { host: runApp } });
    expect(council.status).not.toBe(301);
  });

  it("lets crawlers fetch the public API for rendering but keeps the JSON out of the index", async () => {
    const res = await get("/api/state");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("publishes llms.txt and an RSS feed", async () => {
    const llms = await (await get("/llms.txt")).text();
    expect(llms).toMatch(/^# Earthward/);
    expect(llms).toContain("## Key facts");
    const feed = await get("/feed.xml");
    expect(feed.headers.get("content-type")).toContain("application/rss+xml");
    expect(await feed.text()).toContain("<title>Earthward AI council minutes</title>");
  });
});
