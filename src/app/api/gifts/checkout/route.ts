import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { GIFT_PLANS, validateGiftStripePrice } from "@/lib/gifts";
import { createGiftRepository } from "@/lib/gift-repository";
import { clerkClient } from "@clerk/nextjs/server";
import { reconcileAllFounderReservationAuthority } from "@/lib/founder-reservations";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function appUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const candidate = configured || request.nextUrl.origin || "https://www.bourbonsignal.com";
  if (process.env.NODE_ENV === "production" && !["https://bourbonsignal.com", "https://www.bourbonsignal.com"].includes(candidate)) return "https://www.bourbonsignal.com";
  return candidate.replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to purchase a gift." }, { status: 401, headers: PRIVATE_HEADERS });
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ error: "Gift checkout is not configured." }, { status: 503, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => ({})) as { orderId?: unknown };
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (!/^gift_[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "Invalid gift order." }, { status: 400, headers: PRIVATE_HEADERS });
  const repository = createGiftRepository();
  let order = await repository.readForPurchaser(orderId, userId);
  if (!order) return NextResponse.json({ error: "Gift order not found." }, { status: 404, headers: PRIVATE_HEADERS });
  if (order.paymentStatus === "funded") return NextResponse.json({ url: `${appUrl(request)}/gift/status?order=${encodeURIComponent(order.id)}`, recovered: true }, { headers: PRIVATE_HEADERS });
  if ((order.paymentStatus === "expired" || order.paymentStatus === "failed") && !order.stripeCheckoutSessionId) {
    order = await repository.restartTerminatedCheckout(order.id, userId) || order;
  }
  const stripe = new Stripe(secret);
  if (order.stripeCheckoutSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(order.stripeCheckoutSessionId);
    if (existing.status === "open" && existing.url) return NextResponse.json({ url: existing.url, reused: true }, { headers: PRIVATE_HEADERS });
    if (existing.status === "complete") return NextResponse.json({ url: `${appUrl(request)}/gift/status?order=${encodeURIComponent(order.id)}`, waiting: true }, { headers: PRIVATE_HEADERS });
    order = await repository.restartExpiredCheckout(order.id, userId, existing.id) || await repository.readForPurchaser(order.id, userId);
    if (!order) return NextResponse.json({ error: "Gift order not found." }, { status: 404, headers: PRIVATE_HEADERS });
  }
  if (order.giftPlan === "founder_lifetime_gift") {
    try {
      await reconcileAllFounderReservationAuthority(await clerkClient());
    } catch {
      return NextResponse.json({ error: "Founder checkout is temporarily unavailable while membership authority is reconciled. You have not been charged." }, { status: 503, headers: PRIVATE_HEADERS });
    }
  }
  let claimed;
  try {
    claimed = order.giftPlan === "founder_lifetime_gift"
      ? await repository.claimFounderCheckout(order.id, userId)
      : await repository.claimCheckout(order.id, userId);
  } catch {
    return NextResponse.json({ error: order.giftPlan === "founder_lifetime_gift" ? "Founder gifts are currently unavailable." : "Gift checkout is temporarily unavailable." }, { status: 409, headers: PRIVATE_HEADERS });
  }
  if (!claimed) return NextResponse.json({ error: "Gift checkout is already being prepared. Try again shortly." }, { status: 409, headers: PRIVATE_HEADERS });
  const plan = GIFT_PLANS[order.giftPlan];
  let createdSession: Stripe.Checkout.Session | null = null;
  try {
    const price = await stripe.prices.retrieve(plan.priceId, { expand: ["product"] });
    const priceError = validateGiftStripePrice(price, plan, true);
    if (priceError) {
      await repository.releaseCheckoutClaim(order.id, userId, claimed.claimToken).catch(() => undefined);
      return NextResponse.json({ error: "Gift checkout is temporarily unavailable. You have not been charged." }, { status: 503, headers: PRIVATE_HEADERS });
    }
    const metadata = {
      purchase_type: "gift",
      referral_eligible: "false",
      gift_order_id: order.id,
      gift_plan: order.giftPlan,
      purchaser_user_id: userId,
      gift_checkout_attempt: String(claimed.order.checkoutAttempt),
    };
    const origin = appUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: order.purchaserEmail,
      client_reference_id: userId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${origin}/gift/status?order=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gift/status?order=${encodeURIComponent(order.id)}&canceled=1`,
      metadata,
      payment_intent_data: { metadata },
    }, { idempotencyKey: `gift-checkout-${order.id}-${claimed.order.checkoutAttempt}` });
    createdSession = session;
    const attached = await repository.attachCheckout(order.id, userId, claimed.claimToken, session.id);
    if (!attached) {
      await stripe.checkout.sessions.expire(session.id);
      createdSession = null;
      await repository.releaseCheckoutClaim(order.id, userId, claimed.claimToken);
      return NextResponse.json({ error: "Gift checkout is temporarily unavailable. You have not been charged." }, { status: 503, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ url: session.url }, { headers: PRIVATE_HEADERS });
  } catch {
    let safeToRelease = createdSession === null;
    if (createdSession) {
      try {
        await stripe.checkout.sessions.expire(createdSession.id);
        safeToRelease = true;
      } catch {
        // Keep the Founder reservation when Stripe may still have a chargeable session.
      }
    }
    if (safeToRelease) await repository.releaseCheckoutClaim(order.id, userId, claimed.claimToken).catch(() => undefined);
    return NextResponse.json({ error: "Gift checkout is temporarily unavailable. You have not been charged." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
