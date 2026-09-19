import type { AppleMembershipSummary, MemberProfile } from "../api/types";
import type { BillingInterval, MembershipTier } from "./membership-plans";
import type { PurchaseFlowStatus } from "./purchases";

export type MobileMembershipLifecycleState =
  | "free"
  | "purchase_pending"
  | "trialing"
  | "active"
  | "grace_period"
  | "billing_retry"
  | "canceled_at_period_end"
  | "expired"
  | "refunded_or_revoked"
  | "founder"
  | "provider_unavailable";

export type MobileMembershipLifecycle = {
  state: MobileMembershipLifecycleState;
  title: string;
  detail: string;
  accessActive: boolean;
  manageSubscriptions: boolean;
  preservationNotice: string;
};

export const DOWNGRADE_DATA_NOTICE = "Your saved bottles and preferences stay in your account. If your current plan limit is lower, only additions above that limit are blocked.";

const PLAN_NAMES: Record<MembershipTier, string> = {
  free: "Free",
  standard: "Standard",
  barrel: "Barrel",
  "bottled-in-bond": "Founder",
};

function result(
  state: MobileMembershipLifecycleState,
  title: string,
  detail: string,
  accessActive: boolean,
  manageSubscriptions: boolean,
): MobileMembershipLifecycle {
  return { state, title, detail, accessActive, manageSubscriptions, preservationNotice: DOWNGRADE_DATA_NOTICE };
}

function planName(profile: MemberProfile["profile"]) {
  return PLAN_NAMES[profile.membership.tier];
}

export function deriveMobileMembershipLifecycle(input: {
  profile: MemberProfile["profile"];
  purchaseStatus: PurchaseFlowStatus;
  appleMembership: AppleMembershipSummary | null;
}): MobileMembershipLifecycle {
  const { profile, purchaseStatus, appleMembership } = input;
  const accessActive = profile.membership.paid;
  const hasAppleHistory = Boolean(appleMembership);

  if (profile.membership.tier === "bottled-in-bond") {
    return result("founder", "Founder access", "Your existing lifetime Founder access is active. No renewal or Apple purchase is required.", true, hasAppleHistory);
  }

  if (purchaseStatus === "pending" || purchaseStatus === "purchasing") {
    return result("purchase_pending", "Purchase pending", "Your access has not changed. Paid features appear only after the App Store and Bourbon Signal both confirm the purchase.", accessActive, hasAppleHistory);
  }

  if (appleMembership) {
    const name = appleMembership.productId.includes(".barrel.") ? "Barrel" : "Standard";
    switch (appleMembership.status) {
      case "trialing":
        return result("trialing", `${name} trial active`, "Your server-confirmed trial is active. It renews through the App Store unless canceled before the trial ends.", accessActive, true);
      case "active":
        return result("active", `${name} active`, "Your Apple membership is active and confirmed by Bourbon Signal.", accessActive, true);
      case "grace_period":
        return result("grace_period", "Billing grace period", "Apple is allowing time to resolve a billing issue. Manage your payment method in the App Store to avoid interruption.", accessActive, true);
      case "billing_issue":
        return result("billing_retry", "Billing retry needed", "Apple could not renew this membership. Update your payment method in the App Store; access follows the server-confirmed status.", accessActive, true);
      case "canceled_period_end":
        return result("canceled_at_period_end", "Canceled at period end", "Renewal is off. Your confirmed access continues through the current paid period, then the account returns to its available membership level.", accessActive, true);
      case "expired":
        return result("expired", "Apple membership expired", "Paid Apple access has ended. Free access remains available, and your saved data is preserved.", accessActive, true);
      case "refunded":
      case "revoked":
        return result("refunded_or_revoked", "Apple membership ended", "Apple refunded or revoked this membership. Paid access is no longer confirmed; your saved data remains in your account.", accessActive, true);
    }
  }

  if (accessActive) {
    return result("active", `${planName(profile)} active`, "Your server-confirmed membership is active. Use its billing provider to manage renewal.", true, false);
  }

  if (["unavailable", "unsupported", "error"].includes(purchaseStatus)) {
    return result("provider_unavailable", "Apple purchases unavailable", "Your current Bourbon Signal access is unchanged. Purchase and restore stay disabled until Apple and the server are available.", false, false);
  }

  return result("free", "Free membership", "$0. No payment or renewal. Upgrade options appear only after current App Store products and account eligibility are confirmed.", false, false);
}

export function monthlyTrialIsEligible(input: {
  tier: MembershipTier;
  interval: BillingInterval;
  accountEligible: boolean | null | undefined;
  storeEligible: boolean | null | undefined;
}) {
  return (input.tier === "standard" || input.tier === "barrel")
    && input.interval === "monthly"
    && input.accountEligible === true
    && input.storeEligible === true;
}
