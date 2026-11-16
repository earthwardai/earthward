import { useEffect } from "react";
import { Link } from "wouter";
import { AGENTS } from "../../../shared/agents";
import { LOCALES, type Locale } from "../../../shared/locales";
import { Sigil } from "../components/Sigil";
import { credits, useLiveState, usePageMeta } from "../lib";

/** /es and /hi: the council explained in Spanish or Hindi, linking into the English site. */
export function LocalePage({ lang }: { lang: Locale }) {
  const t = LOCALES[lang];
  usePageMeta(t.title, t.description);
  const state = useLiveState();
  const session = state?.latestSession ?? null;

  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "en";
    };
  }, [lang]);

  return (
    <main id="main" className="page locale" lang={lang}>
      <p className="locale-switch">
        <Link href="/">English</Link> · <Link href="/es">Español</Link> · <Link href="/hi">हिन्दी</Link>
      </p>
      <div className="prose">
        <h1>{t.h1}</h1>
        <p className="lede">{t.lede}</p>
      </div>

      <div className="locale-ctas">
        {session ? (
          <Link href={`/council/${session.day}#replay`} className="btn" data-track={`locale-${lang}-debate`}>
            {t.cta.debate}
          </Link>
        ) : null}
        <Link href="/predict" className="btn ghost" data-track={`locale-${lang}-predict`}>
          {t.cta.predict}
        </Link>
        <Link href="/councils" className="btn ghost" data-track={`locale-${lang}-councils`}>
          {t.cta.councils}
        </Link>
        <Link href="/ask" className="btn ghost" data-track={`locale-${lang}-ask`}>
          {t.cta.ask}
        </Link>
      </div>

      {session ? (
        <section aria-labelledby="ln-title">
          <h2 id="ln-title">{t.lastNight}</h2>
          <p>
            <strong>{session.title}</strong> <span className="muted">{t.englishNote}</span>
          </p>
          <p className="field-label">{t.topCauses}</p>
          <ol className="locale-causes">
            {session.allocations.slice(0, 3).map((a) => (
              <li key={a.causeId}>
                {t.causes[a.causeId] ?? a.causeId} <span className="num muted">{credits(a.credits)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="how-title">
        <h2 id="how-title">{t.howTitle}</h2>
        <ol className="group-steps">
          {t.steps.map((s) => (
            <li key={s}>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ag-title">
        <h2 id="ag-title">{t.agentsTitle}</h2>
        <ul className="locale-agents">
          {AGENTS.map((a) => (
            <li key={a.id} style={{ ["--agent" as string]: `var(--${a.id})` }}>
              <Sigil agent={a.id} />
              <Link href={`/agents/${a.id}`}>{a.name}</Link>
              <span className="muted">{t.mandates[a.id]}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="muted small" style={{ marginTop: 40 }}>
        {t.footnote}
      </p>
    </main>
  );
}
