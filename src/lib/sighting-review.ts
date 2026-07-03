import type { MemberSighting, SightingReviewState } from "@/lib/sightings";

export function sanitizeManualSightingField(value: unknown, maxLength = 180) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function needsSightingReview(sighting: Pick<MemberSighting, "reviewState" | "rewardState">) {
  const review = sighting.reviewState;
  return Boolean(
    review?.needsBottleReview ||
    review?.needsStoreReview ||
    sighting.rewardState?.photoProof ||
    sighting.rewardState?.removedAt ||
    sighting.rewardState?.rejectedAt
  );
}

export function reviewReasonLabels(review?: SightingReviewState) {
  const labels: string[] = [];
  if (review?.needsBottleReview) labels.push("Manual bottle");
  if (review?.needsStoreReview) labels.push("Manual store");
  return labels;
}

function normalizeReviewKey(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sightingDuplicateKey(sighting: Pick<MemberSighting, "bottleName" | "bottleId" | "storeName" | "storeId">) {
  const bottle = normalizeReviewKey(sighting.bottleId || sighting.bottleName);
  const store = normalizeReviewKey(sighting.storeId || sighting.storeName);
  return `${bottle}::${store}`;
}

export function isLikelyDuplicateSighting(
  existing: Pick<MemberSighting, "bottleName" | "bottleId" | "storeName" | "storeId" | "createdAt">,
  next: Pick<MemberSighting, "bottleName" | "bottleId" | "storeName" | "storeId" | "createdAt">,
  windowMs = 15 * 60 * 1000
) {
  if (sightingDuplicateKey(existing) !== sightingDuplicateKey(next)) return false;
  const existingTime = +new Date(existing.createdAt);
  const nextTime = +new Date(next.createdAt);
  if (!Number.isFinite(existingTime) || !Number.isFinite(nextTime)) return true;
  return Math.abs(nextTime - existingTime) <= windowMs;
}
