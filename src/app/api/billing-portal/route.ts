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

function primaryEmail(user: { emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  return (user.emailAddresses?.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "").trim().toLowerCase();
}

async function recoverStripeCustomerId(stripe: Stripe, user: { id: string; publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown>; emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const sessionId = stringValue(user.privateMetadata?.stripePaymentSessionId) || stringValue(user.publicMetadata?.stripePaymentSessionId);
  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId).catch(() => null);
    const customerId = stringValue(session?.customer);
    if (customerId) return { customerId, subscriptionId: stringValue(session?.subscription) };
  }

  const email = primaryEmail(user);
  if (!email) return { customerId: null, subscriptionId: null };
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  const session = sessions.data.find((item) => {
    const checkoutUserId = stringValue(item.metadata?.userId) || stringValue(item.client_reference_id);
    const checkoutEmail = (item.customer_details?.email || item.customer_email || "").trim().toLowerCase();
    return item.status === "complete"
      && (item.payment_status === "paid" || item.payment_status === "no_payment_required")
      && (checkoutUserId === user.id || (!checkoutUserId && checkoutEmail === email));
  });
  const sessionCustomerId = stringValue(session?.customer);
  if (sessionCustomerId) return { customerId: sessionCustomerId, subscriptionId: stringValue(session?.subscription) };

  const customers = await stripe.customers.search({ query: `email:'${email.replace(/'/g, "\\'")}'`, limit: 1 }).catch(() => null);
  const customerId = customers?.data[0]?.id || null;
  return { customerId, subscriptionId: null };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required." }, { status: 401 });

  const stripe = getStripeClient();
  if (!stripe) return NextResponse.json({ error: "Billing portal is not configured." }, { status: 503 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  let customerId = stringValue(user.privateMetadata?.stripeCustomerId) || stringValue(user.publicMetadata?.stripeCustomerId);
  let subscriptionId = stringValue(user.privateMetadata?.stripeSubscriptionId);

  if (!customerId) {
    const recovered = await recoverStripeCustomerId(stripe, user);
    customerId = recovered.customerId;
    subscriptionId = subscriptionId || recovered.subscriptionId;
    if (customerId) {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { ...user.publicMetadata, stripeCustomerId: customerId },
        privateMetadata: { ...user.privateMetadata, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId || null },
      });
    }
  }

  if (!customerId) {
    return NextResponse.json({ error: "No billing account found for this membership yet." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl(req)}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
