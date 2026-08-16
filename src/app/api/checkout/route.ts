import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { FOUNDER_SPOT_LIMIT, normalizeBillingPlan, type BillingPlanId, type MembershipTier } from "@/lib/entitlements";
import { getStripePriceId, LAUNCH_BILLING_PLANS, validateDirectStripePrice } from "@/lib/stripe-plans";
import { CHECKOUT_ENABLED } from "@/lib/site-mode";
import { countFounderMemberships } from "@/lib/founder-allocation";
import { reconcileAllFounderReservationAuthority } from "@/lib/founder-reservations";
import { createGiftRepository, type GiftRepository } from "@/lib/gift-repository";
import { activateMembership } from "@/lib/membership-server";
import { reconcileReferredMembership } from "@/lib/referral-service";
import { mergeGrowthMilestoneMetadata, normalizeCheckoutSource } from "@/lib/growth-events";
import { resolveServerEffectiveMembershipTier } from "@/lib/server-entitlements";
import { hasActiveGiftMembership, membershipTrialEligibility, MONTHLY_MEMBERSHIP_TRIAL_DAYS } from "@/lib/membership-trial";
import { getMembershipTrialRepository } from "@/lib/membership-trial-repository";
import { enforceMembershipSubscriptionActivation } from "@/lib/membership-trial-stripe";
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
  const { users, availability } = await reconcileAllFounderReservationAuthority(client);
  return Math.max(countFounderMemberships(users), availability.claimed);
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

async function checkoutSessionMatchesPlan(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  planId: BillingPlanId,
  priceId: string,
  trialExpected = false,
) {
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
  const sessionHasTrial = session.metadata?.trial_offer === "monthly_7_day_v1";
  return session.metadata?.plan === planId && sessionHasTrial === trialExpected && !lineItems.has_more && lineItems.data.length === 1
    && lineItems.data[0]?.price?.id === priceId && lineItems.data[0]?.quantity === 1;
}

