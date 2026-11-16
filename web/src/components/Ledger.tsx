import { useState } from "react";
import { agentById } from "../../../shared/agents";
import { verifyEntries, type LedgerEntry } from "../../../shared/ledger";
import { ago, credits, getLedger, useNow } from "../lib";

export function describeEntry(e: LedgerEntry): string {
  const d = e.data as Record<string, unknown>;
  if (e.type === "genesis") return `Genesis: ${credits(Number(d.credits))} seed credits start the simulation`;
  if (e.type === "donation") {
    const who = (d.name as string | null) ?? "Someone";
    const backing = d.agentId ? `, backing ${agentById(String(d.agentId))?.name}` : "";
    return `${who} donated ${credits(Number(d.amount))} credits${backing}`;
  }
  const n = Array.isArray(d.allocations) ? d.allocations.length : 0;
  return `Council allocated ${credits(Number(d.spent))} credits across ${n} causes for ${String(d.day)}`;
}

export function LedgerList({ entries }: { entries: LedgerEntry[] }) {
  const now = useNow(30_000);
  return (
    <ol className="ledger-list" reversed>
      {entries.map((e) => (
        <li key={e.seq}>
          <span className="seq num">#{e.seq}</span>
          <span className="desc">{describeEntry(e)}</span>
          <time className="time" dateTime={e.at} title={new Date(e.at).toLocaleString()}>
            {ago(e.at, now)}
          </time>
          <span className="hash">{e.hash}</span>
        </li>
      ))}
    </ol>
  );
}

/** Downloads the whole chain and re-computes every hash in the browser. */
export function VerifyChain() {
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "bad"; text: string }>({ kind: "idle", text: "" });

  async function run() {
    setStatus({ kind: "busy", text: "Checking every entry…" });
    try {
      const all: LedgerEntry[] = [];
      let before: number | undefined;
      for (let page = 0; page < 100; page++) {
        const res = await getLedger(before, 200);
        all.push(...res.entries);
        if (res.nextBefore === null) break;
        before = res.nextBefore;
      }
      const result = await verifyEntries(all);
      const complete = all.some((e) => e.seq === 0);
      if (result.ok && complete) {
        setStatus({ kind: "ok", text: `All ${credits(result.checked)} entries check out, from genesis to entry ${Math.max(...all.map((e) => e.seq))}.` });
      } else if (result.ok) {
        setStatus({ kind: "ok", text: `${credits(result.checked)} recent entries check out.` });
      } else {
        setStatus({ kind: "bad", text: `Entry ${result.brokenAt} does not match the chain. Please report this.` });
      }
    } catch {
      setStatus({ kind: "bad", text: "Couldn't download the ledger. Try again." });
    }
  }

  return (
    <div className="verify">
      <button type="button" className="btn ghost small" onClick={run} disabled={status.kind === "busy"} data-track="verify-chain">
        Verify the chain in your browser
      </button>
      <p className={`verify-result ${status.kind === "ok" ? "ok" : status.kind === "bad" ? "bad" : ""}`} role="status">
        {status.text}
      </p>
    </div>
  );
}
