import * as crypto from "node:crypto";

export type NewsletterPreferenceAction = "unsubscribe" | "resubscribe";

export interface NewsletterResubscribeConfirmation {
  purpose: "newsletter-resubscribe";
  version: "1";
  action: "resubscribe";
  issuedAt: string;
  expiresAt: string;
  signature: string;
}

const RESUBSCRIBE_CONFIRMATION_TTL_MS = 10 * 60_000;
const RESUBSCRIBE_CONFIRMATION_CLOCK_SKEW_MS = 60_000;

export function normalizeNewsletterEmail(value: string | undefined | null) {
  return (value || "").trim().toLowerCase();
}

export function isValidNewsletterEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function newsletterSigningSecret(env: NodeJS.ProcessEnv = process.env) {
  return env.NEWSLETTER_UNSUBSCRIBE_SECRET || env.RESEND_API_KEY || "";
}

function hmac(value: string, secret: string) {
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function newsletterSignatureFor(email: string, secret = newsletterSigningSecret()) {
  return hmac(normalizeNewsletterEmail(email), secret);
}

export function verifyNewsletterSignature(email: string, signature: string, secret = newsletterSigningSecret()) {
  return safeEqual(newsletterSignatureFor(email, secret), signature);
}

export function newsletterUnsubscribeUrl(
  email: string,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com",
) {
  const normalizedEmail = normalizeNewsletterEmail(email);
  const params = new URLSearchParams({
    email: normalizedEmail,
    sig: newsletterSignatureFor(normalizedEmail),
  });
  return `${baseUrl.replace(/\/$/, "")}/unsubscribe?${params.toString()}`;
}

export function newsletterOneClickUnsubscribeUrl(
  email: string,
  baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com",
) {
  const normalizedEmail = normalizeNewsletterEmail(email);
  const params = new URLSearchParams({
    email: normalizedEmail,
    sig: newsletterSignatureFor(normalizedEmail),
  });
  return `${baseUrl.replace(/\/$/, "")}/api/newsletter/preferences?${params.toString()}`;
}

function resubscribeConfirmationPayload(email: string, confirmation: Omit<NewsletterResubscribeConfirmation, "signature">) {
  return [
    confirmation.version,
    confirmation.purpose,
    confirmation.action,
    normalizeNewsletterEmail(email),
    confirmation.issuedAt,
    confirmation.expiresAt,
  ].join("\n");
}

export function issueNewsletterResubscribeConfirmation(input: {
  email: string;
  secret?: string;
  now?: string;
}): NewsletterResubscribeConfirmation {
  const secret = input.secret ?? newsletterSigningSecret();
  const issuedAtDate = new Date(input.now || new Date().toISOString());
  if (!Number.isFinite(issuedAtDate.getTime())) throw new Error("Invalid newsletter confirmation time");
  const confirmation = {
    purpose: "newsletter-resubscribe" as const,
    version: "1" as const,
    action: "resubscribe" as const,
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: new Date(issuedAtDate.getTime() + RESUBSCRIBE_CONFIRMATION_TTL_MS).toISOString(),
  };
  return {
    ...confirmation,
    signature: hmac(resubscribeConfirmationPayload(input.email, confirmation), secret),
  };
}

function verifyNewsletterResubscribeConfirmation(input: {
  email: string;
  confirmation: NewsletterResubscribeConfirmation | undefined;
  secret: string;
  now: string;
}) {
  const confirmation = input.confirmation;
  if (!confirmation
    || confirmation.purpose !== "newsletter-resubscribe"
    || confirmation.version !== "1"
    || confirmation.action !== "resubscribe") return false;
  const issuedAt = Date.parse(confirmation.issuedAt);
  const expiresAt = Date.parse(confirmation.expiresAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(now)) return false;
  if (issuedAt > now + RESUBSCRIBE_CONFIRMATION_CLOCK_SKEW_MS
    || expiresAt <= now
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > RESUBSCRIBE_CONFIRMATION_TTL_MS) return false;
  const expected = hmac(resubscribeConfirmationPayload(input.email, {
    purpose: confirmation.purpose,
    version: confirmation.version,
    action: confirmation.action,
    issuedAt: confirmation.issuedAt,
    expiresAt: confirmation.expiresAt,
  }), input.secret);
  return safeEqual(expected, confirmation.signature);
}

export function verifyNewsletterPreferenceAuthorization(input: {
  action: NewsletterPreferenceAction;
  email: string;
  unsubscribeSignature?: string;
  confirmation?: NewsletterResubscribeConfirmation;
  secret?: string;
  now?: string;
}) {
  const email = normalizeNewsletterEmail(input.email);
  if (!isValidNewsletterEmail(email)) return false;
  const secret = input.secret ?? newsletterSigningSecret();
  if (input.action === "unsubscribe") {
    return verifyNewsletterSignature(email, input.unsubscribeSignature || "", secret);
  }
  return verifyNewsletterResubscribeConfirmation({
    email,
    confirmation: input.confirmation,
    secret,
    now: input.now || new Date().toISOString(),
  });
}
