import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { normalizeMembershipTier, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";
import { getPlanByPriceId, getStripePriceId, LAUNCH_BILLING_PLANS } from "@/lib/stripe-plans";

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

async function findUserByStripeCustomerId(customerId: string) {
  const client = await clerkClient();
  const result = await client.users.getUserList({ limit: 500 });
  const users = Array.isArray(result) ? result : result.data;
  return users.find((user) => user.publicMetadata?.stripeCustomerId === customerId || user.privateMetadata?.stripeCustomerId === customerId) || null;
}

async function updateMembership(userId: string, input: {
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
      stripeCustomerId: input.stripeCustomerId || user.privateMetadata?.stripeCustomerId || null,
      stripeSubscriptionId: input.stripeSubscriptionId || user.privateMetadata?.stripeSubscriptionId || null,
      stripePlan: input.plan,
      stripeMembershipStatus: input.status || "active",
    },
  });
}

async function downgradeSubscription(customerId: string, subscriptionId: string) {
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

async function planFromSubscription(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const matched = getPlanByPriceId(priceId);
  if (matched) return matched;
  const metadataPlan = subscription.metadata?.plan;
  return metadataPlan && metadataPlan in LAUNCH_BILLING_PLANS ? LAUNCH_BILLING_PLANS[metadataPlan as BillingPlanId] : null;
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
    const planId = stringValue(session.metadata?.plan) as BillingPlanId | null;
    const plan = planId && planId in LAUNCH_BILLING_PLANS ? LAUNCH_BILLING_PLANS[planId] : null;
    if (userId && plan) {
      await updateMembership(userId, {
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
      await updateMembership(userId, {
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
    if (customerId) await downgradeSubscription(customerId, subscription.id);
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
