export type MembershipTier = "free" | "standard" | "barrel" | "bottled-in-bond";
export type BillingInterval = "monthly" | "annual" | "lifetime";

type PriceChoice = {
  price: string;
  suffix: string;
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
  purchasableOnIos?: boolean;
  monthly?: Omit<PriceChoice, "interval">;
  lifetime?: Omit<PriceChoice, "interval">;
};

export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    tier: "free",
    name: "Free",
    eyebrow: "Start hunting",
    description: "Explore live signals, contribute sightings, and keep a small My Shelf collection.",
    features: [
      "6 recent Intel Signals across all states",
      "Full Community feed",
      "3 bottle intelligence lookups",
      "10 bottles on My Shelf",
      "Post Community Signals and earn points",
    ],
  },
  {
    tier: "barrel",
    name: "Barrel Proof",
    eyebrow: "Serious hunters",
    description: "Watch every bottle on your list. Discover more through your collection.",
    recommended: true,
    monthly: { price: "$6", suffix: "/month" },
    features: [
      "Full Intel feed and unlimited bottle lookups",
      "Unlimited My Shelf and Signal Points rewards",
      "Unlimited areas and watched bottles",
      "Advanced filters and Community Signal alerts",
      "Bourbon DNA: insights into your collection",
      "Recommendations and opportunities picked for you",
    ],
  },
  {
    tier: "bottled-in-bond",
    name: "Founder",
    eyebrow: "Existing Founder access",
    description: "Lifetime access to the complete hunting toolkit with permanent Founder recognition. Existing Founder memberships remain active in the app.",
    limited: true,
    purchasableOnIos: false,
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
  standard: 2,
  barrel: 2,
  "bottled-in-bond": 3,
};

export function planForTier(tier: string | string[] | undefined) {
  const requested = Array.isArray(tier) ? tier[0] : tier;
  const value = requested === "standard" ? "barrel" : requested;
  return MEMBERSHIP_PLANS.find((plan) => plan.tier === value) || null;
}

export function billingChoiceFor(tier: MembershipTier, _interval: BillingInterval = "monthly") {
  const plan = MEMBERSHIP_PLANS.find((candidate) => candidate.tier === (tier === "standard" ? "barrel" : tier));
  if (!plan) return null;
  if (plan.lifetime) return { interval: "lifetime" as const, ...plan.lifetime };
  return plan.monthly ? { interval: "monthly" as const, ...plan.monthly } : null;
}

export function membershipActionFor(current: MembershipTier, target: MembershipTier) {
  if (current === target || (current === "standard" && target === "barrel") || (current === "barrel" && target === "standard")) return { kind: "current" as const, label: "Current membership" };
  if (tierRank[current] > tierRank[target]) {
    const currentName = MEMBERSHIP_PLANS.find((plan) => plan.tier === current)?.name || "your membership";
    return { kind: "included" as const, label: `Included with ${currentName}` };
  }
  if (target === "bottled-in-bond") return { kind: "unavailable" as const, label: "Founder access" };
  const targetName = MEMBERSHIP_PLANS.find((plan) => plan.tier === target)?.name || "membership";
  return { kind: "upgrade" as const, label: `Review ${targetName}` };
}
