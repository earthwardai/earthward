// First-party analytics: page views, clicks and scroll depth, batched and sent to
// our own server. No third-party scripts. Visitors who send Global Privacy Control
// or Do Not Track are not tracked at all.

import type { TrackEvent } from "../../shared/types";
import { sessionId, visitorId } from "./lib";

const queue: TrackEvent[] = [];
let maxDepth = 0;
let pageStart = Date.now();
let currentPath = "";
let firstView = true;

const optedOut = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === "1";
};

function push(e: Omit<TrackEvent, "at" | "p"> & { p?: string }) {
  if (optedOut()) return;
  queue.push({ p: currentPath, at: Date.now(), ...e });
  if (queue.length >= 40) flush();
}

export function flush(useBeacon = false) {
  if (queue.length === 0) return;
  const vid = visitorId();
  const sid = sessionId();
  if (!vid || !sid) {
    queue.length = 0;
    return;
  }
  const body = JSON.stringify({
    vid,
    sid,
    events: queue.splice(0, 60),
    screen: { w: window.innerWidth, h: window.innerHeight },
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang: navigator.language,
  });
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/t", new Blob([body], { type: "text/plain" }));
  } else {
    void fetch("/api/t", { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => undefined);
  }
}

function leavePage() {
  if (!currentPath) return;
  push({ t: "scroll", depth: Math.round(maxDepth) });
  push({ t: "leave", ms: Date.now() - pageStart });
}

/** Call on every route change. */
export function trackView(path: string) {
  if (path === currentPath) return;
  leavePage();
  currentPath = path;
  pageStart = Date.now();
  maxDepth = 0;
  const params = new URLSearchParams(location.search);
  const utm = ["utm_source", "utm_medium", "utm_campaign"]
    .map((k) => (params.get(k) ? `${k.slice(4)}=${params.get(k)}` : null))
    .filter(Boolean)
    .join("&");
  push({ t: "view", ref: firstView && document.referrer ? document.referrer.slice(0, 300) : undefined, utm: utm || undefined });
  firstView = false;
}

function describe(el: Element): string | null {
  const tagged = el.closest("[data-track]");
  if (tagged) return tagged.getAttribute("data-track");
  const actionable = el.closest("a, button, [role=button], summary, label");
  if (!actionable) return null;
  const href = actionable.getAttribute("href");
  const text = (actionable.getAttribute("aria-label") ?? actionable.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  return `${actionable.tagName.toLowerCase()}:${href && href.startsWith("/") ? href : text || "unnamed"}`.slice(0, 80);
}

export function startTracking() {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? describe(e.target) : null;
      if (!target) return;
      push({ t: "click", target, x: +(e.clientX / window.innerWidth).toFixed(3), y: +(e.clientY / window.innerHeight).toFixed(3) });
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    "scroll",
    () => {
      const doc = document.documentElement;
      const depth = ((window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1)) * 100;
      if (depth > maxDepth) maxDepth = Math.min(100, depth);
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      leavePage();
      flush(true);
    }
  });
  window.setInterval(() => flush(), 10_000);
}
