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
  chooserName?: string;
  eyebrow: string;
  description: string;
  features: string[];
  bestFor?: string;
  chooserFeatures?: string[];
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
    description: "Explore recent signals, contribute to Community, and start building My Shelf.",
    features: [
      "7-item Intel preview",
      "2 newest Community Signals",
      "10 bottles on My Shelf",
      "Post Community Signals and earn points",
    ],
  },
  {
    tier: "standard",
    name: "Standard Proof",
    eyebrow: "Core membership",
    description: "Full state Intel, focused alerts, and unlimited room on My Shelf.",
    bestFor: "For focused hunting near home",
    chooserFeatures: [
      "Full availability intelligence across your state",
      "Track 15 bottles in 5 hunting areas",
      "Immediate push, email, and SMS alerts",
    ],
    monthly: { price: "$3", suffix: "/month", trialDays: 7 },
    annual: { price: "$30", suffix: "/year", valueNote: "2 months free" },
    features: [
      "Full state Intel feed",
      "Alerts for up to 5 areas and 15 bottles",
      "Push, email, and SMS alert delivery",
      "Unlimited My Shelf",
      "Redeem Signal Points for member rewards",
    ],
  },
  {
    tier: "barrel",
    name: "Barrel Proof",
    eyebrow: "Serious hunters",
    description: "Unlimited hunting preferences plus intelligence shaped by your collection.",
    bestFor: "For serious or multi-area hunters",
    chooserFeatures: [
      "Everything in Standard Proof",
      "Track unlimited bottles and areas",
      "Alerts from member-reported sightings",
      "Collection-based DNA and bottle recommendations",
    ],
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
    chooserName: "Founder",
    eyebrow: "Limited Founder offer",
    description: "Lifetime Barrel Proof access with permanent Founder recognition.",
    bestFor: "Barrel Proof for life",
    chooserFeatures: [
      "Permanent Founder number",
      "Numbered Founder’s glass",
    ],
    limited: true,
    lifetime: { price: "$50", suffix: " once" },
    features: [
      "Everything in Barrel Proof for life",
      "Numbered Founder’s glass",
      "Founder badge and number on your profile",
    ],
  },
];

export const PAID_MEMBERSHIP_PLANS = MEMBERSHIP_PLANS.filter((plan): plan is MembershipPlan & { tier: Exclude<MembershipTier, "free"> } => plan.tier !== "free");


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

export function trialDisclosureFor(tier: MembershipTier, interval: BillingInterval, trialEligible: boolean) {
  const price = billingChoiceFor(tier, interval);
  if (!price) return null;
  if (price.interval === "lifetime") return "Lifetime access · no trial";
  if (price.interval === "annual") return `${price.valueNote || "Annual membership"} · annual plans have no trial`;
  if (price.trialDays && trialEligible) return `${price.trialDays}-day free trial · ${price.price}${price.suffix} after`;
  return `No trial available · ${price.price}${price.suffix}`;
}

export function membershipChoiceAccessibilityLabel(
  tier: MembershipTier,
  interval: BillingInterval,
  trialEligible: boolean,
  actionLabel: string,
) {
  const plan = MEMBERSHIP_PLANS.find((candidate) => candidate.tier === tier);
  const price = billingChoiceFor(tier, interval);
  if (!plan || !price) return actionLabel;
  return [
    plan.chooserName || plan.name,
    `${price.price}${price.suffix}`,
    plan.bestFor,
    ...(plan.chooserFeatures || []),
    trialDisclosureFor(tier, interval, trialEligible),
    actionLabel,
  ].filter(Boolean).join(". ");
}

export function membershipActionFor(current: MembershipTier, target: MembershipTier) {
  if (current === target) return { kind: "current" as const, label: "Current membership" };
  if (tierRank[current] > tierRank[target]) {
    const currentPlan = MEMBERSHIP_PLANS.find((plan) => plan.tier === current);
    const currentName = currentPlan?.chooserName || currentPlan?.name || "your membership";
    return { kind: "included" as const, label: `Included with ${currentName}` };
  }
  const targetPlan = MEMBERSHIP_PLANS.find((plan) => plan.tier === target);
  const targetName = targetPlan?.chooserName || targetPlan?.name || "membership";
  return { kind: "upgrade" as const, label: `Review ${targetName}` };
}
