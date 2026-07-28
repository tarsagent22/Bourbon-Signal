import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { FOUNDER_SPOT_LIMIT, normalizeBillingPlan, resolveEffectiveMembershipTier, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";
import { getStripePriceId, LAUNCH_BILLING_PLANS } from "@/lib/stripe-plans";
import { CHECKOUT_ENABLED } from "@/lib/site-mode";
import { countFounderMemberships, type FounderAllocationUser } from "@/lib/founder-allocation";
import { activateMembership } from "@/lib/membership-server";
import { mergeGrowthMilestoneMetadata, normalizeCheckoutSource } from "@/lib/growth-events";
import {
  buildJulySaleSessionFields,
  julySaleCheckoutConfig,
  sessionHasCouponId,
  validateJulySaleCoupon,
} from "@/lib/july-sale";

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

function hasCanceledFreeMembershipHold(publicMetadata: Record<string, unknown> | null | undefined) {
  const tier = stringValue(publicMetadata?.tier) || stringValue(publicMetadata?.membershipTier);
  const plan = stringValue(publicMetadata?.plan) || stringValue(publicMetadata?.billingPlan);
  const status = stringValue(publicMetadata?.membershipStatus);
  return status === "canceled" && (tier === "free" || plan === "free");
}

async function recordCheckoutStarted(
  client: Awaited<ReturnType<typeof clerkClient>>,
  userId: string,
  privateMetadata: Record<string, unknown>,
) {
  try {
    const next = mergeGrowthMilestoneMetadata(privateMetadata, "checkout_started", new Date().toISOString());
    await client.users.updateUserMetadata(userId, { privateMetadata: { activation: next.activation } });
  } catch (error) {
    console.warn("checkout milestone update failed", error instanceof Error ? error.message : "unknown error");
  }
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

async function validateConfiguredJulySale(stripe: Stripe, couponId: string, priceId: string) {
  const [coupon, price] = await Promise.all([
    stripe.coupons.retrieve(couponId),
    stripe.prices.retrieve(priceId),
  ]);
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  return validateJulySaleCoupon(coupon, productId);
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

  const body = (await req.json().catch(() => ({}))) as {
    plan?: string;
    source?: string;
    expectedPromotion?: string;
  };
  const source = normalizeCheckoutSource(body.source);
  const planId = normalizeBillingPlan(body.plan);
  if (!planId) {
    return NextResponse.json({ error: "Choose a valid Bourbon Signal membership plan." }, { status: 400 });
  }

  const plan = LAUNCH_BILLING_PLANS[planId];
  const priceId = getStripePriceId(planId);
  if (!priceId) {
    return NextResponse.json({ error: `${plan.label} is not configured yet.` }, { status: 503 });
  }

  const julySaleConfig = julySaleCheckoutConfig(
    planId,
    process.env.STRIPE_JULY_SALE_COUPON_ID,
  );
  const { couponId: julySaleCouponId } = julySaleConfig;

  if (body.expectedPromotion === "july_sale_2026" && julySaleConfig.state !== "active") {
    return NextResponse.json(
      { error: "The July sale is no longer available. Refresh pricing before continuing." },
      { status: 409 },
    );
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

  if (julySaleConfig.state === "misconfigured") {
    console.error("July sale checkout is missing its coupon configuration.");
    return NextResponse.json({ error: "The July sale is temporarily unavailable. You have not been charged." }, { status: 503 });
  }
  if (julySaleConfig.state === "active" && julySaleCouponId) {
    try {
      const couponError = await validateConfiguredJulySale(stripe, julySaleCouponId, priceId);
      if (couponError) {
        console.error("July sale coupon validation failed:", couponError);
        return NextResponse.json({ error: "The July sale is temporarily unavailable. You have not been charged." }, { status: 503 });
      }
    } catch (error) {
      console.error("Unable to validate the July sale coupon:", error);
      return NextResponse.json({ error: "The July sale is temporarily unavailable. You have not been charged." }, { status: 503 });
    }
  }

  const reusableSession = await findReusableCheckoutSession(stripe, userId, planId, priceId);
  const skipCompletedRecovery = hasCanceledFreeMembershipHold(user.publicMetadata);
  if (reusableSession) {
    await recordCheckoutStarted(client, userId, user.privateMetadata as Record<string, unknown>);
    const completedPaidSession = reusableSession.status === "complete" && (reusableSession.payment_status === "paid" || reusableSession.payment_status === "no_payment_required");
    if (completedPaidSession && !skipCompletedRecovery) {
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

    // A canceled/free hold means access was intentionally revoked (for example, during a
    // refund-and-repay card switch). Do not resurrect access from an old paid Checkout Session;
    // let the user create a fresh Checkout Session below.
    if (!completedPaidSession && reusableSession.url) {
      const hasConfiguredSaleCoupon = sessionHasCouponId(
        reusableSession.discounts,
        julySaleConfig.configuredCouponId,
      );
      const reusableDiscountedSession = julySaleConfig.state === "active"
        && hasConfiguredSaleCoupon
        && (!julySaleConfig.expiresAt || (
          Boolean(reusableSession.expires_at)
          && reusableSession.expires_at <= julySaleConfig.expiresAt
        ));

      if (reusableDiscountedSession || (julySaleConfig.state === "inactive" && !hasConfiguredSaleCoupon)) {
        return NextResponse.json({ url: reusableSession.url, reused: true });
      }

      // Replace full-price sessions during the sale and retire sale sessions once
      // the server-authoritative campaign window closes.
      await stripe.checkout.sessions.expire(reusableSession.id);
    }
  }

  const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses[0]?.emailAddress;
  const origin = appUrl(req);

  const metadata = {
    userId,
    tier: plan.tier,
    plan: plan.id,
    source: "bourbon_signal_launch",
    attributionSurface: source,
  };

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode: plan.stripeMode,
    customer_email: email,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?canceled=${plan.id}&source=${source}`,
    metadata,
    ...buildJulySaleSessionFields(julySaleConfig),
  };

  if (plan.stripeMode === "subscription") {
    sessionConfig.subscription_data = { metadata };
  } else {
    sessionConfig.payment_intent_data = { metadata };
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  await recordCheckoutStarted(client, userId, user.privateMetadata as Record<string, unknown>);
  return NextResponse.json({ url: session.url });
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey);
}
