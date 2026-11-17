import createGlobe from "cobe";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { causeById } from "../../../shared/causes";
import type { PublicDonation, Session } from "../../../shared/types";
import { useTheme, type Theme } from "../lib";

type RGB = [number, number, number];

const GLOBE: Record<Theme, { gold: RGB; green: RGB; base: RGB; glow: RGB; dark: number; brightness: number; diffuse: number }> = {
  dark: { gold: [0.85, 0.75, 0.58], green: [0.37, 0.63, 0.35], base: [0.11, 0.2, 0.25], glow: [0.3, 0.27, 0.21], dark: 1, brightness: 5, diffuse: 1.25 },
  light: { gold: [0.62, 0.46, 0.18], green: [0.29, 0.54, 0.27], base: [0.96, 0.95, 0.92], glow: [0.93, 0.89, 0.8], dark: 0, brightness: 1.6, diffuse: 1.6 },
};

// Legs of the apex, traced from the Earthward emblem in a 1000-unit square.
// Left: a straight blade that bends to hug the planet. Right: a sweep that flicks outward.
const LEFT = "M503 78 L292 520 C232 648 196 760 188 868";
const RIGHT = "M503 78 L700 470 C752 572 806 622 892 646";

function Apex({ draw }: { draw: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    ref.current?.querySelectorAll("path").forEach((p) => p.style.setProperty("--len", String(Math.ceil(p.getTotalLength()))));
  }, []);
  return (
    <svg ref={ref} className={`apex${draw ? " drawing" : ""}`} viewBox="0 0 1000 1000" aria-hidden="true">
      <defs>
        <linearGradient id="apexGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--apex-1)" }} />
          <stop offset="0.45" style={{ stopColor: "var(--apex-2)" }} />
          <stop offset="1" style={{ stopColor: "var(--apex-3)" }} />
        </linearGradient>
        <filter id="apexBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <path className="halo" d={LEFT} />
      <path className="halo" d={RIGHT} />
      <path className="leg-left" d={LEFT} />
      <path className="leg-right" d={RIGHT} />
    </svg>
  );
}

/** True when WebGL runs on real graphics hardware rather than a slow software fallback. */
function hasFastWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl", { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

/** The live globe: donors in gold at country level, last night's funded places in green, arcs between. */
function Globe({ recent, session, reduced }: { recent: PublicDonation[]; session: Session | null; reduced: boolean }) {
  const [theme] = useTheme();
  const palette = GLOBE[theme];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let stop = () => {};

    const start = () => {
      // Phones and laptops without graphics hardware draw WebGL in software, which freezes the page.
      // There the apex and the numbers carry the hero on their own.
      if (cancelled || !hasFastWebGL()) return;
      let size = canvas.offsetWidth;
      const small = size < 520;
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
      let phi = 0.9;
      let raf = 0;
      let frame = 0;
      let onScreen = true;
      let globe: ReturnType<typeof createGlobe>;
      try {
        globe = createGlobe(canvas, {
          width: size * dpr,
          height: size * dpr,
          devicePixelRatio: dpr,
          phi,
          theta: 0.28,
          dark: palette.dark,
          diffuse: palette.diffuse,
          mapSamples: small ? 12000 : 18000,
          mapBrightness: palette.brightness,
          mapBaseBrightness: 0.02,
          baseColor: palette.base,
          markerColor: palette.gold,
          glowColor: palette.glow,
          markers: [],
          arcs: [],
          arcColor: palette.gold,
          arcWidth: 0.6,
          arcHeight: 0.28,
          markerElevation: 0.02,
          opacity: 0.92,
        });
      } catch {
        return;
      }
      globeRef.current = globe;
      setReady(true);

      const onResize = () => {
        size = canvas.offsetWidth;
        globe.update({ width: size * dpr, height: size * dpr });
      };
      window.addEventListener("resize", onResize);

      // Turns at 30 frames a second, and only while it's on screen in a visible tab.
      const tick = () => {
        raf = 0;
        if (!onScreen || document.hidden) return;
        frame += 1;
        if (frame % 2 === 0) {
          phi += 0.0032;
          globe.update({ phi });
        }
        raf = requestAnimationFrame(tick);
      };
      const resume = () => {
        if (!reduced && !raf && onScreen && !document.hidden) raf = requestAnimationFrame(tick);
      };
      const io = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        resume();
      });
      io.observe(canvas);
      document.addEventListener("visibilitychange", resume);
      resume();

      stop = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("resize", onResize);
        globe.destroy();
        globeRef.current = null;
      };
    };

    // Wait until the page has finished its own work before starting the globe.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const idle = w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 2500 }) : window.setTimeout(start, 1200);
    return () => {
      cancelled = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      stop();
    };
    // Rebuilt on theme change: cobe fixes its shading when the globe is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, theme]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const donors = recent.filter((d) => d.location).slice(0, 24);
    const funded = (session?.allocations ?? []).slice(0, 8).map((a) => causeById(a.causeId)).filter(Boolean);
    const markers = [
      ...funded.map((c) => ({ location: c!.location, size: 0.045, color: palette.green })),
      ...donors.map((d, i) => ({ location: d.location!, size: i === 0 ? 0.07 : 0.035, color: palette.gold })),
    ];
    const arcs = donors.slice(0, 10).flatMap((d, i) => {
      const to = funded[i % Math.max(funded.length, 1)];
      return to ? [{ from: d.location!, to: to.location }] : [];
    });
    globe.update({ markers, arcs });
  }, [recent, session, ready, palette]);

  return <canvas ref={canvasRef} className={ready ? "ready" : ""} aria-hidden="true" />;
}

export function Emblem({
  recent,
  session,
  reduced,
  children,
}: {
  recent: PublicDonation[];
  session: Session | null;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <div className="emblem">
      <Globe recent={recent} session={session} reduced={reduced} />
      <Apex draw={!reduced} />
      {children}
    </div>
  );
}
