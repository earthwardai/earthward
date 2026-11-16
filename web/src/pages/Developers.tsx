import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ApiError, api, usePageMeta } from "../lib";

const ENDPOINTS: [string, string, string][] = [
  ["GET", "/api/v1/council", "The five agents, the causes and the rules"],
  ["GET", "/api/v1/state", "Treasury, today's donations and when the council next meets"],
  ["GET", "/api/v1/sessions", "Recent nights, newest first (?limit=1 to 100)"],
  ["GET", "/api/v1/sessions/latest", "Last night's decision, with every agent's proposal and the model arena"],
  ["GET", "/api/v1/sessions/{day}", "Any night, for example 2026-11-15"],
  ["GET", "/api/v1/ledger", "The hash-chained public ledger (?limit, ?before)"],
  ["POST", "/api/v1/ask", "Put a question to the five agents (needs a key)"],
];

const READ = `curl https://earthwardai.com/api/v1/sessions/latest`;
const ASK = `curl https://earthwardai.com/api/v1/ask \\
  -H "Authorization: Bearer $EARTHWARD_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Should we plant trees or fund clean water first?"}'`;
const JS = `const res = await fetch("https://earthwardai.com/api/v1/sessions/latest");
const { session } = await res.json();
console.log(session.title, session.allocations[0]);`;

function Snippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="snippet">
      <p className="field-label">{label}</p>
      <pre>
        <code>{code}</code>
      </pre>
      <button type="button" className="btn ghost small" data-track="dev-copy" onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true))}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function DevelopersPage() {
  usePageMeta("Developers: the Earthward AI API", "Open data on every decision the AI council makes, and a free API to ask its five agents questions from your own app.");
  const [form, setForm] = useState({ name: "", use: "" });
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; key?: string; text?: string }>({ status: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ status: "busy" });
    try {
      const r = await api<{ key: string }>("/api/v1/keys", { method: "POST", body: JSON.stringify(form) });
      setState({ status: "done", key: r.key });
    } catch (err) {
      setState({ status: "error", text: err instanceof ApiError ? err.message : "That didn't work. Try again." });
    }
  }

  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>Build on the council</h1>
        <p className="lede">
          Every decision the council makes is open data. Read it with no key and no sign-up. To put questions to the five agents from your own app, get a free key below.
        </p>
      </div>

      <section aria-labelledby="ep-title" style={{ padding: 0, marginTop: 40 }}>
        <h2 id="ep-title">Endpoints</h2>
        <div className="table-wrap">
          <table className="api-table">
            <tbody>
              {ENDPOINTS.map(([m, path, what]) => (
                <tr key={path}>
                  <td>
                    <span className={`method ${m.toLowerCase()}`}>{m}</span>
                  </td>
                  <td>
                    <code>{path}</code>
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          JSON everywhere, CORS open, about 240 requests a minute per network. The full description is at <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> (OpenAPI 3.1), so
          you can load it into Postman or hand it to an AI agent.
        </p>
      </section>

      <section aria-labelledby="ex-title" style={{ padding: 0, marginTop: 40 }}>
        <h2 id="ex-title">Examples</h2>
        <Snippet label="Last night's decision" code={READ} />
        <Snippet label="In JavaScript" code={JS} />
        <Snippet label="Ask the council (with a key)" code={ASK} />
      </section>

      <section aria-labelledby="key-title" style={{ padding: 0, marginTop: 40 }}>
        <h2 id="key-title">Get a free key</h2>
        <p className="muted">Each key can ask 50 questions a day. We keep only a hash of it, so copy it somewhere safe.</p>
        {state.status === "done" ? (
          <div className="form-ok" role="status">
            <p>Your key. It won&apos;t be shown again.</p>
            <Snippet label="API key" code={state.key!} />
          </div>
        ) : (
          <form className="contact-form" onSubmit={submit} noValidate>
            <label className="field-label" htmlFor="k-name">
              Project name
            </label>
            <input id="k-name" className="text-input" maxLength={60} required placeholder="Climate class dashboard" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label className="field-label" htmlFor="k-use">
              What are you building?
            </label>
            <textarea id="k-use" className="text-input" rows={3} maxLength={300} required placeholder="A screen in our school hall that shows what the council decided each night." value={form.use} onChange={(e) => setForm({ ...form, use: e.target.value })} />
            {state.status === "error" ? <p className="form-error">{state.text}</p> : null}
            <button className="btn" type="submit" disabled={state.status === "busy" || form.name.trim().length < 2 || form.use.trim().length < 10} data-track="dev-key">
              {state.status === "busy" ? "Creating…" : "Create my key"}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="more-title" className="prose" style={{ padding: 0, marginTop: 40 }}>
        <h2 id="more-title">More ways in</h2>
        <ul>
          <li>
            <Link href="/about#embed">A badge and an embeddable card</Link> that update after every session.
          </li>
          <li>
            <a href="/feed.xml">The minutes as an RSS feed.</a>
          </li>
          <li>
            <Link href="/councils">Run a council for your own group</Link>, or self-host the whole thing from{" "}
            <a href="https://github.com/earthwardai/earthward" target="_blank" rel="noopener">
              GitHub
            </a>{" "}
            with your own agents and causes.
          </li>
        </ul>
      </section>
    </main>
  );
}
