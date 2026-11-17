import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { TEMPLATES } from "../../../shared/templates";
import type { GroupCouncil, GroupSession } from "../../../shared/types";
import { ApiError, api, credits, usePageMeta } from "../lib";

const PALETTE = ["verdant", "tide", "kindred", "hearth", "horizon"];
const ownerKey = (id: string) => `ew_owner_${id}`;
const readOwner = (id: string) => {
  try {
    return localStorage.getItem(ownerKey(id));
  } catch {
    return null;
  }
};
const saveOwner = (id: string, token: string) => {
  try {
    localStorage.setItem(ownerKey(id), token);
  } catch {
    /* private mode: the owner link in the page still works */
  }
};

function Mark({ index, name }: { index: number; name: string }) {
  return (
    <span className="group-mark" aria-hidden="true" style={{ ["--agent" as string]: `var(--${PALETTE[index % PALETTE.length]})` }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

// --- /councils: set one up -----------------------------------------------------

const BUDGETS = [500, 1000, 5000, 10000];

export function CouncilsPage() {
  usePageMeta(
    "Run an AI council for your group",
    "Give a class, team or neighbourhood its own council of five AI agents. Members back the agent they agree with, and the council debates and splits your budget.",
  );
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ name: "", template: "classroom", budget: 1000, spec: "" });
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    let spec: unknown;
    if (form.template === "custom") {
      try {
        spec = JSON.parse(form.spec);
      } catch {
        setState({ busy: false, error: "The council file isn't valid JSON." });
        return;
      }
    }
    try {
      const r = await api<{ id: string; ownerToken: string }>("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: form.name, template: form.template, budget: form.budget, spec }),
      });
      saveOwner(r.id, r.ownerToken);
      navigate(`/c/${r.id}#owner=${r.ownerToken}`);
    } catch (err) {
      setState({ busy: false, error: err instanceof ApiError ? err.message : "That didn't work. Try again." });
    }
  }

  return (
    <main id="main" className="page group-page">
      <div className="prose">
        <h1>Run an AI council for your group</h1>
        <p className="lede">
          A class, a team or a neighbourhood gets its own council of five AI agents. Share the link. Members back the agent they agree with and leave a note. When you&apos;re
          ready, you convene the council, and the agents debate and split your budget in front of everyone.
        </p>
      </div>

      <ol className="group-steps">
        <li>
          <strong>Set it up</strong>
          <span>Pick a template and a budget. No sign-up.</span>
        </li>
        <li>
          <strong>Share the link</strong>
          <span>Members back an agent and say why.</span>
        </li>
        <li>
          <strong>Convene</strong>
          <span>The agents argue, the rules merge their votes, and the minutes are written.</span>
        </li>
      </ol>

      <form className="contact-form group-form" onSubmit={submit} noValidate>
        <label className="field-label" htmlFor="g-name">
          Council name
        </label>
        <input id="g-name" className="text-input" maxLength={60} required placeholder="Class 7B giving council" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

        <fieldset className="template-pick">
          <legend className="field-label">Who is it for?</legend>
          {TEMPLATES.map((t) => (
            <label key={t.id} className={`template-option${form.template === t.id ? " on" : ""}`}>
              <input type="radio" name="template" value={t.id} checked={form.template === t.id} onChange={() => setForm({ ...form, template: t.id })} />
              <strong>{t.label}</strong>
              <span>{t.blurb}</span>
              <span className="muted small">{t.spec.agents.map((a) => a.name).join(", ")}</span>
            </label>
          ))}
          <label className={`template-option${form.template === "custom" ? " on" : ""}`}>
            <input type="radio" name="template" value="custom" checked={form.template === "custom"} onChange={() => setForm({ ...form, template: "custom" })} />
            <strong>Your own agents and causes</strong>
            <span>Paste a council file in the open format.</span>
          </label>
        </fieldset>

        {form.template === "custom" ? (
          <>
            <label className="field-label" htmlFor="g-spec">
              Council file (JSON)
            </label>
            <textarea
              id="g-spec"
              className="text-input mono"
              rows={10}
              placeholder='{"agents": [...], "causes": [...]}'
              value={form.spec}
              onChange={(e) => setForm({ ...form, spec: e.target.value })}
            />
            <p className="muted small">
              The format is documented with a full example in{" "}
              <a href="https://github.com/earthwardai/earthward/blob/main/examples/bengaluru.json" target="_blank" rel="noopener">
                examples/bengaluru.json
              </a>
              . Two to eight agents, up to twenty causes.
            </p>
          </>
        ) : null}

        <label className="field-label" htmlFor="g-budget">
          Budget per session (virtual credits)
        </label>
        <select id="g-budget" className="text-input" value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}>
          {BUDGETS.map((b) => (
            <option key={b} value={b}>
              {credits(b)}
            </option>
          ))}
        </select>

        {state.error ? <p className="form-error">{state.error}</p> : null}
        <button className="btn" type="submit" disabled={state.busy || form.name.trim().length < 3} data-track="group-create">
          {state.busy ? "Setting up…" : "Set up the council"}
        </button>
        <p className="muted small">Credits are virtual and nothing is paid to anyone. Group councils are unlisted: only people with the link can see them.</p>
      </form>
    </main>
  );
}

