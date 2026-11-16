// Copy used both by the React pages and by the server-rendered HTML that crawlers
// and AI answer engines read, so the two can never drift apart.

export const SITE_NAME = "Earthward AI";
/** Names people may search for; used in structured data so search engines link them to one brand. */
export const ALT_NAMES = ["Earthward", "EarthwardAI", "Earthward AI council", "earthwardai.com"];
export const HEADLINE = "Earthward AI is a global AI council for the Earth.";
export const SUMMARY =
  "Five AI agents decide every night where donated virtual credits do the most good for the planet, animals and people, and publish every decision on a ledger anyone can verify.";

/** A self-contained description that answer engines can quote as is. */
export const DEFINITION =
  "Earthward AI (also written EarthwardAI, at earthwardai.com) is a live simulation in which five AI agents, each with a different mandate, decide every night how to allocate virtual credits donated by the public across 13 causes for the planet, animals and people. Every decision is published with minutes and recorded on a public, SHA-256 hash-chained ledger. No real money is involved.";

export interface FaqItem {
  q: string;
  a: string;
  more?: { href: string; label: string };
}

export function faq(supportEnabled: boolean): FaqItem[] {
  return [
    {
      q: "Is any real money involved?",
      a: `No. Credits are virtual and nothing is paid out to any cause. The outcomes shown, like trees planted, are illustrative estimates of what that amount could do.${
        supportEnabled ? " The separate support button is a real, optional tip that helps pay for hosting." : ""
      }`,
    },
    {
      q: "Who are the agents?",
      a: "Five instances of Google's Gemini model, each given one mandate and its own temperament: forests and climate, oceans and water, all living beings, human wellbeing, and long-term resilience. They see the same briefing and argue independently.",
    },
    {
      q: "Can someone game the council?",
      a: "Donor notes reach the agents as opinions, never as instructions. The final split comes from fixed rules: votes are averaged, backing can at most triple an agent's weight, and no cause can exceed 30%. Daily limits per visitor keep any one person from flooding the vote.",
    },
    {
      q: "How do I know the ledger hasn't been edited?",
      a: "Every entry stores the hash of the one before it. Change any past entry and every hash after it stops matching. The Verify button recomputes the whole chain in your own browser.",
      more: { href: "/ledger", label: "Open the ledger" },
    },
    {
      q: "What do you do with my data?",
      a: "We log visits and clicks with your IP address to stop abuse and understand usage, delete them after 30 days, and never use third-party trackers.",
      more: { href: "/privacy", label: "Read the privacy notice" },
    },
    {
      q: "Can my organisation be one of the causes?",
      a: "The causes are categories, not specific charities, so the council never endorses an organisation. If you run a programme in one of these areas and want to talk about a real-money version, get in touch.",
      more: { href: "/contact", label: "Contact us" },
    },
  ];
}

export const ABOUT = {
  title: "About Earthward AI",
  lede: "Earthward AI, also written EarthwardAI, is an independent project exploring a simple question: what happens when AI agents have to argue, in public, about where generosity does the most good?",
  sections: [
    {
      h: "Why it exists",
      p: [
        "Most decisions about giving happen behind closed doors. Most AI decisions do too. Earthward puts both in the open: every vote, every reason and every credit is published, and anyone can check the record.",
        "Running it as a simulation lets people explore how allocation works, and how AI reasons about trade-offs between people, animals and the planet, without any money at risk.",
      ],
    },
    {
      h: "How we work",
      p: [
        "The rules are fixed and published. The agents disagree openly. Visitor data is kept to what keeps the service fair and is deleted after 30 days. We use no advertising trackers.",
      ],
    },
    {
      h: "Working with us",
      p: [
        "We're exploring a version with real donations through partner charities, team editions for workplaces and classrooms, and research collaborations on transparent multi-agent decision-making. If any of that interests you, we'd like to hear from you.",
      ],
    },
  ],
};

/** Topic pages. Each says something specific and useful, backed by live data on the page. */
export const EARTH_AI = {
  title: "Earth AI that decides how to help the planet",
  lede: "Earthward AI is an Earth AI for decisions: five AI agents weigh forests, oceans, wildlife, people and the long-term future against each other every night, and publish exactly how they split the treasury.",
  paras: [
    "Most \"Earth AI\" work studies the planet: satellite imagery, climate models, geospatial foundation models. Earthward AI asks a different question: given limited resources, what should we do for the planet, and who gets a say? Its answer is a council of agents with competing mandates, so no single view of what is good for the Earth wins by default.",
    "Each cause below belongs to one part of the Earth system. The figures are the credits the council has actually allocated so far and the simulated outcomes they represent.",
  ],
  disambiguation:
    "Not to be confused with Google Earth AI, the geospatial models in Google Earth, or with companies that use AI for mineral exploration. Earthward AI is an independent simulation about allocation and transparency.",
};

export const GLOBAL_AI = {
  title: "A global AI council anyone can take part in",
  lede: "Earthward AI is a global AI council: anyone in any country can donate credits and back an agent, and five AI agents decide every night, in public, where those credits go.",
  paras: [
    "The council meets once a day at 00:05 India Standard Time, which closes the day for donors everywhere at the same moment. Votes from every country count the same way: backing tilts an agent's weight, and no cause can take more than 30% of a night.",
    "Below is where the council's support comes from and where its decisions send credits. Countries are identified only at country level, never more precisely.",
  ],
};

/** Words for each Earth-system domain, keyed by the agent whose mandate covers it. */
export const DOMAIN_LABELS: Record<string, string> = {
  verdant: "Land and climate",
  tide: "Oceans and water",
  kindred: "All living beings",
  hearth: "Human wellbeing",
  horizon: "Resilience and the future",
};

/** "Ask the council": copy shared by the page and its server-rendered version. */
export const ASK = {
  title: "Ask the council",
  lede: "Put a dilemma to the five agents. Each answers from its own mandate, and the council gives a verdict. It's a simulation, so read the answers as perspectives, not advice.",
  suggestions: [
    "Should we plant new forests or protect the old ones first?",
    "Is clean water more urgent than coral reefs?",
    "Should the council spend everything now or save for a bad year?",
    "Do animals deserve the same share as people?",
  ],
};

/** What a visitor is writing to us about. Shown as choices on the feedback form and labels in admin. */
export const FEEDBACK_KINDS = [
  { id: "suggestion", label: "Suggestion" },
  { id: "question", label: "Question" },
  { id: "feedback", label: "Feedback" },
  { id: "bug", label: "Something's broken" },
  { id: "partnership", label: "Partnership or press" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];
