import { createHash } from "node:crypto";
import { retailerSubmissionLifecycle } from "./retailer-portal.ts";
import type { RetailerSubmissionRecord } from "./retailer-repository.ts";

const VERIFIED_RETAILER_SOURCE = "verified-retailer";
const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

export type RetailerFeedTier = "unicorn" | "allocated" | "limited" | "standard" | "unknown";
export type RetailerFeedSignalKind = "drop" | "barrel_pick" | "tasting" | "lottery";

export function retailerStateCode(address: string) {
  const candidates = address.toUpperCase().match(/\b[A-Z]{2}\b/g) || [];
  return candidates.reverse().find((candidate) => STATE_CODES.has(candidate)) || "";
}

function retailerPrice(value: string) {
  const match = /^\s*\$?\s*(\d+(?:\.\d{1,2})?)\s*$/.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

export function retailerSubmissionToDrop(submission: RetailerSubmissionRecord, now = new Date()) {
  if (retailerSubmissionLifecycle(submission, now) !== "live") return null;
  const state = retailerStateCode(submission.storeAddress);
  if (!state) return null;

  return {
    id: `retailer-${submission.id}`,
    canonicalId: submission.bottleId || undefined,
    bottleId: submission.bottleId || undefined,
    canonicalName: submission.title,
    bottleName: submission.title,
    rawName: submission.title,
    type: submission.kind === "barrel_pick" ? "verified_retailer_barrel_pick" : "verified_retailer_inventory",
    tier: "unknown",
    state,
    storeName: submission.storeName,
    storeAddress: submission.storeAddress,
    storeId: submission.storeId,
    locationName: submission.locationDetails || submission.storeName,
    locationPrecision: "store_level",
    source: VERIFIED_RETAILER_SOURCE,
    observedAt: submission.startsAt,
    firstSeenAt: submission.startsAt,
    lastConfirmedAt: submission.startsAt,
    displayAt: submission.startsAt,
    timestampBasis: "retailer_go_live_at",
    canAlertAsInventory: true,
    availabilityLabel: submission.availability || "Retailer reports this bottle in stock",
    inventoryCaveat: "Direct retailer report; availability can change before arrival.",
    evidence: submission.notes || "Submitted directly by a verified retailer.",
    price: retailerPrice(submission.price),
    retailerSignalId: submission.id,
    retailerReported: true,
    expiresAt: submission.expiresAt,
  };
}

export function retailerSubmissionToEvent(submission: RetailerSubmissionRecord, now = new Date()) {
  let eventDate = "";
  if (submission.kind === "bottle_drop" || submission.kind === "barrel_pick") {
    if (retailerSubmissionLifecycle(submission, now) !== "upcoming") return null;
    eventDate = submission.startsAt;
  } else if (submission.kind === "tasting" || submission.kind === "lottery") {
    const eventTime = Date.parse(submission.expiresAt);
    if (!Number.isFinite(eventTime) || eventTime <= now.getTime()) return null;
    eventDate = submission.expiresAt;
  } else {
    return null;
  }

  const state = retailerStateCode(submission.storeAddress);
  if (!state) return null;
  const category = submission.kind === "bottle_drop" ? "bottle_drop" : submission.kind;
  return {
    eventId: `retailer-${submission.id}`,
    id: `retailer-${submission.id}`,
    title: submission.title,
    category,
    state,
    bottleName: submission.title,
    canonicalName: submission.title,
    rawName: submission.title,
    storeName: submission.storeName,
    storeAddress: submission.storeAddress,
    storeId: submission.storeId,
    locationName: submission.locationDetails || submission.storeName,
    eventDate,
    observedAt: submission.createdAt,
    source: "Verified retailer",
    sourceType: "verified_retailer",
    sourceTypeLabel: "Verified retailer",
    eventStatus: "scheduled_future",
    actionability: "high",
    actionLabel: submission.kind === "lottery" ? "Entry deadline" : "Upcoming at retailer",
    inventoryCaveat: submission.notes || "Details submitted directly by a verified retailer.",
    canAlertAsInventory: false,
    canAlertAsWatch: true,
    retailerSignalId: submission.id,
    retailerReported: true,
  };
}

export function retailerSignalSnapshot(submissions: RetailerSubmissionRecord[], now = new Date()) {
  const value = submissions
    .filter((submission) => (
      submission.kind === "bottle_drop" || submission.kind === "barrel_pick"
    ) && retailerSubmissionLifecycle(submission, now) === "live")
    .map((submission) => [
      submission.id,
      submission.startsAt,
      submission.expiresAt,
      submission.soldOutAt,
    ].join(":"))
    .sort()
    .join("|");
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : "none";
}

export function retailerSubmissionToFeedCard(
  submission: RetailerSubmissionRecord,
  now = new Date(),
  tier: RetailerFeedTier = "unknown",
) {
  if (submission.status === "rejected" || submission.soldOutAt || submission.kind === "other") return null;
  const availabilityKind = submission.kind === "bottle_drop" || submission.kind === "barrel_pick";
  const lifecycle = retailerSubmissionLifecycle(submission, now);
  if (availabilityKind && lifecycle !== "live" && lifecycle !== "upcoming") return null;
  const eventDate = availabilityKind ? submission.startsAt : submission.expiresAt;
  if (!availabilityKind && (!eventDate || new Date(eventDate).getTime() <= now.getTime())) return null;

  const retailerSignalKind: RetailerFeedSignalKind = submission.kind === "bottle_drop" ? "drop" : submission.kind;
  const retailerSignalState = availabilityKind ? lifecycle : "upcoming";
  const type = `verified_retailer_${retailerSignalKind}`;
  return {
    id: `retailer:${submission.id}`,
    bottle_id: submission.bottleId || undefined,
    bottleId: submission.bottleId || undefined,
    bottle_name: submission.title,
    bottleName: submission.title,
    canonicalName: submission.title,
    bourbonName: submission.title,
    brand_name: submission.title,
    type,
    source: "verified-retailer",
    source_type: "verified_retailer",
    retailerReported: true,
    retailerSignalKind,
    retailerSignalState,
    canAlertAsInventory: availabilityKind && lifecycle === "live",
    tier,
    rarity_tier: tier,
    state: retailerStateCode(submission.storeAddress),
    region: retailerStateCode(submission.storeAddress),
    location: submission.locationDetails
      ? `${submission.storeName} · ${submission.locationDetails}`
      : submission.storeName,
    storeName: submission.storeName,
    storeAddress: submission.storeAddress,
    storeId: submission.storeId,
    locationDetails: submission.locationDetails,
    locationPrecision: "store_level",
    observedAt: submission.createdAt,
    timestamp: submission.createdAt,
    created_at: submission.createdAt,
    eventDate: eventDate || undefined,
    startsAt: submission.startsAt || undefined,
    expiresAt: submission.expiresAt || undefined,
    summary: submission.notes || (availabilityKind ? "Availability reported directly by this retailer." : "Event submitted directly by this retailer."),
    availability: submission.availability,
    price: submission.price,
    signal: "exact",
    signal_status: availabilityKind && lifecycle === "live" ? "live" : "upcoming",
    status: availabilityKind && lifecycle === "live" ? "confirmed" : "upcoming",
  };
}

export function retailerFeedSnapshot(submissions: RetailerSubmissionRecord[], now = new Date()) {
  const value = submissions
    .map((submission) => retailerSubmissionToFeedCard(submission, now))
    .filter((card): card is NonNullable<typeof card> => Boolean(card))
    .map((card) => [card.id, card.retailerSignalKind, card.retailerSignalState, card.startsAt || "", card.expiresAt || ""].join(":"))
    .sort()
    .join("|");
  return value ? createHash("sha256").update(value).digest("hex").slice(0, 16) : "none";
}

export function isVerifiedRetailerDrop(drop: Record<string, unknown>) {
  return drop.source === VERIFIED_RETAILER_SOURCE && drop.retailerReported === true;
}
