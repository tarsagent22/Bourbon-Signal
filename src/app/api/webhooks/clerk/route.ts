import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { createNewsletterContact, normalizeNewsletterEmail } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
  emailAddress?: string;
};

type ClerkWebhookUser = {
  id?: string;
  primary_email_address_id?: string;
  primaryEmailAddressId?: string;
  email_addresses?: ClerkEmailAddress[];
  emailAddresses?: ClerkEmailAddress[];
};

function decodeWebhookSecret(secret: string) {
  const trimmed = secret.trim();
  const withoutPrefix = trimmed.startsWith("whsec_") ? trimmed.slice(6) : trimmed;
  return Buffer.from(withoutPrefix, "base64");
}

function timingSafeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyClerkSignature(payload: string, req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new Error("CLERK_WEBHOOK_SECRET is not configured");

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", decodeWebhookSecret(secret)).update(signedContent).digest("base64");
  return svixSignature
    .split(" ")
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3))
    .some((signature) => timingSafeEqualString(signature, expected));
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

  const event = JSON.parse(payload) as { type?: string; data?: ClerkWebhookUser };
  if (event.type !== "user.created") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const email = primaryEmailForWebhookUser(event.data || {});
  if (!email) return NextResponse.json({ ok: true, skipped: "missing-email" });

  await createNewsletterContact(email);
  return NextResponse.json({ ok: true, emailAdded: true });
}
