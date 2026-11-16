import type { CauseId } from "./causes";

/**
 * "Give for real": one established nonprofit per cause, each with a donation page on Every.org,
 * a nonprofit donation platform. Earthward never touches the money and takes no cut. Each
 * organisation and page was checked by hand in November 2026; ratings are from the organisation's
 * evaluator profile at the time.
 */
export interface GiveOption {
  org: string;
  url: string;
  credential: string;
}

const every = (slug: string) => `https://www.every.org/${slug}#/donate`;

export const GIVING: Record<CauseId, GiveOption> = {
  reforest: { org: "One Tree Planted", url: every("onetreeplanted"), credential: "Charity Navigator 4 stars" },
  mangroves: { org: "Mangrove Action Project", url: every("mangrove-action-project"), credential: "Charity Navigator 3 stars" },
  reefs: { org: "Coral Restoration Foundation", url: every("coralrestoration"), credential: "Charity Navigator 4 stars" },
  oceans: { org: "Ocean Conservancy", url: every("ocean-conservancy"), credential: "Charity Navigator 4 stars" },
  water: { org: "charity: water", url: every("charitywater"), credential: "Charity Navigator 4 stars" },
  wildlife: { org: "African Wildlife Foundation", url: every("awf"), credential: "Charity Navigator 4 stars" },
  animals: { org: "Animal Aid Unlimited", url: every("animal-aid-unlimited"), credential: "Charity Navigator 4 stars" },
  pollinators: { org: "Xerces Society", url: every("xerces"), credential: "Charity Navigator 4 stars" },
  malaria: { org: "Against Malaria Foundation", url: every("againstmalaria"), credential: "GiveWell top charity" },
  education: { org: "Malala Fund", url: every("malalafund"), credential: "Charity Navigator 4 stars" },
  clinics: { org: "We Care Solar", url: every("we-care-solar"), credential: "Charity Navigator 4 stars" },
  warning: { org: "Prosper Global (formerly Mercy Corps)", url: every("mercy-corps"), credential: "Charity Navigator 3 stars" },
  seeds: { org: "Crop Trust", url: every("global-crop-diversity-trust"), credential: "Global seed vault partner" },
};

export const givingFor = (causeId: string): GiveOption | undefined => GIVING[causeId as CauseId];
