import { useCallback, useEffect, useState, type FormEvent } from "react";
import { agentById } from "../../../shared/agents";
import type { Session, Treasury } from "../../../shared/types";
import { api, ApiError, countryName, credits } from "../lib";

interface DayStats {
  day: string;
  views: number;
  clicks: number;
  batches: number;
  uniques: number;
  donations: number;
  paths: Record<string, number>;
  targets: Record<string, number>;
  countries: Record<string, number>;
  referrers: Record<string, number>;
  campaigns?: Record<string, number>;
  humanViews?: number;
  humanUniques?: number;
  asks?: number;
}

interface Visit {
  at: string;
  ip: string;
  country: string | null;
  ua: string;
  vid: string;
  sid: string;
  events: { t: string; p: string; target?: string }[];
  screen: { w: number; h: number } | null;
  lang: string | null;
}

interface Overview {
  stats: DayStats[];
  visits: Visit[];
  donations: { at: string; amount: number; name: string | null; agentId: string | null; country: string | null; ipHash: string; vid: string | null; seq: number }[];
  security: { at: string; kind: string; ip: string; path: string; detail?: string }[];
  messages: { at: string; kind?: string; page?: string | null; name: string | null; email: string | null; message: string; ip: string; country: string | null }[];
  treasury: Treasury;
  sessions: Session[];
  github: { repo: string; stars: number | null; forks: number | null; issues: number | null } | null;
  nominations: { id: string; name: string; place: string | null; summary: string; status: string; votes: number; at: string; email?: string | null }[];
  timeZone: string;
}

