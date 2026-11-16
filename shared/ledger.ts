// Tamper-evident ledger. Every entry carries the hash of the one before it, so
// changing any past entry breaks every hash after it. The same code runs in the
// browser to let visitors verify the chain themselves.

export type LedgerType = "genesis" | "donation" | "allocation";

export interface LedgerEntry {
  seq: number;
  type: LedgerType;
  at: string;
  data: Record<string, unknown>;
  prev: string;
  hash: string;
}

export const GENESIS_PREV = "0".repeat(64);

/** JSON with object keys sorted at every level, so hashing is order-independent. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function entryPayload(e: Omit<LedgerEntry, "hash">): string {
  return canonicalJson({ seq: e.seq, type: e.type, at: e.at, data: e.data, prev: e.prev });
}

export async function makeEntry(
  prev: { seq: number; hash: string } | null,
  type: LedgerType,
  data: Record<string, unknown>,
  at: Date = new Date(),
): Promise<LedgerEntry> {
  const base = {
    seq: prev ? prev.seq + 1 : 0,
    type,
    at: at.toISOString(),
    data,
    prev: prev ? prev.hash : GENESIS_PREV,
  };
  return { ...base, hash: await sha256Hex(entryPayload(base)) };
}

export interface VerifyResult {
  checked: number;
  ok: boolean;
  /** First sequence number whose hash or link does not match. */
  brokenAt?: number;
}

/** Verifies a contiguous run of entries, in any order. */
export async function verifyEntries(entries: LedgerEntry[]): Promise<VerifyResult> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const expected = await sha256Hex(entryPayload(e));
    if (expected !== e.hash) return { checked: i, ok: false, brokenAt: e.seq };
    const before = sorted[i - 1];
    if (before && e.prev !== before.hash) return { checked: i, ok: false, brokenAt: e.seq };
    if (e.seq === 0 && e.prev !== GENESIS_PREV) return { checked: i, ok: false, brokenAt: 0 };
  }
  return { checked: sorted.length, ok: true };
}
