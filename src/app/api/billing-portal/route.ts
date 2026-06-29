import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
}

function appUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin || "https://bourbonsignal.com";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required." }, { status: 401 });

  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Billing portal is not configured." }, { status: 503 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const customerId = stringValue(user.privateMetadata?.stripeCustomerId) || stringValue(user.publicMetadata?.stripeCustomerId);
  if (!customerId) {
    return NextResponse.json({ error: "No billing account found for this membership yet." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl(req)}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
