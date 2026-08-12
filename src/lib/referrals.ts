import type { MembershipTier } from "@/lib/entitlements";

export const REFERRAL_POINTS_BY_TIER: Record<MembershipTier, number> = {
  free: 10,
  standard: 50,
  barrel: 100,
  "bottled-in-bond": 150,
};

const REFERRAL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8,16}$/u;

export function normalizeReferralCode(value: unknown) {
  const normalized = typeof value === "string"
    ? value.trim().toUpperCase().replace(/[\s-]+/gu, "")
    : "";
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function referralPointsForTier(tier: MembershipTier) {
  return REFERRAL_POINTS_BY_TIER[tier];
}

export function calculateReferralAward(input: {
  previousAwardedPoints: number;
  nextTier: MembershipTier;
  freePointsAlreadyAwarded: number;
}) {
  const previousAwardedPoints = Math.max(0, Math.trunc(input.previousAwardedPoints));
  const freePointsAlreadyAwarded = Math.max(0, Math.trunc(input.freePointsAlreadyAwarded));
  const desiredTarget = referralPointsForTier(input.nextTier);
  const targetPoints = input.nextTier === "free" && freePointsAlreadyAwarded >= 50
    ? previousAwardedPoints
    : Math.max(previousAwardedPoints, desiredTarget);
  return {
    points: Math.max(0, targetPoints - previousAwardedPoints),
    targetPoints,
    earnsFounderGlass: false,
  };
}
