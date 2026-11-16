import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { causeById } from "../shared/causes";
import type { Session } from "../shared/types";
import { config } from "./config";

// Share images (1200x630) for council nights and donation receipts, so a link posted on X,
// LinkedIn or WhatsApp shows the actual decision. Rendered with satori (layout to SVG) and
// resvg (SVG to PNG), cached in memory, and capped per day by the caller.

const W = 1200;
const H = 630;
const COLORS: Record<string, string> = { verdant: "#5fa05a", tide: "#3f8fd2", kindred: "#d5658f", hearth: "#c97d22", horizon: "#9085e9" };
const INK = "#ece5d6";
const MUTED = "#b4ab9b";
const GOLD = "#d9b97a";
const BG = "#171614";

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | null)[]): Node => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== null) },
});

let assets: Promise<{ fonts: { name: string; data: Buffer; weight: 400 | 500; style: "normal" }[]; emblem: string }> | null = null;
function loadAssets() {
  assets ??= (async () => {
    const require = createRequire(import.meta.url);
    const font = (pkg: string, file: string) => readFile(require.resolve(`${pkg}/files/${file}`));
    const [sans, sansMedium, serif] = await Promise.all([
      font("@fontsource/hanken-grotesk", "hanken-grotesk-latin-400-normal.woff"),
      font("@fontsource/hanken-grotesk", "hanken-grotesk-latin-500-normal.woff"),
      font("@fontsource/bodoni-moda", "bodoni-moda-latin-500-normal.woff"),
    ]);
    const emblem = await readFile(join(config.staticDir, "brand", "emblem-160.jpg")).catch(() => null);
    return {
      fonts: [
        { name: "Hanken", data: sans, weight: 400, style: "normal" },
        { name: "Hanken", data: sansMedium, weight: 500, style: "normal" },
        { name: "Bodoni", data: serif, weight: 500, style: "normal" },
      ],
      emblem: emblem ? `data:image/jpeg;base64,${emblem.toString("base64")}` : "",
    };
  })();
  return assets;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const units = (n: number) => (n < 10 ? n.toLocaleString("en-US", { maximumFractionDigits: 1 }) : fmt(Math.round(n)));
const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function frame(label: string, body: Node[], emblem: string): Node {
  return h(
    "div",
    { width: W, height: H, boxSizing: "border-box", flexDirection: "column", justifyContent: "space-between", padding: "52px 64px", background: BG, color: INK, fontFamily: "Hanken" },
    h(
      "div",
      { alignItems: "center", gap: 18 },
      emblem ? { type: "img", props: { src: emblem, width: 52, height: 52, style: { borderRadius: 26 } } } : null,
      h("div", { fontSize: 26, color: MUTED }, label),
    ),
    h("div", { flexDirection: "column", gap: 22 }, ...body),
    h("div", { justifyContent: "space-between", fontSize: 24 }, h("div", { color: GOLD }, "earthwardai.com"), h("div", { color: MUTED }, "Five AI agents decide every night")),
  );
}

async function render(node: Node): Promise<Buffer> {
  const { fonts } = await loadAssets();
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], { width: W, height: H, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}

export async function councilImage(session: Session): Promise<Buffer> {
  const { emblem } = await loadAssets();
  const top = session.allocations.slice(0, 3);
  const max = Math.max(...top.map((a) => a.share), 0.01);
  const rows = top.map((a) => {
    const c = causeById(a.causeId)!;
    return h(
      "div",
      { flexDirection: "column", gap: 8, width: 1072 },
      h("div", { justifyContent: "space-between", width: 1072, fontSize: 26 }, h("div", {}, c.name), h("div", { color: MUTED }, `${Math.round(a.share * 100)}% of the night`)),
      h("div", { height: 12, width: Math.round(Math.max(0.04, a.share / max) * 1072), background: COLORS[c.domain] ?? GOLD, borderRadius: 6 }),
    );
  });
  return render(
    frame(
      `Council minutes, ${dateLabel(session.day)}`,
      [h("div", { fontFamily: "Bodoni", fontSize: 54, lineHeight: 1.08, width: 1072 }, session.title), h("div", { flexDirection: "column", gap: 14 }, ...rows)],
      emblem,
    ),
  );
}

export async function impactImage(amount: number, items: { causeId: string; units: number }[]): Promise<Buffer> {
  const { emblem } = await loadAssets();
  const lines = items.slice(0, 3).map((i) => {
    const c = causeById(i.causeId)!;
    return h(
      "div",
      { alignItems: "center", gap: 16, fontSize: 32 },
      h("div", { width: 14, height: 14, borderRadius: 7, background: COLORS[c.domain] ?? GOLD }),
      h("div", {}, `about ${units(i.units)} ${c.unit}`),
    );
  });
  return render(
    frame(
      "My donation to the Earthward AI council",
      [h("div", { fontFamily: "Bodoni", fontSize: 76, lineHeight: 1 }, `${fmt(amount)} credits`), h("div", { fontSize: 30, color: MUTED }, "funded"), h("div", { flexDirection: "column", gap: 14 }, ...lines)],
      emblem,
    ),
  );
}
