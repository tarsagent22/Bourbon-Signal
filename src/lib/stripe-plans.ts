import type { BillingPlanId, MembershipTier } from "./entitlements.ts";
import { BILLING_PLAN_TO_TIER } from "./entitlements.ts";

export interface LaunchBillingPlan {
  id: BillingPlanId;
  tier: MembershipTier;
  label: string;
  priceLabel: string;
  cadenceLabel: string;
  envKey: string;
  stripeMode: "payment" | "subscription";
  amountCents: number;
  interval: "month" | "year" | null;
}

export const DIRECT_STRIPE_PRICE_IDS: Record<BillingPlanId, string> = {
  standard_monthly: "price_1U3SkALQlLvo1rCDe3it7BpY",
  standard_annual: "price_1U3SivLQlLvo1rCDNWfku8up",
  barrel_monthly: "price_1U3ShaLQlLvo1rCDXYKq6mJn",
  barrel_annual: "price_1U3SfyLQlLvo1rCDYCcq0bs2",
  bib_lifetime: "price_1U3SeWLQlLvo1rCDRzCsjqrE",
};

export const LAUNCH_BILLING_PLANS: Record<BillingPlanId, LaunchBillingPlan> = {
  standard_monthly: {
    id: "standard_monthly",
    tier: BILLING_PLAN_TO_TIER.standard_monthly,
    label: "Standard Proof Monthly",
    priceLabel: "$3",
    cadenceLabel: "per month",
    envKey: "STRIPE_PRICE_STANDARD_MONTHLY",
    stripeMode: "subscription",
    amountCents: 300,
    interval: "month",
  },
  standard_annual: {
    id: "standard_annual",
    tier: BILLING_PLAN_TO_TIER.standard_annual,
    label: "Standard Proof Annual",
    priceLabel: "$30",
    cadenceLabel: "per year",
    envKey: "STRIPE_PRICE_STANDARD_ANNUAL",
    stripeMode: "subscription",
    amountCents: 3000,
    interval: "year",
  },
  barrel_monthly: {
    id: "barrel_monthly",
    tier: BILLING_PLAN_TO_TIER.barrel_monthly,
    label: "Barrel Proof Monthly",
    priceLabel: "$6",
    cadenceLabel: "per month",
    envKey: "STRIPE_PRICE_BARREL_MONTHLY",
    stripeMode: "subscription",
    amountCents: 600,
    interval: "month",
  },
  barrel_annual: {
    id: "barrel_annual",
    tier: BILLING_PLAN_TO_TIER.barrel_annual,
    label: "Barrel Proof Annual",
    priceLabel: "$60",
    cadenceLabel: "per year",
    envKey: "STRIPE_PRICE_BARREL_ANNUAL",
    stripeMode: "subscription",
    amountCents: 6000,
    interval: "year",
  },
  bib_lifetime: {
    id: "bib_lifetime",
    tier: BILLING_PLAN_TO_TIER.bib_lifetime,
    label: "Bottled in Bond Lifetime",
    priceLabel: "$50",
    cadenceLabel: "one-time lifetime",
    envKey: "STRIPE_PRICE_BIB_LIFETIME",
    stripeMode: "payment",
    amountCents: 5000,
    interval: null,
  },
};

const LEGACY_STRIPE_PRICE_ENV_KEYS: Partial<Record<BillingPlanId, string[]>> = {
  standard_monthly: ["STRIPE_PRICE_MONTHLY"],
  standard_annual: ["STRIPE_PRICE_ANNUAL"],
  bib_lifetime: ["STRIPE_PRICE_FOUNDER"],
};

export function getStripePriceId(planId: BillingPlanId) {
  return DIRECT_STRIPE_PRICE_IDS[planId];
}

function legacyStripePriceIds(planId: BillingPlanId) {
  const ids = new Set<string>();
  const primary = process.env[LAUNCH_BILLING_PLANS[planId].envKey]?.trim();
  if (primary) ids.add(primary);
  for (const legacyKey of LEGACY_STRIPE_PRICE_ENV_KEYS[planId] || []) {
    const legacy = process.env[legacyKey]?.trim();
    if (legacy) ids.add(legacy);
  }
  return ids;
}

export function getPlanByPriceId(priceId: string | null | undefined) {
  const normalized = String(priceId || "").trim();
  if (!normalized) return null;
  return Object.values(LAUNCH_BILLING_PLANS).find((plan) => (
    getStripePriceId(plan.id) === normalized || legacyStripePriceIds(plan.id).has(normalized)
  )) || null;
}

export function getCheckoutPlanByPriceId(priceId: string | null | undefined) {
  const normalized = String(priceId || "").trim();
  if (!normalized) return null;
  return Object.values(LAUNCH_BILLING_PLANS).find((plan) => getStripePriceId(plan.id) === normalized) || null;
}

export function validateDirectStripePrice(price: {
  id?: string;
  active?: boolean;
  livemode?: boolean;
  currency?: string;
  unit_amount?: number | null;
  recurring?: { interval?: string; interval_count?: number } | null;
  product?: string | { active?: boolean; deleted?: unknown } | null;
}, plan: LaunchBillingPlan, requireLive = true) {
  if (price.id !== getStripePriceId(plan.id)) return "Stripe price ID mismatch";
  if (!price.active) return "Stripe price is inactive";
  if (requireLive && !price.livemode) return "Stripe price is not live";
  if (price.currency?.toLowerCase() !== "usd") return "Stripe price currency mismatch";
  if (price.unit_amount !== plan.amountCents) return "Stripe price amount mismatch";
  if (plan.stripeMode === "payment" && price.recurring) return "One-time plan uses a recurring price";
  if (plan.stripeMode === "subscription"
    && (!price.recurring || price.recurring.interval !== plan.interval || price.recurring.interval_count !== 1)) {
    return "Subscription cadence mismatch";
  }
  if (!price.product || typeof price.product === "string" || price.product.deleted === true || !price.product.active) {
    return "Stripe product is unavailable";
  }
  return null;
}
