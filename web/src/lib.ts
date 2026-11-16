import { useEffect, useRef, useState } from "react";
import type { LedgerPage, Session, StateResponse } from "../../shared/types";

// --- API --------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const vid = visitorId();
  if (vid) headers.set("x-ew-vid", vid);
  const res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((body as { error?: string } | null)?.error ?? `Request failed (${res.status}).`, res.status);
  return body as T;
}

export const getState = () => api<StateResponse>("/api/state");
export const getLedger = (before?: number, limit = 50) =>
  api<LedgerPage>(`/api/ledger?limit=${limit}${before !== undefined ? `&before=${before}` : ""}`);
export const getSession = (day: string) => api<{ session: Session }>(`/api/sessions/${day}`);
export const getMe = () => api<{ country: string | null; location: [number, number] | null }>("/api/me");
export const getSessions = (limit = 30) => api<{ sessions: Session[] }>(`/api/sessions?limit=${limit}`);

// --- Live state ---------------------------------------------------------------

type Listener = (s: StateResponse) => void;
let current: StateResponse | null = null;
const listeners = new Set<Listener>();
let timer: number | undefined;
let inflight: Promise<void> | null = null;

export function refreshState(): Promise<void> {
  inflight ??= getState()
    .then((s) => {
      current = s;
      listeners.forEach((l) => l(s));
    })
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    if (document.visibilityState === "visible") await refreshState();
    schedule();
  }, 15_000);
}

/** Shared, polled view of the treasury. Pauses while the tab is hidden. */
export function useLiveState(): StateResponse | null {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    if (listeners.size === 1) {
      void refreshState();
      schedule();
    }
    const onVisible = () => document.visibilityState === "visible" && void refreshState();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(setState);
      document.removeEventListener("visibilitychange", onVisible);
      if (listeners.size === 0) window.clearTimeout(timer);
    };
  }, []);
  return state;
}

// --- Small hooks ---------------------------------------------------------------

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Eases a number toward its new value so the treasury visibly counts up. */
export function useTween(target: number, reduced: boolean, ms = 900): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(a + (target - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, ms]);
  return value;
}

// --- Formatting ------------------------------------------------------------------

export const credits = (n: number) => n.toLocaleString("en-US");

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export const countryName = (code: string | null) => (code ? (regionNames?.of(code) ?? code) : null);

// --- Visitor identity --------------------------------------------------------------

function stored(storage: Storage | undefined, key: string): string | null {
  try {
    if (!storage) return null;
    let v = storage.getItem(key);
    if (!v) {
      v = crypto.randomUUID();
      storage.setItem(key, v);
    }
    return v;
  } catch {
    return null;
  }
}

export const visitorId = () => (typeof window === "undefined" ? null : stored(window.localStorage, "ew_vid"));
export const sessionId = () => (typeof window === "undefined" ? null : stored(window.sessionStorage, "ew_sid"));

// --- Theme --------------------------------------------------------------------------

export type Theme = "light" | "dark";

function resolveTheme(): Theme {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** The theme in effect: the visitor's choice if they made one, otherwise the OS setting. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(resolveTheme);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: light)");
    const sync = () => setTheme(resolveTheme());
    mq.addEventListener("change", sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", sync);
      mo.disconnect();
    };
  }, []);
  const choose = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", t === "light" ? "#ffffff" : "#171614"));
    try {
      localStorage.setItem("ew_theme", t);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  };
  return [theme, choose];
}

// --- Page metadata --------------------------------------------------------------------

/** Sets the tab title and description for a route (search engines that run JS read these). */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title === "Earthward" ? "Earthward AI | Global AI council for the Earth" : `${title} | Earthward AI`;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  }, [title, description]);
}
