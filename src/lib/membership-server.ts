import { clerkClient } from "@clerk/nextjs/server";
import { FOUNDER_SPOT_LIMIT, isMembershipAccessActive, normalizeMembershipTier, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";
import { nextFounderNumber, type FounderAllocationUser } from "@/lib/founder-allocation";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function allocateFounderNumber(client: Awaited<ReturnType<typeof clerkClient>>, userId: string) {
  const result = await client.users.getUserList({ limit: 500 });
  const users = (Array.isArray(result) ? result : result.data) as FounderAllocationUser[];
  const number = nextFounderNumber(users, userId, FOUNDER_SPOT_LIMIT);
  if (!number) throw new Error("Bottled-in-Bond Founder memberships are sold out.");
  return number;
}

export async function findUserByEmailAddress(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const client = await clerkClient();
  const result = await client.users.getUserList({ emailAddress: [normalized], limit: 10 });
  const users = Array.isArray(result) ? result : result.data;
  return users.find((user) => user.emailAddresses?.some((item) => item.emailAddress.toLowerCase() === normalized)) || null;
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
  const status = input.status || "active";
  const accessTier = isMembershipAccessActive(input.tier, status, input.plan) ? input.tier : "free";
  const accessPlan = accessTier === "free" ? "free" : input.plan;
  const founderNumber = accessTier === "bottled-in-bond" && accessPlan === "bib_lifetime"
    ? await allocateFounderNumber(client, userId)
    : null;

  // Entitlement access depends on both tier and billing status. Keep this write tiny and first so
  // large private metadata surfaces (alert inboxes, delivery records, etc.) cannot block a
  // paid checkout from activating the user's tier.
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      tier: accessTier,
      plan: accessPlan,
      membershipTier: accessTier,
      billingPlan: accessPlan,
      membershipStatus: status,
      subscribedAt: stringValue(user.publicMetadata?.subscribedAt) || now,
      membershipUpdatedAt: now,
      ...(founderNumber ? { founderNumber, memberNumber: founderNumber } : {}),
      ...(input.stripeCustomerId ? { stripeCustomerId: input.stripeCustomerId } : {}),
    },
  });

  // Private Stripe bookkeeping is useful, but it must never be the reason paid access fails.
  try {
    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        stripeCustomerId: input.stripeCustomerId || stringValue(user.privateMetadata?.stripeCustomerId) || null,
        stripeSubscriptionId: input.stripeSubscriptionId || stringValue(user.privateMetadata?.stripeSubscriptionId) || null,
        stripePlan: input.plan,
        stripeMembershipStatus: status,
        stripeMembershipUpdatedAt: now,
      },
    });
  } catch (error) {
    console.error("membership private metadata update failed", {
      userId,
      plan: input.plan,
      tier: input.tier,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}


export async function suspendMembershipForSubscription(customerId: string, subscriptionId: string, status = "past_due") {
  const user = await findUserByStripeCustomerId(customerId);
  if (!user) return;
  const existingPlan = stringValue(user.publicMetadata?.plan) || stringValue(user.publicMetadata?.billingPlan);
  const existingTier = normalizeMembershipTier(user.publicMetadata?.tier || user.publicMetadata?.membershipTier);
  if (existingPlan === "bib_lifetime" || existingTier === "bottled-in-bond") return;
  const storedSubscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);
  if (storedSubscriptionId && storedSubscriptionId !== subscriptionId) return;

  const client = await clerkClient();
  await client.users.updateUserMetadata(user.id, {
    publicMetadata: {
      ...user.publicMetadata,
      membershipStatus: status,
      membershipUpdatedAt: new Date().toISOString(),
    },
    privateMetadata: {
      ...user.privateMetadata,
      stripeMembershipStatus: status,
    },
  });
}

export async function downgradeMembershipForSubscription(customerId: string, subscriptionId: string) {
  const user = await findUserByStripeCustomerId(customerId);
  if (!user) return;
  const existingPlan = stringValue(user.publicMetadata?.plan) || stringValue(user.publicMetadata?.billingPlan);
  const existingTier = normalizeMembershipTier(user.publicMetadata?.tier || user.publicMetadata?.membershipTier);
  if (existingPlan === "bib_lifetime" || existingTier === "bottled-in-bond") return;
  const storedSubscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);
  if (storedSubscriptionId && storedSubscriptionId !== subscriptionId) return;

  const client = await clerkClient();
  await client.users.updateUserMetadata(user.id, {
    publicMetadata: {
      tier: "free",
      plan: "free",
      membershipTier: "free",
      billingPlan: "free",
      membershipStatus: "canceled",
      membershipUpdatedAt: new Date().toISOString(),
    },
    privateMetadata: {
      stripeMembershipStatus: "canceled",
    },
  });
}
