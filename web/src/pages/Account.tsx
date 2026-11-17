import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ApiError, api, longDate, usePageMeta } from "../lib";

type Frequency = "daily" | "weekly" | "none";
export type Me =
  | { signedIn: false }
  | {
      signedIn: true;
      email: string;
      createdAt: string;
      councils: { id: string; name: string; template: string; createdAt: string; sessions: number; lastConvenedAt: string | null; backersWaiting: number; lastTitle: string | null }[];
      predictions: { total: number; correct: number; best: number; streak: number };
      subscription: Frequency;
    };

let mePromise: Promise<Me> | null = null;
const listeners = new Set<(m: Me) => void>();
export function refreshMe() {
  mePromise = api<Me>("/api/account/me").catch(() => ({ signedIn: false }) as Me);
  void mePromise.then((m) => listeners.forEach((l) => l(m)));
  return mePromise;
}
/** The signed-in account, shared by the nav and the account page. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    listeners.add(setMe);
    void (mePromise ?? refreshMe()).then(setMe);
    return () => {
      listeners.delete(setMe);
    };
  }, []);
  return me;
}

/** Owner links this browser holds for group councils (saved when a council is created here). */
function localCouncils(): { id: string; token: string }[] {
  const out: { id: string; token: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      const m = key.match(/^ew_owner_([a-z0-9]{6,16})$/);
      const token = m ? localStorage.getItem(key) : null;
      if (m && token) out.push({ id: m[1], token });
    }
  } catch {
    /* storage blocked */
  }
  return out.slice(0, 50);
}

function SignInForm({ next, title = "Sign in" }: { next?: string; title?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ s: "idle" | "busy" | "sent" | "error"; text?: string }>({ s: "idle" });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trap = new FormData(e.currentTarget).get("website");
    setState({ s: "busy" });
    try {
      await api("/api/account/login", { method: "POST", body: JSON.stringify({ email, next, website: typeof trap === "string" && trap ? trap : undefined }) });
      setState({ s: "sent" });
    } catch (err) {
      setState({ s: "error", text: err instanceof ApiError ? err.message : "That didn't go through. Try again." });
    }
  }
  if (state.s === "sent")
    return (
      <div className="manage-card">
        <p className="form-ok" role="status">
          Check your inbox. If {email} can sign in, a link is on its way. It works once, for 20 minutes.
        </p>
        <button type="button" className="linkish" onClick={() => setState({ s: "idle" })}>
          Use a different address
        </button>
      </div>
    );
  return (
    <form className="manage-card contact-form" onSubmit={submit}>
      <h2 className="stay-head">{title}</h2>
      <p className="muted">No password. We email you a link that signs you in.</p>
      <div className="hp" inert>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="field-label" htmlFor="si-email">
        Email
      </label>
      <input id="si-email" className="text-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <button type="submit" className="btn" disabled={state.s === "busy"} data-track="signin-request">
        Email me a sign-in link
      </button>
      {state.s === "error" ? <p className="form-error">{state.text}</p> : null}
    </form>
  );
}

export function SignInPage() {
  usePageMeta("Sign in", "Sign in to Earthward AI with a link sent to your email.");
  const [, navigate] = useLocation();
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const token = q.get("t");
  const [state, setState] = useState<{ s: "idle" | "busy" | "error"; text?: string }>({ s: "idle" });

  async function verify() {
    setState({ s: "busy" });
    try {
      const r = await api<{ next: string }>("/api/account/verify", { method: "POST", body: JSON.stringify({ t: token }) });
      await refreshMe();
      navigate(r.next || "/account");
    } catch (err) {
      setState({ s: "error", text: err instanceof ApiError ? err.message : "That didn't go through. Try again." });
    }
  }

  return (
    <main id="main" className="page prose">
      <h1>Sign in</h1>
      {token ? (
        <div className="manage-card">
          <p>You're one step away from signing in to Earthward AI.</p>
          <button type="button" className="btn" onClick={verify} disabled={state.s === "busy"} data-track="signin-confirm">
            Sign in
          </button>
          {state.s === "error" ? (
            <>
              <p className="form-error">{state.text}</p>
              <SignInForm next={q.get("next") ?? undefined} title="Get a new link" />
            </>
          ) : null}
        </div>
      ) : (
        <>
          <p className="lede">Keep your group councils, predictions and email settings in one place, on any device.</p>
          <SignInForm next={q.get("next") ?? undefined} />
        </>
      )}
    </main>
  );
}