// --- /c/:id: one group's council ------------------------------------------------

function SessionView({ session, group }: { session: GroupSession; group: GroupCouncil }) {
  const agent = (id: string) => group.spec.agents.find((a) => a.id === id);
  const idx = (id: string) => group.spec.agents.findIndex((a) => a.id === id);
  const cause = (id: string) => group.spec.causes.find((c) => c.id === id);
  const max = session.allocations[0]?.credits || 1;
  return (
    <article className="group-session">
      <p className="muted">
        Session {session.n} · {new Date(session.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {session.backers}{" "}
        {session.backers === 1 ? "backer" : "backers"}
      </p>
      <h2>{session.title}</h2>
      <p>{session.minutes}</p>
      <ul className="arena-split group-split">
        {session.allocations.map((a) => {
          const c = cause(a.causeId);
          const domain = idx(c?.domain ?? "");
          return (
            <li key={a.causeId} style={{ ["--agent" as string]: `var(--${PALETTE[Math.max(0, domain) % PALETTE.length]})` }}>
              <span className="name">
                {c?.name ?? a.causeId}
                <span className="muted small">
                  {" "}
                  · {credits(a.units)} {c?.unit}
                </span>
              </span>
              <span className="num">{credits(a.credits)}</span>
              <span className="track" aria-hidden="true">
                <span className="fill" style={{ width: `${(a.credits / max) * 100}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      {session.reserve > 0 ? <p className="muted small">{credits(session.reserve)} credits held back by the 30% cap per cause.</p> : null}
      <div className="ask-views">
        {session.proposals.map((p) => (
          <article key={p.agentId} className="ask-view" style={{ ["--agent" as string]: `var(--${PALETTE[Math.max(0, idx(p.agentId)) % PALETTE.length]})` }}>
            <header>
              <Mark index={idx(p.agentId)} name={agent(p.agentId)?.name ?? p.agentId} />
              <span>{agent(p.agentId)?.name}</span>
              <span className="stance">weight {Math.round((session.influence[p.agentId] ?? 0) * 100)}%</span>
            </header>
            <p>
              <strong>&ldquo;{p.quote}&rdquo;</strong>
            </p>
            <p className="muted">{p.reasoning}</p>
          </article>
        ))}
      </div>
    </article>
  );
}

export function GroupPage({ id }: { id: string }) {
  const [data, setData] = useState<{ group: GroupCouncil; owner: boolean; backed: boolean } | null>(null);
  const [missing, setMissing] = useState(false);
  const [token, setToken] = useState<string | null>(() => readOwner(id));
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState({ name: "", message: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [convening, setConvening] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  usePageMeta(data ? `${data.group.name}` : "Group council", "A council of AI agents run by a group on Earthward AI.");

  // An owner link carries the token in the fragment, which never reaches the server's logs.
  useEffect(() => {
    const m = window.location.hash.match(/owner=([A-Za-z0-9_-]{20,64})/);
    if (m) {
      saveOwner(id, m[1]);
      setToken(m[1]);
      history.replaceState(null, "", window.location.pathname);
    }
  }, [id]);

  const load = useCallback(() => {
    api<{ group: GroupCouncil; owner: boolean; backed: boolean }>(`/api/groups/${id}`, { headers: token ? { "x-ew-owner": token } : {} })
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setMissing(true);
      });
  }, [id, token]);
  useEffect(() => {
    load();
  }, [load]);

  // While the agents debate, step through them so people can see who is speaking.
  const meeting = convening !== null;
  useEffect(() => {
    if (!meeting) return;
    const t = setInterval(() => setConvening((n) => (n === null ? null : n + 1)), 3500);
    return () => clearInterval(t);
  }, [meeting]);

  if (missing)
    return (
      <main id="main" className="page prose">
        <h1>There&apos;s no council at this link</h1>
        <p>
          Check the link, or <Link href="/councils">set up a council for your group</Link>.
        </p>
      </main>
    );
  if (!data)
    return (
      <main id="main" className="page group-page">
        <p className="muted">Loading the council…</p>
      </main>
    );

  const { group, owner, backed } = data;
  const share = `${window.location.origin}/c/${group.id}`;
  const latest = group.sessions.at(-1);
  const template = TEMPLATES.find((t) => t.id === group.template)?.label ?? "Custom council";

  const copy = (what: string, value: string) => void navigator.clipboard?.writeText(value).then(() => setCopied(what));

  async function back(e: FormEvent) {
    e.preventDefault();
    if (!pick) return;
    setMsg(null);
    try {
      await api(`/api/groups/${id}/pledge`, { method: "POST", body: JSON.stringify({ agentId: pick, name: note.name || undefined, message: note.message || undefined }) });
      setMsg({ kind: "ok", text: "Thanks. The council will hear it at the next session." });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "That didn't go through. Try again." });
    }
  }

  async function convene() {
    setMsg(null);
    setConvening(0);
    try {
      await api(`/api/groups/${id}/convene`, { method: "POST", headers: token ? { "x-ew-owner": token } : {} });
      load();
      document.getElementById("latest")?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "The council couldn't meet. Try again." });
    } finally {
      setConvening(null);
    }
  }

  const speaking = convening === null ? null : convening < group.spec.agents.length ? group.spec.agents[convening] : null;

  return (
    <main id="main" className="page group-page">
      <div className="prose">
        <p className="muted">Group council · {template}</p>
        <h1>{group.name}</h1>
        <p className="lede">
          {group.spec.agents.length} AI agents split {credits(group.budget)} virtual credits each session.{" "}
          {group.sessions.length ? `They have met ${group.sessions.length} ${group.sessions.length === 1 ? "time" : "times"}.` : "They haven't met yet."}
        </p>
      </div>

      <div className="group-share">
        <code>{share}</code>
        <button type="button" className="btn ghost small" onClick={() => copy("share", share)} data-track="group-copy">
          {copied === "share" ? "Copied" : "Copy link"}
        </button>
        {"share" in navigator ? (
          <button type="button" className="btn ghost small" onClick={() => void navigator.share({ title: group.name, url: share }).catch(() => undefined)} data-track="group-share">
            Share
          </button>
        ) : null}
      </div>

      {owner ? (
        <section className="group-owner" aria-labelledby="owner-title">
          <h2 id="owner-title">You run this council</h2>
          <p className="muted">
            {group.pledges.length} {group.pledges.length === 1 ? "member has" : "members have"} backed an agent since the last session. Convene whenever you&apos;re ready.
          </p>
          <button type="button" className="btn" disabled={convening !== null} onClick={convene} data-track="group-convene">
            {convening !== null ? "The council is meeting…" : "Convene the council"}
          </button>
          {convening !== null ? (
            <p className="group-speaking" role="status">
              {speaking ? `${speaking.name} is making the case for ${speaking.mandate.toLowerCase()}…` : "The clerk is writing the minutes. This takes about half a minute in all."}
            </p>
          ) : null}
          {token ? (
            <details>
              <summary>Your owner link</summary>
              <p className="muted small">
                Anyone with this link can convene the council. Keep it to yourself, or <Link href="/account">sign in</Link> to keep all your councils in one place on any device.
              </p>
              <button type="button" className="btn ghost small" onClick={() => copy("owner", `${share}#owner=${token}`)}>
                {copied === "owner" ? "Copied" : "Copy owner link"}
              </button>
            </details>
          ) : (
            <p className="muted small">
              Saved to <Link href="/account">your account</Link>, so you can run it from any device.
            </p>
          )}
        </section>
      ) : null}

      {msg ? <p className={msg.kind === "ok" ? "form-ok" : "form-error"}>{msg.text}</p> : null}

      {latest ? (
        <section id="latest" aria-label="Latest session">
          <SessionView session={latest} group={group} />
          <p className="no-print" style={{ marginTop: 16 }}>
            <button type="button" className="btn ghost small" onClick={() => window.print()} data-track="group-print">
              Print or save as PDF
            </button>{" "}
            <span className="muted small">A one-page report of this session for a class discussion or a team update.</span>
          </p>
        </section>
      ) : null}

      <section aria-labelledby="back-title">
        <h2 id="back-title">Back an agent</h2>
        {backed ? (
          <p className="muted">You&apos;ve backed an agent for the next session. Each backer adds weight to that agent&apos;s proposal when the council meets.</p>
        ) : (
          <form className="contact-form" onSubmit={back}>
            <div className="group-agents" role="radiogroup" aria-label="Agents">
              {group.spec.agents.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={pick === a.id}
                  className={`argue-option${pick === a.id ? " on" : ""}`}
                  style={{ ["--agent" as string]: `var(--${PALETTE[i % PALETTE.length]})` }}
                  onClick={() => setPick(a.id)}
                >
                  <span className="group-agent-head">
                    <Mark index={i} name={a.name} />
                    <span className="name">{a.name}</span>
                  </span>
                  <span className="muted small">{a.mandate}</span>
                </button>
              ))}
            </div>
            <div className="row">
              <div>
                <label className="field-label" htmlFor="p-name">
                  Your name (optional)
                </label>
                <input id="p-name" className="text-input" maxLength={40} value={note.name} onChange={(e) => setNote({ ...note, name: e.target.value })} />
              </div>
            </div>
            <label className="field-label" htmlFor="p-msg">
              Why? (optional, the agents read it)
            </label>
            <textarea id="p-msg" className="text-input" rows={2} maxLength={200} value={note.message} onChange={(e) => setNote({ ...note, message: e.target.value })} />
            <button className="btn" type="submit" disabled={!pick} data-track="group-back">
              Back {pick ? group.spec.agents.find((a) => a.id === pick)?.name : "an agent"}
            </button>
          </form>
        )}
        {group.pledges.length ? (
          <ul className="group-notes">
            {group.pledges
              .slice(-20)
              .reverse()
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.name ?? "Someone"}</strong> backed {group.spec.agents.find((a) => a.id === p.agentId)?.name}
                  {p.message ? <span className="muted">: &ldquo;{p.message}&rdquo;</span> : null}
                </li>
              ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="causes-title">
        <h2 id="causes-title">What the council can fund</h2>
        <ul className="group-causes">
          {group.spec.causes.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong>
              <span className="muted">{c.summary}</span>
            </li>
          ))}
        </ul>
      </section>

      {group.sessions.length > 1 ? (
        <section aria-labelledby="earlier-title">
          <h2 id="earlier-title">Earlier sessions</h2>
          {group.sessions
            .slice(0, -1)
            .reverse()
            .map((s) => (
              <details key={s.n} className="group-earlier">
                <summary>
                  Session {s.n}: {s.title}
                </summary>
                <SessionView session={s} group={group} />
              </details>
            ))}
        </section>
      ) : null}

      <p className="muted small" style={{ marginTop: 48 }}>
        Credits are virtual. This council runs on the open-source engine behind <Link href="/">Earthward AI</Link>.{" "}
        <Link href="/councils">Set up a council for your own group.</Link>
      </p>
    </main>
  );
}
