import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !sig) {
    console.log("[Stripe Webhook] No secret/signature configured — skipping verification");
    return NextResponse.json({ received: true });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    console.error("[Stripe Webhook] STRIPE_SECRET_KEY is not configured");
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`[Stripe Webhook] Event: ${event.type}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan;

    console.log(`[Stripe Webhook] Payment completed: userId=${userId}, plan=${plan}`);

    // Write tier to Clerk user metadata so the frontend can read it
    if (userId && userId !== "anonymous") {
      try {
        const tier = plan === "founder" ? "bottled-in-bond" : "standard";
        const client = await clerkClient();
        await client.users.updateUserMetadata(userId, {
          publicMetadata: {
            tier,
            plan,
            stripeCustomerId: session.customer as string,
            subscribedAt: new Date().toISOString(),
          },
        });
        console.log(`[Stripe Webhook] Updated Clerk user ${userId} → tier: ${tier}`);
      } catch (err) {
        console.error("[Stripe Webhook] Failed to update Clerk metadata:", err);
      }
    }
  }

  // Handle subscription cancellations — downgrade to free
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    // Find user by Stripe customer ID — requires iterating users (simple for now)
    console.log(`[Stripe Webhook] Subscription cancelled for customer: ${sub.customer}`);
    // TODO: look up userId by stripeCustomerId and clear their tier
  }

  return NextResponse.json({ received: true });
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}
