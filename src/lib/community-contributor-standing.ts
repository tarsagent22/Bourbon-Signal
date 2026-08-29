import type { MemberSighting } from "./sightings.ts";

export const COMMUNITY_CONTRIBUTOR_SPACING_HOURS = 24;
export const COMMUNITY_CONTRIBUTOR_SURVIVAL_HOURS = 24;
export const COMMUNITY_ALERT_AUTHORITY_LIMIT = 3;
export const COMMUNITY_ALERT_AUTHORITY_WINDOW_HOURS = 24;

const HOUR_MS = 3_600_000;

export type CommunityContributorStanding = "new" | "active" | "restricted";
export type CommunityContributorRestrictionKind = "spam" | "deception";

export interface CommunityContributorModeration {
  restrictionKind: CommunityContributorRestrictionKind;
  restrictionReason: string;
  restrictedAt: string;
  restrictedBy?: string | null;
  restorationReason?: string | null;
  restoredAt?: string | null;
  restoredBy?: string | null;
}

function hasPendingReview(sighting: MemberSighting) {
  const review = sighting.reviewState;
  return Boolean(
    review?.needsBottleReview
    || review?.needsStoreReview
    || review?.manualBottleName
    || review?.manualBottleRarityTier
    || review?.manualStoreName
    || review?.manualStoreAddress
    || review?.manualStoreCity
    || review?.manualStoreState
    || review?.manualStoreZip
  );
}

export function isCleanCommunityStandingSighting(sighting: MemberSighting, now = new Date().toISOString()) {
  if (!sighting.reporterUserId?.trim()) return false;
  if (sighting.sightingType !== "seen_in_store") return false;
  if (!sighting.bottleId?.trim() || !sighting.bottleName?.trim()) return false;
  if (!sighting.storeId?.trim() || !sighting.storeAddress?.trim() || !sighting.storeCity?.trim() || !sighting.storeState?.trim()) return false;
  if (/(^|[:_-])manual([:_-]|$)/i.test(sighting.storeId)) return false;
  if (hasPendingReview(sighting)) return false;
  if (sighting.rewardState?.removedAt || sighting.rewardState?.rejectedAt) return false;
  const createdAt = Date.parse(sighting.createdAt);
  const current = Date.parse(now);
  return Number.isFinite(createdAt)
    && Number.isFinite(current)
    && current - createdAt >= COMMUNITY_CONTRIBUTOR_SURVIVAL_HOURS * HOUR_MS;
}

export function contributorRestrictionIsActive(moderation?: CommunityContributorModeration | null) {
  if (!moderation || !["spam", "deception"].includes(moderation.restrictionKind)) return false;
  const restrictedAt = Date.parse(moderation.restrictedAt);
  const restoredAt = Date.parse(moderation.restoredAt || "");
  return Number.isFinite(restrictedAt) && (!Number.isFinite(restoredAt) || restoredAt < restrictedAt);
}

export function assessCommunityContributorStanding(
  sightings: MemberSighting[],
  now = new Date().toISOString(),
  moderation?: CommunityContributorModeration | null,
): CommunityContributorStanding {
  if (contributorRestrictionIsActive(moderation)) return "restricted";
  const byReporter = new Map<string, number[]>();
  for (const sighting of sightings) {
    if (!isCleanCommunityStandingSighting(sighting, now)) continue;
    const reporterUserId = sighting.reporterUserId!.trim();
    const timestamps = byReporter.get(reporterUserId) || [];
    timestamps.push(Date.parse(sighting.createdAt));
    byReporter.set(reporterUserId, timestamps);
  }
  const requiredSpacingMs = COMMUNITY_CONTRIBUTOR_SPACING_HOURS * HOUR_MS;
  for (const timestamps of byReporter.values()) {
    timestamps.sort((left, right) => left - right);
    const first = timestamps[0];
    if (first !== undefined && timestamps.some((timestamp) => timestamp - first >= requiredSpacingMs)) return "active";
  }
  return "new";
}

export function communityAlertAllowance(authorityTimestamps: string[], at = new Date().toISOString()) {
  const current = Date.parse(at);
  if (!Number.isFinite(current)) return false;
  const cutoff = current - COMMUNITY_ALERT_AUTHORITY_WINDOW_HOURS * HOUR_MS;
  const recent = authorityTimestamps.filter((timestamp) => {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) && parsed > cutoff && parsed <= current;
  });
  return recent.length < COMMUNITY_ALERT_AUTHORITY_LIMIT;
}

export function communityVoteAllowed(reporterUserId: string | null | undefined, voterUserId: string | null | undefined) {
  const reporter = reporterUserId?.trim() || "";
  const voter = voterUserId?.trim() || "";
  return Boolean(reporter && voter && reporter !== voter);
}
