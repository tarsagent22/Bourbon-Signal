import { clerkClient } from "@clerk/nextjs/server";
import { isMembershipAccessActive, normalizeMembershipTier, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";
import { founderNumberFromMetadata, isFounderMembershipMetadata } from "@/lib/founder-allocation";
import { mergeGrowthMilestoneMetadata } from "@/lib/growth-events";
import type { GiftOrderRecord } from "@/lib/gift-repository";
import { createGiftRepository } from "@/lib/gift-repository";
import { reconcileAllFounderReservationAuthority } from "@/lib/founder-reservations";
import { resolveServerEffectiveMembershipTier } from "@/lib/server-entitlements";
import { directFounderRevocationMetadata } from "@/lib/direct-founder-revocation";

type ClerkMembershipUser = {
  id: string;
  publicMetadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  emailAddresses?: Array<{ emailAddress: string }>;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function allocateFounderNumber(client: Awaited<ReturnType<typeof clerkClient>>, userId: string, input: {
  founderCheckoutAttemptId?: string | null;
  checkoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
}) {
  const user = await client.users.getUser(userId);
  const existing = founderNumberFromMetadata(user.publicMetadata);
  if (isFounderMembershipMetadata(user.publicMetadata) && !existing) throw new Error("An existing Founder is missing a durable number.");
  const repository = createGiftRepository();
  if (input.founderCheckoutAttemptId && input.checkoutSessionId) {
    const completed = await repository.completeDirectFounderCheckout({
      userId,
      attemptId: input.founderCheckoutAttemptId,
      checkoutSessionId: input.checkoutSessionId,
      paymentIntentId: input.stripePaymentIntentId || null,
      chargeId: input.stripeChargeId || null,
    });
    if (!completed || completed.latePayment || !completed.founderNumber) {
      throw new Error("Founder checkout payment requires refund review.");
    }
    if (!await repository.directFounderOwnsEffectiveAccess(input.founderCheckoutAttemptId, completed.entitlementVersion)) {
      throw new Error("Founder checkout no longer owns access.");
    }
    if (existing && completed.founderNumber !== existing) throw new Error("Founder number mismatch");
    await reconcileAllFounderReservationAuthority(client);
    return {
      founderNumber: completed.founderNumber,
      attemptId: input.founderCheckoutAttemptId,
      entitlementVersion: completed.entitlementVersion,
    };
  }
  await reconcileAllFounderReservationAuthority(client);
  if (existing) {
    const number = await repository.reconcileExistingFounder(userId, existing);
    const metadataAttemptId = stringValue(user.publicMetadata?.directFounderCheckoutAttemptId);
    const metadataVersion = stringValue(user.publicMetadata?.directFounderEntitlementVersion);
    if (metadataAttemptId && metadataVersion
      && await repository.directFounderOwnsEffectiveAccess(metadataAttemptId, metadataVersion)) {
      return { founderNumber: number, attemptId: metadataAttemptId, entitlementVersion: metadataVersion };
    }
    const ownership = await repository.findDirectFounderOwnershipForUser(userId, existing);
    return {
      founderNumber: number,
      attemptId: ownership?.attemptId || metadataAttemptId,
      entitlementVersion: ownership?.entitlementVersion || metadataVersion,
    };
  }
  throw new Error("Founder checkout ownership is unavailable.");
}

export async function findUserByEmailAddress(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const client = await clerkClient();
  const result = await client.users.getUserList({ emailAddress: [normalized], limit: 10 });
  const users = (Array.isArray(result) ? result : result.data) as ClerkMembershipUser[];
  return users.find((user) => user.emailAddresses?.some((item) => item.emailAddress.toLowerCase() === normalized)) || null;
}

export async function findUserByStripeCustomerId(customerId: string) {
  const client = await clerkClient();
  const result = await client.users.getUserList({ limit: 500 });
  const users = (Array.isArray(result) ? result : result.data) as ClerkMembershipUser[];
  return users.find((user) => user.publicMetadata?.stripeCustomerId === customerId || user.privateMetadata?.stripeCustomerId === customerId) || null;
}

export async function activateMembership(userId: string, input: {
  tier: MembershipTier;
  plan: BillingPlanId;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: string | null;
  founderCheckoutAttemptId?: string | null;
  checkoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
}) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const now = new Date().toISOString();
  const status = input.status || "active";
  const activeGiftOrderId = stringValue(user.publicMetadata?.giftOrderId);
  const activeGiftPlan = stringValue(user.publicMetadata?.plan) || stringValue(user.publicMetadata?.billingPlan);
  if (activeGiftOrderId && activeGiftPlan?.startsWith("gift_") && input.plan !== "bib_lifetime") {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        ...user.publicMetadata,
        giftPreviousMembership: { tier: input.tier, plan: input.plan, status },
        membershipUpdatedAt: now,
      },
      privateMetadata: {
        stripeCustomerId: input.stripeCustomerId || stringValue(user.privateMetadata?.stripeCustomerId) || null,
        stripeSubscriptionId: input.stripeSubscriptionId || stringValue(user.privateMetadata?.stripeSubscriptionId) || null,
        stripePlan: input.plan,
        stripeMembershipStatus: status,
        stripeMembershipUpdatedAt: now,
        activation: mergeGrowthMilestoneMetadata(user.privateMetadata || {}, "membership_activated", now).activation,
      },
    });
    return;
  }
  const accessTier = isMembershipAccessActive(input.tier, status, input.plan) ? input.tier : "free";
  const accessPlan = accessTier === "free" ? "free" : input.plan;
  const founderOwnership = accessTier === "bottled-in-bond" && accessPlan === "bib_lifetime"
    ? await allocateFounderNumber(client, userId, input)
    : null;
  const founderNumber = founderOwnership?.founderNumber || null;
  const existingDirectAttemptId = stringValue(user.publicMetadata?.directFounderCheckoutAttemptId);
  const existingDirectVersion = stringValue(user.publicMetadata?.directFounderEntitlementVersion);
  const currentPlan = stringValue(user.publicMetadata?.plan) || stringValue(user.publicMetadata?.billingPlan) || "free";
  const currentStatus = stringValue(user.publicMetadata?.membershipStatus) || "free";
  const clerkAlreadyFounder = Boolean(founderNumberFromMetadata(user.publicMetadata));
  const directPreviousMembership = founderOwnership
    ? (existingDirectAttemptId === founderOwnership.attemptId
      ? user.publicMetadata?.directFounderPreviousMembership
      : (clerkAlreadyFounder && !existingDirectAttemptId
        ? user.publicMetadata?.directFounderPreviousMembership || { tier: "free", plan: "free", status: "free" }
        : { tier: await resolveServerEffectiveMembershipTier(user.publicMetadata), plan: currentPlan, status: currentStatus }))
    : (existingDirectAttemptId
      ? { tier: input.tier, plan: input.plan, status }
      : user.publicMetadata?.directFounderPreviousMembership);
  const durableDirectAttemptId = founderOwnership?.attemptId || existingDirectAttemptId;
  const durableDirectVersion = founderOwnership?.entitlementVersion || existingDirectVersion;

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
      giftOrderId: null,
      giftAccessStartsAt: null,
      giftAccessExpiresAt: null,
      giftEntitlementVersion: null,
      directFounderCheckoutAttemptId: durableDirectAttemptId || null,
      directFounderEntitlementVersion: durableDirectVersion || null,
      directFounderPreviousMembership: directPreviousMembership || null,
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
        activation: mergeGrowthMilestoneMetadata(user.privateMetadata || {}, "membership_activated", now).activation,
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

