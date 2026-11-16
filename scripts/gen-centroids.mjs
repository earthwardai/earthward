// Builds shared/centroids.json: ISO country code -> [lat, lng], used to place
// donors on the globe at country level (never more precise than that).
import { readFileSync, writeFileSync } from "node:fs";
const countries = JSON.parse(readFileSync(new URL("../node_modules/world-countries/countries.json", import.meta.url)));
const out = {};
for (const c of countries) if (c.cca2 && Array.isArray(c.latlng) && c.latlng.length === 2) out[c.cca2] = c.latlng.map((n) => Math.round(n * 10) / 10);
writeFileSync(new URL("../shared/centroids.json", import.meta.url), JSON.stringify(out));
console.log(Object.keys(out).length, "countries");
