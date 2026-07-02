import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { FOUNDER_SPOT_LIMIT, normalizeBillingPlan, resolveEffectiveMembershipTier, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";
import { getStripePriceId, LAUNCH_BILLING_PLANS } from "@/lib/stripe-plans";
import { CHECKOUT_ENABLED } from "@/lib/site-mode";
import { countFounderMemberships, type FounderAllocationUser } from "@/lib/founder-allocation";
import { activateMembership } from "@/lib/membership-server";

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
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = configured || req.nextUrl.origin || "https://bourbonsignal.com";
  const allowed = new Set(["https://bourbonsignal.com", "https://www.bourbonsignal.com"]);
  if (process.env.NODE_ENV === "production" && !allowed.has(origin)) return "https://www.bourbonsignal.com";
  return origin;
}

async function founderSpotsSold() {
  const client = await clerkClient();
  const result = await client.users.getUserList({ limit: 500 });
  const users = (Array.isArray(result) ? result : result.data) as FounderAllocationUser[];
  return countFounderMemberships(users);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function checkoutSessionMatchesPlan(stripe: Stripe, session: Stripe.Checkout.Session, planId: BillingPlanId, priceId: string) {
  if (session.metadata?.plan === planId) return true;
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
  return lineItems.data.some((item) => item.price?.id === priceId);
}

async function findReusableCheckoutSession(stripe: Stripe, userId: string, planId: BillingPlanId, priceId: string) {
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  for (const session of sessions.data) {
    const sessionUserId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    if (sessionUserId !== userId) continue;
    if (!(await checkoutSessionMatchesPlan(stripe, session, planId, priceId))) continue;

    if (session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required")) {
      return session;
    }

    if (session.status === "open" && session.url && (!session.expires_at || session.expires_at > Math.floor(Date.now() / 1000))) {
      return session;
    }
  }
  return null;
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
  const currentTier = resolveEffectiveMembershipTier(user.publicMetadata);
  if (TIER_RANK[currentTier] >= TIER_RANK[plan.tier]) {
    return NextResponse.json({ error: "Your current Bourbon Signal membership already includes this level." }, { status: 409 });
  }

  const reusableSession = await findReusableCheckoutSession(stripe, userId, planId, priceId);
  if (reusableSession) {
    if (reusableSession.status === "complete" && (reusableSession.payment_status === "paid" || reusableSession.payment_status === "no_payment_required")) {
      let membershipStatus = "active";
      const subscriptionId = stringValue(reusableSession.subscription);
      if (planId !== "bib_lifetime" && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        membershipStatus = subscription.status;
      }
      await activateMembership(userId, {
        tier: plan.tier,
        plan: plan.id,
        stripeCustomerId: stringValue(reusableSession.customer),
        stripeSubscriptionId: subscriptionId,
        status: membershipStatus,
      });
      return NextResponse.json({ url: `${appUrl(req)}/success?session_id=${reusableSession.id}`, recovered: true });
    }

    if (reusableSession.url) {
      return NextResponse.json({ url: reusableSession.url, reused: true });
    }
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