export async function activateGiftMembership(userId: string, order: GiftOrderRecord) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const now = new Date().toISOString();
  const publicMetadata = user.publicMetadata as Record<string, unknown>;
  const existingGiftOrderId = stringValue(publicMetadata.giftOrderId);
  const existingGiftVersion = stringValue(publicMetadata.giftEntitlementVersion);
  if (existingGiftOrderId === order.id && existingGiftVersion === order.entitlementVersion) return;
  if (existingGiftOrderId && existingGiftOrderId !== order.id
    && await createGiftRepository().giftOwnsEffectiveAccess(existingGiftOrderId, existingGiftVersion)) {
    throw new Error("A different gift currently owns this access.");
  }
  const currentTier = await resolveServerEffectiveMembershipTier(publicMetadata);
  const tierRank = { free: 0, standard: 1, barrel: 2, "bottled-in-bond": 3 } as const;
  if (existingGiftOrderId !== order.id && tierRank[currentTier] >= tierRank[order.giftTier]) {
    throw new Error("The current membership already includes this gift level.");
  }
  const plan = order.giftPlan === "standard_annual_gift"
    ? "gift_standard_annual"
    : order.giftPlan === "barrel_annual_gift"
      ? "gift_barrel_annual"
      : "bib_lifetime";
  const status = order.giftPlan === "founder_lifetime_gift" ? "lifetime" : "active";
  const previousMembership = publicMetadata.giftPreviousMembership && typeof publicMetadata.giftPreviousMembership === "object"
    ? publicMetadata.giftPreviousMembership
    : {
        tier: currentTier,
        plan: currentTier === "free" ? "free" : stringValue(publicMetadata.plan) || stringValue(publicMetadata.billingPlan) || "free",
        status: currentTier === "free" ? "free" : stringValue(publicMetadata.membershipStatus) || "free",
      };
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      tier: order.giftTier,
      plan,
      membershipTier: order.giftTier,
      billingPlan: plan,
      membershipStatus: status,
      giftOrderId: order.id,
      giftAccessStartsAt: order.accessStartsAt,
      giftAccessExpiresAt: order.accessExpiresAt,
      giftEntitlementVersion: order.entitlementVersion,
      giftPreviousMembership: previousMembership,
      subscribedAt: stringValue(publicMetadata.subscribedAt) || now,
      membershipUpdatedAt: now,
      ...(order.founderNumber ? { founderNumber: order.founderNumber, memberNumber: order.founderNumber } : {}),
    },
  });
}

