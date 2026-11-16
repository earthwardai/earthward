import { causeById } from "../../../shared/causes";
import { givingFor } from "../../../shared/giving";

/**
 * Real organisations doing the work behind each simulated cause. Links go straight to the
 * organisation's Every.org page; Earthward never handles the money.
 */
export function GiveDirectly({ causeIds, title = "Give for real" }: { causeIds: string[]; title?: string }) {
  const rows = causeIds.map((id) => ({ cause: causeById(id), give: givingFor(id) })).filter((r) => r.cause && r.give);
  if (!rows.length) return null;
  return (
    <section className="give" aria-labelledby="give-title">
      <h2 id="give-title">{title}</h2>
      <p className="lede">
        The credits here are virtual. If the council&apos;s case convinced you, these established organisations do this work for real. Gifts go straight to them through
        Every.org, a nonprofit donation platform. Earthward never touches the money and takes no cut.
      </p>
      <ul className="give-list">
        {rows.map(({ cause, give }) => (
          <li key={cause!.id} style={{ ["--agent" as string]: `var(--${cause!.domain})` }}>
            <div>
              <p className="give-cause">{cause!.name}</p>
              <p className="give-org">
                {give!.org} <span className="muted small">· {give!.credential}</span>
              </p>
            </div>
            <a className="btn ghost small" href={give!.url} target="_blank" rel="noopener" data-track={`give-${cause!.id}`}>
              Donate
            </a>
          </li>
        ))}
      </ul>
      <p className="muted small">We picked these for their track record, not because they asked. Earthward has no relationship with them.</p>
    </section>
  );
}
