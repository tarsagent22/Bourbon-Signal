import type { BillingPlanId } from "./entitlements";

export const MONTHLY_MEMBERSHIP_TRIAL_DAYS = 7;

const MONTHLY_TRIAL_PLANS = new Set<BillingPlanId>(["standard_monthly", "barrel_monthly"]);
const DIRECT_SUBSCRIPTION_PLANS = new Set<BillingPlanId>([
  "standard_monthly",
  "standard_annual",
  "barrel_monthly",
  "barrel_annual",
]);

type Metadata = Record<string, unknown> | null | undefined;

function text(metadata: Metadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
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
  plan: BillingPlanId,
  publicMetadata: Metadata,
  privateMetadata: Metadata,
): { eligible: boolean; reason: "eligible" | "plan_ineligible" | "trial_used" | "prior_subscription" } {
  if (!MONTHLY_TRIAL_PLANS.has(plan)) return { eligible: false, reason: "plan_ineligible" };
  if (text(privateMetadata, "membershipTrialStartedAt") || text(privateMetadata, "membershipTrialSubscriptionId")) {
    return { eligible: false, reason: "trial_used" };
  }
  if (text(privateMetadata, "stripeSubscriptionId")) return { eligible: false, reason: "prior_subscription" };
  const publicPlan = text(publicMetadata, "plan") || text(publicMetadata, "billingPlan");
  if (["bib_lifetime", "lifetime"].includes(publicPlan)) return { eligible: false, reason: "prior_subscription" };
  const publicStatus = text(publicMetadata, "membershipStatus").toLowerCase();
  if (DIRECT_SUBSCRIPTION_PLANS.has(publicPlan as BillingPlanId)
    && ["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired"].includes(publicStatus)) {
    return { eligible: false, reason: "prior_subscription" };
  }
  return { eligible: true, reason: "eligible" };
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
  if (input.status === "active" && appliesToStoredTrial && !trialConverted) {
    return { membershipTrialConvertedAt: input.now };
  }
  if (["canceled", "unpaid", "incomplete_expired"].includes(input.status || "")
    && appliesToStoredTrial
    && !trialConverted
    && !text(input.existingPrivateMetadata, "membershipTrialCanceledAt")) {
    return { membershipTrialCanceledAt: input.now };
  }
  return {};
}
