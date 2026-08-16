import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { isMembershipAccessActive, normalizeMembershipTier, type BillingPlanId } from "@/lib/entitlements";
import { getCheckoutPlanByPriceId, getPlanByPriceId, LAUNCH_BILLING_PLANS, type LaunchBillingPlan } from "@/lib/stripe-plans";
import { activateMembership, downgradeMembershipForSubscription, findUserByEmailAddress, findUserByStripeCustomerId, suspendMembershipForSubscription } from "@/lib/membership-server";
import { reconcileReferredMembership } from "@/lib/referral-service";
import { isGiftPurchase } from "@/lib/gifts";
import { handleDirectFounderStripeEvent, handleGiftStripeEvent } from "@/lib/gift-stripe-webhook";
import { getMembershipTrialRepository } from "@/lib/membership-trial-repository";
import { enforceMembershipSubscriptionActivation, isManagedMembershipTrial } from "@/lib/membership-trial-stripe";

export const dynamic = "force-dynamic";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? createStripeClient(secretKey) : null;
}

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isReferralEligiblePurchase(metadata: Stripe.Metadata | null | undefined) {
  if (metadata?.purchase_type === "gift" || metadata?.referral_eligible === "false") return false;
  return !isGiftPurchase(metadata);
}

function checkoutEmail(session: Stripe.Checkout.Session) {
  return (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
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

async function planFromSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const matched = getPlanByPriceId(priceId);
  if (matched) return matched;
  return planFromMetadata(stringValue(subscription.metadata?.plan));
}

async function retrieveCurrentSubscription(stripe: Stripe, subscriptionId: string) {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") return null;
    throw error;
  }
}

