import { useEffect, useState } from "react";
import { Link } from "wouter";
import { StayInTouch } from "../components/StayInTouch";
import { ApiError, api, usePageMeta } from "../lib";

type Frequency = "daily" | "weekly";
type Sub = { email: string; frequency: Frequency; status: "pending" | "active" };

const FREQ_TEXT: Record<Frequency, string> = {
  daily: "the council's decision after each night, around 00:10 India time",
  weekly: "a roundup on Monday mornings, India time",
};

/**
 * Where email links land. Confirming and unsubscribing both need a button press, so the link
 * scanners some mail providers run can't subscribe or unsubscribe anyone on their own.
 */
export function DigestPage() {
  usePageMeta("Email updates", "The Earthward AI council's decisions in your inbox, every night or once a week.");
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const confirmToken = q.get("confirm");
  const manageToken = q.get("manage");

  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>Email updates</h1>
        {confirmToken ? (
          <Confirm token={confirmToken} />
        ) : manageToken ? (
          <Manage token={manageToken} leaving={q.has("leave")} />
        ) : (
          <p className="lede">The council's decision in your inbox, every night or once a week, with how your predictions did.</p>
        )}
      </div>
      {!confirmToken && !manageToken ? <StayInTouch title="Choose how to hear from us" /> : null}
      <p style={{ marginTop: 40 }}>
        <Link href="/">Back to the council</Link>
      </p>
    </main>
  );
}

function Confirm({ token }: { token: string }) {
  const [state, setState] = useState<{ s: "idle" | "busy" | "done" | "error"; text?: string; frequency?: Frequency }>({ s: "idle" });
  async function confirm() {
    setState({ s: "busy" });
    try {
      const r = await api<{ frequency: Frequency }>("/api/notify/digest/confirm", { method: "POST", body: JSON.stringify({ t: token }) });
      setState({ s: "done", frequency: r.frequency });
    } catch (err) {
      setState({ s: "error", text: err instanceof ApiError ? err.message : "That didn't go through. Try again." });
    }
  }
  if (state.s === "done")
    return (
      <p className="form-ok" role="status">
        You're subscribed. You'll get {FREQ_TEXT[state.frequency ?? "weekly"]}. Every email has a link to change this or unsubscribe.
      </p>
    );
  return (
    <div className="manage-card">
      <p>One more step: confirm that you want email from the Earthward AI council.</p>
      <div className="manage-actions">
        <button type="button" className="btn" onClick={confirm} disabled={state.s === "busy"} data-track="email-confirm">
          Confirm my subscription
        </button>
      </div>
      {state.s === "error" ? <p className="form-error">{state.text}</p> : null}
    </div>
  );
}

function Manage({ token, leaving }: { token: string; leaving: boolean }) {
  const [sub, setSub] = useState<Sub | null>(null);
  const [state, setState] = useState<{ s: "loading" | "idle" | "busy" | "gone" | "error"; text?: string; saved?: boolean }>({ s: "loading" });

  useEffect(() => {
    api<Sub>(`/api/notify/subscription?t=${encodeURIComponent(token)}`)
      .then((s) => {
        setSub(s);
        setState({ s: "idle" });
      })
      .catch((err) => setState({ s: "error", text: err instanceof ApiError ? err.message : "We couldn't load your subscription." }));
  }, [token]);

  async function setFrequency(frequency: Frequency) {
    setState({ s: "busy" });
    try {
      await api("/api/notify/subscription", { method: "POST", body: JSON.stringify({ t: token, frequency }) });
      setSub((s) => (s ? { ...s, frequency } : s));
      setState({ s: "idle", saved: true });
    } catch (err) {
      setState({ s: "error", text: err instanceof ApiError ? err.message : "That didn't save. Try again." });
    }
  }

  async function leave() {
    setState({ s: "busy" });
    await api("/api/notify/digest/unsubscribe", { method: "POST", body: JSON.stringify({ t: token }) }).catch(() => undefined);
    setState({ s: "gone" });
  }

  if (state.s === "gone")
    return (
      <p className="form-ok" role="status">
        You've unsubscribed and we've deleted your email address. You can sign up again any time.
      </p>
    );
  if (state.s === "loading") return <p className="muted">Loading your subscription…</p>;
  if (!sub) return <p className="form-error">{state.text ?? "That link has expired or the address was already removed."}</p>;

  return (
    <div className="manage-card">
      <p>
        Emails to <strong>{sub.email}</strong>
        {sub.status === "pending" ? " (not confirmed yet)" : ""}.
      </p>
      <fieldset className="chips" style={{ border: 0, padding: 0 }}>
        <legend className="field-label">How often</legend>
        {(["daily", "weekly"] as const).map((f) => (
          <label key={f} className="chip">
            <input type="radio" name="freq" checked={sub.frequency === f} disabled={state.s === "busy"} onChange={() => void setFrequency(f)} />
            <span>{f === "daily" ? "Every night" : "Once a week"}</span>
          </label>
        ))}
      </fieldset>
      {state.saved ? (
        <p className="form-ok" role="status">
          Saved. You'll get {FREQ_TEXT[sub.frequency]}.
        </p>
      ) : null}
      <div className="manage-actions">
        <button type="button" className={leaving ? "btn" : "btn ghost small"} onClick={leave} disabled={state.s === "busy"} data-track="email-unsubscribe">
          Unsubscribe and delete my address
        </button>
      </div>
      {state.s === "error" ? <p className="form-error">{state.text}</p> : null}
    </div>
  );
}
