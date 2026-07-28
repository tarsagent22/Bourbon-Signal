import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { verifyClerkWebhookSignature } from "@/lib/clerk-webhook";
import { mergeGrowthMilestoneMetadata } from "@/lib/growth-events";
import { createNewsletterContact, normalizeNewsletterEmail } from "@/lib/newsletter";
import { notifyRetailerAccountCreated } from "@/lib/retailer-notifications";
import { getRetailerRepository } from "@/lib/retailer-repository";
import { normalizeRetailerApplication } from "@/lib/retailer-portal";

export const dynamic = "force-dynamic";

type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
  emailAddress?: string;
};

type ClerkWebhookUser = {
  id?: string;
  first_name?: string;
  firstName?: string;
  primary_email_address_id?: string;
  primaryEmailAddressId?: string;
  email_addresses?: ClerkEmailAddress[];
  emailAddresses?: ClerkEmailAddress[];
  unsafe_metadata?: Record<string, unknown>;
  unsafeMetadata?: Record<string, unknown>;
  private_metadata?: Record<string, unknown>;
  privateMetadata?: Record<string, unknown>;
  created_at?: number;
  createdAt?: number;
};

function verifyClerkSignature(payload: string, req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new Error("CLERK_WEBHOOK_SECRET is not configured");
  return verifyClerkWebhookSignature({
    payload,
    secret,
    id: req.headers.get("svix-id") || "",
    timestamp: req.headers.get("svix-timestamp") || "",
    signature: req.headers.get("svix-signature") || "",
  });
}

function primaryEmailForWebhookUser(user: ClerkWebhookUser) {
  const emailAddresses = user.email_addresses || user.emailAddresses || [];
  const primaryId = user.primary_email_address_id || user.primaryEmailAddressId;
  const primary = emailAddresses.find((email) => email.id === primaryId) || emailAddresses[0];
  return normalizeNewsletterEmail(primary?.email_address || primary?.emailAddress || "");
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  if (!verifyClerkSignature(payload, req)) {
    return NextResponse.json({ error: "Invalid Clerk webhook signature" }, { status: 400 });
  }

  let event: { type?: string; data?: ClerkWebhookUser };
  try {
    event = JSON.parse(payload) as { type?: string; data?: ClerkWebhookUser };
  } catch {
    return NextResponse.json({ error: "Invalid Clerk webhook payload" }, { status: 400 });
  }
  if (event.type !== "user.created") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const user = event.data || {};
  if (user.id) {
    const client = await clerkClient();
    const currentUser = await client.users.getUser(user.id);
    const privateMetadata = currentUser.privateMetadata as Record<string, unknown>;
    const registration = mergeGrowthMilestoneMetadata(
      privateMetadata,
      "registration_completed",
      new Date(user.created_at || user.createdAt || Date.now()).toISOString(),
    );
    await client.users.updateUserMetadata(user.id, {
      privateMetadata: { activation: registration.activation },
    });
  }
  const email = primaryEmailForWebhookUser(user);
  if (!email) return NextResponse.json({ ok: true, skipped: "missing-email" });

  const unsafeMetadata = user.unsafe_metadata || user.unsafeMetadata || {};
  if (unsafeMetadata.accountType !== "retailer") {
    await createNewsletterContact(email);
    return NextResponse.json({ ok: true, emailAdded: true });
  }

  const retailerApplication = normalizeRetailerApplication(unsafeMetadata.retailerApplication);
  if (!retailerApplication.ok || !user.id) {
    return NextResponse.json({ ok: true, skipped: "invalid-retailer-application" });
  }

  const repository = getRetailerRepository();
  await repository.upsertPendingApplication({
    userId: user.id,
    email,
    firstName: user.first_name || user.firstName,
    application: retailerApplication.value,
  });
  const notification = await notifyRetailerAccountCreated({
    userId: user.id,
    email,
    firstName: user.first_name || user.firstName,
    application: retailerApplication.value,
  });
  await repository.markNotificationSent(user.id, notification.messageId);
  return NextResponse.json({ ok: true, retailerNotificationSent: true, retailerApplicationCreated: true });
}
