import { getEntitlements } from "./entitlements";
import { masterUnsubscribed } from "./member-weekly-delivery";
import { membershipTrialEligibility } from "./membership-trial";

export const MISSING_STATE_COMMUNITY_CAMPAIGN_ID = "missing-state-community-pilot-v1";
export const MISSING_STATE_COMMUNITY_SUBJECT = "Where do you hunt for bourbon?";
export const WELCOME_PAGE_LAUNCHED_AT = "2026-07-16T02:13:37.000Z";

export interface MissingStateCommunityUser {
  id: string;
  createdAt?: string | number | Date;
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  unsafeMetadata?: Record<string, unknown>;
  banned?: boolean;
  locked?: boolean;
}

export type MissingStateCommunityRecipientResult =
  | { status: "eligible" }
  | { status: "skipped_not_free" | "skipped_trial_or_paid_history" | "skipped_selector_used" | "skipped_setup_dismissed" | "skipped_disabled_account" | "skipped_unsubscribed" | "skipped_operational_account" | "skipped_trial_email_history" | "skipped_already_delivered" };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function operationalAccount(publicMetadata: Record<string, unknown>, unsafeMetadata: Record<string, unknown>) {
  const accountType = String(unsafeMetadata.accountType || publicMetadata.accountType || "").trim().toLowerCase();
  const role = String(publicMetadata.role || unsafeMetadata.role || "").trim().toLowerCase();
  return ["retailer", "vendor", "admin", "owner"].includes(accountType)
    || ["retailer", "vendor", "admin", "owner"].includes(role);
}

function deliveryHasHistory(value: unknown, campaignId?: string) {
  const delivery = record(value);
  if (campaignId && delivery.campaignId && delivery.campaignId !== campaignId) return false;
  return ["reserved", "sending", "delivered", "uncertain", "failed"].includes(String(delivery.status || ""))
    || typeof delivery.reservedAt === "string"
    || typeof delivery.deliveredAt === "string"
    || typeof delivery.providerMessageId === "string";
}

export function hasStateSelectorEvidence(publicInput: unknown, privateInput: unknown, unsafeInput?: unknown) {
  const metadataSources = [record(publicInput), record(unsafeInput)];
  const privateMetadata = record(privateInput);
  const activation = record(privateMetadata.activation);
  return metadataSources.some((metadata) => {
    const profile = record(metadata.memberProfile);
    const areaPreferences = record(metadata.areaPreferences);
    return (typeof profile.homeState === "string" && profile.homeState.trim().length > 0)
      || (typeof profile.homeStateSelectedAt === "string" && profile.homeStateSelectedAt.trim().length > 0)
      || stringArray(areaPreferences.states).length > 0;
  })
    || typeof activation.onboarding_state_selected === "string";
}

export function safeMissingStateFirstName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= 40 && /^[A-Za-z][A-Za-z' -]*$/.test(name) ? name : null;
}

export function classifyMissingStateCommunityRecipient(user: MissingStateCommunityUser): MissingStateCommunityRecipientResult {
  const publicMetadata = record(user.publicMetadata);
  const privateMetadata = record(user.privateMetadata);
  const unsafeMetadata = record(user.unsafeMetadata);
  if (getEntitlements(publicMetadata).tier !== "free") return { status: "skipped_not_free" };
  if (!membershipTrialEligibility("standard_monthly", publicMetadata, privateMetadata).eligible) {
    return { status: "skipped_trial_or_paid_history" };
  }
  if (user.banned || user.locked) return { status: "skipped_disabled_account" };
  if (operationalAccount(publicMetadata, unsafeMetadata)) return { status: "skipped_operational_account" };
  if (masterUnsubscribed(publicMetadata, privateMetadata)) return { status: "skipped_unsubscribed" };
  if (hasStateSelectorEvidence(publicMetadata, privateMetadata, unsafeMetadata)) return { status: "skipped_selector_used" };
  const setupPrompt = record(privateMetadata.legacySetupPrompt);
  if (typeof setupPrompt.dismissedAt === "string") return { status: "skipped_setup_dismissed" };
  if (deliveryHasHistory(privateMetadata.freeMemberDayTwoDelivery)) return { status: "skipped_trial_email_history" };
  if (deliveryHasHistory(privateMetadata.missingStateCommunityDelivery, MISSING_STATE_COMMUNITY_CAMPAIGN_ID)) {
    return { status: "skipped_already_delivered" };
  }
  return { status: "eligible" };
}

export function needsLegacySetupPrompt(user: MissingStateCommunityUser, now = new Date()) {
  const createdAt = new Date(user.createdAt || 0).getTime();
  const launchAt = Date.parse(WELCOME_PAGE_LAUNCHED_AT);
  if (!Number.isFinite(createdAt) || createdAt >= launchAt || createdAt > now.getTime()) return false;
  const publicMetadata = record(user.publicMetadata);
  const privateMetadata = record(user.privateMetadata);
  const unsafeMetadata = record(user.unsafeMetadata);
  if (user.banned || user.locked || operationalAccount(publicMetadata, unsafeMetadata)) return false;
  if (hasStateSelectorEvidence(publicMetadata, privateMetadata, unsafeMetadata)) return false;
  return typeof record(privateMetadata.legacySetupPrompt).dismissedAt !== "string";
}
