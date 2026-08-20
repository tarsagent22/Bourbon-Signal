import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { consumeCampaignPreflightNonce, prepareCampaignClickSchema } from "@/lib/campaign-click-tracking";
import { assertFreeMemberDayTwoDeliveryAuthorized } from "@/lib/free-member-day-two";
import { getMembershipTrialRepository } from "@/lib/membership-trial-repository";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validSignedRequest(request: Request, rawBody: string) {
  const secret = process.env.CLERK_SECRET_KEY?.trim() || "";
  const timestamp = request.headers.get("x-low-coverage-timestamp")?.trim() || "";
  const supplied = request.headers.get("x-low-coverage-signature")?.trim() || "";
  const timestampMs = Number(timestamp);
  if (!secret || !/^\d{13}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(supplied) || !Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let authorized = false;
  let signedAuthorization = false;
  try {
    assertFreeMemberDayTwoDeliveryAuthorized(request);
    authorized = true;
  } catch {
    signedAuthorization = validSignedRequest(request, rawBody);
    authorized = signedAuthorization;
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const body = (() => { try { return JSON.parse(rawBody) as { userIds?: unknown; nonce?: unknown }; } catch { return null; } })();
  const rawUserIds = Array.isArray(body?.userIds) ? body.userIds : [];
  const userIds = Array.from(new Set(rawUserIds.filter((value): value is string => typeof value === "string" && /^user_[A-Za-z0-9]+$/.test(value))));
  if (!userIds.length || userIds.length > 20 || userIds.length !== rawUserIds.length) {
    return NextResponse.json({ error: "Expected 1 to 20 valid, unique user IDs." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  if (signedAuthorization) {
    const nonce = typeof body?.nonce === "string" && /^[a-f0-9]{32}$/.test(body.nonce) ? body.nonce : "";
    if (!nonce) return NextResponse.json({ error: "A valid signed nonce is required." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    try {
      if (!await consumeCampaignPreflightNonce(nonce)) {
        return NextResponse.json({ error: "This signed request was already consumed." }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
      }
    } catch {
      return NextResponse.json({ error: "Signed request replay protection is unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
  }

  try {
    const repository = getMembershipTrialRepository();
    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeSecret) throw new Error("Stripe is unavailable.");
    const stripe = new Stripe(stripeSecret, { timeout: 8_000, maxNetworkRetries: 1 });
    const clerk = await clerkClient();
    const clearUserIds: string[] = [];
    for (const userId of userIds) {
      if (await repository.findByUserId(userId)) continue;
      const user = await clerk.users.getUser(userId);
      const primaryEmail = user.emailAddresses.find((row) => row.id === user.primaryEmailAddressId)?.emailAddress?.trim().toLowerCase();
      if (!primaryEmail) continue;
      const customerIds = new Set<string>();
      for (const metadata of [user.publicMetadata, user.privateMetadata]) {
        const customerId = text((metadata as Record<string, unknown>)?.stripeCustomerId);
        if (customerId) customerIds.add(customerId);
      }
      const matchingCustomers = await stripe.customers.list({ email: primaryEmail, limit: 100 });
      if (matchingCustomers.has_more) continue;
      for (const customer of matchingCustomers.data) customerIds.add(customer.id);
      let hasSubscriptionHistory = false;
      for (const customerId of customerIds) {
        const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
        if (subscriptions.data.length || subscriptions.has_more) {
          hasSubscriptionHistory = true;
          break;
        }
      }
      if (!hasSubscriptionHistory) clearUserIds.push(userId);
    }
    await prepareCampaignClickSchema();
    return NextResponse.json({ clearUserIds, blockedCount: userIds.length - clearUserIds.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Durable eligibility verification is unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
