export type MembershipTier = "free" | "standard" | "barrel" | "bottled-in-bond";
export type BillingInterval = "monthly" | "annual" | "lifetime";

type PriceChoice = {
  price: string;
  suffix: string;
  trialDays?: number;
  valueNote?: string;
};

export type MembershipPlan = {
  tier: MembershipTier;
  name: string;
  eyebrow: string;
  description: string;
  features: string[];
  recommended?: boolean;
  limited?: boolean;
  monthly?: Omit<PriceChoice, "interval">;
  annual?: Omit<PriceChoice, "interval">;
  lifetime?: Omit<PriceChoice, "interval">;
};

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    tier: "free",
    name: "Free",
    eyebrow: "Start hunting",
    description: "Explore live signals, contribute sightings, and keep a small My Shelf collection.",
    features: [
      "7-item Intel preview",
      "2 newest Community Signals",
      "3 Bottle Checks",
      "10 bottles on My Shelf",
      "Post Community Signals and earn points",
    ],
  },
  {
    tier: "standard",
    name: "Standard Proof",
    eyebrow: "Core membership",
    description: "Turn state signals into a focused hunting plan with full access and alerts.",
    monthly: { price: "$3", suffix: "/month", trialDays: 7 },
    annual: { price: "$30", suffix: "/year", valueNote: "2 months free" },
    features: [
      "Full state Intel feed",
      "Alerts for up to 5 areas and 15 bottles",
      "Unlimited Bottle Checks and Community Signals",
      "Unlimited My Shelf",
      "Redeem Signal Points for member rewards",
    ],
  },
  {
    tier: "barrel",
    name: "Barrel Proof",
    eyebrow: "Serious hunters",
    description: "Add unlimited preferences and intelligence shaped by your own collection.",
    recommended: true,
    monthly: { price: "$6", suffix: "/month", trialDays: 7 },
    annual: { price: "$60", suffix: "/year", valueNote: "2 months free" },
    features: [
      "Everything in Standard Proof",
      "Unlimited areas and watched bottles",
      "Advanced filters and Community Signal alerts",
      "Bourbon DNA and collection intelligence",
      "Personalized recommendations and local opportunities",
    ],
  },
  {
    tier: "bottled-in-bond",
    name: "Bottled in Bond",
    eyebrow: "Limited Founder offer",
    description: "Lifetime access to the complete hunting toolkit with permanent Founder recognition.",
    limited: true,
    lifetime: { price: "$50", suffix: " once" },
    features: [
      "Everything in Barrel Proof for life",
      "Numbered Founder’s glass",
      "Founder badge and number on your profile",
    ],
  },
];

const tierRank: Record<MembershipTier, number> = {
  free: 0,
  standard: 1,
  barrel: 2,
  "bottled-in-bond": 3,
};

export function planForTier(tier: string | string[] | undefined) {
  const value = Array.isArray(tier) ? tier[0] : tier;
  return MEMBERSHIP_PLANS.find((plan) => plan.tier === value) || null;
}

export function billingChoiceFor(tier: MembershipTier, interval: BillingInterval = "monthly") {
  const plan = MEMBERSHIP_PLANS.find((candidate) => candidate.tier === tier);
  if (!plan) return null;
  if (plan.lifetime) return { interval: "lifetime" as const, ...plan.lifetime };
  const normalizedInterval = interval === "annual" ? "annual" : "monthly";
  const choice = normalizedInterval === "annual" ? plan.annual : plan.monthly;
  return choice ? { interval: normalizedInterval, ...choice } : null;
}

export function membershipActionFor(current: MembershipTier, target: MembershipTier) {
  if (current === target) return { kind: "current" as const, label: "Current membership" };
  if (tierRank[current] > tierRank[target]) {
    const currentName = MEMBERSHIP_PLANS.find((plan) => plan.tier === current)?.name || "your membership";
    return { kind: "included" as const, label: `Included with ${currentName}` };
  }
  const targetName = MEMBERSHIP_PLANS.find((plan) => plan.tier === target)?.name || "membership";
  return { kind: "upgrade" as const, label: `Review ${targetName}` };
}
