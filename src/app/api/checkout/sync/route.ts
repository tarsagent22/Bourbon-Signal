import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { isMembershipAccessActive, type BillingPlanId } from "@/lib/entitlements";
import { getPlanByPriceId, LAUNCH_BILLING_PLANS, type LaunchBillingPlan } from "@/lib/stripe-plans";
import { activateMembership } from "@/lib/membership-server";

export const dynamic = "force-dynamic";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
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

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401 });

  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "Missing checkout session" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const checkoutUserId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
  if (!checkoutUserId || session.metadata?.source !== "bourbon_signal_launch") {
    return NextResponse.json({ error: "Checkout session is not a Bourbon Signal membership checkout" }, { status: 403 });
  }
  if (checkoutUserId !== userId) {
    return NextResponse.json({ error: "Checkout session belongs to a different account" }, { status: 403 });
  }
  if (session.status !== "complete" || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")) {
    return NextResponse.json({ error: "Checkout is not complete yet" }, { status: 409 });
  }

  const plan = await planFromCheckoutSession(stripe, session);
  if (!plan) return NextResponse.json({ error: "Could not match checkout to a membership plan" }, { status: 422 });

  let membershipStatus = "active";
  if (plan.id !== "bib_lifetime" && session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
    membershipStatus = subscription.status;
    if (!isMembershipAccessActive(plan.tier, membershipStatus, plan.id)) {
      return NextResponse.json({ error: "Subscription is not active", status: membershipStatus }, { status: 409 });
    }
  }

  await activateMembership(checkoutUserId, {
    tier: plan.tier,
    plan: plan.id,
    stripeCustomerId: stringValue(session.customer),
    stripeSubscriptionId: stringValue(session.subscription),
    status: membershipStatus,
  });

  return NextResponse.json({ ok: true, tier: plan.tier, plan: plan.id });
}
