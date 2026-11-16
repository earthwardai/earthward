import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { FEEDBACK_KINDS, type FeedbackKind } from "../../../shared/content";
import { api, ApiError } from "../lib";

/** Suggestions, questions, feedback, bug reports and partnership notes. Used on /contact and in the Feedback dialog. */
export function FeedbackForm({ initialKind = "feedback", compact = false, onSent }: { initialKind?: FeedbackKind; compact?: boolean; onSent?: () => void }) {
  const [location] = useLocation();
  const openedAt = useRef(Date.now());
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<{ state: "idle" | "busy" | "sent" | "error"; text?: string }>({ state: "idle" });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form.message.trim().length < 10) {
      setStatus({ state: "error", text: "Write at least a sentence so we can act on it." });
      return;
    }
    const trap = new FormData(e.currentTarget).get("website");
    setStatus({ state: "busy" });
    try {
      await api("/api/contact", {
        method: "POST",
        body: JSON.stringify({
          kind,
          page: location,
          name: form.name.trim() || undefined,
          email: form.email.trim() || undefined,
          message: form.message,
          website: typeof trap === "string" && trap ? trap : undefined,
          elapsed: Date.now() - openedAt.current,
        }),
      });
      setStatus({ state: "sent" });
      setForm({ name: "", email: "", message: "" });
      onSent?.();
    } catch (err) {
      setStatus({ state: "error", text: err instanceof ApiError ? err.message : "That didn't send. Check your connection and try again." });
    }
  }

  if (status.state === "sent")
    return (
      <div className="feedback-sent" role="status">
        <p className="form-ok">Thank you. We read every message, and if you left an email we'll reply.</p>
        <button type="button" className="btn ghost small" onClick={() => setStatus({ state: "idle" })}>
          Send another
        </button>
      </div>
    );

  const placeholder: Record<FeedbackKind, string> = {
    suggestion: "A cause the council should consider, a feature you'd like, a rule you'd change…",
    question: "What would you like to know?",
    feedback: "What worked, what didn't, what surprised you…",
    bug: "What happened, and on which page?",
    partnership: "Who you are and what you have in mind.",
  };

  return (
    <form className={`contact-form${compact ? " compact" : ""}`} onSubmit={submit} noValidate>
      <fieldset className="feedback-kinds">
        <legend className="field-label">What is it about?</legend>
        <div className="chips">
          {FEEDBACK_KINDS.map((k) => (
            <label key={k.id} className="chip">
              <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
              <span>{k.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="field-label" htmlFor={compact ? "f-msg" : "c-msg"}>
          Message
        </label>
        <textarea
          id={compact ? "f-msg" : "c-msg"}
          className="text-input"
          style={{ minHeight: compact ? 120 : 160 }}
          maxLength={4000}
          required
          placeholder={placeholder[kind]}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />
      </div>
      <div className="row">
        <div>
          <label className="field-label" htmlFor={compact ? "f-name" : "c-name"}>
            Name (optional)
          </label>
          <input id={compact ? "f-name" : "c-name"} className="text-input" maxLength={80} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="field-label" htmlFor={compact ? "f-email" : "c-email"}>
            Email, if you'd like a reply
          </label>
          <input
            id={compact ? "f-email" : "c-email"}
            className="text-input"
            type="email"
            maxLength={160}
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
      </div>
      <div className="trap" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {status.state === "error" ? (
        <p className="form-error" role="alert">
          {status.text}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn" disabled={status.state === "busy"} data-track={`feedback-send-${kind}`}>
          {status.state === "busy" ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

/** A small "Feedback" button fixed to the corner of every public page. */
export function FeedbackButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const close = () => ref.current?.close();

  useEffect(() => {
    const d = ref.current;
    const onClose = () => setOpen(false);
    d?.addEventListener("close", onClose);
    return () => d?.removeEventListener("close", onClose);
  }, []);

  if (location.startsWith("/admin")) return null;
  return (
    <>
      <button
        type="button"
        className="feedback-fab"
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
        data-track="feedback-open"
      >
        Feedback
      </button>
      <dialog ref={ref} className="donate" aria-labelledby="feedback-title" onClick={(e) => e.target === ref.current && close()}>
        <div className="donate-inner">
          <div className="donate-head">
            <div>
              <h3 id="feedback-title">Tell us what you think</h3>
              <p className="hint">Suggestions, questions, feedback or a bug. A person reads every message.</p>
            </div>
            <button type="button" className="close" onClick={close} aria-label="Close">
              ×
            </button>
          </div>
          {open ? <FeedbackForm compact /> : null}
        </div>
      </dialog>
    </>
  );
}
