import type { MemberSighting } from "@/lib/sightings";
import {
  buildApprovedBottle,
  buildApprovedLocation,
  type ApprovedBottle,
  type ApprovedBottleAvailability,
  type ApprovedBottleCategory,
  type ApprovedLocation,
} from "@/lib/approved-catalog";
import { createApprovedCatalogRepository } from "@/lib/approved-catalog-repository";

export async function listApprovedBottles(): Promise<ApprovedBottle[]> {
  return createApprovedCatalogRepository().listApprovedBottles();
}

export async function listApprovedLocations(): Promise<ApprovedLocation[]> {
  return createApprovedCatalogRepository().listApprovedLocations();
}

export async function upsertApprovedBottle(input: {
  canonicalName: string;
  brand: string;
  category: ApprovedBottleCategory;
  availability: ApprovedBottleAvailability;
}, approvedBy: string, approvalSource: string): Promise<ApprovedBottle> {
  const bottle = buildApprovedBottle(input, approvedBy, approvalSource);
  return createApprovedCatalogRepository().upsertApprovedBottle(bottle);
}

function inferredBrand(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).join(" ") || "Unknown";
}

export async function persistApprovedSightingCatalog(sighting: MemberSighting, approvedBy: string) {
  const repository = createApprovedCatalogRepository();
  const review = sighting.reviewState;
  let bottle: ApprovedBottle | null = null;
  let location: ApprovedLocation | null = null;
  if (review?.needsBottleReview) {
    const canonicalName = String(review.manualBottleName || sighting.bottleName || "").trim();
    bottle = await repository.upsertApprovedBottle(buildApprovedBottle({
      canonicalName,
      brand: inferredBrand(canonicalName),
      category: /\brye\b/i.test(canonicalName) ? "rye" : "bourbon",
      availability: review.manualBottleRarityTier || "limited",
    }, approvedBy, "sighting_review"));
  }
  if (review?.needsStoreReview) {
    location = await repository.upsertApprovedLocation(buildApprovedLocation({
      name: review.manualStoreName || sighting.storeName,
      address: review.manualStoreAddress,
      city: review.manualStoreCity || sighting.storeCity || "",
      state: review.manualStoreState || sighting.storeState || "",
      zip: review.manualStoreZip,
    }, approvedBy, "sighting_review"));
  }
  return { bottle, location };
}
