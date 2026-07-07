import crypto from "crypto";
import Link from "next/link";
import { getResendClient } from "@/lib/email-alerts";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type SubscriptionState = "unsubscribed" | "resubscribed" | "invalid" | "error";

const AUDIENCE_ID = process.env.RESEND_DIGEST_AUDIENCE_ID;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeEmail(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function signingSecret() {
  return process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || "";
}

function signatureFor(email: string) {
  const secret = signingSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(email).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function updateSubscription(email: string, unsubscribed: boolean) {
  if (!AUDIENCE_ID) throw new Error("RESEND_DIGEST_AUDIENCE_ID is not configured");
  const resend = getResendClient();
  const updated = await resend.contacts.update({
    audienceId: AUDIENCE_ID,
    email,
    unsubscribed,
  });

  if (!updated.error) return;

  if (!unsubscribed) {
    const created = await resend.contacts.create({
      audienceId: AUDIENCE_ID,
      email,
      unsubscribed: false,
    });
    if (!created.error) return;
    throw new Error(created.error.message || "Could not resubscribe contact");
  }

  throw new Error(updated.error.message || "Could not update contact");
}

function resubscribeHref(email: string) {
  const params = new URLSearchParams({
    email,
    sig: signatureFor(email),
    action: "resubscribe",
  });
  return `/unsubscribe?${params.toString()}`;
}

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const email = normalizeEmail(firstValue(params.email));
  const sig = firstValue(params.sig) || "";
  const action = firstValue(params.action) === "resubscribe" ? "resubscribe" : "unsubscribe";
  const expected = signatureFor(email);
  let state: SubscriptionState = "invalid";

  if (validEmail(email) && expected && sig && safeEqual(sig, expected)) {
    try {
      await updateSubscription(email, action !== "resubscribe");
      state = action === "resubscribe" ? "resubscribed" : "unsubscribed";
    } catch (error) {
      console.error("Newsletter unsubscribe update failed", error);
      state = "error";
    }
  }

  const title = state === "resubscribed"
    ? "You’re back on the list."
    : state === "unsubscribed"
      ? "You’ve been unsubscribed."
      : state === "error"
        ? "We couldn’t update your subscription."
        : "This unsubscribe link is invalid.";

  const body = state === "resubscribed"
    ? "You’ll keep receiving Bourbon Signal updates."
    : state === "unsubscribed"
      ? "You won’t receive Bourbon Signal update emails at this address unless you resubscribe."
      : state === "error"
        ? "Please try again in a minute, or reply to the email and we’ll handle it manually."
        : "The link may be expired, malformed, or missing its signature.";

  return (
    <main style={{ minHeight: "100vh", background: "#120d09", color: "#f5edd6", display: "grid", placeItems: "center", padding: "32px 18px" }}>
      <section style={{ width: "100%", maxWidth: 560, border: "1px solid rgba(232,201,122,0.25)", borderRadius: 24, background: "linear-gradient(180deg, #1c130d, #120d09)", padding: "34px", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
        <div style={{ color: "#e8c97a", fontFamily: "var(--font-jetbrains)", fontSize: 12, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 14 }}>
          Bourbon Signal updates
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 7vw, 54px)", lineHeight: 1, color: "#f5edd6" }}>
          {title}
        </h1>
        <p style={{ margin: "18px 0 0", color: "#d9cdb2", fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.7 }}>
          {body}
        </p>
        {state === "unsubscribed" ? (
          <p style={{ margin: "24px 0 0", color: "#d9cdb2", fontFamily: "var(--font-dm-sans)", fontSize: 15, lineHeight: 1.7 }}>
            Was this a mistake?{" "}
            <Link href={resubscribeHref(email)} style={{ color: "#e8c97a", fontWeight: 900 }}>
              Click here to resubscribe to updates.
            </Link>
          </p>
        ) : null}
        <Link href="/" style={{ display: "inline-flex", marginTop: 28, borderRadius: 999, padding: "12px 18px", background: "linear-gradient(135deg, #c4943a, #e8c97a)", color: "#120d09", fontFamily: "var(--font-dm-sans)", fontWeight: 900, textDecoration: "none" }}>
          Back to Bourbon Signal
        </Link>
      </section>
    </main>
  );
}
