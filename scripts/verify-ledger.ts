// Downloads the whole public ledger from a deployment and checks every hash link.
import { verifyEntries, type LedgerEntry } from "../shared/ledger";
const base = process.argv[2] ?? "https://earthwardai.com";
const all: LedgerEntry[] = [];
let before: number | null | undefined;
do {
  const r = (await (await fetch(`${base}/api/ledger?limit=200${before != null ? `&before=${before}` : ""}`)).json()) as { entries: LedgerEntry[]; nextBefore: number | null };
  all.push(...r.entries);
  before = r.nextBefore;
} while (before != null);
const res = await verifyEntries(all);
console.log(res.ok ? `OK: ${res.checked} entries, genesis to #${Math.max(...all.map((e) => e.seq))}` : `BROKEN at #${res.brokenAt}`);
