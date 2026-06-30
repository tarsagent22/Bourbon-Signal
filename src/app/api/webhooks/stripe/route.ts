import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { normalizeMembershipTier, type BillingPlanId } from "@/lib/entitlements";
import { getPlanByPriceId, LAUNCH_BILLING_PLANS, type LaunchBillingPlan } from "@/lib/stripe-plans";
import { activateMembership, downgradeMembershipForSubscription, findUserByStripeCustomerId } from "@/lib/membership-server";

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

function planFromMetadata(planId: string | null): LaunchBillingPlan | null {
  return planId && planId in LAUNCH_BILLING_PLANS ? LAUNCH_BILLING_PLANS[planId as BillingPlanId] : null;
}

async function planFromCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  const metadataPlan = planFromMetadata(stringValue(session.metadata?.plan));
  if (metadataPlan) return metadataPlan;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
  const priceId = lineItems.data[0]?.price?.id;
  return getPlanByPriceId(priceId);
}

async function planFromSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const matched = getPlanByPriceId(priceId);
  if (matched) return matched;
  return planFromMetadata(stringValue(subscription.metadata?.plan));
}

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = getWebhookSecret();
  const signature = req.headers.get("stripe-signature");
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  }
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    const plan = await planFromCheckoutSession(stripe, session);
    if (userId && plan) {
      await activateMembership(userId, {
        tier: plan.tier,
        plan: plan.id,
        stripeCustomerId: stringValue(session.customer),
        stripeSubscriptionId: stringValue(session.subscription),
        status: "active",
      });
    }
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = stringValue(subscription.metadata?.userId);
    const plan = await planFromSubscription(subscription);
    if (userId && plan) {
      await activateMembership(userId, {
        tier: plan.tier,
        plan: plan.id,
        stripeCustomerId: stringValue(subscription.customer),
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
      });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = stringValue(subscription.customer);
    if (customerId) await downgradeMembershipForSubscription(customerId, subscription.id);
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = stringValue(invoice.customer);
    const user = customerId ? await findUserByStripeCustomerId(customerId) : null;
    if (user) {
      const client = await clerkClient();
      await client.users.updateUserMetadata(user.id, {
        publicMetadata: {
          ...user.publicMetadata,
          membershipStatus: "past_due",
          membershipUpdatedAt: new Date().toISOString(),
        },
        privateMetadata: {
          ...user.privateMetadata,
          stripeMembershipStatus: "past_due",
        },
      });
    }
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = stringValue(invoice.customer);
    const user = customerId ? await findUserByStripeCustomerId(customerId) : null;
    if (user && normalizeMembershipTier(user.publicMetadata?.tier) !== "free") {
      const client = await clerkClient();
      await client.users.updateUserMetadata(user.id, {
        publicMetadata: {
          ...user.publicMetadata,
          membershipStatus: "active",
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
