import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  const { priceId, plan } = await req.json();

  // Map plan to price ID
  const priceMap: Record<string, string> = {
    monthly: process.env.STRIPE_PRICE_MONTHLY!,
    annual: process.env.STRIPE_PRICE_ANNUAL!,
    founder: process.env.STRIPE_PRICE_FOUNDER!,
  };

  const resolvedPriceId = priceId || priceMap[plan];
  if (!resolvedPriceId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const isFounder =
    plan === "founder" ||
    resolvedPriceId === process.env.STRIPE_PRICE_FOUNDER;

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode: isFounder ? "payment" : "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: resolvedPriceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://bourbonsignal.com"}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://bourbonsignal.com"}/pricing`,
    metadata: {
      userId: userId || "anonymous",
      plan: plan || "unknown",
    },
  };

  // Add 7-day trial for monthly plan
  if (plan === "monthly") {
    sessionConfig.subscription_data = { trial_period_days: 7 };
  }

  // Associate with Clerk user if signed in
  if (userId) {
    sessionConfig.client_reference_id = userId;
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return NextResponse.json({ url: session.url });
}
