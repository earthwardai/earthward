import type { AgentId } from "./agents";

/**
 * Copy for the product pages: the "Which agent are you?" quiz, the changelog, the classroom
 * page and the press kit. Shared so the server can render the same text for search engines.
 */

// --- Which agent are you? -------------------------------------------------------

export interface QuizOption {
  text: string;
  /** Points per agent. The main match gets 2, a close cousin 1. */
  points: Partial<Record<AgentId, number>>;
}
export interface QuizQuestion {
  q: string;
  options: QuizOption[];
}

export const QUIZ: { title: string; lede: string; questions: QuizQuestion[] } = {
  title: "Which agent are you?",
  lede: "Five questions, about a minute. Find out which of the council's five AI agents thinks most like you, then back it tonight.",
  questions: [
    {
      q: "You have one free Saturday to help. Where do you go?",
      options: [
        { text: "Planting trees on a bare hillside", points: { verdant: 2, horizon: 1 } },
        { text: "A beach or river clean-up", points: { tide: 2, kindred: 1 } },
        { text: "The animal shelter down the road", points: { kindred: 2 } },
        { text: "Tutoring kids or helping at a clinic", points: { hearth: 2 } },
        { text: "Helping your town plan for the next flood or heatwave", points: { horizon: 2, hearth: 1 } },
      ],
    },
    {
      q: "Which headline would make your week?",
      options: [
        { text: "Forest cover rises for the tenth year running", points: { verdant: 2 } },
        { text: "A dead coral reef comes back to life", points: { tide: 2, kindred: 1 } },
        { text: "A species thought lost returns to the wild", points: { kindred: 2, verdant: 1 } },
        { text: "Malaria deaths halved in a decade", points: { hearth: 2 } },
        { text: "Early warning gets a whole village out before the cyclone", points: { horizon: 2, hearth: 1 } },
      ],
    },
    {
      q: "What keeps you up at night?",
      options: [
        { text: "A climate pushed past the point of repair", points: { verdant: 2, horizon: 1 } },
        { text: "Places running out of clean water", points: { tide: 2, hearth: 1 } },
        { text: "Animals suffering with no one to speak for them", points: { kindred: 2 } },
        { text: "People dying of things we already know how to prevent", points: { hearth: 2 } },
        { text: "A future nobody prepared for", points: { horizon: 2 } },
      ],
    },
    {
      q: "When you give, you'd rather it…",
      options: [
        { text: "Grows and lasts for decades", points: { verdant: 2, horizon: 1 } },
        { text: "Cleans up a mess others left behind", points: { tide: 2 } },
        { text: "Protects those who can't ask for help", points: { kindred: 2, hearth: 1 } },
        { text: "Changes one person's life this year", points: { hearth: 2 } },
        { text: "Pays off long after you're gone", points: { horizon: 2, verdant: 1 } },
      ],
    },
    {
      q: "Pick one place to protect forever.",
      options: [
        { text: "An old rainforest", points: { verdant: 2, kindred: 1 } },
        { text: "A mangrove coast", points: { tide: 2, verdant: 1 } },
        { text: "A wildlife corridor between two parks", points: { kindred: 2 } },
        { text: "A village health post", points: { hearth: 2 } },
        { text: "A vault of seeds for every crop on Earth", points: { horizon: 2 } },
      ],
    },
  ],
};

/** Each agent's share of the points, highest first. */
export function scoreQuiz(answers: number[]): { agentId: AgentId; pct: number }[] {
  const totals: Record<string, number> = { verdant: 0, tide: 0, kindred: 0, hearth: 0, horizon: 0 };
  QUIZ.questions.forEach((question, i) => {
    const opt = question.options[answers[i]];
    if (!opt) return;
    for (const [id, n] of Object.entries(opt.points)) totals[id] += n ?? 0;
  });
  const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(totals)
    .map(([agentId, n]) => ({ agentId: agentId as AgentId, pct: Math.round((n / sum) * 100) }))
    .sort((a, b) => b.pct - a.pct);
}

// --- What's new -------------------------------------------------------------------

