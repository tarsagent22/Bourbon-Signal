import { createHash } from "node:crypto";
import { geographyState, searchGeography } from "./geography-directory.ts";
import type { MemberSighting } from "./sightings.ts";

export const COMMUNITY_ALERT_FRESHNESS_HOURS = 2;

export interface CanonicalCommunityStore {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
}

export function canonicalCommunityStoreKey(state: string, storeId: string) {
  return `${state.trim().toUpperCase()}:${storeId.trim()}`;
}

function cityToken(value: string) {
  return value.toLowerCase().replace(/\b(city|town|village|borough|municipality|cdp)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function cityIsValid(state: string, city: string) {
  const wanted = cityToken(city);
  return Boolean(wanted && searchGeography({ state, levels: ["city"], query: city, limit: 50, offset: 0 }).results.some((entry) => cityToken(entry.name) === wanted));
}

export type CommunitySightingQualification = { qualified: true; freshnessHours: number; store: CanonicalCommunityStore } | { qualified: false; reason: string };

function addressToken(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }

export function canonicalCommunityStoreMatches(store: CanonicalCommunityStore, candidate: { storeId?: unknown; storeName?: unknown; storeAddress?: unknown; storeCity?: unknown; storeState?: unknown }) {
  return store.id === String(candidate.storeId || "").trim()
    && addressToken(store.address) === addressToken(String(candidate.storeAddress || ""))
    && addressToken(store.name) === addressToken(String(candidate.storeName || ""))
    && cityToken(store.city) === cityToken(String(candidate.storeCity || ""))
    && store.state === String(candidate.storeState || "").trim().toUpperCase();
}

export function qualifyCommunitySighting(sighting: MemberSighting, now = new Date().toISOString(), canonicalStores?: ReadonlyMap<string, CanonicalCommunityStore>): CommunitySightingQualification {
  if (!sighting.reporterUserId?.trim()) return { qualified: false, reason: "unauthenticated_reporter" };
  if (sighting.sightingType !== "seen_in_store") return { qualified: false, reason: "not_seen_in_store" };
  if (!sighting.bottleId?.trim() || !sighting.bottleName?.trim()) return { qualified: false, reason: "noncanonical_bottle" };
  if (!sighting.storeId?.trim() || /(^|[:_-])manual([:_-]|$)/i.test(sighting.storeId)) return { qualified: false, reason: "noncanonical_store" };
  if (!sighting.storeAddress?.trim()) return { qualified: false, reason: "missing_store_address" };
  const state = sighting.storeState?.trim().toUpperCase() || "";
  const city = sighting.storeCity?.trim() || "";
  if (!geographyState(state) || !cityIsValid(state, city)) return { qualified: false, reason: "invalid_store_geography" };
  const canonicalStore = canonicalStores?.get(canonicalCommunityStoreKey(state, sighting.storeId));
  if (!canonicalStore || !canonicalCommunityStoreMatches(canonicalStore, sighting)) {
    return { qualified: false, reason: "noncanonical_store" };
  }
  const review = sighting.reviewState;
  if (review?.needsBottleReview || review?.needsStoreReview || review?.manualBottleName || review?.manualBottleRarityTier
    || review?.manualStoreName || review?.manualStoreAddress || review?.manualStoreCity || review?.manualStoreState || review?.manualStoreZip) {
    return { qualified: false, reason: "pending_review" };
  }
  if (sighting.rewardState?.removedAt || sighting.rewardState?.rejectedAt) return { qualified: false, reason: "removed_or_rejected" };
  const observed = Date.parse(sighting.createdAt);
  const current = Date.parse(now);
  const freshnessHours = (current - observed) / 3_600_000;
  if (!Number.isFinite(freshnessHours) || freshnessHours < -5 / 60 || freshnessHours > COMMUNITY_ALERT_FRESHNESS_HOURS) {
    return { qualified: false, reason: "outside_freshness_window" };
  }
  return { qualified: true, freshnessHours: Math.max(0, freshnessHours), store: canonicalStore };
}

export function buildCommunityAlertCandidates(sightings: MemberSighting[], now = new Date().toISOString(), canonicalStores?: ReadonlyMap<string, CanonicalCommunityStore>) {
  const unique = new Map<string, Record<string, unknown>>();
  for (const sighting of sightings) {
    const qualification = qualifyCommunitySighting(sighting, now, canonicalStores);
    if (!qualification.qualified || unique.has(sighting.id)) continue;
    const store = qualification.store;
    const state = store.state;
    unique.set(sighting.id, {
      id: `community:${sighting.id}`,
      dedupeKey: `community-sighting:${sighting.id}`,
      matchKey: `community:${createHash("sha256").update(sighting.id).digest("hex").slice(0, 24)}`,
      source: "Community sighting",
      sourceType: "community",
      bottle: sighting.bottleName.trim(),
      canonicalName: sighting.bottleName.trim(),
      bottleId: sighting.bottleId,
      state,
      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      storeCity: store.city,
      locationName: store.name,
      locationPrecision: "store_level",
      eventType: "qualified_community_sighting",
      actionabilityClass: "community_store_sighting",
      tier: sighting.rarityTier || "limited",
      priorityClass: sighting.rarityTier === "unicorn" ? "major" : "standard",
      reliabilityScore: 70,
      signalAt: sighting.createdAt,
      freshnessHours: qualification.freshnessHours,
      freshnessPolicyHours: { onSite: COMMUNITY_ALERT_FRESHNESS_HOURS, email: COMMUNITY_ALERT_FRESHNESS_HOURS, sms: COMMUNITY_ALERT_FRESHNESS_HOURS },
      eligibleForDelivery: true,
      eligibleForOnSite: true,
      eligibleForEmail: true,
      eligibleForSms: true,
      availabilityStatus: "community_reported",
      availabilityLabel: "A member reported seeing this bottle at this store recently. Availability is unconfirmed.",
      evidence: "Recent qualified member report; check with the store before making a trip.",
      blockers: [],
      cautions: ["community_report_not_verified_inventory"],
    });
  }
  return [...unique.values()];
}
