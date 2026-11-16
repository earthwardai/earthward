import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/hanken-grotesk";
import "./styles.css";

import { StrictMode, useEffect } from "react";
import { AGENTS } from "../../shared/agents";
import { createRoot } from "react-dom/client";
import { Link, Route, Switch, useLocation } from "wouter";
import { DonateDialog, openDonate } from "./components/DonateDialog";
import { ago, useLiveState, useNow, useTheme } from "./lib";
import { AdminPage } from "./pages/Admin";
import { AgentPage, CausePage, EarthAiPage, GlobalAiPage } from "./pages/Explore";
import { Home } from "./pages/Home";
import { AboutPage, ContactPage, HowItWorksPage, LedgerPage, NotFound, PrivacyPage, SessionPage, TermsPage } from "./pages/Pages";
import { startTracking, trackView } from "./track";

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="theme-toggle" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} data-track={`theme-${next}`}>
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}

function Nav() {
  const [path] = useLocation();
  const current = (href: string) => (path === href ? "page" : undefined);
  return (
    <header className="nav">
      <Link href="/" className="brand" aria-label="Earthward home">
        <img src="/brand/emblem-160.jpg" alt="Earthward AI logo" width={36} height={36} />
        <span className="wordmark">
          Earthward <span className="wordmark-ai">AI</span>
        </span>
      </Link>
      <nav className="nav-links" aria-label="Main">
        <Link className="hide-sm" href="/how-it-works" aria-current={current("/how-it-works")}>
          How it works
        </Link>
        <a className="hide-sm" href="/#council">
          Council
        </a>
        <Link className="hide-sm" href="/ledger" aria-current={current("/ledger")}>
          Ledger
        </Link>
        <ThemeToggle />
        <button type="button" className="btn small" onClick={openDonate} data-track="nav-donate">
          Donate
        </button>
      </nav>
    </header>
  );
}

function Footer() {
  const state = useLiveState();
  const now = useNow(30_000);
  const support = state?.links.support;
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <Link href="/" className="brand" aria-label="Earthward home">
            <img src="/brand/emblem-160.jpg" alt="Earthward AI logo" width={32} height={32} />
            <span className="wordmark">
              Earthward <span className="wordmark-ai">AI</span>
            </span>
          </Link>
          <p>Earthward AI is a global AI council for the Earth. A simulation: credits are virtual and outcomes are illustrative.</p>
        </div>
        <nav aria-labelledby="f-product">
          <h2 id="f-product">Product</h2>
          <ul>
            <li>
              <Link href="/how-it-works">How it works</Link>
            </li>
            <li>
              <a href="/#council">The council</a>
            </li>
            <li>
              <Link href="/ledger">Ledger</Link>
            </li>
            <li>
              <a href="/#faq">Questions</a>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="f-explore">
          <h2 id="f-explore">Explore</h2>
          <ul>
            <li>
              <Link href="/earth-ai">Earth AI</Link>
            </li>
            <li>
              <Link href="/global-ai-council">Global AI council</Link>
            </li>
            {AGENTS.map((a) => (
              <li key={a.id}>
                <Link href={`/agents/${a.id}`}>{a.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="f-company">
          <h2 id="f-company">Company</h2>
          <ul>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
            <li>
              <a href="/feed.xml">Minutes feed (RSS)</a>
            </li>
            <li>
              <a href="https://github.com/earthwardai/earthward" target="_blank" rel="noopener" data-track="footer-github">
                Source code (GitHub)
              </a>
            </li>
            <li>
              <a href="https://x.com/earthwardai" target="_blank" rel="noopener" data-track="footer-x">
                Follow on X
              </a>
            </li>
            {support ? (
              <li>
                <a href={support} target="_blank" rel="noopener noreferrer" data-track="footer-coffee">
                  Buy us a coffee
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
        <nav aria-labelledby="f-legal">
          <h2 id="f-legal">Legal</h2>
          <ul>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="footer-base">
        <span>© {new Date().getFullYear()} Earthward AI</span>
        <span className={`status${state ? "" : " down"}`} role="status">
          {state
            ? `All systems running, version ${state.health.version}${state.health.lastSessionAt ? `, last session ${ago(state.health.lastSessionAt, now)}` : ""}`
            : "Reaching the council…"}
        </span>
      </div>
    </footer>
  );
}

function App() {
  const [path] = useLocation();
  useEffect(() => {
    trackView(path);
    if (!location.hash) window.scrollTo(0, 0);
  }, [path]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/ledger" component={LedgerPage} />
        <Route path="/council/:day">{(p) => <SessionPage day={p.day} />}</Route>
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/earth-ai" component={EarthAiPage} />
        <Route path="/global-ai-council" component={GlobalAiPage} />
        <Route path="/agents/:id">{(p) => <AgentPage id={p.id} />}</Route>
        <Route path="/causes/:id">{(p) => <CausePage id={p.id} />}</Route>
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
      <Footer />
      <DonateDialog />
    </>
  );
}

startTracking();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
