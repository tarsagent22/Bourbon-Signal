import type { MemberSighting, SightingReviewState } from "@/lib/sightings";

export const SIGHTING_DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

export function sanitizeManualSightingField(value: unknown, maxLength = 180) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function needsSightingReview(sighting: Pick<MemberSighting, "reviewState" | "rewardState">) {
  if (sighting.rewardState?.removedAt || sighting.rewardState?.rejectedAt) return false;
  const review = sighting.reviewState;
  const photoStatus = sighting.rewardState?.photoProof?.status;
  return Boolean(
    review?.needsBottleReview ||
    review?.needsStoreReview ||
    (sighting.rewardState?.photoProof && (!photoStatus || photoStatus === "pending"))
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
  windowMs = SIGHTING_DUPLICATE_WINDOW_MS
) {
  if (sightingDuplicateKey(existing) !== sightingDuplicateKey(next)) return false;
  const existingTime = +new Date(existing.createdAt);
  const nextTime = +new Date(next.createdAt);
  if (!Number.isFinite(existingTime) || !Number.isFinite(nextTime)) return true;
  return Math.abs(nextTime - existingTime) <= windowMs;
}

export function isSameReporterCanonicalDuplicateSighting(
  existing: Pick<MemberSighting, "reporterUserId" | "bottleId" | "storeId" | "createdAt">,
  next: Pick<MemberSighting, "reporterUserId" | "bottleId" | "storeId" | "createdAt">,
  windowMs = SIGHTING_DUPLICATE_WINDOW_MS,
) {
  const existingReporter = String(existing.reporterUserId || "").trim();
  const nextReporter = String(next.reporterUserId || "").trim();
  const existingBottle = String(existing.bottleId || "").trim();
  const nextBottle = String(next.bottleId || "").trim();
  const existingStore = String(existing.storeId || "").trim();
  const nextStore = String(next.storeId || "").trim();
  if (!existingReporter || existingReporter !== nextReporter) return false;
  if (!existingBottle || existingBottle !== nextBottle) return false;
  if (!existingStore || existingStore !== nextStore) return false;
  const existingTime = Date.parse(existing.createdAt);
  const nextTime = Date.parse(next.createdAt);
  return Number.isFinite(existingTime)
    && Number.isFinite(nextTime)
    && Math.abs(nextTime - existingTime) <= windowMs;
}
