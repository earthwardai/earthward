import type { AgentId } from "./agents";
import { worldScoped } from "./world";

export type CauseId =
  | "reforest"
  | "mangroves"
  | "reefs"
  | "oceans"
  | "water"
  | "wildlife"
  | "animals"
  | "pollinators"
  | "malaria"
  | "education"
  | "clinics"
  | "warning"
  | "seeds";

export interface Cause {
  id: CauseId;
  name: string;
  /** Agent whose mandate covers this cause. Drives colour grouping. */
  domain: AgentId;
  place: string;
  location: [lat: number, lng: number];
  /** Simulated outcome: how many credits produce one unit. Illustrative only. */
  creditsPerUnit: number;
  unit: string;
  summary: string;
}

const EARTHWARD_CAUSES: Cause[] = [
  {
    id: "reforest",
    name: "Tropical reforestation",
    domain: "verdant",
    place: "Amazon basin",
    location: [-3.4, -62.2],
    creditsPerUnit: 1.5,
    unit: "trees planted",
    summary: "Native-species planting on degraded rainforest land, tended for five years.",
  },
  {
    id: "mangroves",
    name: "Mangrove restoration",
    domain: "verdant",
    place: "Sundarbans delta",
    location: [21.9, 89.2],
    creditsPerUnit: 0.8,
    unit: "mangrove seedlings planted",
    summary: "Coastal forests that store carbon and shield villages from storm surge.",
  },
  {
    id: "reefs",
    name: "Coral reef restoration",
    domain: "tide",
    place: "Coral Triangle",
    location: [-8.5, 124.0],
    creditsPerUnit: 40,
    unit: "square metres of reef restored",
    summary: "Heat-tolerant coral fragments grown in nurseries and reattached to damaged reef.",
  },
  {
    id: "oceans",
    name: "Ocean plastic recovery",
    domain: "tide",
    place: "North Pacific",
    location: [32.0, -142.0],
    creditsPerUnit: 2,
    unit: "kg of plastic recovered",
    summary: "River-mouth barriers and offshore collection before plastic breaks into microplastic.",
  },
  {
    id: "water",
    name: "Safe drinking water",
    domain: "tide",
    place: "East Africa",
    location: [1.3, 36.8],
    creditsPerUnit: 12,
    unit: "people with safe water for a year",
    summary: "Borehole repair and household filters in communities without a reliable source.",
  },
  {
    id: "wildlife",
    name: "Wildlife corridors",
    domain: "kindred",
    place: "Serengeti–Mara",
    location: [-2.3, 34.8],
    creditsPerUnit: 25,
    unit: "hectares of habitat protected",
    summary: "Leasing land that reconnects migration routes, with community ranger patrols.",
  },
  {
    id: "animals",
    name: "Animal rescue and care",
    domain: "kindred",
    place: "South Asia",
    location: [19.1, 72.9],
    creditsPerUnit: 3,
    unit: "animal shelter days",
    summary: "Veterinary care, sterilisation and shelter for street and working animals.",
  },
  {
    id: "pollinators",
    name: "Pollinator habitat",
    domain: "kindred",
    place: "Western Europe",
    location: [51.5, 5.0],
    creditsPerUnit: 0.5,
    unit: "square metres of wildflower meadow",
    summary: "Native wildflower strips along farmland to bring back bees and other insects.",
  },
  {
    id: "malaria",
    name: "Malaria prevention",
    domain: "hearth",
    place: "West Africa",
    location: [9.1, 7.5],
    creditsPerUnit: 4,
    unit: "bed nets distributed",
    summary: "Insecticide-treated nets, one of the most cost-effective ways to save a life.",
  },
  {
    id: "education",
    name: "Girls' education",
    domain: "hearth",
    place: "Sahel",
    location: [13.5, 2.1],
    creditsPerUnit: 30,
    unit: "school months for a girl",
    summary: "Fees, uniforms and materials that keep girls in school through adolescence.",
  },
  {
    id: "clinics",
    name: "Solar-powered clinics",
    domain: "hearth",
    place: "Rural India",
    location: [25.6, 85.1],
    creditsPerUnit: 20,
    unit: "clinic days on solar power",
    summary: "Panels and batteries so rural clinics keep vaccines cold and lights on at night.",
  },
  {
    id: "warning",
    name: "Disaster early warning",
    domain: "horizon",
    place: "Philippines",
    location: [12.9, 121.8],
    creditsPerUnit: 6,
    unit: "households reached by early warnings",
    summary: "SMS and radio alerts that give families hours of notice before floods and typhoons.",
  },
  {
    id: "seeds",
    name: "Seed and crop diversity",
    domain: "horizon",
    place: "Svalbard and partner banks",
    location: [78.2, 15.6],
    creditsPerUnit: 150,
    unit: "seed varieties preserved",
    summary: "Collecting and storing crop varieties that future farmers may need in a hotter world.",
  },
];

/** The council's causes: Earthward's thirteen, or a group council's own while it deliberates. */
export const CAUSES: Cause[] = worldScoped(EARTHWARD_CAUSES, (w) => w.causes);

export const CAUSE_IDS: CauseId[] = worldScoped(
  EARTHWARD_CAUSES.map((c) => c.id),
  (w) => w.causeIds,
);

export const causeById = (id: string): Cause | undefined => CAUSES.find((c) => c.id === id);
