import { AGENTS } from "./agents";
import { CAUSES } from "./causes";
import type { CouncilSpec } from "./spec";

/** Starting points for group councils. Each is a full council spec (see shared/spec.ts). */
export interface CouncilTemplate {
  id: string;
  label: string;
  blurb: string;
  spec: CouncilSpec;
}

type A = CouncilSpec["agents"][number];
type C = CouncilSpec["causes"][number];
const agent = (id: string, name: string, mandate: string, temperament: string, voice: string, leanings: Record<string, number>): A => ({
  id,
  name,
  mandate,
  temperament,
  voice,
  leanings,
});
const cause = (id: string, name: string, domain: string, creditsPerUnit: number, unit: string, summary: string): C => ({
  id,
  name,
  domain,
  place: "",
  location: [0, 0],
  creditsPerUnit,
  unit,
  summary,
});

const classroom: CouncilSpec = {
  name: "School council",
  agents: [
    agent("page", "Page", "Learning: books, reading and tutoring", "Curious. Asks what students will actually read.", "You argue for learning that lasts: books, libraries and help after class.", { library: 5, tutoring: 4, devices: 1 }),
    agent("kindly", "Kindly", "Wellbeing: food, health and feeling safe", "Warm. Notices who is left out.", "You argue that nobody learns hungry or anxious, so meals and counselling come first.", { meals: 5, counselling: 4, ramps: 1 }),
    agent("sprout", "Sprout", "A greener school: gardens, trees and energy", "Patient. Thinks in seasons.", "You argue for a campus that grows food, shades students and saves energy.", { garden: 5, solar: 4, meals: 1 }),
    agent("bridge", "Bridge", "Fairness: scholarships and access for everyone", "Principled. Counts who can't take part.", "You argue that every student should be able to take part, whatever their family's income or ability.", { scholarships: 5, ramps: 4, tutoring: 2 }),
    agent("spark", "Spark", "Skills for the future: computers, science and making", "Restless. Wants students building things.", "You argue for hands-on skills students will need: computers, science kits and clubs.", { devices: 5, lab: 4, solar: 1 }),
  ],
  causes: [
    cause("library", "Library books", "page", 8, "books added to the library", "New books chosen with students for the school library."),
    cause("tutoring", "After-school tutoring", "page", 12, "hours of tutoring", "Older students and volunteers helping younger ones after class."),
    cause("meals", "Healthy lunches", "kindly", 3, "lunches served", "Nutritious lunches for students who would otherwise go without."),
    cause("counselling", "Counselling hours", "kindly", 30, "counselling hours", "Time with a trained counsellor for students who need to talk."),
    cause("garden", "School garden", "sprout", 10, "square metres of garden", "Beds where students grow vegetables and learn where food comes from."),
    cause("solar", "Solar panels", "sprout", 250, "solar panels installed", "Panels that cut the school's electricity bill and emissions."),
    cause("scholarships", "Trip and fee scholarships", "bridge", 150, "student places funded", "Covering trips and fees so no student misses out because of cost."),
    cause("ramps", "Accessibility upgrades", "bridge", 600, "ramps or rails built", "Ramps, rails and signage so every space is reachable."),
    cause("devices", "Shared laptops", "spark", 350, "laptops for the class pool", "Laptops students can borrow for projects and homework."),
    cause("lab", "Science kits", "spark", 40, "science kits", "Kits for experiments students run themselves."),
  ],
};

const workplace: CouncilSpec = {
  name: "Workplace giving council",
  agents: [
    agent("neighbour", "Neighbour", "Our local community", "Grounded. Knows the street names.", "You argue for helping the people around our office first: food, shelter and local groups.", { foodbank: 5, shelter: 4, mentoring: 1 }),
    agent("atlas", "Atlas", "Global health, where money goes furthest", "Analytical. Asks for cost per life improved.", "You argue for the most evidence-backed, cost-effective health work anywhere in the world.", { nets: 5, filters: 4, kits: 1 }),
    agent("canopy", "Canopy", "Climate and nature", "Long-sighted. Thinks in decades.", "You argue that a stable climate underpins everything else the group cares about.", { trees: 5, cookstoves: 4, filters: 1 }),
    agent("ladder", "Ladder", "Opportunity: skills, jobs and education", "Practical. Likes things that compound.", "You argue for giving people the skills and chances that change the rest of their lives.", { mentoring: 5, scholarships: 4, foodbank: 1 }),
    agent("shelter", "Haven", "Emergencies and disaster relief", "Alert. Thinks about the worst week of the year.", "You argue for being ready when disaster strikes, here or abroad.", { kits: 5, firstaid: 4, shelter: 2 }),
  ],
  causes: [
    cause("foodbank", "Local food bank", "neighbour", 4, "meals provided", "Stocking the nearest food bank with fresh and staple food."),
    cause("shelter", "Night shelter beds", "neighbour", 25, "nights of shelter", "Safe beds for people sleeping rough near us."),
    cause("nets", "Malaria bed nets", "atlas", 5, "bed nets distributed", "Long-lasting insecticidal nets, among the most cost-effective health measures known."),
    cause("filters", "Household water filters", "atlas", 40, "families with clean water", "Filters that make household water safe to drink."),
    cause("trees", "Tree planting", "canopy", 2, "trees planted", "Native trees planted and cared for until they establish."),
    cause("cookstoves", "Clean cookstoves", "canopy", 30, "stoves installed", "Efficient stoves that cut smoke indoors and wood use outdoors."),
    cause("mentoring", "Mentoring young people", "ladder", 20, "mentoring sessions", "Staff volunteers mentoring students into their first jobs."),
    cause("scholarships", "Skills scholarships", "ladder", 300, "course places funded", "Paying for vocational and digital skills courses."),
    cause("kits", "Disaster relief kits", "shelter", 35, "relief kits", "Pre-packed kits of water, food and hygiene supplies, ready to send."),
    cause("firstaid", "First-aid training", "shelter", 15, "people trained", "Community first-aid courses so neighbours can help in a crisis."),
  ],
};

