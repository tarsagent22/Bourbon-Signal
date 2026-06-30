import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { type BillingPlanId } from "@/lib/entitlements";
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

function checkoutEmail(session: Stripe.Checkout.Session) {
  return (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required" }, { status: 401 });

  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = (user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses[0]?.emailAddress || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: true, activated: false, reason: "missing_email" });

  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  for (const session of sessions.data) {
    if (session.status !== "complete" || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")) continue;
    const checkoutUserId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    const emailMatches = checkoutEmail(session) === email;
    if (checkoutUserId && checkoutUserId !== userId) continue;
    if (!checkoutUserId && !emailMatches) continue;

    const plan = await planFromCheckoutSession(stripe, session);
    if (!plan) continue;

    await activateMembership(userId, {
      tier: plan.tier,
      plan: plan.id,
      stripeCustomerId: stringValue(session.customer),
      stripeSubscriptionId: stringValue(session.subscription),
      status: "active",
    });

    return NextResponse.json({ ok: true, activated: true, tier: plan.tier, plan: plan.id, sessionId: session.id });
  }

  return NextResponse.json({ ok: true, activated: false, reason: "no_completed_membership_checkout_found" });
}
