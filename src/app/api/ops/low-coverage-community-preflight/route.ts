import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { prepareCampaignClickSchema } from "@/lib/campaign-click-tracking";
import { assertFreeMemberDayTwoDeliveryAuthorized } from "@/lib/free-member-day-two";
import { getMembershipTrialRepository } from "@/lib/membership-trial-repository";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  try {
    assertFreeMemberDayTwoDeliveryAuthorized(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }

  const body = await request.json().catch(() => null) as { userIds?: unknown } | null;
  const rawUserIds = Array.isArray(body?.userIds) ? body.userIds : [];
  const userIds = Array.from(new Set(rawUserIds.filter((value): value is string => typeof value === "string" && /^user_[A-Za-z0-9]+$/.test(value))));
  if (!userIds.length || userIds.length > 20 || userIds.length !== rawUserIds.length) {
    return NextResponse.json({ error: "Expected 1 to 20 valid, unique user IDs." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
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