async function findReusableCheckoutSession(stripe: Stripe, userId: string, planId: BillingPlanId, priceId: string, trialExpected: boolean) {
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  for (const session of sessions.data) {
    const sessionUserId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    if (sessionUserId !== userId) continue;
    if (!(await checkoutSessionMatchesPlan(stripe, session, planId, priceId, trialExpected))) continue;

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
    trialOfferExpected?: boolean;
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

  const giftRepository = createGiftRepository();
  let existingFounderCheckout = planId === "bib_lifetime"
    ? await giftRepository.findLiveDirectFounderCheckout(userId)
    : null;
  if (planId === "bib_lifetime") {
    const sold = await founderSpotsSold();
    existingFounderCheckout ||= await giftRepository.findLiveDirectFounderCheckout(userId);
    if (sold >= FOUNDER_SPOT_LIMIT && !existingFounderCheckout) {
      return NextResponse.json({ error: "Bottled-in-Bond Founder memberships are sold out." }, { status: 409 });
    }
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const currentTier = await resolveServerEffectiveMembershipTier(user.publicMetadata);
  if (hasActiveGiftMembership(user.publicMetadata as Record<string, unknown>)) {
    return NextResponse.json({ error: "Your active gift membership already includes paid access. Choose a plan after the gift period ends." }, { status: 409 });
  }
  let trialEligibility = membershipTrialEligibility(
    planId,
    user.publicMetadata as Record<string, unknown>,
    user.privateMetadata as Record<string, unknown>,
  );
  if (trialEligibility.eligible) {
    try {
      const durableClaim = await getMembershipTrialRepository().findByUserId(userId);
      if (durableClaim) trialEligibility = { eligible: false, reason: "trial_used" };
    } catch (error) {
      console.error("membership trial eligibility storage failed", { userId, error });
      return NextResponse.json({ error: "Checkout is temporarily unavailable. You have not been charged." }, { status: 503 });
    }
  }
  if (body.trialOfferExpected && !trialEligibility.eligible) {
    return NextResponse.json(
      { error: "The trial is not available for this account. Return to pricing to choose a paid plan." },
      { status: 409 },
    );
  }
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

  try {
    const configuredPrice = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const priceError = validateDirectStripePrice(configuredPrice, plan, process.env.NODE_ENV === "production");
    if (priceError) {
      console.error("Direct membership price validation failed:", priceError);
      return NextResponse.json({ error: "Checkout is temporarily unavailable. You have not been charged." }, { status: 503 });
    }
  } catch (error) {
    console.error("Unable to validate direct membership price:", error);
    return NextResponse.json({ error: "Checkout is temporarily unavailable. You have not been charged." }, { status: 503 });
  }

  const reusableSession = planId === "bib_lifetime"
    ? null
    : await findReusableCheckoutSession(stripe, userId, planId, priceId, trialEligibility.eligible);
  const skipCompletedRecovery = hasCanceledFreeMembershipHold(user.publicMetadata);
  if (reusableSession) {
    await recordCheckoutStarted(client, userId, user.privateMetadata as Record<string, unknown>);
    const completedPaidSession = reusableSession.status === "complete" && (reusableSession.payment_status === "paid" || reusableSession.payment_status === "no_payment_required");
    if (completedPaidSession && !skipCompletedRecovery) {
      let membershipStatus = "active";
      const subscriptionId = stringValue(reusableSession.subscription);
      let subscription: Stripe.Subscription | null = null;
      if (planId !== "bib_lifetime" && subscriptionId) {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
        membershipStatus = subscription.status;
      }
      if (subscription) {
        const enforcement = await enforceMembershipSubscriptionActivation({ stripe, userId, subscription, plan });
        if (!enforcement.accepted) {
          return NextResponse.json({ error: "This checkout can no longer activate membership." }, { status: 409 });
        }
      }
      await activateMembership(userId, {
        tier: plan.tier,
        plan: plan.id,
        stripeCustomerId: stringValue(reusableSession.customer),
        stripeSubscriptionId: subscriptionId,
        status: membershipStatus,
        founderCheckoutAttemptId: stringValue(reusableSession.metadata?.founder_checkout_attempt_id),
        checkoutSessionId: reusableSession.id,
        stripePaymentIntentId: stringValue(reusableSession.payment_intent),
      });
      if (stringValue(reusableSession.metadata?.purchase_type) !== "gift") {
        await reconcileReferredMembership({ userId, tier: plan.tier, sourceEventId: `checkout-recovery:${reusableSession.id}` });
      }
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

  let founderAttemptId = planId === "bib_lifetime" ? `founder_${randomUUID()}` : null;
  let founderReservation: Awaited<ReturnType<GiftRepository["reserveDirectFounder"]>> = null;
  if (founderAttemptId) {
    try {
      founderReservation = await giftRepository.reserveDirectFounder(userId, founderAttemptId);
      if (!founderReservation) throw new Error("Founder reservation unavailable");
      founderAttemptId = founderReservation.attemptId;
      if (founderReservation.checkoutSessionId) {
        const existingSession = await stripe.checkout.sessions.retrieve(founderReservation.checkoutSessionId);
        if (!await checkoutSessionMatchesPlan(stripe, existingSession, planId, priceId)
          || stringValue(existingSession.metadata?.founder_checkout_attempt_id) !== founderAttemptId
          || stringValue(existingSession.metadata?.founder_entitlement_version) !== founderReservation.entitlementVersion) {
          throw new Error("Existing Founder checkout authority mismatch");
        }
        if (existingSession.status === "open" && existingSession.url
          && (!existingSession.expires_at || existingSession.expires_at > Math.floor(Date.now() / 1000))) {
          await recordCheckoutStarted(client, userId, user.privateMetadata as Record<string, unknown>);
          return NextResponse.json({ url: existingSession.url, reused: true });
        }
        if (existingSession.status === "complete"
          && (existingSession.payment_status === "paid" || existingSession.payment_status === "no_payment_required")) {
          await activateMembership(userId, {
            tier: plan.tier, plan: plan.id, status: "lifetime",
            stripeCustomerId: stringValue(existingSession.customer),
            founderCheckoutAttemptId: founderAttemptId,
            checkoutSessionId: existingSession.id,
            stripePaymentIntentId: stringValue(existingSession.payment_intent),
          });
          await giftRepository.markDirectFounderActivationReconciled(founderAttemptId);
          return NextResponse.json({ url: `${appUrl(req)}/success?session_id=${existingSession.id}`, recovered: true });
        }
        await giftRepository.releaseDirectFounderReservation(userId, founderAttemptId, existingSession.id);
        founderAttemptId = `founder_${randomUUID()}`;
        founderReservation = await giftRepository.reserveDirectFounder(userId, founderAttemptId);
        if (!founderReservation) throw new Error("Founder reservation unavailable");
        founderAttemptId = founderReservation.attemptId;
      }
    } catch {
      return NextResponse.json({ error: "Bottled-in-Bond Founder memberships are sold out." }, { status: 409 });
    }
  }

  const metadata = {
    userId,
    tier: plan.tier,
    plan: plan.id,
    source: "bourbon_signal_launch",
    attributionSurface: source,
    trial_offer: trialEligibility.eligible ? "monthly_7_day_v1" : "none",
    ...(founderReservation ? {
      founder_checkout_attempt_id: founderReservation.attemptId,
      founder_entitlement_version: founderReservation.entitlementVersion,
    } : {}),
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
    sessionConfig.subscription_data = {
      metadata,
      ...(trialEligibility.eligible ? {
        trial_period_days: MONTHLY_MEMBERSHIP_TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      } : {}),
    };
  } else {
    sessionConfig.payment_intent_data = { metadata };
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(sessionConfig, founderAttemptId
      ? { idempotencyKey: `direct-founder-checkout-${founderAttemptId}` }
      : undefined);
    if (founderAttemptId) {
      const attached = await giftRepository.attachDirectFounderCheckout(userId, founderAttemptId, session.id);
      if (!attached) {
        await stripe.checkout.sessions.expire(session.id);
        await giftRepository.releaseDirectFounderReservation(userId, founderAttemptId, session.id);
        return NextResponse.json({ error: "Founder checkout is temporarily unavailable. You have not been charged." }, { status: 503 });
      }
    }
  } catch (error) {
    if (founderAttemptId) await giftRepository.releaseDirectFounderReservation(userId, founderAttemptId).catch(() => undefined);
    throw error;
  }
  await recordCheckoutStarted(client, userId, user.privateMetadata as Record<string, unknown>);
  return NextResponse.json({ url: session.url });
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey);
}
