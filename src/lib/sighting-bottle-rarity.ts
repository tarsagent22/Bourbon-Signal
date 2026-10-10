import type { SightingBottleRarity } from "../../shared/sighting-bottle-rarity";
import { getScarcityTierPresentation, resolveBottleScarcity } from "./bottle-scarcity";
import type { BibleBottle } from "./bourbonBible";
import type { MemberSighting } from "./sightings";

// Geography belongs to the sighting, never the viewing member's preferences.
export function sightingBottleRarity(sighting: MemberSighting, bottle?: BibleBottle, now = Date.now()): SightingBottleRarity {
  const state = (sighting.storeState || "").trim().toUpperCase();
  const city = (sighting.storeCity || "").trim();
  const online = sighting.sightingType === "online_social";
  const areaLabel = online ? "Online" : [city, state].filter(Boolean).join(", ") || "Location unknown";
  const pending = !bottle || bottle.rarityPending === true;
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
    // Catalog rarity describes the expression. Inventory confidence describes
    // the local evidence and must not erase a known expression's baseline.
    nationalLabel: bottle.availability === "regional" ? "Regional availability" : getScarcityTierPresentation(scarcity.nationalTier).label,
    localLabel: localEstablished ? `${scarcity.marketLabel} in ${evidenceArea}` : "Limited local data",
    areaLabel,
    localEstablished,
    ...(localEstablished ? { localReason: scarcity.localReason || undefined, reviewedAt: override!.lastReviewedAt } : {}),
  };
}

export function sightingBottleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildSightingRarityCatalog(catalog: BibleBottle[]) {
  const byName = new Map<string, BibleBottle | null>();
  for (const bottle of catalog) {
    for (const name of [bottle.canonicalName, ...bottle.aliases]) {
      const key = sightingBottleKey(name);
      if (!key) continue;
      const existing = byName.get(key);
      byName.set(key, existing === undefined || existing?.id === bottle.id ? bottle : null);
    }
  }
  const byId = new Map(catalog.map(bottle => [bottle.id, bottle]));
  const resolve = (sighting: Pick<MemberSighting, "bottleId" | "bottleName">) => {
    const key = sightingBottleKey(sighting.bottleName);
    const idMatch = byId.get(sighting.bottleId || "");
    if (idMatch && [idMatch.canonicalName, ...idMatch.aliases].some(name => sightingBottleKey(name) === key)) return idMatch;
    return byName.get(key) || undefined;
  };
  const tier = (bottle?: BibleBottle): MemberSighting["rarityTier"] => {
    if (!bottle || bottle.rarityPending) return undefined;
    const availability = bottle.availability;
    if (availability === "unicorn" || availability === "highly_allocated") return "unicorn";
    if (availability === "allocated") return "allocated";
    if (["limited", "seasonal", "regional"].includes(availability)) return "limited";
    return undefined;
  };
  const filterTiers = Object.fromEntries([...byName].map(([key, bottle]) => [key, tier(bottle || undefined) || "unclassified"]));
  for (const bottle of catalog) for (const name of [bottle.canonicalName, ...bottle.aliases]) {
    filterTiers[`${bottle.id}|${sightingBottleKey(name)}`] = tier(bottle) || "unclassified";
  }
  return { resolve, tier, filterTiers, present: (sighting: MemberSighting) => {
    const bottle = resolve(sighting);
    return { ...sighting, ...(bottle ? { bottleId: bottle.id } : {}), rarityTier: tier(bottle), bottleRarity: sightingBottleRarity(sighting, bottle) };
  } };
}
