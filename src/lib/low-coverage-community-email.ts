import { getEntitlements } from "./entitlements";
import { masterUnsubscribed } from "./member-weekly-delivery";
import { membershipTrialEligibility } from "./membership-trial";

export const LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID = "low-coverage-community-pilot-v1";
export const LOW_COVERAGE_COMMUNITY_SUBJECT = (stateName: string) => `Help improve bourbon coverage in ${stateName}`;

export interface LowCoverageCommunityUser {
  id: string;
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  unsafeMetadata?: Record<string, unknown>;
  banned?: boolean;
  locked?: boolean;
}

export interface CoverageStrengthRow {
  code: string;
  name: string;
  coverageStrength: string;
}

export type LowCoverageCommunityRecipientResult =
  | { status: "eligible"; stateCode: string; stateName: string }
  | { status: "skipped_not_free" | "skipped_trial_or_paid_history" | "skipped_unverified_state" | "skipped_not_low_coverage" | "skipped_disabled_account" | "skipped_unsubscribed" | "skipped_operational_account" | "skipped_already_delivered" };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function safeCommunityFirstName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= 40 && /^[A-Za-z][A-Za-z' -]*$/.test(name) ? name : null;
}

export function classifyLowCoverageCommunityRecipient(
  user: LowCoverageCommunityUser,
  coverageRows: CoverageStrengthRow[],
): LowCoverageCommunityRecipientResult {
  const publicMetadata = record(user.publicMetadata);
  const privateMetadata = record(user.privateMetadata);
  const unsafeMetadata = record(user.unsafeMetadata);
  if (getEntitlements(publicMetadata).tier !== "free") return { status: "skipped_not_free" };
  if (!membershipTrialEligibility("standard_monthly", publicMetadata, privateMetadata).eligible) {
    return { status: "skipped_trial_or_paid_history" };
  }
  if (user.banned || user.locked) return { status: "skipped_disabled_account" };
  const accountType = String(unsafeMetadata.accountType || publicMetadata.accountType || "").trim().toLowerCase();
  const role = String(publicMetadata.role || unsafeMetadata.role || "").trim().toLowerCase();
  if (["retailer", "vendor", "admin", "owner"].includes(accountType) || ["retailer", "vendor", "admin", "owner"].includes(role)) {
    return { status: "skipped_operational_account" };
  }
  if (masterUnsubscribed(publicMetadata, privateMetadata)) return { status: "skipped_unsubscribed" };
  const delivery = record(privateMetadata.lowCoverageCommunityDelivery);
  if (delivery.campaignId === LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID
    && (["reserved", "sending", "delivered", "uncertain", "failed"].includes(String(delivery.status)) || typeof delivery.deliveredAt === "string")) {
    return { status: "skipped_already_delivered" };
  }
  const memberProfile = record(publicMetadata.memberProfile);
  const stateCode = typeof memberProfile.homeState === "string" ? memberProfile.homeState.trim().toUpperCase() : "";
  const selectedAt = typeof memberProfile.homeStateSelectedAt === "string" ? Date.parse(memberProfile.homeStateSelectedAt) : Number.NaN;
  if (!/^[A-Z]{2}$/.test(stateCode) || !Number.isFinite(selectedAt)) return { status: "skipped_unverified_state" };
  const coverage = coverageRows.find((row) => row.code === stateCode);
  if (!coverage || !["none", "sparse"].includes(coverage.coverageStrength)) return { status: "skipped_not_low_coverage" };
  return { status: "eligible", stateCode, stateName: coverage.name };
}
