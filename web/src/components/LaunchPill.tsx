import { useState } from "react";
import { useLocation } from "wouter";
import { LAUNCH, launchPhase } from "../../../shared/product";

const key = (phase: string) => `ew_ph_${phase}`;

/** Before and during the Product Hunt launch, a dismissible pill pointing to it. Gone afterwards. */
export function LaunchPill() {
  const [path] = useLocation();
  const phase = launchPhase(Date.now());
  const [hidden, setHidden] = useState(() => {
    try {
      return phase ? localStorage.getItem(key(phase)) === "1" : true;
    } catch {
      return false;
    }
  });
  if (!phase || hidden || path.startsWith("/admin")) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(key(phase), "1");
    } catch {
      /* storage blocked */
    }
  };
  return (
    <aside className="launch-pill" aria-label="Product Hunt launch">
      <a href={`${LAUNCH.url}?utm_source=site&utm_campaign=launch`} target="_blank" rel="noopener" data-track={`ph-pill-${phase}`}>
        {phase === "live" ? (
          <>
            <strong>We're live on Product Hunt today.</strong> Tell us what you think
          </>
        ) : (
          <>
            <strong>On Product Hunt 24 Nov.</strong> Get a reminder
          </>
        )}
      </a>
      <button type="button" className="launch-pill-close" onClick={close} aria-label="Hide this">
        ×
      </button>
    </aside>
  );
}
