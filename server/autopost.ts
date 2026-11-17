import { causeById } from "../shared/causes";
import type { Session } from "../shared/types";
import { config } from "./config";
import { councilImage } from "./og";

/**
 * Posts each night's decision to Bluesky and Mastodon. Both have free APIs. Nothing happens
 * unless the credentials are configured:
 *   BLUESKY_HANDLE + BLUESKY_APP_PASSWORD   (an app password, not the account password)
 *   MASTODON_URL + MASTODON_TOKEN           (an access token with write:statuses only)
 */

export function postText(session: Session, max = 280): string {
  const url = `${config.siteUrl}/council/${session.day}`;
  const top = session.allocations
    .slice(0, 3)
    .map((a) => `${causeById(a.causeId)?.name ?? a.causeId} ${Math.round(a.share * 100)}%`)
    .join(", ");
  const head = `${session.title}.`;
  const body = `Last night the five AI agents of the Earthward AI council split ${session.spent.toLocaleString("en-US")} credits. Top causes: ${top}.`;
  const tail = "Watch the debate:";
  let text = `${head}\n\n${body}\n\n${tail} ${url}`;
  if ([...text].length > max) text = `${head}\n\n${tail} ${url}`;
  return text;
}

type Fetch = typeof fetch;

/** Byte ranges of links in a post, so Bluesky shows them as links. */
export function linkFacets(text: string, utm: string) {
  const enc = new TextEncoder();
  const facets: { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] }[] = [];
  for (const m of text.matchAll(/(?:https?:\/\/)?(?:earthwardai\.com|github\.com)[^\s]*/g)) {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(m[0]).length;
    const bare = m[0].replace(/^https?:\/\//, "");
    const uri = bare.startsWith("earthwardai.com") ? `https://${bare}${bare.includes("?") ? "&" : "?"}${utm}` : `https://${bare}`;
    facets.push({ index: { byteStart, byteEnd }, features: [{ $type: "app.bsky.richtext.facet#link", uri }] });
  }
  return facets;
}

/** Posts text (with linked URLs) and an optional JPEG to the Bluesky account. */
export async function postToBluesky(text: string, image: { bytes: Uint8Array<ArrayBuffer>; alt: string } | null, utm: string, f: Fetch = fetch): Promise<string> {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return "skipped";
  const base = "https://bsky.social/xrpc";
  const auth = await f(`${base}/com.atproto.server.createSession`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: handle, password }) });
  if (!auth.ok) throw new Error(`bluesky login ${auth.status}`);
  const { accessJwt, did } = (await auth.json()) as { accessJwt: string; did: string };
  const headers = { authorization: `Bearer ${accessJwt}` };
  const record: Record<string, unknown> = { $type: "app.bsky.feed.post", text, facets: linkFacets(text, utm), langs: ["en"], createdAt: new Date().toISOString() };
  if (image) {
    const up = await f(`${base}/com.atproto.repo.uploadBlob`, { method: "POST", headers: { ...headers, "content-type": "image/jpeg" }, body: image.bytes });
    if (up.ok) record.embed = { $type: "app.bsky.embed.images", images: [{ alt: image.alt, image: ((await up.json()) as { blob: unknown }).blob }] };
  }
  const res = await f(`${base}/com.atproto.repo.createRecord`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ repo: did, collection: "app.bsky.feed.post", record }) });
  if (!res.ok) throw new Error(`bluesky post ${res.status}`);
  return "posted";
}

async function postBluesky(session: Session, f: Fetch) {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) return "skipped";
  const base = "https://bsky.social/xrpc";
  const auth = await f(`${base}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!auth.ok) throw new Error(`bluesky login ${auth.status}`);
  const { accessJwt, did } = (await auth.json()) as { accessJwt: string; did: string };
  const headers = { authorization: `Bearer ${accessJwt}` };

  const png = await councilImage(session);
  const up = await f(`${base}/com.atproto.repo.uploadBlob`, { method: "POST", headers: { ...headers, "content-type": "image/png" }, body: new Uint8Array(png) });
  const thumb = up.ok ? ((await up.json()) as { blob: unknown }).blob : undefined;

  const url = `${config.siteUrl}/council/${session.day}?utm_source=bluesky&utm_campaign=nightly`;
  const text = postText(session, 300).replace(/ https:\/\/\S+$/, "");
  const res = await f(`${base}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      repo: did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        createdAt: new Date().toISOString(),
        embed: {
          $type: "app.bsky.embed.external",
          external: { uri: url, title: session.title, description: "Five AI agents argue every night over where giving does the most good.", ...(thumb ? { thumb } : {}) },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`bluesky post ${res.status}`);
  return "posted";
}

async function postMastodon(session: Session, f: Fetch) {
  const base = process.env.MASTODON_URL?.replace(/\/$/, "");
  const token = process.env.MASTODON_TOKEN;
  if (!base || !token || !/^https:\/\//.test(base)) return "skipped";
  const text = postText(session, 480).replace(/(https:\/\/\S+)$/, "$1?utm_source=mastodon&utm_campaign=nightly");
  const res = await f(`${base}/api/v1/statuses`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": `earthward-${session.day}` },
    body: JSON.stringify({ status: text, visibility: "public", language: "en" }),
  });
  if (!res.ok) throw new Error(`mastodon post ${res.status}`);
  return "posted";
}

/** Posts the night's decision everywhere that is configured. Never throws. */
export async function announceSession(session: Session, f: Fetch = fetch): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const [name, fn] of [
    ["bluesky", postBluesky],
    ["mastodon", postMastodon],
  ] as const) {
    try {
      results[name] = await fn(session, f);
    } catch (err) {
      console.error(`autopost ${name} failed`, err);
      results[name] = "failed";
    }
  }
  return results;
}
