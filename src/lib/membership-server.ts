import { clerkClient } from "@clerk/nextjs/server";
import { normalizeMembershipTier, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function findUserByStripeCustomerId(customerId: string) {
  const client = await clerkClient();
  const result = await client.users.getUserList({ limit: 500 });
  const users = Array.isArray(result) ? result : result.data;
  return users.find((user) => user.publicMetadata?.stripeCustomerId === customerId || user.privateMetadata?.stripeCustomerId === customerId) || null;
}

export async function activateMembership(userId: string, input: {
  tier: MembershipTier;
  plan: BillingPlanId;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: string | null;
}) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const now = new Date().toISOString();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...user.publicMetadata,
      tier: input.tier,
      plan: input.plan,
      membershipStatus: input.status || "active",
      subscribedAt: user.publicMetadata?.subscribedAt || now,
      membershipUpdatedAt: now,
      ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
    },
    privateMetadata: {
      ...user.privateMetadata,
      stripeCustomerId: input.stripeCustomerId || stringValue(user.privateMetadata?.stripeCustomerId) || null,
      stripeSubscriptionId: input.stripeSubscriptionId || stringValue(user.privateMetadata?.stripeSubscriptionId) || null,
      stripePlan: input.plan,
      stripeMembershipStatus: input.status || "active",
    },
  });
}

export async function downgradeMembershipForSubscription(customerId: string, subscriptionId: string) {
  const user = await findUserByStripeCustomerId(customerId);
  if (!user) return;
  const existingPlan = stringValue(user.publicMetadata?.plan);
  const existingTier = normalizeMembershipTier(user.publicMetadata?.tier);
  if (existingPlan === "bib_lifetime" || existingTier === "bottled-in-bond") return;
  const storedSubscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);
  if (storedSubscriptionId && storedSubscriptionId !== subscriptionId) return;

  const client = await clerkClient();
  await client.users.updateUserMetadata(user.id, {
    publicMetadata: {
      ...user.publicMetadata,
      tier: "free",
      plan: "free",
      membershipStatus: "canceled",
      membershipUpdatedAt: new Date().toISOString(),
    },
    privateMetadata: {
      ...user.privateMetadata,
      stripeMembershipStatus: "canceled",
    },
  });
}