/** People rather than bots. Days recorded before the split existed fall back to the total. */
const humans = (d: DayStats | undefined) => (d ? (d.humanUniques ?? d.uniques) : 0);
const pctOf = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%` : "–");

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function browser(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Other";
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /bot|crawl|spider/i.test(ua) ? "Bot" : "Other";
  return `${b} on ${os}`;
}

function sumMaps(stats: DayStats[], key: "paths" | "targets" | "countries" | "referrers" | "campaigns") {
  const out: Record<string, number> = {};
  for (const s of stats) for (const [k, v] of Object.entries(s[key] ?? {})) out[k] = (out[k] ?? 0) + v;
  return Object.entries(out)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
}

function HBars({ rows, label, format = (k: string) => k }: { rows: [string, number][]; label: string; format?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      <h3 style={{ fontSize: 20, marginBottom: 14 }}>{label}</h3>
      {rows.length ? (
        <div className="hbars">
          {rows.map(([k, v]) => (
            <div key={k} className="hbar">
              <span>{format(k)}</span>
              <span className="num r" style={{ textAlign: "right" }}>
                {credits(v)}
              </span>
              <div className="track">
                <div className="fill" style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No data yet.</p>
      )}
    </div>
  );
}

function DailyVisitors({ stats }: { stats: DayStats[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...stats.map((s) => s.uniques));
  const shown = hover === null ? stats.at(-1) : stats[hover];
  return (
    <div>
      <h3 style={{ fontSize: 20 }}>Unique visitors per day</h3>
      <p className="muted num" style={{ margin: "4px 0 0" }} role="status">
        {shown
          ? `${shown.day}: ${credits(humans(shown))} people (${credits(shown.uniques)} including bots), ${credits(shown.views)} page views, ${credits(shown.clicks)} clicks, ${credits(shown.donations)} donations, ${credits(shown.asks ?? 0)} questions`
          : ""}
      </p>
      <div className="bars" onMouseLeave={() => setHover(null)}>
        {stats.map((s, i) => (
          <button
            key={s.day}
            type="button"
            className="b"
            style={{ height: `${Math.max(1, (s.uniques / max) * 100)}%`, border: 0, padding: 0, cursor: "default" }}
            aria-label={`${s.day}: ${s.uniques} visitors`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
          />
        ))}
      </div>
      <div className="bar-axis num">
        <span>{stats[0]?.day}</span>
        <span>{stats.at(-1)?.day}</span>
      </div>
    </div>
  );
}

export function AdminPage() {
  const [who, setWho] = useState<{ ip: string; signedIn: boolean } | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [council, setCouncil] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const w = await api<{ ip: string; signedIn: boolean }>("/api/admin/whoami");
      setWho(w);
      if (w.signedIn) setData(await api<Overview>("/api/admin/overview"));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "The admin area only opens over the Earthward VPN." : "Couldn't load the dashboard.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ key }) });
      setKey("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
    }
  }

  async function runCouncil() {
    setCouncil("The council is meeting. This takes up to a minute…");
    try {
      const r = await api<{ status: string; day?: string }>("/api/admin/council", { method: "POST" });
      setCouncil(r.status === "created" ? "Session recorded." : "Today's session already exists.");
      await load();
    } catch (err) {
      setCouncil(err instanceof ApiError ? err.message : "The session failed.");
    }
  }

  const [nominationNote, setNominationNote] = useState<string | null>(null);
  async function setNomination(id: string, status: "approved" | "rejected") {
    await api(`/api/admin/nominations/${id}`, { method: "POST", body: JSON.stringify({ status }) }).catch(() => undefined);
    await load();
  }
  async function runRound() {
    setNominationNote("The council is debating the shortlist…");
    try {
      await api("/api/admin/nominations-round", { method: "POST" });
      setNominationNote("Round recorded. It's on /nominate.");
      await load();
    } catch (err) {
      setNominationNote(err instanceof ApiError ? err.message : "The round failed.");
    }
  }

  async function logout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    setData(null);
    await load();
  }

  if (error && !who) {
    return (
      <main id="main" className="page">
        <h1>Admin</h1>
        <p className="lede">{error}</p>
      </main>
    );
  }

  if (who && !who.signedIn) {
    return (
      <main id="main" className="page">
        <h1>Admin</h1>
        <p className="lede num">Connected from {who.ip}. Enter the admin key to continue.</p>
        <form onSubmit={login} style={{ maxWidth: 420, marginTop: 32 }}>
          <label className="field-label" htmlFor="admin-key">
            Admin key
          </label>
          <input id="admin-key" className="text-input" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="session-nav">
            <button className="btn" type="submit">
              Sign in
            </button>
          </div>
        </form>
      </main>
    );
  }

  if (!data) return <main id="main" className="page"><p className="muted">Loading…</p></main>;

  const today = data.stats.at(-1);
  const week = data.stats.slice(-7);
  const sum = (k: keyof Pick<DayStats, "uniques" | "views" | "clicks" | "donations">) => week.reduce((s, d) => s + d[k], 0);
  const people7 = week.reduce((n, d) => n + humans(d), 0);
  const cutoff = Date.now() - 30 * 60_000;
  const live = new Set(data.visits.filter((v) => new Date(v.at).getTime() > cutoff).map((v) => v.vid)).size;
  const devices: [string, number][] = (() => {
    const seen = new Map<string, string>();
    for (const v of data.visits) if (v.screen && !seen.has(v.vid)) seen.set(v.vid, v.screen.w < 768 ? "Phone" : v.screen.w < 1100 ? "Tablet or small laptop" : "Desktop");
    const counts: Record<string, number> = {};
    for (const d of seen.values()) counts[d] = (counts[d] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  return (
    <main id="main" className="page admin">
      <div className="section-head">
        <div>
          <h1>Admin</h1>
          <p className="lede num">
            Signed in from {who?.ip}. Days run on {data.timeZone} time.
          </p>
        </div>
        <div className="session-nav">
          <button className="btn ghost small" type="button" onClick={() => void load()}>
            Refresh
          </button>
          <button className="btn ghost small" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </div>

      <dl className="kpis num">
        <div className="kpi"><dt>Live now (30 min)</dt><dd>{credits(live)}</dd></div>
        <div className="kpi"><dt>People today</dt><dd>{credits(humans(today))}</dd></div>
        <div className="kpi"><dt>Bots today</dt><dd>{credits(Math.max(0, (today?.uniques ?? 0) - humans(today)))}</dd></div>
        <div className="kpi"><dt>Questions asked today</dt><dd>{credits(today?.asks ?? 0)}</dd></div>
        <div className="kpi"><dt>Donations today</dt><dd>{credits(today?.donations ?? 0)}</dd></div>
        <div className="kpi"><dt>People, 7 days</dt><dd>{credits(people7)}</dd></div>
        <div className="kpi"><dt>Donation rate, 7 days</dt><dd>{pctOf(sum("donations"), people7)}</dd></div>
        <div className="kpi"><dt>Questions, 7 days</dt><dd>{credits(week.reduce((n, d) => n + (d.asks ?? 0), 0))}</dd></div>
        <div className="kpi"><dt>Page views today</dt><dd>{credits(today?.views ?? 0)}</dd></div>
        <div className="kpi"><dt>Messages, 7 days</dt><dd>{credits(data.messages.filter((m) => Date.now() - new Date(m.at).getTime() < 7 * 86_400_000).length)}</dd></div>
        <div className="kpi"><dt>Treasury</dt><dd>{credits(data.treasury.balance)}</dd></div>
        {data.github ? (
          <div className="kpi">
            <dt>GitHub stars</dt>
            <dd>
              <a href={`https://github.com/${data.github.repo}`} target="_blank" rel="noopener">
                {data.github.stars === null ? "–" : credits(data.github.stars)}
              </a>
            </dd>
          </div>
        ) : null}
        {data.github ? <div className="kpi"><dt>Forks, open issues</dt><dd>{data.github.forks ?? "–"}, {data.github.issues ?? "–"}</dd></div> : null}
      </dl>

      <div className="panel">
        <DailyVisitors stats={data.stats} />
      </div>

      <div className="panel grid-2">
        <HBars label="Top pages, 14 days" rows={sumMaps(data.stats, "paths")} format={(k) => k.replace(/_/g, "/")} />
        <HBars label="Top clicks, 14 days" rows={sumMaps(data.stats, "targets")} format={(k) => k.replace(/_/g, " ")} />
        <HBars label="Countries, 14 days" rows={sumMaps(data.stats, "countries")} format={(k) => countryName(k) ?? k} />
        <HBars label="Referrers, 14 days" rows={sumMaps(data.stats, "referrers")} format={(k) => k.replace(/_/g, ".")} />
        <HBars label="Campaigns (utm source and campaign), 14 days" rows={sumMaps(data.stats, "campaigns")} format={(k) => k.replace(/_/, ": ")} />
        <HBars label="Devices, recent visitors" rows={devices} />
      </div>

      <section className="panel" style={{ width: "auto", padding: 0 }}>
        <h2>Council</h2>
        <p className="muted">
          Last session: {data.sessions[0] ? `${data.sessions[0].day}, ${credits(data.sessions[0].spent)} credits spent, model ${data.sessions[0].model}` : "none yet"}.
        </p>
        <div className="session-nav">
          <button className="btn small" type="button" onClick={runCouncil}>
            Run today's session now
          </button>
          {council ? <p className="muted" role="status">{council}</p> : null}
        </div>
      </section>

      <section className="panel" style={{ width: "auto", padding: 0 }}>
        <div className="section-head">
          <h2>Cause nominations</h2>
          <button className="btn ghost small" type="button" onClick={runRound}>
            Run the monthly round now
          </button>
        </div>
        {nominationNote ? <p className="hint">{nominationNote}</p> : null}
        {data.nominations?.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Cause</th>
                  <th>Status</th>
                  <th>Support</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.nominations.map((n) => (
                  <tr key={n.id}>
                    <td className="num">{time(n.at)}</td>
                    <td>
                      <strong>{n.name}</strong>
                      {n.place ? `, ${n.place}` : ""}
                      <div className="muted">{n.summary}</div>
                      {n.email ? <a href={`mailto:${n.email}`}>{n.email}</a> : null}
                    </td>
                    <td>{n.status}</td>
                    <td className="num">{n.votes}</td>
                    <td>
                      {n.status !== "approved" && n.status !== "chosen" ? (
                        <button className="btn ghost small" type="button" onClick={() => setNomination(n.id, "approved")}>
                          Approve
                        </button>
                      ) : null}{" "}
                      {n.status !== "rejected" && n.status !== "chosen" ? (
                        <button className="btn ghost small" type="button" onClick={() => setNomination(n.id, "rejected")}>
                          Reject
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No nominations yet.</p>
        )}
      </section>

      <section className="panel" style={{ width: "auto", padding: 0 }}>
        <h2>Messages</h2>
        {data.messages?.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>From</th>
                  <th>Message</th>
                  <th>IP</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {data.messages.map((m, i) => (
                  <tr key={`${m.at}-${i}`}>
                    <td className="num">{time(m.at)}</td>
                    <td>
                      {m.kind ?? "feedback"}
                      {m.page ? <div className="muted">{m.page}</div> : null}
                    </td>
                    <td>
                      {m.name ?? "Anonymous"}
                      {m.email ? (
                        <>
                          <br />
                          <a href={`mailto:${m.email}`}>{m.email}</a>
                        </>
                      ) : null}
                    </td>
                    <td className="wrap">{m.message}</td>
                    <td className="num">{m.ip}</td>
                    <td>{countryName(m.country) ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No messages yet.</p>
        )}
      </section>

      <section className="panel" style={{ width: "auto", padding: 0 }}>
        <h2>Recent visits</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Time</th>
                <th>IP</th>
                <th>Country</th>
                <th>Browser</th>
                <th>Screen</th>
                <th>Pages</th>
                <th className="r">Clicks</th>
                <th>Visitor</th>
              </tr>
            </thead>
            <tbody>
              {data.visits.map((v, i) => (
                <tr key={`${v.at}-${i}`}>
                  <td className="num">{time(v.at)}</td>
                  <td className="num">{v.ip}</td>
                  <td>{countryName(v.country) ?? "Unknown"}</td>
                  <td title={v.ua}>{browser(v.ua)}</td>
                  <td className="num">{v.screen ? `${v.screen.w}×${v.screen.h}` : ""}</td>
                  <td className="wrap">{[...new Set(v.events.filter((e) => e.t === "view").map((e) => e.p))].join(", ")}</td>
                  <td className="r num">{v.events.filter((e) => e.t === "click").length}</td>
                  <td className="num" title={v.vid}>{v.vid.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ width: "auto", padding: 0 }}>
        <h2>Recent donations</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Time</th>
                <th className="r">Credits</th>
                <th>Name</th>
                <th>Backing</th>
                <th>Country</th>
                <th>IP hash</th>
                <th>Visitor</th>
              </tr>
            </thead>
            <tbody>
              {data.donations.map((d) => (
                <tr key={d.seq}>
                  <td className="num">#{d.seq}</td>
                  <td className="num">{time(d.at)}</td>
                  <td className="r num">{credits(d.amount)}</td>
                  <td>{d.name ?? "Anonymous"}</td>
                  <td>{d.agentId ? agentById(d.agentId)?.name : ""}</td>
                  <td>{countryName(d.country) ?? "Unknown"}</td>
                  <td className="num">{d.ipHash.slice(0, 10)}</td>
                  <td className="num">{d.vid?.slice(0, 8) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" style={{ width: "auto", padding: 0 }}>
        <h2>Security events</h2>
        {data.security.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>IP</th>
                  <th>Path</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.security.map((s, i) => (
                  <tr key={`${s.at}-${i}`}>
                    <td className="num">{time(s.at)}</td>
                    <td>{s.kind.replace(/_/g, " ")}</td>
                    <td className="num">{s.ip}</td>
                    <td>{s.path}</td>
                    <td>{s.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No blocked requests recorded.</p>
        )}
      </section>
    </main>
  );
}
