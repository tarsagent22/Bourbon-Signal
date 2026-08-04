import { getResendClient } from "@/lib/email-alerts";
import { isValidNewsletterEmail, normalizeNewsletterEmail } from "./newsletter-preference-token";

export {
  isValidNewsletterEmail,
  issueNewsletterResubscribeConfirmation,
  newsletterSignatureFor,
  newsletterSigningSecret,
  newsletterOneClickUnsubscribeUrl,
  newsletterUnsubscribeUrl,
  normalizeNewsletterEmail,
  verifyNewsletterPreferenceAuthorization,
  verifyNewsletterSignature,
  type NewsletterPreferenceAction,
  type NewsletterResubscribeConfirmation,
} from "./newsletter-preference-token";

export const NEWSLETTER_AUDIENCE_ID = process.env.RESEND_DIGEST_AUDIENCE_ID;

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
