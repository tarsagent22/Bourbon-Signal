export function directFounderRevocationMetadata(now = new Date().toISOString()) {
  return {
    tier: "free",
    plan: "free",
    membershipTier: "free",
    billingPlan: "free",
    membershipStatus: "free",
    directFounderCheckoutAttemptId: null,
    directFounderEntitlementVersion: null,
    directFounderPreviousMembership: null,
    founderNumber: null,
    membershipUpdatedAt: now,
  } as const;
}
