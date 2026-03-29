import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // If no webhook secret configured yet, just log and return 200
  if (!webhookSecret || !sig) {
    console.log("[Stripe Webhook] No secret configured — skipping verification");
    return NextResponse.json({ received: true });
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
    console.log(
      `[Stripe Webhook] Payment completed: userId=${session.metadata?.userId}, plan=${session.metadata?.plan}`
    );
    // TODO: Update user tier in database when we add Postgres/Supabase
  }

  return NextResponse.json({ received: true });
}
