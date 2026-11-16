import { existsSync } from "node:fs";
import maxmind, { type CountryResponse, type Reader } from "maxmind";
import centroids from "../shared/centroids.json" with { type: "json" };
import { config } from "./config";

// Country-level lookup only, from the free DB-IP Lite database (CC BY 4.0).
// Donor markers on the globe use the country's centre, never a precise location.

let reader: Reader<CountryResponse> | null = null;

export async function initGeo() {
  if (!existsSync(config.geoipDb)) {
    console.warn(`geo: ${config.geoipDb} not found, countries will be unknown`);
    return;
  }
  reader = await maxmind.open<CountryResponse>(config.geoipDb);
}

export function countryOf(ip: string): string | null {
  if (!reader) return null;
  try {
    return reader.get(ip)?.country?.iso_code ?? null;
  } catch {
    return null;
  }
}

export function centroidOf(country: string | null): [number, number] | null {
  if (!country) return null;
  const c = (centroids as Record<string, number[]>)[country];
  return c ? [c[0], c[1]] : null;
}