export async function expireGiftMembershipIfCurrent(order: GiftOrderRecord) {
  if (!order.redeemedByUserId || !order.accessExpiresAt) return false;
  const client = await clerkClient();
  const user = await client.users.getUser(order.redeemedByUserId);
  const metadata = user.publicMetadata as Record<string, unknown>;
  const currentGiftOrderId = stringValue(metadata.giftOrderId);
  const currentExpiry = stringValue(metadata.giftAccessExpiresAt);
  const currentPlan = stringValue(metadata.plan) || stringValue(metadata.billingPlan);
  const currentEntitlementVersion = stringValue(metadata.giftEntitlementVersion);
  if (currentGiftOrderId !== order.id || currentExpiry !== order.accessExpiresAt) return false;
  if (!order.entitlementVersion || currentEntitlementVersion !== order.entitlementVersion) return false;
  if (currentPlan !== "gift_standard_annual" && currentPlan !== "gift_barrel_annual") return false;
  // Expiry is a read-only overlay: resolveEffectiveMembershipTier stops honoring this gift at
  // accessExpiresAt and exposes any still-active previous membership. Avoiding a Clerk write here
  // means an expiry worker can never overwrite a newer subscription activation.
  return true;
}

export async function revokeGiftMembershipIfCurrent(order: GiftOrderRecord) {
  if (!order.redeemedByUserId) return true;
  const client = await clerkClient();
  const user = await client.users.getUser(order.redeemedByUserId);
  const metadata = user.publicMetadata as Record<string, unknown>;
  if (stringValue(metadata.giftOrderId) !== order.id) return true;
  if (!order.entitlementVersion || stringValue(metadata.giftEntitlementVersion) !== order.entitlementVersion) return true;
  const previous = metadata.giftPreviousMembership && typeof metadata.giftPreviousMembership === "object"
    ? metadata.giftPreviousMembership as Record<string, unknown> : {};
  const tier = normalizeMembershipTier(previous.tier);
  const plan = stringValue(previous.plan) || "free";
  const status = stringValue(previous.status) || "free";
  await client.users.updateUserMetadata(order.redeemedByUserId, {
    publicMetadata: {
      tier,
      plan,
      membershipTier: tier,
      billingPlan: plan,
      membershipStatus: status,
      giftOrderId: null,
      giftAccessStartsAt: null,
      giftAccessExpiresAt: null,
      giftEntitlementVersion: null,
      membershipUpdatedAt: new Date().toISOString(),
    },
  });
  return true;
}

