import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { FOUNDER_SPOT_LIMIT, normalizeBillingPlan, normalizeMembershipTier, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";
import { getStripePriceId, LAUNCH_BILLING_PLANS } from "@/lib/stripe-plans";
import { CHECKOUT_ENABLED } from "@/lib/site-mode";

export const dynamic = "force-dynamic";

const TIER_RANK: Record<MembershipTier, number> = {
  free: 0,
  standard: 1,
  barrel: 2,
  "bottled-in-bond": 3,
};

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? createStripeClient(secretKey) : null;
}

function appUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin || "https://bourbonsignal.com";
}

async function founderSpotsSold() {
  const client = await clerkClient();
  const result = await client.users.getUserList({ limit: 500 });
  const users = Array.isArray(result) ? result : result.data;
  return users.filter((user) => {
    const tier = user.publicMetadata?.tier;
    const plan = user.publicMetadata?.plan;
    return tier === "bottled-in-bond" || plan === "bib_lifetime";
  }).length;
}

export async function POST(req: NextRequest) {
  if (!CHECKOUT_ENABLED && process.env.NEXT_PUBLIC_ENABLE_LAUNCH_CHECKOUT !== "1") {
    return NextResponse.json(
      { error: "Checkout is disabled until Bourbon Signal launch." },
      { status: 403 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Account required before checkout." }, { status: 401 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe checkout is not configured." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  const planId = normalizeBillingPlan(body.plan);
  if (!planId) {
    return NextResponse.json({ error: "Choose a valid Bourbon Signal membership plan." }, { status: 400 });
  }

  const plan = LAUNCH_BILLING_PLANS[planId];
  const priceId = getStripePriceId(planId);
  if (!priceId) {
    return NextResponse.json({ error: `${plan.label} is not configured yet.` }, { status: 503 });
  }

  if (planId === "bib_lifetime") {
    const sold = await founderSpotsSold();
    if (sold >= FOUNDER_SPOT_LIMIT) {
      return NextResponse.json({ error: "Bottled-in-Bond Founder memberships are sold out." }, { status: 409 });
    }
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const currentTier = normalizeMembershipTier(user.publicMetadata?.tier);
  if (TIER_RANK[currentTier] >= TIER_RANK[plan.tier]) {
    return NextResponse.json({ error: "Your current Bourbon Signal membership already includes this level." }, { status: 409 });
  }
  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses[0]?.emailAddress;
  const origin = appUrl(req);
  const metadata = {
    userId,
    tier: plan.tier,
    plan: plan.id,
    source: "bourbon_signal_launch",
  };

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode: plan.stripeMode,
    customer_email: email,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=${plan.id}`,
    metadata,
  };

  if (plan.stripeMode === "subscription") {
    sessionConfig.subscription_data = { metadata };
  } else {
    sessionConfig.payment_intent_data = { metadata };
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return NextResponse.json({ url: session.url });
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey);
}
