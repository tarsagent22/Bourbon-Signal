import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { isMembershipAccessActive, normalizeMembershipTier, type BillingPlanId } from "@/lib/entitlements";
import { hasActiveGiftMembership } from "@/lib/membership-trial";
import { getCheckoutPlanByPriceId, LAUNCH_BILLING_PLANS, type LaunchBillingPlan } from "@/lib/stripe-plans";
import { activateMembership } from "@/lib/membership-server";
import { reconcileReferredMembership } from "@/lib/referral-service";
import { enforceMembershipSubscriptionActivation } from "@/lib/membership-trial-stripe";
import { verifiedPrimaryClerkEmail } from "@/lib/owner-auth";
import { createGiftRepository } from "@/lib/gift-repository";

export const dynamic = "force-dynamic";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function stripeObjectId(value: unknown) {
  return typeof value === "string" ? value
    : value && typeof value === "object" && "id" in value ? stringValue(value.id) : null;
}

function planFromMetadata(planId: string | null): LaunchBillingPlan | null {
  return planId && planId in LAUNCH_BILLING_PLANS ? LAUNCH_BILLING_PLANS[planId as BillingPlanId] : null;
}

async function planFromCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  const metadataPlan = planFromMetadata(stringValue(session.metadata?.plan));
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
  if (lineItems.has_more || lineItems.data.length !== 1 || lineItems.data[0]?.quantity !== 1) return null;
  const priceId = lineItems.data[0]?.price?.id;
  const pricePlan = getCheckoutPlanByPriceId(priceId);
  return metadataPlan && pricePlan?.id === metadataPlan.id ? metadataPlan : null;
}

