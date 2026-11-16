import createGlobe from "cobe";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AGENTS } from "../../../shared/agents";
import { causeById, type Cause } from "../../../shared/causes";
import type { LedgerEntry } from "../../../shared/ledger";
import type { StateResponse } from "../../../shared/types";
import { countryName, credits, getLedger, getMe, useReducedMotion, useTheme, type Theme } from "../lib";
import { openDonate } from "./DonateDialog";
import { describeEntry } from "./Ledger";
import { Sigil } from "./Sigil";

// A scroll-scrubbed story. The section is several screens tall; its stage stays
// pinned while scroll progress drives the globe's camera and the chapter text.

type RGB = [number, number, number];
type LatLng = [number, number];

const CHAPTERS = 5;
const HOME_FALLBACK: LatLng = [20.6, 78.9];
const TAU = Math.PI * 2;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => t * t * (3 - 2 * t);
/** cobe's camera angles that put a place at the centre of the globe. */
const facing = ([lat, lng]: LatLng): [number, number] => [Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2), (lat * Math.PI) / 180];
/** Moves angle `a` toward `b` the short way round. */
const approachAngle = (a: number, b: number, k: number) => {
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * k;
};

const PALETTE: Record<Theme, { gold: RGB; green: RGB; base: RGB; glow: RGB; dark: number; brightness: number; diffuse: number }> = {
  dark: { gold: [0.88, 0.76, 0.55], green: [0.4, 0.7, 0.38], base: [0.12, 0.22, 0.28], glow: [0.28, 0.25, 0.19], dark: 1, brightness: 5.6, diffuse: 1.3 },
  light: { gold: [0.62, 0.46, 0.18], green: [0.29, 0.54, 0.27], base: [0.96, 0.95, 0.92], glow: [0.93, 0.89, 0.8], dark: 0, brightness: 1.6, diffuse: 1.6 },
};

interface Props {
  state: StateResponse | null;
}

export function Journey({ state }: Props) {
  const reduced = useReducedMotion();
  const [me, setMe] = useState<{ country: string | null; location: LatLng | null } | null>(null);
  const [chain, setChain] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    getMe()
      .then((m) => setMe({ country: m.country, location: m.location as LatLng | null }))
      .catch(() => setMe({ country: null, location: null }));
  }, []);
  const headSeq = state?.head?.seq;
  useEffect(() => {
    if (headSeq === undefined) return;
    getLedger(undefined, 4)
      .then((r) => setChain(r.entries))
      .catch(() => undefined);
  }, [headSeq]);

  const story = useMemo(() => buildStory(state, me), [state, me]);
  if (reduced) return <StaticStory story={story} chain={chain} />;
  return <PinnedStory story={story} chain={chain} />;
}

interface Story {
  home: LatLng;
  homeName: string | null;
  donors: LatLng[];
  countries: number;
  todayDonations: number;
  todayCredits: number;
  funded: { cause: Cause; credits: number; units: number; share: number }[];
  spent: number;
  quotes: Record<string, string | null>;
}

function buildStory(state: StateResponse | null, me: { country: string | null; location: LatLng | null } | null): Story {
  const recent = state?.recent ?? [];
  const seen = new Set<string>();
  const donors: LatLng[] = [];
  for (const d of recent) {
    if (!d.location) continue;
    const k = d.location.join(",");
    if (!seen.has(k)) {
      seen.add(k);
      donors.push(d.location as LatLng);
    }
  }
  const allocations = state?.latestSession?.allocations ?? [];
  return {
    home: me?.location ?? HOME_FALLBACK,
    homeName: countryName(me?.country ?? null),
    donors,
    countries: new Set(recent.map((d) => d.country).filter(Boolean)).size,
    todayDonations: state?.today.donations ?? 0,
    todayCredits: state?.today.credits ?? 0,
    funded: allocations.slice(0, 3).map((a) => ({ cause: causeById(a.causeId)!, credits: a.credits, units: a.units, share: a.share })),
    spent: state?.latestSession?.spent ?? 0,
    quotes: Object.fromEntries((state?.agents ?? []).map((a) => [a.id, a.lastQuote])),
  };
}

function chapterCopy(s: Story) {
  const today =
    s.todayDonations > 0
      ? `${credits(s.todayDonations)} ${s.todayDonations === 1 ? "donation" : "donations"} so far today, ${credits(s.todayCredits)} credits from ${s.countries || 1} ${
          s.countries === 1 ? "country" : "countries"
        } in the recent feed.`
      : "Donations arrive from every timezone. Each one lands as a point of light on this globe.";
  const top = s.funded[0];
  return [
    {
      title: "It starts with you.",
      body: s.homeName ? `A credit given from ${s.homeName} joins tonight's treasury the moment you send it.` : "A credit you give joins tonight's treasury the moment you send it.",
    },
    { title: "The world gives.", body: today },
    { title: "Five minds weigh it.", body: "At midnight each steward argues for its mandate. Backing from donors gives an agent's vote more weight." },
    {
      title: "One decision.",
      body: top
        ? `The last session sent ${credits(s.spent)} credits out into the world. The largest share went to ${top.cause.name.toLowerCase()} in ${top.cause.place}.`
        : "No cause can take more than 30%. The council spends 95% and rolls the rest over.",
    },
    { title: "Written for good.", body: "Every credit and every decision is chained into a public ledger. Change one entry and every hash after it breaks." },
  ];
}

