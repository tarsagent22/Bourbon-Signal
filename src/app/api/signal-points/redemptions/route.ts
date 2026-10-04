import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAppleMembershipRepository } from "@/lib/apple-membership-repository";
import { appleMembershipAccessTier } from "@/lib/apple-membership";
import { appleMonthAvailable, membershipMonthQuery, membershipMonthRoute, readMonthDelivery } from "@/lib/membership-month";
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
    const item = rewardCatalogItem(payload.itemKey);
    if (!item) return NextResponse.json({ error: "Choose an available reward." }, { status: 400, headers: PRIVATE_HEADERS });
    if (!canRedeemSignalPoints(tier) && item.key !== "standard_membership_credit_month") return NextResponse.json({ error: "Membership is required for this reward. Free users can earn a month of Standard." }, { status: 403, headers: PRIVATE_HEADERS });
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

    if (isMembershipCreditRewardKey(item.key)) {
      await repository.assertMembershipCreditReady();
      const query = membershipMonthQuery();
      const readiness = await query.query("SELECT 1 FROM signal_point_migrations WHERE migration_key='signal_points_membership_month_v5_ready'");
      if (!readiness.length) return NextResponse.json({ error: "Membership rewards are temporarily unavailable; no points were spent." }, { status: 503, headers: PRIVATE_HEADERS });
      const existing = (await query.query("SELECT id,status,details,item_key,account_email FROM signal_reward_redemptions WHERE user_id=$1 AND idempotency_key=$2", [userId,idempotencyKey]))[0] as {id:string;status:string;details:Record<string,unknown>;item_key:string;account_email:string}|undefined;
      if (existing && (existing.item_key !== item.key || existing.account_email.toLowerCase() !== email)) throw new Error("Redemption idempotency key conflict");
      if (existing?.status === "delivered") {
        const delivery = await readMonthDelivery(userId, existing.id);
        if (delivery?.provider === "earned_access") await (await clerkClient()).users.updateUserMetadata(userId, { publicMetadata: { rewardMembershipRedemptionId: existing.id, rewardMembershipUserId: userId, rewardMembershipExpiresAt: delivery.expiresAt } });
        const account = (await query.query("SELECT balance FROM signal_point_accounts WHERE user_id=$1", [userId]))[0] as {balance:number};
        return NextResponse.json({ ok:true, redemptionId:existing.id, status:"delivered", balance:account.balance, membershipMonth:delivery }, { status:201, headers:PRIVATE_HEADERS });
      }
      const route = existing?.details.monthProvider
        ? { provider: String(existing.details.monthProvider), audience: String(existing.details.monthAudience), tier: item.eligibleTier! }
        : membershipMonthRoute(tier, user.publicMetadata as Record<string,unknown>, user.privateMetadata as Record<string,unknown>, payload.platform);
      if (!route || item.eligibleTier !== route.tier) return NextResponse.json({ error:"This membership reward does not match your current membership." }, { status:409, headers:PRIVATE_HEADERS });
      if (route.provider === "apple" && route.audience === "member") {
        const apple = await getAppleMembershipRepository().readCurrentForUser(userId);
        if (!apple || apple.environment !== "production" || !apple.productId.endsWith(".monthly") || appleMembershipAccessTier(apple) !== route.tier) return NextResponse.json({ error:"An active Apple monthly subscription for this tier is required; no points were spent." }, { status:409,headers:PRIVATE_HEADERS });
      }
      let stripeFulfillment: null | { stripe:Stripe; customerId:string; subscriptionId:string; plan:string; creditCents:300|600 } = null;
      if (route.provider === "stripe") {
        const stripe = getStripeClient();
        const subscriptionId = typeof user.privateMetadata.stripeSubscriptionId === "string" ? user.privateMetadata.stripeSubscriptionId : "";
        if (!stripe || !subscriptionId) return NextResponse.json({ error:"Membership billing could not be verified; no points were spent." }, { status:503, headers:PRIVATE_HEADERS });
        const eligibility = membershipCreditEligibility({ itemKey:item.key, tier, privateMetadata:user.privateMetadata as Record<string,unknown>, subscription:await stripe.subscriptions.retrieve(subscriptionId) });
        if (!eligibility.ok) return NextResponse.json({ error:eligibility.error }, { status:409, headers:PRIVATE_HEADERS });
        stripeFulfillment = { stripe,...eligibility };
      } else if (route.provider === "apple" && !existing && !await appleMonthAvailable({ ...route, provider:"apple", audience:route.audience as "free"|"member" })) {
        return NextResponse.json({ error:"Apple membership rewards are awaiting App Store approval. No points were spent." }, { status:409, headers:PRIVATE_HEADERS });
      }
      const rows = await query.query("SELECT * FROM redeem_signal_membership_month($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(),userId,route.audience === "free" ? "free" : tier,item.key,idempotencyKey,email,route.provider,route.audience]);
      const reserved = rows[0] as {redemption_id:string;redemption_status:string;balance:number};
      membershipReservationId = reserved.redemption_id;
      let completed = { redemptionId:reserved.redemption_id,status:reserved.redemption_status,balance:reserved.balance };
      if (stripeFulfillment) {
        await repository.prepareMembershipCreditFulfillment({ redemptionId:completed.redemptionId, actorId:userId,metadata:{ provider:"stripe" } });
        const credit = await applyMembershipCredit({ stripe:stripeFulfillment.stripe, customerId:stripeFulfillment.customerId,redemptionId:completed.redemptionId,itemKey:item.key,creditCents:stripeFulfillment.creditCents });
        completed = await repository.completeMembershipCreditFulfillment({ redemptionId:completed.redemptionId,actorId:userId,providerReference:credit.transactionId,metadata:{provider:"stripe",subscriptionId:stripeFulfillment.subscriptionId,plan:stripeFulfillment.plan,creditCents:stripeFulfillment.creditCents} });
      }
      const delivery = await readMonthDelivery(userId, completed.redemptionId);
      if (delivery?.provider === "earned_access") await (await clerkClient()).users.updateUserMetadata(userId, { publicMetadata: { rewardMembershipRedemptionId:completed.redemptionId,rewardMembershipUserId:userId,rewardMembershipExpiresAt:delivery.expiresAt } });
      return NextResponse.json({ ok:true,...completed,membershipMonth:delivery }, { status:201,headers:PRIVATE_HEADERS });
    }

    const result = await repository.reserve({
      id: randomUUID(), userId, tier, itemKey: item.key, idempotencyKey, details: normalized.details,
      accountEmail: email, shippingConfirmed: item.fulfillmentType !== "physical" || payload.confirmSavedAddress === true,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201, headers: PRIVATE_HEADERS });

  } catch (error) {
    console.error("Signal Points redemption failed", { reserved: Boolean(membershipReservationId) });
    if (error instanceof Error && /idempotency key conflict/i.test(error.message)) {
      return NextResponse.json({ error: "That redemption key was already used for different details." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    if (error instanceof Error && /membership credit already redeemed within the last 12 months/i.test(error.message)) {
      return NextResponse.json({ error: "A month-on-us reward can be redeemed once every 12 months." }, { status: 409, headers: PRIVATE_HEADERS });
    }
    if (membershipReservationId) {
      return NextResponse.json({ error: "Your points remain reserved. Retry this same redemption to finish applying the membership credit." }, { status: 503, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ error: "The redemption result could not be confirmed. Retry the same request or check your redemption history before starting another." }, { status: 503, headers: PRIVATE_HEADERS });
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
