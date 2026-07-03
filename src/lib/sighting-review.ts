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
