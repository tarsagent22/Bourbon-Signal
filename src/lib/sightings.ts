import type { SightingRewardState } from "@/lib/sighting-rewards";

export type SightingSource = "custom" | "feed" | "finder";
export type SightingType = "seen_in_store" | "online_social";
export type SightingVoteKind = "up" | "down";
export type SignalReportKind = "seen" | "not_seen";

export interface SightingVote {
  sightingId: string;
  kind: SightingVoteKind;
  createdAt: string;
}

export interface SightingReviewState {
  needsBottleReview?: boolean;
  needsStoreReview?: boolean;
  manualBottleName?: string;
  manualBottleRarityTier?: "unicorn" | "allocated" | "limited";
  manualStoreName?: string;
  manualStoreAddress?: string;
  manualStoreCity?: string;
  manualStoreState?: string;
  manualStoreZip?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
}

export interface MemberSighting {
  id: string;
  bottleName: string;
  bottleId?: string;
  rarityTier?: "unicorn" | "allocated" | "limited";
  storeId: string;
  storeName: string;
  storeAddress: string;
  storeCity?: string;
  storeState?: string;
  storeZip?: string;
  quantityEstimate?: string;
  price?: number | null;
  notes?: string;
  source: SightingSource;
  sightingType?: SightingType;
  reporterUserId?: string;
  createdAt: string;
  upCount?: number;
  downCount?: number;
  myVote?: SightingVoteKind | null;
  storeTimeZone?: string;
  rewardState?: SightingRewardState;
  reviewState?: SightingReviewState;
  reporterDisplayName?: string;
  reporterBadges?: string[];
}

export interface SignalReport {
  id: string;
  signalId: string;
  bottleName: string;
  storeName?: string;
  storeAddress?: string;
  state?: string;
  kind: SignalReportKind;
  createdAt: string;
}

export interface SightingsPreferences {
  submittedSightings: MemberSighting[];
  signalReports: SignalReport[];
  sightingVotes?: SightingVote[];
}

export const EMPTY_SIGHTINGS_PREFERENCES: SightingsPreferences = {
  submittedSightings: [],
  signalReports: [],
  sightingVotes: [],
};

export function normalizeBottleKey(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function makeSightingId(prefix = "sighting") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function canonicalizeLegacySighting(input: MemberSighting, ownerUserId: string): MemberSighting {
  const parsedCreatedAt = new Date(input.createdAt);
  const now = new Date();
  const createdAt = Number.isFinite(parsedCreatedAt.getTime()) && parsedCreatedAt <= now ? parsedCreatedAt.toISOString() : now.toISOString();
  const review = input.reviewState;
  return {
    id: String(input.id).slice(0, 160), bottleName: String(input.bottleName || "Unknown bottle").slice(0, 180),
    bottleId: input.bottleId ? String(input.bottleId).slice(0, 180) : undefined, rarityTier: input.rarityTier,
    storeId: String(input.storeId || "manual-store").slice(0, 180), storeName: String(input.storeName || "Unknown store").slice(0, 180),
    storeAddress: String(input.storeAddress || "").slice(0, 300), storeCity: input.storeCity ? String(input.storeCity).slice(0, 100) : undefined,
    storeState: input.storeState ? String(input.storeState).slice(0, 32) : undefined, storeZip: input.storeZip ? String(input.storeZip).slice(0, 20) : undefined,
    quantityEstimate: input.quantityEstimate ? String(input.quantityEstimate).slice(0, 80) : undefined,
    price: typeof input.price === "number" && Number.isFinite(input.price) ? input.price : null,
    notes: input.notes ? String(input.notes).slice(0, 1000) : undefined, source: input.source, sightingType: input.sightingType,
    reporterUserId: ownerUserId, createdAt, storeTimeZone: input.storeTimeZone ? String(input.storeTimeZone).slice(0, 80) : undefined,
    rewardState: {},
    reviewState: review ? {
      needsBottleReview: Boolean(review.needsBottleReview), needsStoreReview: Boolean(review.needsStoreReview),
      manualBottleName: review.manualBottleName ? String(review.manualBottleName).slice(0, 180) : undefined,
      manualBottleRarityTier: review.manualBottleRarityTier,
      manualStoreName: review.manualStoreName ? String(review.manualStoreName).slice(0, 180) : undefined,
      manualStoreAddress: review.manualStoreAddress ? String(review.manualStoreAddress).slice(0, 300) : undefined,
      manualStoreCity: review.manualStoreCity ? String(review.manualStoreCity).slice(0, 100) : undefined,
      manualStoreState: review.manualStoreState ? String(review.manualStoreState).slice(0, 32) : undefined,
      manualStoreZip: review.manualStoreZip ? String(review.manualStoreZip).slice(0, 20) : undefined,
    } : undefined,
  };
}

export function formatStoreAddress(parts: Array<string | undefined | null>) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

export function sightingTypeLabel(type?: SightingType) {
  return type === "online_social" ? "Online/Social Media" : "Seen in store";
}
