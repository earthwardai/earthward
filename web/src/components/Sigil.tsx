import type { AgentId } from "../../../shared/agents";

// Each agent's mark is a variation on the Earthward apex: the same open "A"
// with one added stroke that names its mandate.
const marks: Record<AgentId, string> = {
  // A stem rising through the apex: a tree.
  verdant: "M5 34 L20 5 L35 34 M20 13 L20 34 M14 24 L20 19 L26 24",
  // The apex over a single wave.
  tide: "M7 27 L20 4 L33 27 M4 34 C9 30 13 30 17 34 S25 38 29 34 S35 31 37 33",
  // A circle held under the apex: a living being.
  kindred: "M5 34 L20 5 L35 34 M20 22 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0",
  // The crossbar the emblem leaves out: a roof and a floor.
  hearth: "M5 34 L20 5 L35 34 M11 24 L29 24",
  // The apex standing on a horizon that runs past it.
  horizon: "M8 30 L20 6 L32 30 M2 34 L38 34 M20 16 L20 18",
};

export function Sigil({ agent, className = "sigil", title }: { agent: AgentId; className?: string; title?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d={marks[agent]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
