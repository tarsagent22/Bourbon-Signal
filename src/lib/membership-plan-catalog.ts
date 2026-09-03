import type { BillingPlanId, MembershipTier } from "./entitlements";

export type PaidMembershipPlan = {
  tier: Exclude<MembershipTier, "free">;
  name: string;
  eyebrow: string;
  monthlyPrice?: string;
  annualPrice?: string;
  oneTimePrice?: string;
  monthlyPlan?: BillingPlanId;
  annualPlan?: BillingPlanId;
  plan?: BillingPlanId;
  description: string;
  features: string[];
  accent: "standard" | "barrel" | "founder";
  featured?: boolean;
  evergreenEmailEligible: boolean;
};

export const PAID_MEMBERSHIP_PLANS: PaidMembershipPlan[] = [
  {
    tier: "standard",
    name: "Standard Proof",
    eyebrow: "Core Membership",
    monthlyPrice: "$3",
    annualPrice: "$30",
    monthlyPlan: "standard_monthly",
    annualPlan: "standard_annual",
    description: "Turn the state signal you just explored into a focused hunting plan.",
    features: [
      "Full state Drop Feed",
      "Alerts for up to 5 areas and 15 bottles",
      "Unlimited Bottle Checks and full Member Sightings",
      "Unlimited My Shelf",
      "Redeem Signal Points for member rewards",
    ],
    accent: "standard",
    evergreenEmailEligible: true,
  },
  {
    tier: "barrel",
    name: "Barrel Proof",
    eyebrow: "Serious hunters",
    monthlyPrice: "$6",
    annualPrice: "$60",
    monthlyPlan: "barrel_monthly",
    annualPlan: "barrel_annual",
    description: "Pair unlimited hunting tools with intelligence shaped by your own collection.",
    features: [
      "Everything in Standard with unlimited preferences",
      "Advanced filters and Sightings alerts",
      "Bourbon DNA and personalized collection intelligence",
      "Personalized recommendations and local opportunities",
    ],
    accent: "barrel",
    featured: true,
    evergreenEmailEligible: true,
  },
  {
    tier: "bottled-in-bond",
    name: "Bottled in Bond",
    eyebrow: "Limited Founder Offer",
    oneTimePrice: "$50",
    plan: "bib_lifetime",
    description: "Lifetime access to Bourbon Signal’s most complete hunting toolkit, plus permanent Founder recognition.",
    features: [
      "Everything in Barrel Proof",
      "Numbered Founder’s glass",
      "Founder badge & number on profile",
    ],
    accent: "founder",
    evergreenEmailEligible: false,
  },
];

export const CORE_PAID_MEMBERSHIP_PLANS = PAID_MEMBERSHIP_PLANS.filter((plan) => plan.evergreenEmailEligible);

export const CHECKOUT_PLAN_TIERS: Record<BillingPlanId, MembershipTier> = {
  standard_monthly: "standard",
  standard_annual: "standard",
  barrel_monthly: "barrel",
  barrel_annual: "barrel",
  bib_lifetime: "bottled-in-bond",
};

export const MEMBERSHIP_COMPARISON_ROWS = [
  ["Drop Feed access", "Limited", "Full · state only", "Full · advanced", "Full · advanced"],
  ["Bottle Checks", "3", "Unlimited", "Unlimited", "Unlimited"],
  ["Member Sightings", "Limited", "✓", "✓", "✓"],
  ["SMS, email, and on-site alerts", "—", "✓", "✓", "✓"],
  ["Alert preference limits", "—", "5 areas · 15 bottles", "No limits", "No limits"],
  ["Signal Points redemption", "Earn only", "✓", "✓", "✓"],
  ["Sightings alerts", "—", "—", "✓", "✓"],
  ["My Shelf", "✓", "Unlimited", "Unlimited", "Unlimited"],
  ["Recommended Bottles", "—", "—", "✓", "✓"],
  ["Founder badge + number", "—", "—", "—", "✓"],
  ["Numbered Founder’s glass", "—", "—", "—", "✓"],
] as const;
