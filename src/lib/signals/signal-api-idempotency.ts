import { createHash } from "node:crypto";
import type { MemberSighting } from "../sightings.ts";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function idempotentSightingId(userId: string, idempotencyKey: string) {
  return `sighting_api_${sha256(`${userId}\n${idempotencyKey}`).slice(0, 32)}`;
}

function createIdentity(sighting: Partial<MemberSighting>) {
  const review = sighting.reviewState;
  return {
    bottleName: sighting.bottleName || null,
    bottleId: sighting.bottleId || null,
    storeId: sighting.storeId || null,
    storeName: sighting.storeName || null,
    storeAddress: sighting.storeAddress || null,
    storeCity: sighting.storeCity || null,
    storeState: sighting.storeState || null,
    storeZip: sighting.storeZip || null,
    quantityEstimate: sighting.quantityEstimate || null,
    price: sighting.price ?? null,
    notes: sighting.notes || null,
    source: sighting.source || null,
    sightingType: sighting.sightingType || "seen_in_store",
    reporterUserId: sighting.reporterUserId || null,
    reviewState: review ? {
      needsBottleReview: Boolean(review.needsBottleReview),
      needsStoreReview: Boolean(review.needsStoreReview),
      manualBottleName: review.manualBottleName || null,
      manualStoreName: review.manualStoreName || null,
      manualStoreAddress: review.manualStoreAddress || null,
      manualStoreCity: review.manualStoreCity || null,
      manualStoreState: review.manualStoreState || null,
      manualStoreZip: review.manualStoreZip || null,
    } : null,
  };
}

export function idempotentSightingFingerprint(sighting: Partial<MemberSighting>) {
  return sha256(JSON.stringify(createIdentity(sighting)));
}

export function sameIdempotentSighting(left: MemberSighting, right: MemberSighting) {
  if (left.idempotencyFingerprint || right.idempotencyFingerprint) {
    return Boolean(left.idempotencyFingerprint && right.idempotencyFingerprint && left.idempotencyFingerprint === right.idempotencyFingerprint);
  }
  return idempotentSightingFingerprint(left) === idempotentSightingFingerprint(right);
}
