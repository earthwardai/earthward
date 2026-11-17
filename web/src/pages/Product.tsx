import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { agentById, type AgentId } from "../../../shared/agents";
import { CHANGELOG, CLASSROOM, PLANS, PRESS, QUIZ, scoreQuiz, type Plan } from "../../../shared/product";
import { openDonate } from "../components/DonateDialog";
import { Share } from "../components/Share";
import { Sigil } from "../components/Sigil";
import { StayInTouch } from "../components/StayInTouch";
import { ApiError, api, countdown, longDate, useNow, usePageMeta } from "../lib";

const agentStyle = (id: string) => ({ ["--agent" as string]: `var(--${id})` });

// --- Which agent are you? ------------------------------------------------------

export function MatchPage() {
  usePageMeta(QUIZ.title, QUIZ.lede);
  const [answers, setAnswers] = useState<number[]>([]);
  const step = answers.length;
  const done = step >= QUIZ.questions.length;
  const result = done ? scoreQuiz(answers) : null;

  if (result) {
    const [first, second] = result;
    const a = agentById(first.agentId)!;
    const b = agentById(second.agentId)!;
    return (
      <main id="main" className="page">
        <div className="match-result" style={agentStyle(a.id)}>
          <p className="lede">You think most like</p>
          <h1 className="match-name">
            <Sigil agent={a.id as AgentId} className="sigil big" />
            {a.name}
          </h1>
          <p className="match-mandate">{a.mandate}</p>
          <p>{a.temperament}</p>
          <ul className="match-bars" aria-label="How closely you match each agent">
            {result.map((r) => (
              <li key={r.agentId} style={agentStyle(r.agentId)}>
                <span>{agentById(r.agentId)?.name}</span>
                <span className="match-bar" aria-hidden="true">
                  <span style={{ width: `${r.pct}%` }} />
                </span>
                <span className="num">{r.pct}%</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            Your runner-up is {b.name}: {b.mandate.toLowerCase()}.
          </p>
          <div className="session-nav" style={{ marginTop: 24 }}>
            <button type="button" className="btn" onClick={() => openDonate(a.id)} data-track="match-back">
              Back {a.name} tonight
            </button>
            <Link className="btn ghost" href={`/agents/${a.id}`}>
              How {a.name} argues
            </Link>
            <button type="button" className="btn ghost" onClick={() => setAnswers([])}>
              Take it again
            </button>
          </div>
          <div style={{ marginTop: 28 }}>
            <Share path="/match" campaign="match" label="Share your result" text={`I'm ${a.name} on the Earthward AI council (${first.pct}% match): ${a.mandate.toLowerCase()}. Which of the five AI agents are you?`} />
          </div>
        </div>
        <StayInTouch title={`See how ${a.name} does each night`} compact />
      </main>
    );
  }

  const question = QUIZ.questions[step];
  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>{QUIZ.title}</h1>
        <p className="lede">{QUIZ.lede}</p>
      </div>
      <section className="match-q" aria-live="polite">
        <p className="muted num">
          Question {step + 1} of {QUIZ.questions.length}
        </p>
        <div className="match-progress" aria-hidden="true">
          <span style={{ width: `${(step / QUIZ.questions.length) * 100}%` }} />
        </div>
        <h2>{question.q}</h2>
        <div className="match-options">
          {question.options.map((o, i) => (
            <button key={o.text} type="button" className="match-option" onClick={() => setAnswers([...answers, i])} data-track={step === 0 ? "match-start" : undefined}>
              {o.text}
            </button>
          ))}
        </div>
        {step > 0 ? (
          <button type="button" className="linkish" onClick={() => setAnswers(answers.slice(0, -1))}>
            Back
          </button>
        ) : null}
      </section>
    </main>
  );
}

// --- What's new ----------------------------------------------------------------

export function ChangelogPage() {
  usePageMeta("What's new", "Everything we've shipped on Earthward AI, newest first.");
  return (
    <main id="main" className="page prose">
      <h1>What's new</h1>
      <p className="lede">Everything we've shipped, newest first. Ideas for what's next are welcome on the contact page or on GitHub.</p>
      {CHANGELOG.map((r) => (
        <section key={`${r.date}-${r.title}`} className="release" style={{ width: "auto", padding: 0 }}>
          <p className="muted num">{longDate(r.date)}</p>
          <h2>{r.title}</h2>
          <ul>
            {r.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
      <div className="session-nav" style={{ marginTop: 32 }}>
        <Link className="btn" href="/contact">
          Suggest a feature
        </Link>
        <a className="btn ghost" href="https://github.com/earthwardai/earthward" target="_blank" rel="noopener">
          Follow along on GitHub
        </a>
      </div>
    </main>
  );
}

// --- For classrooms -------------------------------------------------------------

export function ClassroomPage() {
  usePageMeta(CLASSROOM.title, CLASSROOM.lede);
  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>{CLASSROOM.title}</h1>
        <p className="lede">{CLASSROOM.lede}</p>
        <div className="session-nav" style={{ marginTop: 16 }}>
          <Link className="btn" href="/councils" data-track="classroom-start">
            Set up a council for my class
          </Link>
          <a className="btn ghost" href="#plan">
            See the lesson plan
          </a>
        </div>
      </div>
      <div className="more-grid" style={{ marginTop: 48 }}>
        {CLASSROOM.why.map((w) => (
          <div key={w.h} className="more-card">
            <h2 className="stay-head">{w.h}</h2>
            <p className="muted">{w.p}</p>
          </div>
        ))}
      </div>
      <section id="plan" className="prose" style={{ width: "auto", padding: 0, marginTop: 64 }}>
        <h2>A 45-minute lesson</h2>
        <ol className="plan">
          {CLASSROOM.plan.map((s) => (
            <li key={s.h}>
              <strong>
                {s.h} <span className="muted num">({s.t})</span>
              </strong>
              <p>{s.p}</p>
            </li>
          ))}
        </ol>
        <h2>Questions for the discussion</h2>
        <ul>
          {CLASSROOM.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
        <h2>Questions teachers ask</h2>
        {CLASSROOM.faq.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
        <p style={{ marginTop: 32 }}>
          Using it with a class? We'd love to hear how it went, and we can help set up something bigger for a school or a course. <Link href="/contact">Get in touch</Link>.
        </p>
      </section>
    </main>
  );
}

// --- Press kit -----------------------------------------------------------------

export function PressPage() {
  usePageMeta(PRESS.title, PRESS.lede);
  return (
    <main id="main" className="page prose">
      <h1>{PRESS.title}</h1>
      <p className="lede">{PRESS.lede}</p>
      <h2>In one line</h2>
      <p>{PRESS.oneLiner}</p>
      <h2>In a paragraph</h2>
      <p>{PRESS.boilerplate}</p>
      <h2>Facts</h2>
      <dl className="press-facts">
        {PRESS.facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h2>Logos and images</h2>
      <ul>
        {PRESS.assets.map((a) => (
          <li key={a.href}>
            <a href={a.href} download>
              {a.label}
            </a>
          </li>
        ))}
      </ul>
      <h2>Contact</h2>
      <p>
        Interviews, data and early access to new features: <a href={`mailto:${PRESS.contact}`}>{PRESS.contact}</a>. We usually reply within a day.
      </p>
    </main>
  );
}

// --- Status ---------------------------------------------------------------------

type Status = {
  status: "ok" | "degraded";
  checkedAt: string;
  version: string;
  council: { ok: boolean; lastDay: string | null; lastAt: string | null; lastModel: string | null; nextAt: string };
  ledger: { ok: boolean; entries: number };
  services: Record<"website" | "api" | "email" | "notifications" | "bluesky", boolean>;
};

const SERVICE_LABEL: Record<keyof Status["services"], string> = {
  website: "Website",
  api: "Public API",
  email: "Email updates",
  notifications: "Notifications",
  bluesky: "Nightly Bluesky post",
};

export function StatusPage() {
  usePageMeta("Status", "Whether Earthward AI is up and the council met on schedule.");
  const [s, setS] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useNow();
  useEffect(() => {
    api<Status>("/api/status")
      .then(setS)
      .catch(() => setFailed(true));
  }, []);

  return (
    <main id="main" className="page prose">
      <h1>Status</h1>
      {failed ? (
        <p className="status-banner bad">We couldn't reach the server. If this lasts, email ved@earthwardai.com.</p>
      ) : !s ? (
        <p className="muted">Checking…</p>
      ) : (
        <>
          <p className={`status-banner ${s.status === "ok" ? "good" : "bad"}`}>
            {s.status === "ok" ? "Everything is running." : "The council missed its last session. We've been alerted and are looking into it."}
          </p>
          <table className="data status-table">
            <tbody>
              <tr>
                <td>Nightly council</td>
                <td>{s.council.ok ? "On schedule" : "Late"}</td>
                <td className="muted">
                  {s.council.lastDay ? `Last met ${longDate(s.council.lastDay)}` : "Hasn't met yet"}
                  {s.council.lastModel ? ` with ${s.council.lastModel === "fallback" ? "standing preferences" : s.council.lastModel}` : ""}. Next session in {countdown(Date.parse(s.council.nextAt) - now)}.
                </td>
              </tr>
              <tr>
                <td>Public ledger</td>
                <td>{s.ledger.ok ? "Available" : "Unavailable"}</td>
                <td className="muted">
                  {s.ledger.entries.toLocaleString("en-US")} entries. <Link href="/ledger">Verify the chain yourself</Link>.
                </td>
              </tr>
              {(Object.keys(SERVICE_LABEL) as (keyof Status["services"])[]).map((k) => (
                <tr key={k}>
                  <td>{SERVICE_LABEL[k]}</td>
                  <td>{s.services[k] ? "Running" : "Not switched on yet"}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Version {s.version}. Checked {new Date(s.checkedAt).toLocaleTimeString()}. The site is checked from several regions every few minutes, and the team is alerted if it goes down or a night is
            missed.
          </p>
        </>
      )}
      <p>
        Something not working? <Link href="/contact">Tell us</Link>.
      </p>
    </main>
  );
}

// --- Plans ------------------------------------------------------------------------

export function PlansPage() {
  usePageMeta(PLANS.title, PLANS.lede);
  const [plan, setPlan] = useState<"school" | "organization">("school");
  const openedAt = useRef(Date.now());
  const [form, setForm] = useState({ name: "", email: "", org: "", size: "", message: "" });
  const [state, setState] = useState<{ s: "idle" | "busy" | "sent" | "error"; text?: string }>({ s: "idle" });

  function choose(id: Plan["id"]) {
    if (id === "public") return;
    setPlan(id);
    document.getElementById("enquire")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ s: "busy" });
    const label = plan === "school" ? "School pilot" : "Organisation plan";
    const message = [
      `${label} enquiry`,
      `Organisation: ${form.org || "not given"}`,
      `Size: ${form.size || "not given"}`,
      "",
      form.message || "(no message)",
    ].join("\n");
    try {
      await api("/api/contact", {
        method: "POST",
        body: JSON.stringify({ kind: "plan", page: "/plans", name: form.name || undefined, email: form.email, message, elapsed: Date.now() - openedAt.current }),
      });
      setState({ s: "sent" });
    } catch (err) {
      setState({ s: "error", text: err instanceof ApiError ? err.message : "That didn't send. Try again, or email ved@earthwardai.com." });
    }
  }

  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>{PLANS.title}</h1>
        <p className="lede">{PLANS.lede}</p>
      </div>
      <div className="plans">
        {PLANS.plans.map((p) => (
          <section key={p.id} className={`plan-card${p.id === "school" ? " featured" : ""}`} aria-labelledby={`plan-${p.id}`}>
            <h2 id={`plan-${p.id}`} className="stay-head">
              {p.name}
            </h2>
            <p className="plan-price">
              {p.price} <span className="muted small">{p.priceNote}</span>
            </p>
            <p className="muted">{p.for}</p>
            <ul>
              {p.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {p.id === "public" ? (
              <Link className="btn ghost" href="/councils" data-track="plan-public">
                {p.cta}
              </Link>
            ) : (
              <button type="button" className={p.id === "school" ? "btn" : "btn ghost"} onClick={() => choose(p.id)} data-track={`plan-${p.id}`}>
                {p.cta}
              </button>
            )}
          </section>
        ))}
      </div>

      <section id="enquire" className="prose" style={{ width: "auto", padding: 0, marginTop: 72 }}>
        <h2>{plan === "school" ? "Join the school pilot" : "Talk to us about your organisation"}</h2>
        {state.s === "sent" ? (
          <p className="form-ok" role="status">
            Thanks. A person from the Earthward team will email {form.email} within two working days.
          </p>
        ) : (
          <form className="contact-form" onSubmit={submit}>
            <fieldset className="chips" style={{ border: 0, padding: 0 }}>
              <legend className="field-label">Plan</legend>
              <label className="chip">
                <input type="radio" name="plan" checked={plan === "school"} onChange={() => setPlan("school")} />
                <span>School</span>
              </label>
              <label className="chip">
                <input type="radio" name="plan" checked={plan === "organization"} onChange={() => setPlan("organization")} />
                <span>Organisation</span>
              </label>
            </fieldset>
            <label className="field-label" htmlFor="pl-name">
              Your name
            </label>
            <input id="pl-name" className="text-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            <label className="field-label" htmlFor="pl-email">
              Work email
            </label>
            <input id="pl-email" className="text-input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            <label className="field-label" htmlFor="pl-org">
              {plan === "school" ? "School" : "Organisation"}
            </label>
            <input id="pl-org" className="text-input" value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} autoComplete="organization" />
            <label className="field-label" htmlFor="pl-size">
              {plan === "school" ? "How many students or classes?" : "How many people would take part?"}
            </label>
            <input id="pl-size" className="text-input" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            <label className="field-label" htmlFor="pl-msg">
              What would you like to do with it?
            </label>
            <textarea id="pl-msg" className="text-input" maxLength={2500} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            <button type="submit" className="btn" disabled={state.s === "busy" || !form.email.includes("@")} data-track={`plan-enquire-${plan}`}>
              Send
            </button>
            {state.s === "error" ? <p className="form-error">{state.text}</p> : null}
          </form>
        )}
        <h2 style={{ marginTop: 56 }}>Questions</h2>
        {PLANS.faq.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
