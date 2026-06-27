export type MembershipTier = "free" | "standard" | "barrel" | "bottled-in-bond";

export type BillingPlanId =
  | "standard_monthly"
  | "standard_annual"
  | "barrel_monthly"
  | "barrel_annual"
  | "bib_lifetime";

export interface TierEntitlements {
  tier: MembershipTier;
  label: string;
  feedPreviewLimit: number | null;
  bottleCheckLimit: number | null;
  alertAreaLimit: number | null;
  trackedBottleLimit: number | null;
  canUseStateFilter: boolean;
  canUseDropFeedFilters: boolean;
  canUseBottleSearch: boolean;
  canUseAdvancedFilters: boolean;
  canReadSightings: boolean;
  canSubmitSightings: boolean;
  canReceiveSightingsAlerts: boolean;
  canAccessDashboard: boolean;
  canUseCollection: boolean;
  canUseRecommendations: boolean;
  canReceiveSmsAlerts: boolean;
  smsDailyLimit: number;
  smsMonthlyLimit: number;
  hasBetaAccess: boolean;
  founderSpotLimit?: number;
}

export const FOUNDER_SPOT_LIMIT = 100;

export const BILLING_PLAN_TO_TIER: Record<BillingPlanId, MembershipTier> = {
  standard_monthly: "standard",
  standard_annual: "standard",
  barrel_monthly: "barrel",
  barrel_annual: "barrel",
  bib_lifetime: "bottled-in-bond",
};

export const TIER_ENTITLEMENTS: Record<MembershipTier, TierEntitlements> = {
  free: {
    tier: "free",
    label: "Free",
    feedPreviewLimit: 5,
    bottleCheckLimit: 3,
    alertAreaLimit: 0,
    trackedBottleLimit: 0,
    canUseStateFilter: false,
    canUseDropFeedFilters: false,
    canUseBottleSearch: false,
    canUseAdvancedFilters: false,
    canReadSightings: false,
    canSubmitSightings: false,
    canReceiveSightingsAlerts: false,
    canAccessDashboard: false,
    canUseCollection: false,
    canUseRecommendations: false,
    canReceiveSmsAlerts: false,
    smsDailyLimit: 0,
    smsMonthlyLimit: 0,
    hasBetaAccess: false,
  },
  standard: {
    tier: "standard",
    label: "Standard Proof",
    feedPreviewLimit: null,
    bottleCheckLimit: null,
    alertAreaLimit: 5,
    trackedBottleLimit: 15,
    canUseStateFilter: true,
    canUseDropFeedFilters: false,
    canUseBottleSearch: false,
    canUseAdvancedFilters: false,
    canReadSightings: true,
    canSubmitSightings: true,
    canReceiveSightingsAlerts: false,
    canAccessDashboard: true,
    canUseCollection: false,
    canUseRecommendations: false,
    canReceiveSmsAlerts: true,
    smsDailyLimit: 3,
    smsMonthlyLimit: 30,
    hasBetaAccess: false,
  },
  barrel: {
    tier: "barrel",
    label: "Barrel Proof",
    feedPreviewLimit: null,
    bottleCheckLimit: null,
    alertAreaLimit: null,
    trackedBottleLimit: null,
    canUseStateFilter: true,
    canUseDropFeedFilters: true,
    canUseBottleSearch: true,
    canUseAdvancedFilters: true,
    canReadSightings: true,
    canSubmitSightings: true,
    canReceiveSightingsAlerts: true,
    canAccessDashboard: true,
    canUseCollection: true,
    canUseRecommendations: true,
    canReceiveSmsAlerts: true,
    smsDailyLimit: 8,
    smsMonthlyLimit: 100,
    hasBetaAccess: true,
  },
  "bottled-in-bond": {
    tier: "bottled-in-bond",
    label: "Bottled in Bond",
    feedPreviewLimit: null,
    bottleCheckLimit: null,
    alertAreaLimit: null,
    trackedBottleLimit: null,
    canUseStateFilter: true,
    canUseDropFeedFilters: true,
    canUseBottleSearch: true,
    canUseAdvancedFilters: true,
    canReadSightings: true,
    canSubmitSightings: true,
    canReceiveSightingsAlerts: true,
    canAccessDashboard: true,
    canUseCollection: true,
    canUseRecommendations: true,
    canReceiveSmsAlerts: true,
    smsDailyLimit: 10,
    smsMonthlyLimit: 150,
    hasBetaAccess: true,
    founderSpotLimit: FOUNDER_SPOT_LIMIT,
  },
};

export function normalizeMembershipTier(value: unknown): MembershipTier {
  if (value === "standard") return "standard";
  if (value === "barrel") return "barrel";
  if (value === "bottled-in-bond" || value === "founder" || value === "lifetime") return "bottled-in-bond";
  if (value === "monthly" || value === "annual") return "standard";
  return "free";
}

export function normalizeBillingPlan(value: unknown): BillingPlanId | null {
  if (
    value === "standard_monthly" ||
    value === "standard_annual" ||
    value === "barrel_monthly" ||
    value === "barrel_annual" ||
    value === "bib_lifetime"
  ) {
    return value;
  }
  if (value === "monthly") return "standard_monthly";
  if (value === "annual") return "standard_annual";
  if (value === "founder") return "bib_lifetime";
  return null;
}

export function getEntitlements(tier: unknown): TierEntitlements {
  return TIER_ENTITLEMENTS[normalizeMembershipTier(tier)];
}

export function isPaidTier(tier: unknown) {
  return normalizeMembershipTier(tier) !== "free";
}