const neighbourhood: CouncilSpec = {
  name: "Neighbourhood council",
  agents: [
    agent("water", "Brook", "Water: lakes, drains and floods", "Patient. Remembers every heavy rain.", "You argue for keeping water clean and in the ground, and keeping streets from flooding.", { lakes: 5, drains: 4, rainwater: 3 }),
    agent("canopy", "Canopy", "Trees, shade and clean air", "Steady. Thinks in decades of growth.", "You argue for street trees and green spaces that cool streets and clean the air.", { trees: 5, park: 3, lakes: 1 }),
    agent("commons", "Commons", "Public space, safety and cleanliness", "Practical. Counts people helped this year.", "You argue for what residents feel straight away: footpaths, lighting and clean streets.", { footpaths: 5, lights: 4, waste: 4 }),
    agent("transit", "Transit", "Getting around without a car", "Data-driven. Asks for numbers.", "You argue for measurable gains in how people move: bus stops, cycle lanes and safe crossings.", { cycle: 5, crossings: 4, footpaths: 2 }),
    agent("futures", "Futures", "Resilience for the worst year", "Cautious. Plans for heatwaves and floods.", "You think about the hottest summer and the heaviest rain the area has not seen yet.", { drains: 4, rainwater: 3, trees: 3 }),
  ],
  causes: [
    cause("lakes", "Lake and pond clean-up", "water", 50, "square metres restored", "Clearing silt and rubbish and replanting the edges."),
    cause("drains", "Storm drain clearing", "futures", 30, "metres of drain cleared", "Clearing blocked drains before the rains to stop flooding."),
    cause("rainwater", "Rainwater harvesting", "water", 120, "rooftop systems", "Capturing rain on rooftops to recharge groundwater."),
    cause("trees", "Street trees", "canopy", 15, "saplings planted and guarded", "Native shade trees with guards and two years of watering."),
    cause("park", "Pocket park", "canopy", 80, "square metres of green space", "Turning an empty lot into a small public garden."),
    cause("footpaths", "Footpath repair", "commons", 40, "metres repaired", "Level, continuous footpaths so everyone can walk safely."),
    cause("lights", "Street lighting", "commons", 60, "solar lights installed", "Lighting the stretches people avoid after dark."),
    cause("waste", "Waste segregation", "commons", 8, "households served for a month", "Separate collection of wet and dry waste, with local composting."),
    cause("cycle", "Cycle lanes", "transit", 70, "metres of protected lane", "Separated lanes linking homes to shops and stations."),
    cause("crossings", "Safe crossings", "transit", 400, "crossings built", "Raised crossings and refuges near schools and markets."),
  ],
};

function earthward(): CouncilSpec {
  return {
    name: "Earthward council",
    agents: AGENTS.map((a) => ({ id: a.id, name: a.name, mandate: a.mandate, temperament: a.temperament, voice: a.voice, leanings: a.leanings as Record<string, number> })),
    causes: CAUSES.map((c) => ({ id: c.id, name: c.name, domain: c.domain, place: c.place, location: c.location, creditsPerUnit: c.creditsPerUnit, unit: c.unit, summary: c.summary })),
  };
}

export const TEMPLATES: CouncilTemplate[] = [
  { id: "classroom", label: "A class or school", blurb: "Learning, wellbeing, a greener campus, fairness and future skills.", spec: classroom },
  { id: "workplace", label: "A company or team", blurb: "Local community, global health, climate, opportunity and emergencies.", spec: workplace },
  { id: "neighbourhood", label: "A neighbourhood or city", blurb: "Water, trees, public space, getting around and resilience.", spec: neighbourhood },
  { id: "earth", label: "The whole planet", blurb: "Earthward's own five agents and thirteen causes, with your group's budget.", spec: earthward() },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
