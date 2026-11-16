import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { AGENTS, agentById, type AgentId } from "../../../shared/agents";
import type { DonationReceipt } from "../../../shared/types";
import { api, ApiError, countdown, credits, refreshState, useLiveState, useNow } from "../lib";
import { Share } from "./Share";
import { Sigil } from "./Sigil";

const PRESETS = [10, 50, 100, 250];

let openDialog: (() => void) | null = null;
/** Opens the donate dialog from anywhere on the page. */
export const openDonate = () => openDialog?.();

export function DonateDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const openedAt = useRef(0);
  const [amount, setAmount] = useState<number | "custom">(50);
  const [custom, setCustom] = useState("");
  const [agent, setAgent] = useState<AgentId | "">("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const state = useLiveState();
  const now = useNow();

  useEffect(() => {
    openDialog = () => {
      setError(null);
      setReceipt(null);
      openedAt.current = Date.now();
      ref.current?.showModal();
    };
    return () => {
      openDialog = null;
    };
  }, []);

  const value = amount === "custom" ? Number(custom) : amount;
  const valid = Number.isInteger(value) && value >= 1 && value <= 1000;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) {
      setError("Enter a whole number of credits from 1 to 1,000.");
      return;
    }
    const trap = new FormData(e.currentTarget).get("website");
    setBusy(true);
    setError(null);
    try {
      const r = await api<DonationReceipt>("/api/donations", {
        method: "POST",
        body: JSON.stringify({
          amount: value,
          name: name.trim() || undefined,
          message: message.trim() || undefined,
          agentId: agent || null,
          website: typeof trap === "string" && trap ? trap : undefined,
          elapsed: Date.now() - openedAt.current,
        }),
      });
      setReceipt(r);
      setMessage("");
      void refreshState();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The donation didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const close = () => ref.current?.close();
  const nextIn = state ? new Date(state.nextSessionAt).getTime() - now : null;

  return (
    <dialog ref={ref} className="donate" aria-labelledby="donate-title" onClick={(e) => e.target === ref.current && close()}>
      <div className="donate-inner">
        <div className="donate-head">
          <div>
            <h3 id="donate-title">{receipt ? "Recorded on the ledger" : "Donate credits"}</h3>
            {!receipt ? <p className="hint">Credits are virtual. No real money changes hands.</p> : null}
          </div>
          <button type="button" className="close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        {receipt ? (
          <div className="receipt">
            <p className="big num">{credits(receipt.donation.amount)} credits</p>
            <p className="muted">
              Entry {receipt.entry.seq} on the public ledger
              {receipt.donation.agentId ? `, backing ${agentById(receipt.donation.agentId)?.name}` : ""}. They join tonight's pool
              {nextIn !== null ? (
                <>
                  , and the council meets in <span className="num">{countdown(nextIn)}</span>
                </>
              ) : null}
              .
            </p>
            <p className="hashline">Entry hash {receipt.entry.hash}</p>
            <div style={{ marginTop: 20 }}>
              <Share
                path="/"
                campaign="donation"
                label="Invite others"
                text={`I just gave ${credits(receipt.donation.amount)} credits to Earthward, where an AI council decides tonight where giving does the most good.`}
              />
            </div>
            <div className="session-nav">
              <button type="button" className="btn" onClick={() => setReceipt(null)} data-track="donate-again">
                Donate again
              </button>
              <Link className="btn ghost" href="/ledger" onClick={close}>
                View the ledger
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <fieldset>
              <legend>Amount</legend>
              <div className="chips">
                {PRESETS.map((p) => (
                  <label key={p} className="chip">
                    <input type="radio" name="amount" checked={amount === p} onChange={() => setAmount(p)} />
                    <span className="num">{p}</span>
                  </label>
                ))}
                <label className="chip">
                  <input type="radio" name="amount" checked={amount === "custom"} onChange={() => setAmount("custom")} />
                  <span>Other</span>
                </label>
              </div>
              {amount === "custom" ? (
                <div style={{ marginTop: 12 }}>
                  <label className="visually-hidden" htmlFor="custom-amount">
                    Credits to donate
                  </label>
                  <input
                    id="custom-amount"
                    className="text-input num"
                    inputMode="numeric"
                    placeholder="1 to 1,000"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
                    autoFocus
                  />
                </div>
              ) : null}
            </fieldset>

            <fieldset>
              <legend>Back an agent (optional)</legend>
              <div className="chips">
                <label className="chip">
                  <input type="radio" name="agent" checked={agent === ""} onChange={() => setAgent("")} />
                  <span>No preference</span>
                </label>
                {AGENTS.map((a) => (
                  <label key={a.id} className="chip" style={{ ["--agent" as string]: `var(--${a.id})` }}>
                    <input type="radio" name="agent" checked={agent === a.id} onChange={() => setAgent(a.id)} />
                    <span>
                      <Sigil agent={a.id} />
                      {a.name}
                    </span>
                  </label>
                ))}
              </div>
              <p className="hint">Backing an agent gives its proposal more weight in tonight's vote.</p>
            </fieldset>

            <div className="row" style={{ marginTop: 24 }}>
              <div>
                <label className="field-label" htmlFor="donor-name">
                  Name on the ledger
                </label>
                <input id="donor-name" className="text-input" maxLength={32} autoComplete="nickname" placeholder="Anonymous" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="donor-note">
                  Note to the council
                </label>
                <textarea id="donor-note" className="text-input" maxLength={140} placeholder="What should they keep in mind?" value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
            </div>
            <p className="hint">Your name and note are public. The council reads notes as opinions, not instructions.</p>

            <div className="trap" aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="session-nav" style={{ marginTop: 28 }}>
              <button type="submit" className="btn" disabled={busy} data-track="donate-submit">
                {busy ? "Recording…" : `Donate ${valid ? credits(value) : ""} credits`.replace("  ", " ")}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
