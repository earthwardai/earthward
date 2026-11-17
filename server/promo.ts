import { dayKey } from "../shared/council";
import { postToBluesky } from "./autopost";
import { config } from "./config";
import type { Store } from "./store/types";

/**
 * Approved posts for the week before the Product Hunt launch, one a day. A Cloud Scheduler job
 * (earthward-promo, 18:00 India time) calls /internal/promo, which posts that day's entry to
 * Bluesky once. X has its own scheduler, so those were scheduled there.
 */
export interface PromoPost {
  day: string;
  text: string;
  image: string;
  alt: string;
}

export const LAUNCH_WEEK: PromoPost[] = [
  {
    day: "2026-11-19",
    text: "Five questions, about a minute: which of the council's five AI agents thinks most like you? I got Tide (oceans and clean water), with Kindred a close second. earthwardai.com/match",
    image: "/launch/day2-quiz.jpg",
    alt: "Quiz result on Earthward AI: 'You think most like Tide', oceans, rivers and clean water, with match bars of 62% Tide, 31% Kindred and 8% Verdant.",
  },
  {
    day: "2026-11-20",
    text: "A 45-minute lesson on AI and fairness: your class gets a budget and five AI agents with different values. Students back an agent, the council debates in front of them, and you talk about what just happened. Free, no student accounts. earthwardai.com/classroom",
    image: "/launch/day3-classroom.jpg",
    alt: "The 'An AI council for your classroom' page, with buttons to set up a council and see the lesson plan, and three reasons: trade-offs made visible, a safe way to talk about AI, quick to run.",
  },
  {
    day: "2026-11-21",
    text: "Put any dilemma to five AI agents with different values and get five answers and a verdict in seconds. \"Should we plant new forests or protect the old ones first?\" Try your own: earthwardai.com/ask",
    image: "/launch/day4-ask.jpg",
    alt: "The council's verdict on planting new forests versus protecting old ones, with short answers from Verdant, Tide, Kindred and Hearth.",
  },
  {
    day: "2026-11-22",
    text: "The whole council is open source: the agents' prompts, the rules that merge their votes, and a hash-chained ledger you can verify in your browser. Run it with any model, including one on your laptop with Ollama. github.com/earthwardai/earthward",
    image: "/launch/day5-open-source.jpg",
    alt: "The Earthward AI emblem: a gold A rising over the Earth on black.",
  },
  {
    day: "2026-11-23",
    text: "Tomorrow Earthward AI launches on Product Hunt. Five AI agents, one treasury, a public vote every night. Predict tonight's top cause before it goes live: earthwardai.com/predict",
    image: "/launch/day6-home.jpg",
    alt: "The Earthward AI home page: 'Earthward AI is a global AI council for the Earth', the treasury on a glowing globe, and the latest decision led by safe drinking water.",
  },
];

/** Posts today's entry once. Returns what happened, for the log. */
export async function postPromo(store: Store, now = new Date(), f: typeof fetch = fetch, posts = LAUNCH_WEEK): Promise<string> {
  const today = dayKey(now, config.timeZone);
  const post = posts.find((p) => p.day === today);
  if (!post) return "nothing scheduled";
  if (!(await store.claimTask(`promo-${today}`))) return "already posted";
  let image: { bytes: Uint8Array<ArrayBuffer>; alt: string } | null = null;
  try {
    const res = await f(`${config.siteUrl}${post.image}`);
    if (res.ok) image = { bytes: new Uint8Array(await res.arrayBuffer()), alt: post.alt };
  } catch {
    /* post without the image rather than not at all */
  }
  return postToBluesky(post.text, image, "utm_source=bluesky&utm_campaign=launchweek", f);
}
