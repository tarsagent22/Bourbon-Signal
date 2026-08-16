import "server-only";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import type { LaunchBillingPlan } from "@/lib/stripe-plans";
import { getMembershipTrialRepository } from "@/lib/membership-trial-repository";
import { hasActiveGiftMembership } from "@/lib/membership-trial";

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
}) {
  const observedAt = input.observedAt || new Date().toISOString();
  const user = await (await clerkClient()).users.getUser(input.userId);
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
  if (input.subscription.status === "active") {
    await repository.markConverted(input.subscription.id, observedAt);
  }
  return { accepted: true as const, managedTrial: true as const };
}

export function isManagedMembershipTrial(subscription: Stripe.Subscription, plan: LaunchBillingPlan | null) {
  return isManagedTrial(subscription, plan);
}
