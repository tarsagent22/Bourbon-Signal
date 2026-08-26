import type { TierEntitlements } from "./entitlements.ts";
import type { CollectionBottlePreference } from "./member-collection.ts";
import { canonicalBottleId } from "../data/bottle-identity-redirects.ts";

export type BottleCheckAction = "track" | "collection";

export function findBottleCheckCollectionEntry(
  entries: CollectionBottlePreference[],
  bottle: { id: string; canonicalName: string } | null | undefined,
) {
  if (!bottle) return null;
  const bottleKeys = bottleIdentityKeys(bottle.id, bottle.canonicalName);
  return entries.find((entry) => [...bottleIdentityKeys(entry.bottleId, entry.canonicalKey, entry.bottleName)]
    .some((key) => bottleKeys.has(key))) || null;
}

export function formatBottleCheckCollectionRating(entry: CollectionBottlePreference | null | undefined) {
  if (!entry) return null;
  if (!entry.isRated || !Number.isFinite(entry.rating)) {
    return "This bottle is in your collection, but you haven’t rated it yet.";
  }
  const score = (Math.max(0, Math.min(100, entry.rating)) / 10).toFixed(1);
  return `You rated this bottle ${score}/10.`;
}

function normalizeBottleIdentity(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function bottleIdentityKeys(...values: string[]) {
  const keys = new Set<string>();
  for (const value of values) {
    for (const candidate of [value, canonicalBottleId(value)]) {
      const normalized = normalizeBottleIdentity(candidate);
      if (normalized) keys.add(normalized);
    }
  }
  return keys;
}

export type ShelfPriceAssessment = {
  tone: "near" | "moderate" | "high";
  label: string;
  detail: string;
  premiumPercent: number;
};

export function assessShelfPrice(msrp: number | null | undefined, shelfPrice: number | null | undefined): ShelfPriceAssessment | null {
  if (typeof msrp !== "number" || !Number.isFinite(msrp) || msrp <= 0) return null;
  if (typeof shelfPrice !== "number" || !Number.isFinite(shelfPrice) || shelfPrice <= 0) return null;

  const rawPremiumPercent = ((shelfPrice - msrp) / msrp) * 100;
  const roundedPremiumPercent = Math.round(rawPremiumPercent);
  const premiumPercent = rawPremiumPercent;
  const displayPercent = Math.abs(rawPremiumPercent) < 1 ? "less than 1%" : `${Math.abs(roundedPremiumPercent)}%`;
  if (shelfPrice === msrp) {
    return {
      tone: "near",
      label: "At MSRP",
      detail: "This shelf price matches the MSRP listed in Bottle Check.",
      premiumPercent: 0,
    };
  }
  if (rawPremiumPercent < 0) {
    return {
      tone: "near",
      label: `${displayPercent} below MSRP`,
      detail: `This shelf price is ${displayPercent} below the MSRP listed in Bottle Check.`,
      premiumPercent,
    };
  }
  if (rawPremiumPercent <= 10) {
    return {
      tone: "near",
      label: "Near MSRP",
      detail: `This shelf price is ${displayPercent} above the MSRP listed in Bottle Check.`,
      premiumPercent,
    };
  }
  return {
    tone: rawPremiumPercent <= 25 ? "moderate" : "high",
    label: `${roundedPremiumPercent}% above MSRP`,
    detail: `This shelf price is ${roundedPremiumPercent}% above the MSRP listed in Bottle Check.`,
    premiumPercent,
  };
}

export type BottleCheckActionAccess =
  | { allowed: true }
  | {
      allowed: false;
      requiredTier: "Standard Proof" | "Barrel Proof";
      title: string;
      description: string;
    };

export type BottleCheckTrackContext = {
  trackedBottleCount?: number;
  currentAlertAreaCount?: number;
  requestedNewAreaCount?: number;
  alreadyTracked?: boolean;
};

export function bottleCheckActionAccess(
  action: BottleCheckAction,
  entitlements: TierEntitlements,
  context: BottleCheckTrackContext = {},
): BottleCheckActionAccess {
  if (action === "track") {
    if (entitlements.trackedBottleLimit === 0) {
      return {
        allowed: false,
        requiredTier: "Standard Proof",
        title: "Upgrade membership to track this bottle",
        description: "Standard Proof and higher memberships can save bottle alerts for selected markets.",
      };
    }
    if (context.alreadyTracked) return { allowed: true };
    const bottleLimitReached = typeof entitlements.trackedBottleLimit === "number"
      && (context.trackedBottleCount || 0) >= entitlements.trackedBottleLimit;
    const areaLimitReached = typeof entitlements.alertAreaLimit === "number"
      && (context.currentAlertAreaCount || 0) + (context.requestedNewAreaCount || 0) > entitlements.alertAreaLimit;
    if (bottleLimitReached || areaLimitReached) {
      return {
        allowed: false,
        requiredTier: "Barrel Proof",
        title: "Upgrade membership to track more bottles",
        description: "Barrel Proof and Founder memberships include unlimited tracked bottles and alert areas.",
      };
    }
    return { allowed: true };
  }
  if (entitlements.canUseCollection) return { allowed: true };
  return {
    allowed: false,
    requiredTier: "Barrel Proof",
    title: "Upgrade membership to add this bottle to your collection",
    description: "Barrel Proof and Founder memberships include the saved collection and taste profile.",
  };
}

type AlertAreaPreferencesLike = {
  states: string[];
  ncBoards?: string[];
  gaAreas?: string[];
  tnAreas?: string[];
  vaCities?: string[];
  ohCities?: string[];
  iaCities?: string[];
  idCities?: string[];
  scAreas?: string[];
  caAreas?: string[];
  nvAreas?: string[];
  nyAreas?: string[];
  coAreas?: string[];
  paCounties?: string[];
  paStores?: string[];
};

export function countBottleCheckAlertAreas(preferences: AlertAreaPreferencesLike) {
  const detailFields: Record<string, (keyof AlertAreaPreferencesLike)[]> = {
    NC: ["ncBoards"],
    GA: ["gaAreas"],
    TN: ["tnAreas"],
    VA: ["vaCities"],
    OH: ["ohCities"],
    IA: ["iaCities"],
    ID: ["idCities"],
    SC: ["scAreas"],
    CA: ["caAreas"],
    NV: ["nvAreas"],
    NY: ["nyAreas"],
    CO: ["coAreas"],
    PA: ["paCounties", "paStores"],
  };
  return preferences.states.reduce((count, state) => {
    const detailCount = (detailFields[state] || []).reduce((sum, field) => {
      const values = preferences[field];
      return sum + (Array.isArray(values) ? values.length : 0);
    }, 0);
    return count + Math.max(1, detailCount);
  }, 0);
}

export function countDistinctTrackedBottles(preferences: { bottleNames: string[]; bottleKeys: string[] }) {
  const normalize = (value: string) => value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return new Set(
    [...preferences.bottleNames, ...preferences.bottleKeys]
      .map(normalize)
      .filter(Boolean),
  ).size;
}

export function buildBottleCheckCollectionEntry(input: {
  bottleId: string;
  bottleName: string;
  canonicalKey: string;
  now?: string;
}): CollectionBottlePreference {
  const now = input.now || new Date().toISOString();
  return {
    bottleId: input.bottleId,
    bottleName: input.bottleName,
    canonicalKey: input.canonicalKey,
    rating: 0,
    isRated: false,
    tasteTags: [],
    wouldBuyAgain: false,
    opened: false,
    sealedQuantity: 1,
    openedQuantity: 0,
    finishedCount: 0,
    tastedOnly: false,
    notes: "",
    addedAt: now,
    updatedAt: now,
  };
}