const FREQ: { id: Frequency; label: string }[] = [
  { id: "daily", label: "Every night" },
  { id: "weekly", label: "Once a week" },
  { id: "none", label: "No email" },
];

export function AccountPage() {
  usePageMeta("Your account", "Your group councils, predictions and email settings on Earthward AI.");
  const me = useMe();
  const [, navigate] = useLocation();
  const [note, setNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Councils made in this browser before signing in move into the account automatically.
  const claim = useCallback(async () => {
    const councils = localCouncils();
    if (!councils.length) return;
    const r = await api<{ claimed: number }>("/api/account/councils/claim", { method: "POST", body: JSON.stringify({ councils }) }).catch(() => ({ claimed: 0 }));
    if (r.claimed) {
      setNote(`Added ${r.claimed} ${r.claimed === 1 ? "council" : "councils"} from this browser to your account.`);
      await refreshMe();
    }
  }, []);
  useEffect(() => {
    if (me?.signedIn) void claim();
  }, [me?.signedIn, claim]);

  if (!me) return <main id="main" className="page prose"><p className="muted">Loading…</p></main>;
  if (!me.signedIn)
    return (
      <main id="main" className="page prose">
        <h1>Your account</h1>
        <p className="lede">Keep your group councils, predictions and email settings in one place, on any device.</p>
        <SignInForm next="/account" />
      </main>
    );

  async function setFrequency(frequency: Frequency) {
    await api("/api/account/subscription", { method: "POST", body: JSON.stringify({ frequency }) }).catch(() => undefined);
    await refreshMe();
  }
  async function signOut() {
    await api("/api/account/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    await refreshMe();
    navigate("/");
  }
  async function remove() {
    await api("/api/account/delete", { method: "POST", body: "{}" }).catch(() => undefined);
    await refreshMe();
    navigate("/");
  }

  const p = me.predictions;
  return (
    <main id="main" className="page prose">
      <h1>Your account</h1>
      <p className="lede">Signed in as {me.email}.</p>
      {note ? (
        <p className="form-ok" role="status">
          {note}
        </p>
      ) : null}

      <h2>Your councils</h2>
      {me.councils.length ? (
        <ul className="account-councils">
          {me.councils.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.id}`}>{c.name}</Link>
              <span className="muted small">
                {" "}
                {c.sessions ? `${c.sessions} ${c.sessions === 1 ? "session" : "sessions"}, last: ${c.lastTitle}` : "Hasn't met yet"}
                {c.backersWaiting ? `. ${c.backersWaiting} waiting for the next session` : ""}.
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">None yet. Councils you set up while signed in appear here, and so do ones you created in this browser before.</p>
      )}
      <p>
        <Link className="btn small" href="/councils">
          Set up a council
        </Link>{" "}
        <Link className="btn ghost small" href="/plans">
          Plans for schools and organisations
        </Link>
      </p>

      <h2>Your predictions</h2>
      {p.total ? (
        <p>
          {p.correct} of {p.total} right. Current streak {p.streak}, best {p.best}. <Link href="/predict">Predict tonight</Link>.
        </p>
      ) : (
        <p className="muted">
          No predictions yet. <Link href="/predict">Guess tonight's top cause</Link>; predictions made on any device you've signed in on count here.
        </p>
      )}

      <h2>Email updates</h2>
      <div className="chips" role="radiogroup" aria-label="Email updates">
        {FREQ.map((f) => (
          <label key={f.id} className="chip">
            <input type="radio" name="freq" checked={me.subscription === f.id} onChange={() => void setFrequency(f.id)} />
            <span>{f.label}</span>
          </label>
        ))}
      </div>

      <h2>Account</h2>
      <p className="muted">Member since {longDate(me.createdAt.slice(0, 10))}.</p>
      <div className="manage-actions">
        <button type="button" className="btn ghost small" onClick={signOut} data-track="signout">
          Sign out
        </button>
        {confirmDelete ? (
          <>
            <button type="button" className="btn small danger" onClick={remove} data-track="account-delete">
              Yes, delete my account
            </button>
            <span className="muted small">Your councils stay online for anyone with their links; your email address and settings are deleted.</span>
          </>
        ) : (
          <button type="button" className="linkish" onClick={() => setConfirmDelete(true)}>
            Delete my account
          </button>
        )}
      </div>
    </main>
  );
}
