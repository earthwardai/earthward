import "@fontsource-variable/bodoni-moda/opsz.css";
import "@fontsource-variable/hanken-grotesk";
import "./styles.css";

import { StrictMode, useEffect } from "react";
import { AGENTS } from "../../shared/agents";
import { createRoot } from "react-dom/client";
import { Link, Route, Switch, useLocation } from "wouter";
import { ChangelogPage, ClassroomPage, MatchPage, PlansPage, PressPage, StatusPage } from "./pages/Product";
import { AccountPage, SignInPage, useMe } from "./pages/Account";
import { DonateDialog, openDonate } from "./components/DonateDialog";
import { ago, useLiveState, useNow, useTheme } from "./lib";
import { AdminPage } from "./pages/Admin";
import { AgentPage, CausePage, EarthAiPage, GlobalAiPage } from "./pages/Explore";
import { AskPage, ImpactPage } from "./pages/Features";
import { Home } from "./pages/Home";
import { AboutPage, ContactPage, HowItWorksPage, LedgerPage, NotFound, PrivacyPage, SessionPage, TermsPage } from "./pages/Pages";
import { startTracking, trackView } from "./track";
import { FeedbackButton } from "./components/Feedback";
import { LaunchPill } from "./components/LaunchPill";
import { PredictPage } from "./pages/Predict";
import { NominatePage } from "./pages/Nominate";
import { DevelopersPage } from "./pages/Developers";
import { CouncilsPage, GroupPage } from "./pages/Groups";
import { DigestPage } from "./pages/Digest";
import { LocalePage } from "./pages/Locale";

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

function StarButton() {
  const github = useLiveState()?.links.github;
  if (!github) return null;
  return (
    <a className="star-btn" href={github.url} target="_blank" rel="noopener" data-track="nav-github-star" aria-label={`Star Earthward AI on GitHub${github.stars ? `, ${github.stars} stars` : ""}`}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path fill="currentColor" d="M8 .2a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.3.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.7-3.6 3.9.3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2Z" />
      </svg>
      <span className="star-label">Star</span>
      {github.stars !== null ? <span className="star-count num">{github.stars.toLocaleString("en")}</span> : null}
    </a>
  );
}

function AccountLink({ current }: { current: (href: string) => "page" | undefined }) {
  const me = useMe();
  if (!me) return null;
  return me.signedIn ? (
    <Link className="hide-sm" href="/account" aria-current={current("/account")} data-track="nav-account">
      Account
    </Link>
  ) : (
    <Link className="hide-sm" href="/signin" aria-current={current("/signin")} data-track="nav-signin">
      Sign in
    </Link>
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
        <Link className="hide-sm" href="/predict" aria-current={current("/predict")}>
          Predict
        </Link>
        <Link className="hide-sm" href="/ask" aria-current={current("/ask")}>
          Ask
        </Link>
        <Link className="hide-sm" href="/ledger" aria-current={current("/ledger")}>
          Ledger
        </Link>
        <AccountLink current={current} />
        <StarButton />
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
              <a href="/#council">Tonight's council</a>
            </li>
            <li>
              <Link href="/match">Which agent are you?</Link>
            </li>
            <li>
              <Link href="/predict">Predict tonight</Link>
            </li>
            <li>
              <Link href="/ask">Ask the council</Link>
            </li>
            <li>
              <Link href="/ledger">Ledger</Link>
            </li>
            <li>
              <Link href="/digest">Email updates</Link>
            </li>
            <li>
              <Link href="/changelog">What's new</Link>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="f-explore">
          <h2 id="f-explore">For groups</h2>
          <ul>
            <li>
              <Link href="/councils">Run a council for your group</Link>
            </li>
            <li>
              <Link href="/classroom">For classrooms</Link>
            </li>
            <li>
              <Link href="/plans">Plans for schools and organisations</Link>
            </li>
            <li>
              <Link href="/nominate">Nominate a cause</Link>
            </li>
            <li>
              <Link href="/developers">Developers and API</Link>
            </li>
            <li>
              <a href="/feed.xml">Minutes feed (RSS)</a>
            </li>
            <li>
              <Link href="/es">Español</Link> · <Link href="/hi">हिन्दी</Link>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="f-agents">
          <h2 id="f-agents">The agents</h2>
          <ul>
            {AGENTS.map((a) => (
              <li key={a.id}>
                <Link href={`/agents/${a.id}`}>{a.name}</Link>
              </li>
            ))}
            <li>
              <Link href="/earth-ai">Earth AI</Link>
            </li>
            <li>
              <Link href="/global-ai-council">Global AI council</Link>
            </li>
          </ul>
        </nav>
        <nav aria-labelledby="f-company">
          <h2 id="f-company">Company</h2>
          <ul>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/contact">Contact and feedback</Link>
            </li>
            <li>
              <Link href="/account">Your account</Link>
            </li>
            <li>
              <Link href="/press">Press kit</Link>
            </li>
            <li>
              <Link href="/status">Status</Link>
            </li>
            <li>
              <a href="https://github.com/earthwardai/earthward" target="_blank" rel="noopener" data-track="footer-github">
                Star us on GitHub
              </a>
            </li>
            <li>
              <a href="https://x.com/earthwardai" target="_blank" rel="noopener" data-track="footer-x">
                Follow on X
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/earthwardai.com" target="_blank" rel="me noopener" data-track="footer-bluesky">
                Follow on Bluesky
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
        <Route path="/ask" component={AskPage} />
        <Route path="/predict" component={PredictPage} />
        <Route path="/nominate" component={NominatePage} />
        <Route path="/developers" component={DevelopersPage} />
        <Route path="/councils" component={CouncilsPage} />
        <Route path="/digest" component={DigestPage} />
        <Route path="/es">{() => <LocalePage lang="es" />}</Route>
        <Route path="/hi">{() => <LocalePage lang="hi" />}</Route>
        <Route path="/c/:id">{(p) => <GroupPage id={p.id} />}</Route>
        <Route path="/impact/:id">{(p) => <ImpactPage id={p.id} />}</Route>
        <Route path="/match" component={MatchPage} />
        <Route path="/changelog" component={ChangelogPage} />
        <Route path="/classroom" component={ClassroomPage} />
        <Route path="/press" component={PressPage} />
        <Route path="/status" component={StatusPage} />
        <Route path="/plans" component={PlansPage} />
        <Route path="/signin" component={SignInPage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
      <Footer />
      <DonateDialog />
      <LaunchPill />
      <FeedbackButton />
    </>
  );
}

startTracking();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
