import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  return secretKey ? new Stripe(secretKey) : null;
}

function appUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin || "https://www.bourbonsignal.com";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function recoverStripeCustomerId(stripe: Stripe, user: { id: string; publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown>; emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const sessionId = stringValue(user.privateMetadata?.stripePaymentSessionId) || stringValue(user.publicMetadata?.stripePaymentSessionId);
  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
    const customerId = stringValue(session?.customer);
    if (customerId && (session?.metadata?.userId || session?.client_reference_id) === user.id) return { customerId, subscriptionId: stringValue(session?.subscription) };
  }

  // Recover only from a checkout explicitly bound to this authenticated member.
  // Email alone is not a reliable billing-account association.
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const session = sessions.data.find((item) => {
    const checkoutUserId = stringValue(item.metadata?.userId) || stringValue(item.client_reference_id);
    return item.status === "complete"
      && (item.payment_status === "paid" || item.payment_status === "no_payment_required")
      && checkoutUserId === user.id;
  });
  return { customerId: stringValue(session?.customer), subscriptionId: stringValue(session?.subscription) };
}

function providerFor(user: { publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown> }) {
  const pub = user.publicMetadata || {}, priv = user.privateMetadata || {};
  const stripeStatus = stringValue(priv.stripeMembershipStatus) || stringValue(pub.membershipStatus);
  const subscription = stringValue(priv.stripeSubscriptionId);
  // Existing Stripe subscribers always manage with Stripe, including payment recovery.
  if (subscription && !["canceled", "incomplete_expired"].includes(stripeStatus || "")) return "stripe";
  if (priv.appleMembershipProductId || pub.appleMembershipStatus) return "apple";
  if (priv.stripeCustomerId || pub.stripeCustomerId || priv.stripePaymentSessionId || pub.stripePaymentSessionId) return "stripe";
  return "none";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required." }, { status: 401 });
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return NextResponse.json({ provider: providerFor(user) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Membership management is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required." }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (providerFor(user) === "apple") return NextResponse.json({ provider: "apple", url: "https://apps.apple.com/account/subscriptions" }, { headers: { "Cache-Control": "private, no-store" } });
  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Membership management is temporarily unavailable. Please contact support." }, { status: 503 });
  let customerId = stringValue(user.privateMetadata?.stripeCustomerId) || stringValue(user.publicMetadata?.stripeCustomerId);
  let subscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);

  if (!customerId) {
    const recovered = await recoverStripeCustomerId(stripe, user);
    customerId = recovered.customerId;
    subscriptionId = subscriptionId || recovered.subscriptionId;
    if (customerId) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { stripeCustomerId: customerId },
        privateMetadata: { stripeCustomerId: customerId, ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}) },
      });
    }
  }

  if (!customerId) {
    return NextResponse.json({ error: "No billing account found for this membership yet." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl(req)}/settings`,
  });

  return NextResponse.json({ provider: "stripe", url: session.url }, { headers: { "Cache-Control": "private, no-store" } });
}
