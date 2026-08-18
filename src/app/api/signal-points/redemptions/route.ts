import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { readFounderShippingForUser } from "@/lib/founder-shipping-repository";
import { canRedeemSignalPoints, normalizeRedemptionDetails, rewardCatalogItem } from "@/lib/signal-points";
import { applyMembershipCredit, isMembershipCreditRewardKey, membershipCreditEligibility } from "@/lib/signal-points-membership-credit";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import { resolveServerEffectiveMembershipTier } from "@/lib/server-entitlements";
import { requireSignalPointsApiAccess } from "@/lib/owner-auth";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
}
function verifiedPrimaryEmail(user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>) {
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  return primary?.verification?.status === "verified" ? primary.emailAddress.trim().toLowerCase() : "";
}

export async function POST(request: NextRequest) {
  const access = await requireSignalPointsApiAccess({ unauthorized: "Account required", forbidden: "Not found" });
  if (access.error) return access.error;
  const { userId } = access;
  let membershipReservationId = "";
  try {
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    const user = await (await clerkClient()).users.getUser(userId);
    const tier = await resolveServerEffectiveMembershipTier(user.publicMetadata);
    if (!canRedeemSignalPoints(tier)) return NextResponse.json({ error: "Paid membership required to redeem Signal Points." }, { status: 403, headers: PRIVATE_HEADERS });
    const item = rewardCatalogItem(payload.itemKey);
    if (!item) return NextResponse.json({ error: "Choose an available reward." }, { status: 400, headers: PRIVATE_HEADERS });
    const email = verifiedPrimaryEmail(user);
    if (!email) return NextResponse.json({ error: "A verified account email is required." }, { status: 409, headers: PRIVATE_HEADERS });
    const detailInput = (payload.details && typeof payload.details === "object" ? payload.details : {}) as Record<string, unknown>;
    const normalized = normalizeRedemptionDetails(item.key, { ...detailInput, accountEmail: email });
    if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400, headers: PRIVATE_HEADERS });
    if (item.fulfillmentType === "physical") {
      const shipping = await readFounderShippingForUser(userId);
      if (!shipping || payload.confirmSavedAddress !== true) return NextResponse.json({ error: "Confirm your saved U.S. shipping address before redeeming." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim().slice(0, 120) : "";
    if (!idempotencyKey) return NextResponse.json({ error: "A redemption idempotency key is required." }, { status: 400, headers: PRIVATE_HEADERS });
    const repository = createSignalPointsRepository();
    await repository.assertCutoverVerified();

    let membershipFulfillment: null | {
      stripe: Stripe;
      itemKey: "standard_membership_credit_month" | "barrel_membership_credit_month";
      customerId: string;
      subscriptionId: string;
      plan: string;
      creditCents: 300 | 600;
    } = null;
    if (isMembershipCreditRewardKey(item.key)) {
      await repository.assertMembershipCreditReady();
      const stripe = getStripeClient();
      if (!stripe) return NextResponse.json({ error: "Membership credits are temporarily unavailable; no points were spent." }, { status: 503, headers: PRIVATE_HEADERS });
      const subscriptionId = typeof user.privateMetadata?.stripeSubscriptionId === "string" ? user.privateMetadata.stripeSubscriptionId : "";
      if (!subscriptionId) return NextResponse.json({ error: "A directly billed active membership is required." }, { status: 409, headers: PRIVATE_HEADERS });
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const eligibility = membershipCreditEligibility({ itemKey: item.key, tier, privateMetadata: user.privateMetadata as Record<string, unknown>, subscription });
      if (!eligibility.ok) return NextResponse.json({ error: eligibility.error }, { status: 409, headers: PRIVATE_HEADERS });
      membershipFulfillment = { stripe, itemKey: item.key, ...eligibility };
    }

    const result = await repository.reserve({
      id: randomUUID(), userId, tier, itemKey: item.key, idempotencyKey, details: normalized.details,
      accountEmail: email, shippingConfirmed: item.fulfillmentType !== "physical" || payload.confirmSavedAddress === true,
    });
    if (!membershipFulfillment) return NextResponse.json({ ok: true, ...result }, { status: 201, headers: PRIVATE_HEADERS });

    membershipReservationId = result.redemptionId;
    const prepared = await repository.prepareMembershipCreditFulfillment({
      redemptionId: result.redemptionId,
      actorId: userId,
      metadata: { plan: membershipFulfillment.plan, creditCents: membershipFulfillment.creditCents },
    });
    if (prepared.status === "delivered") return NextResponse.json({ ok: true, ...prepared }, { status: 201, headers: PRIVATE_HEADERS });
    const credit = await applyMembershipCredit({
      stripe: membershipFulfillment.stripe,
      customerId: membershipFulfillment.customerId,
      redemptionId: result.redemptionId,
      itemKey: membershipFulfillment.itemKey,
      creditCents: membershipFulfillment.creditCents,
    });
    const completed = await repository.completeMembershipCreditFulfillment({
      redemptionId: result.redemptionId,
      actorId: userId,
      providerReference: credit.transactionId,
      metadata: { subscriptionId: membershipFulfillment.subscriptionId, plan: membershipFulfillment.plan, creditCents: membershipFulfillment.creditCents },
    });
    return NextResponse.json({ ok: true, ...completed }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("Signal Points redemption failed", error);
    if (error instanceof Error && /idempotency key conflict/i.test(error.message)) {
      return NextResponse.json({ error: "That redemption key was already used for different details." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    if (error instanceof Error && /membership credit already redeemed within the last 12 months/i.test(error.message)) {
      return NextResponse.json({ error: "A month-on-us reward can be redeemed once every 12 months." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    if (membershipReservationId) {
      return NextResponse.json({ error: "Your points remain reserved. Retry this same redemption to finish applying the membership credit." }, { status: 503, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ error: "Redemption is temporarily unavailable; no points were intentionally spent." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireSignalPointsApiAccess({ unauthorized: "Account required", forbidden: "Not found" });
  if (access.error) return access.error;
  const { userId } = access;
  try {
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (payload.action !== "cancel" || typeof payload.redemptionId !== "string") return NextResponse.json({ error: "Invalid redemption action." }, { status: 400, headers: PRIVATE_HEADERS });
    const repository = createSignalPointsRepository();
    await repository.assertCutoverVerified();
    const result = await repository.transition({ redemptionId: payload.redemptionId, actorId: userId, actorRole: "member", nextStatus: "canceled" });
    return NextResponse.json({ ok: true, ...result }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("Signal Points cancellation failed", error);
    return NextResponse.json({ error: "Cancellation is temporarily unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
