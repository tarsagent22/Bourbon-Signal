import * as crypto from "crypto";
import { getResendClient } from "@/lib/email-alerts";

export const NEWSLETTER_AUDIENCE_ID = process.env.RESEND_DIGEST_AUDIENCE_ID;

export function normalizeNewsletterEmail(value: string | undefined | null) {
  return (value || "").trim().toLowerCase();
}

export function isValidNewsletterEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function newsletterSigningSecret() {
  return process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || "";
}

export function newsletterSignatureFor(email: string) {
  const secret = newsletterSigningSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(normalizeNewsletterEmail(email)).digest("hex");
}

export function newsletterUnsubscribeUrl(email: string, baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com") {
  const normalizedEmail = normalizeNewsletterEmail(email);
  const params = new URLSearchParams({
    email: normalizedEmail,
    sig: newsletterSignatureFor(normalizedEmail),
  });
  return `${baseUrl.replace(/\/$/, "")}/unsubscribe?${params.toString()}`;
}

function resendErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "Unknown Resend error";
  const maybeMessage = "message" in error ? error.message : null;
  return typeof maybeMessage === "string" ? maybeMessage : JSON.stringify(error);
}

function resendStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

function isExistingContactError(error: unknown) {
  const status = resendStatusCode(error);
  const message = resendErrorMessage(error).toLowerCase();
  return status === 409 || message.includes("already") || message.includes("exist");
}

export async function createNewsletterContact(email: string) {
  const normalizedEmail = normalizeNewsletterEmail(email);
  if (!NEWSLETTER_AUDIENCE_ID) throw new Error("RESEND_DIGEST_AUDIENCE_ID is not configured");
  if (!isValidNewsletterEmail(normalizedEmail)) throw new Error("Invalid newsletter email");

  const resend = getResendClient();
  const created = await resend.contacts.create({
    audienceId: NEWSLETTER_AUDIENCE_ID,
    email: normalizedEmail,
    unsubscribed: false,
  });

  if (!created.error) return { ok: true as const, created: true as const, contactId: created.data?.id || null };
  if (isExistingContactError(created.error)) return { ok: true as const, created: false as const, contactId: null };
  throw new Error(resendErrorMessage(created.error));
}

export async function subscribeNewsletterContact(email: string) {
  const normalizedEmail = normalizeNewsletterEmail(email);
  if (!NEWSLETTER_AUDIENCE_ID) throw new Error("RESEND_DIGEST_AUDIENCE_ID is not configured");
  if (!isValidNewsletterEmail(normalizedEmail)) throw new Error("Invalid newsletter email");

  const resend = getResendClient();
  const created = await resend.contacts.create({
    audienceId: NEWSLETTER_AUDIENCE_ID,
    email: normalizedEmail,
    unsubscribed: false,
  });

  if (!created.error) return { ok: true as const, alreadySubscribed: false, contactId: created.data?.id || null };
  if (!isExistingContactError(created.error)) throw new Error(resendErrorMessage(created.error));

  const updated = await resend.contacts.update({
    audienceId: NEWSLETTER_AUDIENCE_ID,
    email: normalizedEmail,
    unsubscribed: false,
  });

  if (updated.error) throw new Error(resendErrorMessage(updated.error));
  return { ok: true as const, alreadySubscribed: true, contactId: updated.data?.id || null };
}

export async function unsubscribeNewsletterContact(email: string) {
  const normalizedEmail = normalizeNewsletterEmail(email);
  if (!NEWSLETTER_AUDIENCE_ID) throw new Error("RESEND_DIGEST_AUDIENCE_ID is not configured");
  if (!isValidNewsletterEmail(normalizedEmail)) throw new Error("Invalid newsletter email");

  const resend = getResendClient();
  const updated = await resend.contacts.update({
    audienceId: NEWSLETTER_AUDIENCE_ID,
    email: normalizedEmail,
    unsubscribed: true,
  });

  if (!updated.error) return { ok: true as const };
  throw new Error(resendErrorMessage(updated.error));
}