async function emailFromStripeCustomer(stripe: Stripe, customerId: string | null) {
  if (!customerId) return "";
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) return "";
  return ("email" in customer && typeof customer.email === "string" ? customer.email : "").trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = getWebhookSecret();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  if (await handleGiftStripeEvent(stripe, event)) {
    return NextResponse.json({ received: true });
  }
  if (await handleDirectFounderStripeEvent(stripe, event)) {
    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const plan = await planFromCheckoutSession(stripe, session);
    const metadataUserId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    const emailMatchedUser = !metadataUserId ? await findUserByEmailAddress(checkoutEmail(session)) : null;
    const userId = metadataUserId || emailMatchedUser?.id || null;
    let membershipStatus = "active";
    const subscriptionId = stringValue(session.subscription);
    let subscription: Stripe.Subscription | null = null;
    if (plan && plan.id !== "bib_lifetime" && subscriptionId) {
      subscription = await retrieveCurrentSubscription(stripe, subscriptionId);
      if (!subscription) return NextResponse.json({ received: true });
      membershipStatus = subscription.status;
    }
    if (userId && plan && (session.payment_status === "paid" || session.payment_status === "no_payment_required")
      && isMembershipAccessActive(plan.tier, membershipStatus, plan.id)) {
      if (subscription) {
        const enforcement = await enforceMembershipSubscriptionActivation({
          stripe,
          userId,
          subscription,
          plan,
          observedAt: new Date(event.created * 1000).toISOString(),
        });
        if (!enforcement.accepted) return NextResponse.json({ received: true });
      }
      const paymentIntentId = stringValue(session.payment_intent);
      let chargeId: string | null = null;
      if (paymentIntentId) chargeId = stringValue((await stripe.paymentIntents.retrieve(paymentIntentId)).latest_charge);
      await activateMembership(userId, {
        tier: plan.tier,
        plan: plan.id,
        stripeCustomerId: stringValue(session.customer),
        stripeSubscriptionId: subscriptionId,
        status: membershipStatus,
        founderCheckoutAttemptId: stringValue(session.metadata?.founder_checkout_attempt_id),
        checkoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: chargeId,
      });
      if (isReferralEligiblePurchase(session.metadata)) {
        await reconcileReferredMembership({ userId, tier: plan.tier, sourceEventId: event.id });
      }
    }
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const eventSubscription = event.data.object as Stripe.Subscription;
    const subscription = await retrieveCurrentSubscription(stripe, eventSubscription.id);
    if (!subscription) return NextResponse.json({ received: true });
    const customerId = stringValue(subscription.customer);
    const metadataUserId = stringValue(subscription.metadata?.userId);
    const existingUser = !metadataUserId && customerId ? await findUserByStripeCustomerId(customerId) : null;
    const emailMatchedUser = !metadataUserId && !existingUser ? await findUserByEmailAddress(await emailFromStripeCustomer(stripe, customerId)) : null;
    const userId = metadataUserId || existingUser?.id || emailMatchedUser?.id || null;
    const plan = await planFromSubscription(subscription);
    const eventAt = new Date(event.created * 1000).toISOString();
    if (userId && plan) {
      const enforcement = await enforceMembershipSubscriptionActivation({ stripe, userId, subscription, plan, observedAt: eventAt });
      if (!enforcement.accepted) return NextResponse.json({ received: true });
    }
    if (isManagedMembershipTrial(subscription, plan) && ["canceled", "unpaid", "incomplete_expired"].includes(subscription.status)) {
      await getMembershipTrialRepository().markCanceled(subscription.id, eventAt);
    }
    if (userId && plan && isMembershipAccessActive(plan.tier, subscription.status, plan.id)) {
      await activateMembership(userId, {
        tier: plan.tier,
        plan: plan.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
      });
      if (isReferralEligiblePurchase(subscription.metadata)) {
        await reconcileReferredMembership({ userId, tier: plan.tier, sourceEventId: event.id });
      }
    } else if (customerId && !isMembershipAccessActive(plan?.tier, subscription.status, plan?.id)) {
      await suspendMembershipForSubscription(customerId, subscription.id, subscription.status, userId);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = stringValue(subscription.customer);
    const metadataUserId = stringValue(subscription.metadata?.userId);
    if (subscription.metadata?.trial_offer === "monthly_7_day_v1") {
      if (!metadataUserId) return NextResponse.json({ received: true });
      const durableClaim = await getMembershipTrialRepository().findByUserId(metadataUserId);
      if (durableClaim && durableClaim.subscriptionId !== subscription.id) {
        return NextResponse.json({ received: true });
      }
      await getMembershipTrialRepository().markCanceled(subscription.id, new Date(event.created * 1000).toISOString());
    }
    if (customerId) await downgradeMembershipForSubscription(customerId, subscription.id, metadataUserId);
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = stringValue(invoice.customer);
    const user = customerId ? await findUserByStripeCustomerId(customerId) : null;
    if (user) {
      const subscriptionId = stringValue((invoice as unknown as { subscription?: unknown }).subscription) || stringValue(user.privateMetadata?.stripeSubscriptionId) || "";
      if (customerId && subscriptionId) await suspendMembershipForSubscription(customerId, subscriptionId, "past_due");
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = stringValue(invoice.customer);
    const user = customerId ? await findUserByStripeCustomerId(customerId) : null;
    if (user && normalizeMembershipTier(user.publicMetadata?.tier) !== "free") {
      const client = await clerkClient();
      const currentPlan = stringValue(user.publicMetadata?.plan) || stringValue(user.publicMetadata?.billingPlan);
      const previous = user.publicMetadata?.giftPreviousMembership && typeof user.publicMetadata.giftPreviousMembership === "object"
        ? user.publicMetadata.giftPreviousMembership as Record<string, unknown> : null;
      await client.users.updateUserMetadata(user.id, {
        publicMetadata: {
          ...user.publicMetadata,
          membershipStatus: "active",
          ...(currentPlan?.startsWith("gift_") && previous ? { giftPreviousMembership: { ...previous, status: "active" } } : {}),
          membershipUpdatedAt: new Date().toISOString(),
        },
        privateMetadata: {
          ...user.privateMetadata,
          stripeMembershipStatus: "active",
        },
      });
    }
  }

  return NextResponse.json({ received: true });
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey);
}
