import type { BillingPlanId } from "./entitlements";

export const MONTHLY_MEMBERSHIP_TRIAL_DAYS = 7;

const MONTHLY_TRIAL_PLANS = new Set<BillingPlanId>(["standard_monthly", "barrel_monthly"]);
type Metadata = Record<string, unknown> | null | undefined;

function text(metadata: Metadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function paidPostTrialInvoiceConvertsMembership(input: {
  status: string | null | undefined;
  billingReason: string | null | undefined;
}) {
  return input.status === "paid" && input.billingReason === "subscription_cycle";
}

export function membershipTrialConversionMetadata(input: {
  subscriptionId: string | null | undefined;
  existingPrivateMetadata: Metadata;
  convertedAt: string;
}) {
  const storedSubscriptionId = text(input.existingPrivateMetadata, "membershipTrialSubscriptionId");
  const trialStarted = text(input.existingPrivateMetadata, "membershipTrialStartedAt");
  const candidateTime = Date.parse(input.convertedAt);
  const existingTime = Date.parse(text(input.existingPrivateMetadata, "membershipTrialConvertedAt"));
  if (!trialStarted || !storedSubscriptionId || storedSubscriptionId !== input.subscriptionId || !Number.isFinite(candidateTime)) return {};
  if (Number.isFinite(existingTime) && existingTime <= candidateTime) return {};
  return { membershipTrialConvertedAt: input.convertedAt };
}

export function hasActiveGiftMembership(publicMetadata: Metadata, now = new Date()) {
  const plan = text(publicMetadata, "plan") || text(publicMetadata, "billingPlan");
  const status = text(publicMetadata, "membershipStatus").toLowerCase();
  const isLifetimeGift = Boolean(text(publicMetadata, "giftOrderId")) && ["bib_lifetime", "lifetime"].includes(plan);
  if ((!plan.startsWith("gift_") && !isLifetimeGift) || !["active", "trialing"].includes(status)) return false;
  const expiry = Date.parse(text(publicMetadata, "giftAccessExpiresAt"));
  return !Number.isFinite(expiry) || expiry > now.getTime();
}

export function membershipTrialEligibility(
  _plan: BillingPlanId,
  _publicMetadata: Metadata,
  _privateMetadata: Metadata,
): { eligible: false; reason: "trials_ended" } {
  // Existing trial tracking and conversions remain supported below.
  return { eligible: false, reason: "trials_ended" };
}

export function hasMembershipPurchaseHistory(publicMetadata: Metadata, privateMetadata: Metadata) {
  if (text(privateMetadata, "membershipTrialStartedAt")
    || text(privateMetadata, "membershipTrialSubscriptionId")
    || text(privateMetadata, "stripeSubscriptionId")) return true;
  const plan = text(publicMetadata, "plan") || text(publicMetadata, "billingPlan");
  if (["bib_lifetime", "lifetime"].includes(plan)) return true;
  const status = text(publicMetadata, "membershipStatus").toLowerCase();
  return ["standard_monthly", "standard_annual", "barrel_monthly", "barrel_annual"].includes(plan)
    && ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"].includes(status);
}

export function membershipTrialMetadata(input: {
  status: string | null | undefined;
  plan: BillingPlanId;
  subscriptionId: string | null | undefined;
  existingPrivateMetadata: Metadata;
  now: string;
}) {
  const storedSubscriptionId = text(input.existingPrivateMetadata, "membershipTrialSubscriptionId");
  const trialStarted = text(input.existingPrivateMetadata, "membershipTrialStartedAt");
  const trialConverted = text(input.existingPrivateMetadata, "membershipTrialConvertedAt");
  const appliesToStoredTrial = Boolean(trialStarted)
    && (!storedSubscriptionId || storedSubscriptionId === input.subscriptionId);

  if (input.status === "trialing" && MONTHLY_TRIAL_PLANS.has(input.plan)) {
    return {
      membershipTrialStartedAt: trialStarted || input.now,
      membershipTrialPlan: text(input.existingPrivateMetadata, "membershipTrialPlan") || input.plan,
      membershipTrialSubscriptionId: storedSubscriptionId || input.subscriptionId || null,
    };
  }
  if (["canceled", "unpaid", "incomplete_expired"].includes(input.status || "")
    && appliesToStoredTrial
    && !trialConverted
    && !text(input.existingPrivateMetadata, "membershipTrialCanceledAt")) {
    return { membershipTrialCanceledAt: input.now };
  }
  return {};
}
