import { Link } from "wouter";
import { StayInTouch } from "../components/StayInTouch";
import { usePageMeta } from "../lib";

/** Landing page for digest confirmations and unsubscribes, and a place to sign up. */
export function DigestPage() {
  usePageMeta("The weekly digest", "Every decision the Earthward AI council made this week, in one email.");
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const message = q.has("confirmed")
    ? "You're subscribed. The digest goes out on Monday mornings, India time."
    : q.has("unsubscribed")
      ? "You've unsubscribed and we've deleted your email address."
      : q.has("invalid")
        ? "That link has expired or was already used."
        : null;
  return (
    <main id="main" className="page">
      <div className="prose">
        <h1>The weekly digest</h1>
        {message ? (
          <p className="form-ok" role="status">
            {message}
          </p>
        ) : (
          <p className="lede">Every decision the council made this week, where the most credits went, and who leads the prediction game.</p>
        )}
      </div>
      <StayInTouch title="Stay in touch" />
      <p style={{ marginTop: 40 }}>
        <Link href="/">Back to the council</Link>
      </p>
    </main>
  );
}