export async function reactivateGiftMembershipIfEligible(order: GiftOrderRecord) {
  if (!order.redeemedByUserId || !order.entitlementVersion) return true;
  const repository = createGiftRepository();
  if (!await repository.giftOwnsEffectiveAccess(order.id, order.entitlementVersion)) return true;
  await activateGiftMembership(order.redeemedByUserId, order);
  if (!await repository.giftOwnsEffectiveAccess(order.id, order.entitlementVersion)) {
    await revokeGiftMembershipIfCurrent(order);
    return false;
  }
  const user = await (await clerkClient()).users.getUser(order.redeemedByUserId);
  return stringValue(user.publicMetadata?.giftOrderId) === order.id
    && stringValue(user.publicMetadata?.giftEntitlementVersion) === order.entitlementVersion
    && stringValue(user.publicMetadata?.giftAccessStartsAt) === order.accessStartsAt
    && stringValue(user.publicMetadata?.giftAccessExpiresAt) === order.accessExpiresAt;
}

export async function revokeDirectFounderMembershipIfCurrent(attemptId: string) {
  const ownership = await createGiftRepository().readDirectFounderAttempt(attemptId);
  if (!ownership) return true;
  const userId = stringValue(ownership.user_id);
  if (!userId) return true;
  const user = await (await clerkClient()).users.getUser(userId);
  if (stringValue(user.publicMetadata?.directFounderCheckoutAttemptId) !== attemptId) return true;
  await (await clerkClient()).users.updateUserMetadata(userId, {
    publicMetadata: directFounderRevocationMetadata(),
  });
  return true;
}

export async function reactivateDirectFounderMembership(attemptId: string) {
  const repository = createGiftRepository();
  const ownership = await repository.readDirectFounderAttempt(attemptId);
  if (!ownership || ownership.status !== "paid" || (ownership.dispute_status && ownership.dispute_status !== "won")) return false;
  const userId = stringValue(ownership.user_id);
  const checkoutSessionId = stringValue(ownership.checkout_session_id);
  if (!userId || !checkoutSessionId) return false;
  await activateMembership(userId, {
    tier: "bottled-in-bond",
    plan: "bib_lifetime",
    status: "lifetime",
    founderCheckoutAttemptId: attemptId,
    checkoutSessionId,
    stripePaymentIntentId: stringValue(ownership.stripe_payment_intent_id),
    stripeChargeId: stringValue(ownership.stripe_charge_id),
  });
  return true;
}


export async function suspendMembershipForSubscription(customerId: string, subscriptionId: string, status = "past_due") {
  const user = await findUserByStripeCustomerId(customerId);
  if (!user) return;
  const existingPlan = stringValue(user.publicMetadata?.plan) || stringValue(user.publicMetadata?.billingPlan);
  const existingTier = normalizeMembershipTier(user.publicMetadata?.tier || user.publicMetadata?.membershipTier);
  const storedSubscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);
  if (storedSubscriptionId && storedSubscriptionId !== subscriptionId) return;
  if (existingPlan?.startsWith("gift_")) {
    const previous = user.publicMetadata?.giftPreviousMembership && typeof user.publicMetadata.giftPreviousMembership === "object"
      ? user.publicMetadata.giftPreviousMembership as Record<string, unknown> : {};
    const client = await clerkClient();
    await client.users.updateUserMetadata(user.id, {
      publicMetadata: { ...user.publicMetadata, giftPreviousMembership: { ...previous, status }, membershipUpdatedAt: new Date().toISOString() },
      privateMetadata: { ...user.privateMetadata, stripeMembershipStatus: status },
    });
    return;
  }
  if (existingPlan === "bib_lifetime" || existingTier === "bottled-in-bond") return;

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
  const storedSubscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);
  if (storedSubscriptionId && storedSubscriptionId !== subscriptionId) return;
  if (existingPlan?.startsWith("gift_")) {
    const previous = user.publicMetadata?.giftPreviousMembership && typeof user.publicMetadata.giftPreviousMembership === "object"
      ? user.publicMetadata.giftPreviousMembership as Record<string, unknown> : {};
    const client = await clerkClient();
    await client.users.updateUserMetadata(user.id, {
      publicMetadata: { ...user.publicMetadata, giftPreviousMembership: { ...previous, status: "canceled" }, membershipUpdatedAt: new Date().toISOString() },
      privateMetadata: { ...user.privateMetadata, stripeMembershipStatus: "canceled" },
    });
    return;
  }
  if (existingPlan === "bib_lifetime" || existingTier === "bottled-in-bond") return;

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