export interface Release {
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    date: "2026-11-17",
    title: "Accounts, plans and a faster home page",
    items: [
      "Sign in with a link sent to your email, no password. Your group councils, predictions and email settings follow you to any device.",
      "Plans for schools and organisations, including a free school pilot for the 2026 to 2027 school year.",
      "Print or save a report of any group council session as a PDF.",
      "The home page loads much faster on phones, and works better with screen readers.",
    ],
  },
  {
    date: "2026-11-16",
    title: "Email, a deciding vote, and a quiz",
    items: [
      "Email updates: the council's decision every night or a roundup once a week, with whether your prediction was right.",
      "Questions and feedback now reach a person. Ask the council anything, then hand the question to the team and get a reply by email.",
      "What if you had the deciding vote? Every night's page lets you reweight the five agents and see the split recalculated with the council's own code.",
      "Which agent are you? A one-minute quiz that matches you to an agent.",
      "A status page, this changelog, a classroom guide and a press kit.",
      "The site now runs behind Cloudflare, and the council posts each night's decision to Bluesky.",
    ],
  },
  {
    date: "2026-11-16",
    title: "Councils for groups, and an open API",
    items: [
      "Run a council for your class, team or neighbourhood: pick a template, share the link, let members back agents, and convene it live.",
      "Model arena: the same night's briefing goes to other models, scored by how close they come to the real decision.",
      "A public API with open data and free keys for asking the agents questions.",
      "Give for real: each cause links to an established charity on Every.org.",
      "Notifications after each night, and an installable app.",
      "Spanish and Hindi introductions, and easier-to-read headings.",
    ],
  },
  {
    date: "2026-11-16",
    title: "Predictions, votes and nominations",
    items: [
      "Predict tonight's top cause and build a streak on the leaderboard.",
      "Vote on who argued best. Votes feed each agent's standing, which nudges its weight on later nights.",
      "Nominate a cause. Once a month the agents debate the most supported nominations.",
      "Watch a replay of each night's debate, and embed the latest decision on your own site.",
      "Ask the council: put any dilemma to the five agents and get a verdict in seconds.",
      "Donation receipts that trace where your credits went.",
      "Open source under AGPL-3.0. Run the council with any model, including one on your own laptop.",
    ],
  },
  {
    date: "2026-11-12",
    title: "The first council",
    items: [
      "Five AI agents with competing mandates meet for the first time and split the treasury across 13 causes.",
      "Every donation, grant and decision goes on a public hash-chained ledger you can verify in your browser.",
    ],
  },
];

// --- For classrooms ---------------------------------------------------------------

export const CLASSROOM = {
  title: "An AI council for your classroom",
  lede: "Give your class a budget and five AI agents with different values. Students back the agent they agree with, the council debates in front of them, and you talk about what just happened. Free, no sign-up, no student accounts.",
  why: [
    { h: "It makes trade-offs visible", p: "Forests or clinics? Now or later? The agents argue for different priorities out loud, so students see that a fair decision still means someone gets less." },
    { h: "It's a safe way to talk about AI", p: "Students watch models reason, disagree and get things wrong. The rules that turn votes into a decision are plain code anyone can read." },
    { h: "It's quick to run", p: "Set-up takes two minutes. A session takes about a minute. Nothing to install, and students only need a link." },
  ],
  plan: [
    { t: "5 min", h: "Set up", p: "Open Run a council, choose the Classroom template, set a budget, and share the link on the board or in your class chat." },
    { t: "10 min", h: "Meet the agents", p: "Read the five agents' mandates together. Each student backs one and writes a one-line reason. The agents read those reasons before they debate." },
    { t: "5 min", h: "Convene", p: "Press Convene. The agents propose, the rules merge their votes, and the split appears with a short summary." },
    { t: "15 min", h: "Discuss", p: "Who got the most, and why? Was it fair? What would you change in the rules? Did any agent say something you disagree with?" },
    { t: "10 min", h: "Try again", p: "Students change their backing based on the discussion and you convene again. Compare the two splits." },
  ],
  questions: [
    "Which agent did most of the class back, and did that decide the result?",
    "No cause can get more than 30%. Is that a good rule? Why might it exist?",
    "Did any agent's reasoning change your mind?",
    "What would you want a real organisation to know before trusting an AI with a budget?",
  ],
  faq: [
    { q: "Do students need accounts?", a: "No. They open the link and back an agent. We don't ask for names or emails; a first name on a note is optional." },
    { q: "Is any real money involved?", a: "No. The budget is made-up credits. If your class wants to give for real afterwards, each cause links to an established charity." },
    { q: "What ages is it for?", a: "It works best from about age 11 up, and well into university courses on ethics, civics, economics or AI." },
    { q: "Can I change the agents or causes?", a: "Yes. Pick another template or define your own agents and causes." },
  ],
};

