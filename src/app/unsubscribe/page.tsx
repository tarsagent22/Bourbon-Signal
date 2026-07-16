import Link from "next/link";
import {
  isValidNewsletterEmail,
  issueNewsletterResubscribeConfirmation,
  normalizeNewsletterEmail,
  verifyNewsletterSignature,
} from "@/lib/newsletter";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type SubscriptionState = "confirm" | "unsubscribed" | "resubscribed" | "invalid" | "error";

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const email = normalizeNewsletterEmail(firstValue(params.email));
  const signature = firstValue(params.sig) || "";
  const result = firstValue(params.result);
  const requestedAction = firstValue(params.action) === "resubscribe" ? "resubscribe" : "unsubscribe";
  const valid = isValidNewsletterEmail(email) && verifyNewsletterSignature(email, signature);
  const state: SubscriptionState = valid && result === "unsubscribed"
    ? "unsubscribed"
    : valid && result === "resubscribed"
      ? "resubscribed"
      : valid && result === "error"
        ? "error"
        : valid
          ? "confirm"
          : "invalid";

  const title = state === "resubscribed"
    ? "You’re back on the list."
    : state === "unsubscribed"
      ? "You’ve been unsubscribed."
      : state === "confirm"
        ? requestedAction === "resubscribe" ? "Resubscribe to updates?" : "Unsubscribe from updates?"
        : state === "error"
          ? "We couldn’t update your subscription."
          : "This unsubscribe link is invalid.";
  const body = state === "resubscribed"
    ? "You’ll keep receiving Bourbon Signal updates."
    : state === "unsubscribed"
      ? "You won’t receive Bourbon Signal update emails at this address unless you explicitly resubscribe."
      : state === "confirm"
        ? requestedAction === "resubscribe"
          ? "Confirm below to resume Bourbon Signal update emails. Opening this page has not changed your subscription."
          : "Confirm below to stop Bourbon Signal update emails. Opening this page has not changed your subscription."
        : state === "error"
          ? "Please try again in a minute, or reply to the email and we’ll handle it manually."
          : "The link may be malformed or missing its signature.";
  const formAction = state === "unsubscribed" ? "resubscribe" : requestedAction;
  const resubscribeConfirmation = valid && formAction === "resubscribe"
    ? issueNewsletterResubscribeConfirmation({ email })
    : null;

  return (
    <main style={{ minHeight: "100vh", background: "#120d09", color: "#f5edd6", display: "grid", placeItems: "center", padding: "32px 18px" }}>
      <section style={{ width: "100%", maxWidth: 560, border: "1px solid rgba(232,201,122,0.25)", borderRadius: 24, background: "linear-gradient(180deg, #1c130d, #120d09)", padding: "34px", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
        <div style={{ color: "#e8c97a", fontFamily: "var(--font-jetbrains)", fontSize: 12, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 14 }}>
          Bourbon Signal updates
        </div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 7vw, 54px)", lineHeight: 1, color: "#f5edd6" }}>{title}</h1>
        <p style={{ margin: "18px 0 0", color: "#d9cdb2", fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.7 }}>{body}</p>
        {state === "confirm" || state === "unsubscribed" ? (
          <form method="post" action="/api/newsletter/preferences" style={{ marginTop: 24 }}>
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="sig" value={signature} />
            <input type="hidden" name="action" value={formAction} />
            {resubscribeConfirmation ? (
              <>
                <input type="hidden" name="confirmationPurpose" value={resubscribeConfirmation.purpose} />
                <input type="hidden" name="confirmationVersion" value={resubscribeConfirmation.version} />
                <input type="hidden" name="confirmationAction" value={resubscribeConfirmation.action} />
                <input type="hidden" name="confirmationIssuedAt" value={resubscribeConfirmation.issuedAt} />
                <input type="hidden" name="confirmationExpiresAt" value={resubscribeConfirmation.expiresAt} />
                <input type="hidden" name="confirmationSignature" value={resubscribeConfirmation.signature} />
              </>
            ) : null}
            <button type="submit" style={{ border: 0, padding: "12px 18px", borderRadius: 999, background: "linear-gradient(135deg, #c4943a, #e8c97a)", color: "#120d09", fontFamily: "var(--font-dm-sans)", fontWeight: 900, cursor: "pointer" }}>
              {state === "unsubscribed" || requestedAction === "resubscribe" ? "Confirm resubscribe" : "Confirm unsubscribe"}
            </button>
          </form>
        ) : null}
        <Link href="/" style={{ display: "inline-flex", marginTop: 28, borderRadius: 999, padding: "12px 18px", border: "1px solid rgba(232,201,122,0.25)", color: "#e8c97a", fontFamily: "var(--font-dm-sans)", fontWeight: 900, textDecoration: "none" }}>
          Back to Bourbon Signal
        </Link>
      </section>
    </main>
  );
}
