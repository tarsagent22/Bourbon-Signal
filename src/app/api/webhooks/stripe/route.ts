import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { isMembershipAccessActive, normalizeMembershipTier, type BillingPlanId } from "@/lib/entitlements";
import { getPlanByPriceId, LAUNCH_BILLING_PLANS, type LaunchBillingPlan } from "@/lib/stripe-plans";
import { activateMembership, downgradeMembershipForSubscription, findUserByEmailAddress, findUserByStripeCustomerId, suspendMembershipForSubscription } from "@/lib/membership-server";

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

function checkoutEmail(session: Stripe.Checkout.Session) {
  return (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
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
    const plan = await planFromCheckoutSession(stripe, session);
    const metadataUserId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    const emailMatchedUser = !metadataUserId ? await findUserByEmailAddress(checkoutEmail(session)) : null;
    const userId = metadataUserId || emailMatchedUser?.id || null;
    if (userId && plan && (plan.id === "bib_lifetime" || !session.subscription)) {
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
    const customerId = stringValue(subscription.customer);
    const metadataUserId = stringValue(subscription.metadata?.userId);
    const existingUser = !metadataUserId && customerId ? await findUserByStripeCustomerId(customerId) : null;
    const userId = metadataUserId || existingUser?.id || null;
    const plan = await planFromSubscription(subscription);
    if (userId && plan && isMembershipAccessActive(plan.tier, subscription.status, plan.id)) {
      await activateMembership(userId, {
        tier: plan.tier,
        plan: plan.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        status: subscription.status,
      });
    } else if (customerId && !isMembershipAccessActive(plan?.tier, subscription.status, plan?.id)) {
      await suspendMembershipForSubscription(customerId, subscription.id, subscription.status);
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
