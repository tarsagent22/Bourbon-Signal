import type { SightingBottleRarity } from "../../shared/sighting-bottle-rarity";
import { resolveBottleScarcity } from "./bottle-scarcity";
import type { BibleBottle } from "./bourbonBible";
import type { MemberSighting } from "./sightings";

// Geography belongs to the sighting, never the viewing member's preferences.
export function sightingBottleRarity(sighting: MemberSighting, bottle?: BibleBottle, now = Date.now()): SightingBottleRarity {
  const state = (sighting.storeState || "").trim().toUpperCase();
  const city = (sighting.storeCity || "").trim();
  const online = sighting.sightingType === "online_social";
  const areaLabel = online ? "Online" : [city, state].filter(Boolean).join(", ") || "Location unknown";
  const pending = !bottle || bottle.rarityPending === true || sighting.reviewState?.needsBottleReview === true;
  const unknown: SightingBottleRarity = { pending, nationalLabel: "Rarity pending", localLabel: "Limited local data", areaLabel, localEstablished: false };
  if (pending) return unknown;
  const jurisdiction = online ? "" : [state, city.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")].filter(Boolean).join("-");
  const scarcity = resolveBottleScarcity(bottle, jurisdiction);
  const override = scarcity.override;
  const end = override ? Date.parse(override.evidenceWindow.end) : NaN;
  const fresh = Number.isFinite(end) && end <= now && now - end <= 90 * 86_400_000;
  const localEstablished = !online && !!state && scarcity.localClassificationEstablished && fresh;
  // Statewide evidence must remain labelled statewide, never as a city-specific claim.
  const evidenceArea = override?.jurisdiction === state ? state : areaLabel;
  return {
    pending: false,
    nationalLabel: scarcity.nationalLabel === "Scarcity under review" ? "Rarity pending" : scarcity.nationalLabel,
    localLabel: localEstablished ? `${scarcity.marketLabel} in ${evidenceArea}` : "Limited local data",
    areaLabel,
    localEstablished,
    ...(localEstablished ? { localReason: scarcity.localReason || undefined, reviewedAt: override!.lastReviewedAt } : {}),
  };
}
