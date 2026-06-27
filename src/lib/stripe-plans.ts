import type { BillingPlanId, MembershipTier } from "@/lib/entitlements";
import { BILLING_PLAN_TO_TIER } from "@/lib/entitlements";

export interface LaunchBillingPlan {
  id: BillingPlanId;
  tier: MembershipTier;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
  envKey: string;
  stripeMode: "payment" | "subscription";
}

export const LAUNCH_BILLING_PLANS: Record<BillingPlanId, LaunchBillingPlan> = {
  standard_monthly: {
    id: "standard_monthly",
    tier: BILLING_PLAN_TO_TIER.standard_monthly,
    label: "Standard Proof Monthly",
    priceLabel: "$2.99",
    cadenceLabel: "per month",
    envKey: "STRIPE_PRICE_STANDARD_MONTHLY",
    stripeMode: "subscription",
  },
  standard_annual: {
    id: "standard_annual",
    tier: BILLING_PLAN_TO_TIER.standard_annual,
    label: "Standard Proof Annual",
    priceLabel: "$24.99",
    cadenceLabel: "per year",
    envKey: "STRIPE_PRICE_STANDARD_ANNUAL",
    stripeMode: "subscription",
  },
  barrel_monthly: {
    id: "barrel_monthly",
    tier: BILLING_PLAN_TO_TIER.barrel_monthly,
    label: "Barrel Proof Monthly",
    priceLabel: "$4.99",
    cadenceLabel: "per month",
    envKey: "STRIPE_PRICE_BARREL_MONTHLY",
    stripeMode: "subscription",
  },
  barrel_annual: {
    id: "barrel_annual",
    tier: BILLING_PLAN_TO_TIER.barrel_annual,
    label: "Barrel Proof Annual",
    priceLabel: "$49.99",
    cadenceLabel: "per year",
    envKey: "STRIPE_PRICE_BARREL_ANNUAL",
    stripeMode: "subscription",
  },
  bib_lifetime: {
    id: "bib_lifetime",
    tier: BILLING_PLAN_TO_TIER.bib_lifetime,
    label: "Bottled-in-Bond Founder",
    priceLabel: "$49.99",
    cadenceLabel: "one-time lifetime",
    envKey: "STRIPE_PRICE_BIB_LIFETIME",
    stripeMode: "payment",
  },
};

export function getStripePriceId(planId: BillingPlanId) {
  return process.env[LAUNCH_BILLING_PLANS[planId].envKey]?.trim() || null;
}

export function getPlanByPriceId(priceId: string | null | undefined) {
  const normalized = String(priceId || "").trim();
  if (!normalized) return null;
  return Object.values(LAUNCH_BILLING_PLANS).find((plan) => getStripePriceId(plan.id) === normalized) || null;
}