function PinnedStory({ story, chain }: { story: Story; chain: LedgerEntry[] }) {
  const [theme] = useTheme();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const [chapter, setChapter] = useState(0);
  const [beat, setBeat] = useState(0);
  const storyRef = useRef(story);
  storyRef.current = story;
  const copy = chapterCopy(story);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const pal = PALETTE[theme];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let size = canvas.offsetWidth;
    let globe: ReturnType<typeof createGlobe>;
    try {
      globe = createGlobe(canvas, {
        width: size * dpr,
        height: size * dpr,
        devicePixelRatio: dpr,
        phi: 0,
        theta: 0.3,
        dark: pal.dark,
        diffuse: pal.diffuse,
        mapSamples: 22000,
        mapBrightness: pal.brightness,
        mapBaseBrightness: 0.02,
        baseColor: pal.base,
        markerColor: pal.gold,
        glowColor: pal.glow,
        arcColor: pal.gold,
        arcWidth: 0.7,
        arcHeight: 0.32,
        markers: [],
        arcs: [],
        scale: 1,
      });
    } catch {
      return;
    }
    canvas.classList.add("ready");

    const cam = { phi: facing(story.home)[0] - 1, theta: 0.3, scale: 0.8, lift: 0, dim: 1 };
    let visible = false;
    let raf = 0;
    let lastKey = "";
    let lastChapter = -1;
    let lastBeat = -1;

    const target = (f: number) => {
      const s = storyRef.current;
      const [hp, ht] = facing(s.home);
      const idx = Math.min(CHAPTERS - 1, Math.floor(f));
      const t = clamp(f - idx);
      switch (idx) {
        case 0:
          return { phi: hp - 1 * (1 - ease(t)), theta: ht * 0.85, scale: 0.85 + 0.3 * ease(t), lift: 0, dim: 1, beat: 0 };
        case 1:
          return { phi: hp + TAU * ease(t), theta: 0.32, scale: 1.1, lift: 0, dim: 1, beat: 0 };
        case 2:
          return { phi: hp + TAU + t * 0.7, theta: 0.22, scale: 0.68, lift: 0.2, dim: 1, beat: Math.min(4, Math.floor(t * 5)) };
        case 3: {
          const n = Math.max(1, s.funded.length);
          const k = Math.min(n - 1, Math.floor(t * n));
          const place = s.funded[k]?.cause.location ?? s.home;
          const [p, th] = facing(place);
          return { phi: p, theta: th * 0.9, scale: 1.3, lift: 0, dim: 1, beat: k };
        }
        default:
          return { phi: hp + TAU + 0.7 + t * 0.9, theta: 0.3, scale: 0.92, lift: 0.08, dim: 0.35, beat: 0 };
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const r = section.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const p = clamp(-r.top / span);
      const f = p * CHAPTERS;
      const goal = target(f);
      const k = 0.085;
      cam.phi = approachAngle(cam.phi, goal.phi, k);
      cam.theta += (goal.theta - cam.theta) * k;
      cam.scale += (goal.scale - cam.scale) * k;
      cam.lift += (goal.lift - cam.lift) * k;
      cam.dim += (goal.dim - cam.dim) * k;

      const idx = Math.min(CHAPTERS - 1, Math.floor(f));
      const s = storyRef.current;
      const pulse = 0.07 + 0.025 * Math.sin(now / 260);
      const markers =
        idx === 0
          ? [{ location: s.home, size: pulse, color: pal.gold }]
          : idx <= 2
            ? [{ location: s.home, size: 0.06, color: pal.gold }, ...s.donors.map((d) => ({ location: d, size: 0.04, color: pal.gold }))]
            : [
                { location: s.home, size: 0.06, color: pal.gold },
                ...s.funded.map((x, i) => ({ location: x.cause.location, size: i === goal.beat ? 0.09 : 0.055, color: pal.green })),
              ];
      const arcs = idx >= 3 ? s.funded.map((x) => ({ from: s.home, to: x.cause.location })) : [];
      const key = `${idx}:${goal.beat}:${s.donors.length}:${s.funded.length}`;
      if (idx === 0 || key !== lastKey) {
        globe.update({ markers, arcs });
        lastKey = key;
      }
      globe.update({ phi: cam.phi, theta: cam.theta, scale: cam.scale });
      canvas.style.transform = `translate(-50%, calc(-50% + ${(cam.lift * 100).toFixed(2)}vh))`;
      canvas.style.opacity = cam.dim.toFixed(3);

      textRefs.current.forEach((el, i) => {
        if (!el) return;
        const d = f - (i + 0.5);
        const o = clamp(1 - Math.abs(d) * 2.4);
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translateY(${(-d * 70).toFixed(1)}px)`;
        el.style.visibility = o > 0.01 ? "visible" : "hidden";
      });
      railRef.current?.style.setProperty("--progress", p.toFixed(4));
      if (idx !== lastChapter) {
        lastChapter = idx;
        setChapter(idx);
      }
      if (goal.beat !== lastBeat) {
        lastBeat = goal.beat;
        setBeat(goal.beat);
      }
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(section);
    const onResize = () => {
      size = canvas.offsetWidth;
      globe.update({ width: size * dpr, height: size * dpr });
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", onResize);
      globe.destroy();
    };
    // The globe is rebuilt only when the theme changes; story data is read from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const jump = (i: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const span = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: section.offsetTop + span * ((i + 0.5) / CHAPTERS), behavior: "smooth" });
  };

  const focus = story.funded[beat];
  return (
    <section ref={sectionRef} className="journey" aria-label="How a credit travels">
      <div className="stage">
        <canvas ref={canvasRef} className="journey-globe" aria-hidden="true" />

        {copy.map((c, i) => (
          <div
            key={c.title}
            ref={(el) => {
              textRefs.current[i] = el;
            }}
            className="chapter"
            aria-hidden={chapter !== i}
          >
            <p className="chapter-index num">
              {i + 1} of {CHAPTERS}
            </p>
            <h2 className="chapter-title">{c.title}</h2>
            <p className="chapter-body">{c.body}</p>
          </div>
        ))}

        <div className={`circle${chapter === 2 ? " on" : ""}`} aria-hidden={chapter !== 2}>
          {AGENTS.map((a, i) => (
            <div key={a.id} className={`orbit${beat === i ? " speaking" : ""}`} style={{ ["--agent" as string]: `var(--${a.id})`, ["--i" as string]: i }}>
              <Sigil agent={a.id} />
              <span>{a.name}</span>
            </div>
          ))}
          <blockquote className="speech" key={beat}>
            {story.quotes[AGENTS[beat]?.id] ? `“${story.quotes[AGENTS[beat].id]}”` : AGENTS[beat]?.mandate}
          </blockquote>
        </div>

        <div className={`place-card${chapter === 3 && focus ? " on" : ""}`} aria-hidden={chapter !== 3}>
          {focus ? (
            <>
              <p className="place-rank num">
                {beat + 1} of {story.funded.length} largest shares
              </p>
              <p className="place-name">{focus.cause.name}</p>
              <p className="place-where">{focus.cause.place}</p>
              <p className="place-figures num">
                {credits(focus.credits)} credits, {Math.round(focus.share * 100)}%
                <br />
                <span>
                  Simulated: {credits(focus.units)} {focus.cause.unit}
                </span>
              </p>
            </>
          ) : null}
        </div>

        <div className={`chain${chapter === 4 ? " on" : ""}`} aria-hidden={chapter !== 4}>
          <ol>
            {[...chain].reverse().map((e) => (
              <li key={e.seq}>
                <span className="num">#{e.seq}</span>
                <span className="chain-desc">{describeEntry(e)}</span>
                <span className="chain-hash num">{e.hash.slice(0, 16)}…</span>
              </li>
            ))}
          </ol>
          <div className="session-nav">
            <button type="button" className="btn" onClick={openDonate} data-track="journey-donate">
              Donate credits
            </button>
            <Link className="btn ghost" href="/ledger">
              Check the ledger
            </Link>
          </div>
        </div>

        <div className="rail" ref={railRef}>
          {copy.map((c, i) => (
            <button key={c.title} type="button" className={chapter === i ? "on" : undefined} onClick={() => jump(i)} aria-label={`Chapter ${i + 1}: ${c.title}`} data-track={`journey-rail-${i + 1}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** The same story without motion, for visitors who ask for reduced motion. */
function StaticStory({ story, chain }: { story: Story; chain: LedgerEntry[] }) {
  const copy = chapterCopy(story);
  return (
    <section className="journey-static" aria-label="How a credit travels">
      <ol>
        {copy.map((c, i) => (
          <li key={c.title}>
            <h2 className="chapter-title">{c.title}</h2>
            <p className="chapter-body">{c.body}</p>
            {i === 4 && chain[0] ? <p className="muted num">Latest entry #{chain[0].seq}, hash {chain[0].hash.slice(0, 16)}…</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
