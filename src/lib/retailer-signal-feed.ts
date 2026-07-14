import { createHash } from "node:crypto";
import { retailerSubmissionLifecycle } from "./retailer-portal.ts";
import type { RetailerSubmissionRecord } from "./retailer-repository.ts";

const VERIFIED_RETAILER_SOURCE = "verified-retailer";
const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

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

export function isVerifiedRetailerDrop(drop: Record<string, unknown>) {
  return drop.source === VERIFIED_RETAILER_SOURCE && drop.retailerReported === true;
}