// --- Press kit -------------------------------------------------------------------

export const PRESS = {
  title: "Press kit",
  lede: "Everything you need to write about Earthward AI. Use any of it freely; a link back is appreciated.",
  oneLiner: "Earthward AI is a public council of five AI agents that decides every night where donated credits do the most good for the planet, animals and people.",
  boilerplate:
    "Earthward AI is an open-source simulation in which five AI agents with competing mandates (forests and climate, oceans and water, all living beings, human wellbeing, and long-term resilience) debate every night how to split a shared treasury across 13 causes. Fixed rules turn their votes into a decision, a clerk model writes the minutes, and every credit lands on a public hash-chained ledger anyone can verify. Visitors back the agent they agree with, predict the result, ask the council questions, and run councils for their own classes and teams. Credits are virtual; each cause links to an established charity for anyone who wants to give for real.",
  facts: [
    ["First council", "12 November 2026"],
    ["Agents", "Verdant, Tide, Kindred, Hearth, Horizon"],
    ["Causes", "13, from tropical reforestation to malaria prevention"],
    ["Meets", "Every night at 00:05 India time"],
    ["Model", "Google Gemini, with other models compared nightly in the model arena"],
    ["Licence", "AGPL-3.0, at github.com/earthwardai/earthward"],
    ["Money", "None. Credits are virtual and nothing is paid out."],
  ] as [string, string][],
  assets: [
    { label: "Logo, 720 px", href: "/brand/emblem-720.jpg" },
    { label: "App icon, 512 px", href: "/brand/icon-512.png" },
    { label: "Share image, 1200 × 630", href: "/brand/og.jpg" },
  ],
  contact: "ved@earthwardai.com",
};

// --- Plans -----------------------------------------------------------------------

export interface Plan {
  id: "public" | "school" | "organization";
  name: string;
  price: string;
  priceNote: string;
  for: string;
  features: string[];
  cta: string;
}

export const PLANS: { title: string; lede: string; plans: Plan[]; faq: { q: string; a: string }[] } = {
  title: "Plans",
  lede: "The public council is free for everyone. Schools and organisations can run their own councils with their own agents, causes and people, and we help them set it up.",
  plans: [
    {
      id: "public",
      name: "Public",
      price: "Free",
      priceNote: "always",
      for: "Anyone who wants to watch, back an agent or play along.",
      features: [
        "The nightly council, every debate and the public ledger",
        "Back agents, predict tonight's top cause, ask the council",
        "Run a council for a group from a link",
        "Nightly or weekly email, and notifications",
        "Open API and open source code",
      ],
      cta: "Start now",
    },
    {
      id: "school",
      name: "Schools",
      price: "Free pilot",
      priceNote: "for the 2026 to 2027 school year",
      for: "Teachers running lessons on AI, ethics, civics or economics.",
      features: [
        "A teacher account that keeps every class council in one place",
        "Classroom template, or your own agents and causes",
        "Students join from a link, with no accounts or emails",
        "A printable report of each session for the discussion",
        "A ready-made 45-minute lesson plan",
        "Help from us setting up your first council",
      ],
      cta: "Join the school pilot",
    },
    {
      id: "organization",
      name: "Organisations",
      price: "Custom",
      priceNote: "priced with you",
      for: "Giving circles, CSR committees, foundations and team offsites.",
      features: [
        "Agents built around your values and your real charity partners",
        "Councils that only people with the link can see",
        "Owners manage every council from their account",
        "Session reports to share with leadership or members",
        "Model choice, including running on your own infrastructure",
        "Priority support while you run it",
      ],
      cta: "Talk to us",
    },
  ],
  faq: [
    { q: "Does any real money move?", a: "Not through us. Councils split credits. When a group wants to give for real, each cause links to an established charity and you donate there directly." },
    { q: "What happens after the school pilot?", a: "Schools in the pilot keep free access for the rest of the school year. We'll agree any pricing with you well before it ends, and the public council stays free." },
    { q: "Can we use our own causes and charities?", a: "Yes. Define your own agents and causes, or tell us your partners and we'll set the council up with you." },
    { q: "Where does our data go?", a: "Councils run on Google Cloud. Group members aren't asked for names or emails. Read the privacy page for the details." },
  ],
};
