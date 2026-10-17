import type { BillingPlanId, MembershipTier } from "./entitlements";

export type PublicCheckoutPlanId = "barrel_monthly";

export type PaidMembershipPlan = {
  tier: Exclude<MembershipTier, "free">;
  name: string;
  eyebrow: string;
  monthlyPrice?: string;
  oneTimePrice?: string;
  monthlyPlan?: PublicCheckoutPlanId;
  plan?: PublicCheckoutPlanId;
  description: string;
  features: string[];
  accent: "standard" | "barrel" | "founder";
  featured?: boolean;
  evergreenEmailEligible: boolean;
};

export const PAID_MEMBERSHIP_PLANS: PaidMembershipPlan[] = [
  {
    tier: "barrel",
    name: "Barrel Proof",
    eyebrow: "Serious hunters",
    monthlyPrice: "$6",
    monthlyPlan: "barrel_monthly",
    description: "Pair unlimited hunting tools with intelligence shaped by your own collection.",
    features: [
      "Full Intel feed and unlimited bottle lookups",
      "Unlimited alert areas, watched bottles, and My Shelf",
      "Redeem Signal Points for member rewards",
      "Advanced filters and Sightings alerts",
      "Bourbon DNA and personalized collection intelligence",
      "Personalized recommendations and local opportunities",
    ],
    accent: "barrel",
    featured: true,
    evergreenEmailEligible: true,
  },

];

export const CORE_PAID_MEMBERSHIP_PLANS = PAID_MEMBERSHIP_PLANS.filter((plan) => plan.evergreenEmailEligible);

export const CHECKOUT_PLAN_TIERS: Record<PublicCheckoutPlanId, MembershipTier> = {
  barrel_monthly: "barrel",
};

export function isPublicCheckoutPlanId(planId: BillingPlanId): planId is PublicCheckoutPlanId {
  return Object.hasOwn(CHECKOUT_PLAN_TIERS, planId);
}

export const MEMBERSHIP_COMPARISON_ROWS = [
  ["Intel feed", "6 recent signals", "Full access"],
  ["My Shelf", "10 bottles", "Unlimited"],
  ["Bottle lookups", "3", "Unlimited"],
  ["Alert areas and watched bottles", "—", "Unlimited"],
  ["Push and Community alerts", "—", "✓"],
  ["Advanced filters and bottle search", "—", "✓"],
  ["Bourbon DNA and recommendations", "—", "✓"],
  ["Signal Points", "Earn", "Earn and redeem"],
] as const;
