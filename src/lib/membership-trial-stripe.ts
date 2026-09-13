import "server-only";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import type { LaunchBillingPlan } from "@/lib/stripe-plans";
import { getMembershipTrialRepository } from "@/lib/membership-trial-repository";
import { hasActiveGiftMembership, membershipTrialConversionMetadata, paidPostTrialInvoiceConvertsMembership } from "@/lib/membership-trial";
import { membershipRecoveryAuthorityMatches, type MembershipRecoveryAuthority } from "@/lib/membership-server";

function isManagedTrial(subscription: Stripe.Subscription, plan: LaunchBillingPlan | null): plan is LaunchBillingPlan & { id: "standard_monthly" | "barrel_monthly" } {
  return subscription.metadata?.trial_offer === "monthly_7_day_v1"
    && (plan?.id === "standard_monthly" || plan?.id === "barrel_monthly");
}

function stripeTimestamp(value: number | null | undefined, fallback: string) {
  return value ? new Date(value * 1000).toISOString() : fallback;
}

export async function enforceMembershipSubscriptionActivation(input: {
  stripe: Stripe;
  userId: string;
  subscription: Stripe.Subscription;
  plan: LaunchBillingPlan | null;
  observedAt?: string;
  recoveryAuthority?: MembershipRecoveryAuthority;
}) {
  const observedAt = input.observedAt || new Date().toISOString();
  const user = await (await clerkClient()).users.getUser(input.userId);
  if (input.recoveryAuthority && (!input.plan || !membershipRecoveryAuthorityMatches(user, input.recoveryAuthority, {
    plan: input.plan.id,
    stripeCustomerId: typeof input.subscription.customer === "string" ? input.subscription.customer : input.subscription.customer.id,
    stripeSubscriptionId: input.subscription.id,
  }))) {
    // Recovery is read/repair, not authorization to cancel another subscription.
    return { accepted: false as const, reason: "recovery_authority_changed" as const };
  }
  if (hasActiveGiftMembership(user.publicMetadata as Record<string, unknown>)) {
    await input.stripe.subscriptions.cancel(input.subscription.id);
    console.warn("subscription overlapping active gift canceled", { userId: input.userId, subscriptionId: input.subscription.id });
    return { accepted: false as const, reason: "active_gift" as const };
  }

  if (!isManagedTrial(input.subscription, input.plan)) {
    return { accepted: true as const, managedTrial: false as const };
  }
  const repository = getMembershipTrialRepository();
  const result = await repository.claimStart({
    userId: input.userId,
    subscriptionId: input.subscription.id,
    plan: input.plan.id,
    startedAt: stripeTimestamp(input.subscription.trial_start, observedAt),
  });
  if (!result.accepted) {
    await input.stripe.subscriptions.cancel(input.subscription.id);
    console.warn("duplicate membership trial subscription canceled", { userId: input.userId, subscriptionId: input.subscription.id });
    return { accepted: false as const, reason: "duplicate_trial" as const };
  }
  return { accepted: true as const, managedTrial: true as const };
}

export async function markMembershipTrialConvertedFromInvoice(input: {
  userId: string;
  subscriptionId: string;
  invoice: Stripe.Invoice;
  observedAt: string;
}) {
  if (!paidPostTrialInvoiceConvertsMembership({
    status: input.invoice.status,
    billingReason: input.invoice.billing_reason,
  })) return false;
  const repository = getMembershipTrialRepository();
  const claim = await repository.findByUserId(input.userId);
  if (!claim || claim.subscriptionId !== input.subscriptionId) return false;
  const convertedAt = stripeTimestamp(input.invoice.status_transitions?.paid_at, input.observedAt);
  const convertedClaim = await repository.markConverted(input.subscriptionId, convertedAt);
  if (!convertedClaim) return false;
  const canonicalConvertedAt = convertedClaim.convertedAt || convertedAt;
  const client = await clerkClient();
  const user = await client.users.getUser(input.userId);
  const metadata = membershipTrialConversionMetadata({
    subscriptionId: input.subscriptionId,
    existingPrivateMetadata: user.privateMetadata as Record<string, unknown>,
    convertedAt: canonicalConvertedAt,
  });
  if (!("membershipTrialConvertedAt" in metadata)) return true;
  await client.users.updateUserMetadata(input.userId, { privateMetadata: metadata });
  return true;
}

export function isManagedMembershipTrial(subscription: Stripe.Subscription, plan: LaunchBillingPlan | null) {
  return isManagedTrial(subscription, plan);
}
