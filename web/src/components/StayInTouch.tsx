import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../lib";

type Config = { push: string | null; digest: boolean };
let configPromise: Promise<Config> | null = null;
const getConfig = () => (configPromise ??= api<Config>("/api/notify/config").catch(() => ({ push: null, digest: false })));

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const bin = atob((base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Push after each night and a weekly email. Each part shows only once it is switched on. */
export function StayInTouch({ title = "Hear how it ends", compact = false }: { title?: string; compact?: boolean }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [push, setPush] = useState<"off" | "on" | "busy" | "blocked">("off");
  const [email, setEmail] = useState("");
  const [mail, setMail] = useState<{ state: "idle" | "busy" | "sent" | "error"; text?: string }>({ state: "idle" });

  useEffect(() => {
    void getConfig().then(setCfg);
    if (!pushSupported()) return;
    if (Notification.permission === "denied") setPush("blocked");
    void navigator.serviceWorker.getRegistration("/").then((reg) => reg?.pushManager.getSubscription().then((s) => s && setPush("on")));
  }, []);

  if (!cfg || (!cfg.digest && !(cfg.push && pushSupported()))) return null;

  async function enablePush() {
    if (!cfg?.push) return;
    setPush("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setPush("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.push) }));
      await api("/api/notify/push", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
      setPush("on");
    } catch {
      setPush("off");
    }
  }

  async function disablePush() {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/notify/push/remove", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
      await sub.unsubscribe();
    }
    setPush("off");
  }

  async function subscribe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trap = new FormData(e.currentTarget).get("website");
    setMail({ state: "busy" });
    try {
      await api("/api/notify/digest", { method: "POST", body: JSON.stringify({ email, website: typeof trap === "string" && trap ? trap : undefined }) });
      setMail({ state: "sent" });
    } catch (err) {
      setMail({ state: "error", text: err instanceof ApiError ? err.message : "That didn't go through. Try again." });
    }
  }

  return (
    <section className={`stay${compact ? " compact" : ""}`} aria-labelledby="stay-title">
      <h2 id="stay-title">{title}</h2>
      <div className="stay-grid">
        {cfg.push && pushSupported() ? (
          <div className="stay-card">
            <p className="stay-head">After each night</p>
            <p className="muted">A notification when the council decides, and whether your prediction was right.</p>
            {push === "on" ? (
              <button type="button" className="btn ghost small" onClick={disablePush} data-track="push-off">
                Notifications on · Turn off
              </button>
            ) : push === "blocked" ? (
              <p className="muted small">Notifications are blocked for this site in your browser settings.</p>
            ) : (
              <button type="button" className="btn small" disabled={push === "busy"} onClick={enablePush} data-track="push-on">
                Notify me
              </button>
            )}
          </div>
        ) : null}
        {cfg.digest ? (
          <div className="stay-card">
            <p className="stay-head">Once a week</p>
            <p className="muted">Every decision, the closest calls and the prediction leaderboard, in one email.</p>
            {mail.state === "sent" ? (
              <p className="form-ok" role="status">
                Check your inbox for a confirmation link.
              </p>
            ) : (
              <form className="stay-form" onSubmit={subscribe}>
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
                <label className="visually-hidden" htmlFor="stay-email">
                  Email
                </label>
                <input id="stay-email" className="text-input" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className="btn small" type="submit" disabled={mail.state === "busy"} data-track="digest-subscribe">
                  Subscribe
                </button>
                {mail.state === "error" ? <p className="form-error">{mail.text}</p> : null}
              </form>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