function checkoutEmail(session: Stripe.Checkout.Session) {
  return (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
}

function hasCanceledFreeMembershipHold(publicMetadata: Record<string, unknown> | null | undefined) {
  const tier = stringValue(publicMetadata?.tier) || stringValue(publicMetadata?.membershipTier);
  const plan = stringValue(publicMetadata?.plan) || stringValue(publicMetadata?.billingPlan);
  const status = stringValue(publicMetadata?.membershipStatus);
  return status === "canceled" && (tier === "free" || plan === "free");
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401 });

  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (hasCanceledFreeMembershipHold(user.publicMetadata)) {
    return NextResponse.json({ ok: true, activated: false, reason: "membership_canceled" });
  }
  const email = verifiedPrimaryClerkEmail(user);
  const storedCustomerId = stringValue(user.privateMetadata?.stripeCustomerId) || stringValue(user.publicMetadata?.stripeCustomerId);
  const customerIds = new Set<string>(storedCustomerId ? [storedCustomerId] : []);
  // Guest payment-mode Founder sessions may have no Stripe customer. Recover
  // only the exact session already bound to this user by the durable ledger.
  const repository = createGiftRepository();
  const founderAttempt = await repository.findLiveDirectFounderCheckout(userId)
    || await repository.findDirectFounderOwnershipForUser(userId);
  if (founderAttempt?.checkoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(founderAttempt.checkoutSessionId);
    if (session.metadata?.userId === userId
      && session.metadata?.founder_checkout_attempt_id === founderAttempt.attemptId
      && session.metadata?.source === "bourbon_signal_launch"
      && session.metadata?.purchase_type !== "gift"
      && session.status === "complete" && session.payment_status === "paid"
      && session.mode === "payment" && session.metadata?.tier === "bottled-in-bond") {
      const plan = await planFromCheckoutSession(stripe, session);
      const paymentIntentId = stripeObjectId(session.payment_intent);
      const chargeId = paymentIntentId ? stripeObjectId((await stripe.paymentIntents.retrieve(paymentIntentId)).latest_charge) : null;
      const charge = chargeId ? await stripe.charges.retrieve(chargeId) : null;
      if (plan?.id === "bib_lifetime" && charge?.paid && !charge.refunded && !charge.disputed && charge.amount_refunded === 0) {
        const activated = await activateMembership(userId, {
          recoveryAuthority: user,
          tier: plan.tier, plan: plan.id, status: "active",
          stripeCustomerId: stripeObjectId(session.customer), stripeSubscriptionId: null,
          founderCheckoutAttemptId: founderAttempt.attemptId, checkoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId, stripeChargeId: chargeId,
        });
        if (activated === false) return NextResponse.json({ ok: false, activated: false, reason: "recovery_authority_changed" }, { status: 503 });
        await reconcileReferredMembership({ userId, tier: plan.tier, sourceEventId: `checkout-recovery:${session.id}` });
        return NextResponse.json({ ok: true, activated: true, tier: plan.tier, plan: plan.id, sessionId: session.id });
      }
    }
  }
  if (normalizeMembershipTier(user.publicMetadata?.tier || user.publicMetadata?.membershipTier) === "bottled-in-bond"
    || hasActiveGiftMembership(user.publicMetadata as Record<string, unknown>)) {
    return NextResponse.json({ ok: true, activated: false, reason: "existing_lifetime_or_gift" });
  }
  let incomplete = false;
  if (email) {
    const customers = await stripe.customers.list({ email, limit: 10 });
    incomplete = customers.has_more;
    for (const customer of customers.data) {
      if (customer.metadata?.userId && customer.metadata.userId !== userId) continue;
      if (customer.email?.trim().toLowerCase() === email) customerIds.add(customer.id);
    }
  }
  if (!customerIds.size) return NextResponse.json({ ok: true, activated: false, reason: "missing_customer" });

  // Bound work by this customer's sessions, never a global Stripe listing.
  for (const customerId of customerIds) {
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
      for (const session of sessions.data) {
    if (stripeObjectId(session.customer) !== customerId || session.metadata?.source !== "bourbon_signal_launch") continue;
    if (stringValue(session.metadata?.purchase_type) === "gift") continue;
    if (session.status !== "complete" || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")) continue;
    const checkoutUserId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    const emailMatches = checkoutEmail(session) === email;
    if (checkoutUserId && checkoutUserId !== userId) continue;
    if (!checkoutUserId && !emailMatches) continue;

    const plan = await planFromCheckoutSession(stripe, session);
    if (!plan) continue;

    // Founder recovery exclusively uses the user-bound ledger path above.
    if (plan.id === "bib_lifetime") continue;
    let membershipStatus = "active";
    let subscription: Stripe.Subscription | null = null;
    const subscriptionId = stripeObjectId(session.subscription);
    {
      if (!subscriptionId) continue;
      const currentSubscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);
      if (currentSubscriptionId && currentSubscriptionId !== subscriptionId) continue;
      subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (stripeObjectId(subscription.customer) !== customerId || (subscription.metadata?.userId && subscription.metadata.userId !== userId)) continue;
      if (subscription.items.has_more || subscription.items.data.length !== 1
        || getCheckoutPlanByPriceId(subscription.items.data[0]?.price.id)?.id !== plan.id) continue;
      membershipStatus = subscription.status;
      if (!isMembershipAccessActive(plan.tier, membershipStatus, plan.id)) continue;
    }
    if (subscription) {
      const enforcement = await enforceMembershipSubscriptionActivation({ stripe, userId, subscription, plan, recoveryAuthority: user });
      if (!enforcement.accepted && enforcement.reason === "recovery_authority_changed") {
        return NextResponse.json({ ok: false, activated: false, reason: enforcement.reason }, { status: 503 });
      }
      if (!enforcement.accepted) continue;
    }

    const paymentIntentId = stringValue(session.payment_intent);
    const chargeId = paymentIntentId ? stringValue((await stripe.paymentIntents.retrieve(paymentIntentId)).latest_charge) : null;
    const activated = await activateMembership(userId, {
      recoveryAuthority: user,
      tier: plan.tier,
      plan: plan.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: membershipStatus,
      founderCheckoutAttemptId: stringValue(session.metadata?.founder_checkout_attempt_id),
      checkoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
    });
    if (activated === false) return NextResponse.json({ ok: false, activated: false, reason: "recovery_authority_changed" }, { status: 503 });
    if (stringValue(session.metadata?.purchase_type) !== "gift") {
      await reconcileReferredMembership({ userId, tier: plan.tier, sourceEventId: `checkout-recovery:${session.id}` });
    }

    return NextResponse.json({ ok: true, activated: true, tier: plan.tier, plan: plan.id, sessionId: session.id });
      }
      if (!sessions.has_more) break;
      const nextCursor = sessions.data.at(-1)?.id;
      if (!nextCursor || nextCursor === cursor || page === 4) { incomplete = true; break; }
      cursor = nextCursor;
    }
  }
  if (incomplete) return NextResponse.json({ ok: false, activated: false, reason: "recovery_search_limit" }, { status: 503 });
  return NextResponse.json({ ok: true, activated: false, reason: "no_completed_membership_checkout_found" });
}
