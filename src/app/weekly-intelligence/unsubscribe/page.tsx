import Link from "next/link";
import {
  verifyWeeklyIntelligenceUnsubscribe,
  weeklyIntelligenceUnsubscribeSecret,
} from "@/lib/member-weekly-email";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type UnsubscribeState = "confirm" | "unsubscribed" | "invalid" | "error";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function WeeklyIntelligenceUnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const memberId = first(params.member).trim();
  const purpose = first(params.purpose).trim();
  const version = first(params.v).trim();
  const issuedAt = first(params.iat).trim();
  const expiresAt = first(params.exp).trim();
  const signature = first(params.sig).trim();
  const result = first(params.result);
  const valid = verifyWeeklyIntelligenceUnsubscribe({
    memberId,
    purpose,
    version,
    issuedAt,
    expiresAt,
    signature,
    secret: weeklyIntelligenceUnsubscribeSecret(),
  });
  const state: UnsubscribeState = valid && result === "unsubscribed"
    ? "unsubscribed"
    : valid && result === "error"
      ? "error"
      : valid
        ? "confirm"
        : "invalid";

  const title = state === "unsubscribed"
    ? "Weekly brief paused."
    : state === "confirm"
      ? "Pause your weekly brief?"
      : state === "error"
        ? "We couldn’t update your preference."
        : "This unsubscribe link is invalid.";
  const body = state === "unsubscribed"
    ? "You won’t receive weekly member intelligence. Your real-time alert preferences are unchanged. Repeating the request will not change the original unsubscribe time."
    : state === "confirm"
      ? "Confirm below to turn off only Weekly intelligence email. Opening this page has not changed your preferences."
      : state === "error"
        ? "Please use your member dashboard to turn off Weekly intelligence email."
        : "The link may be malformed, expired, or missing its signed purpose and version.";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px 18px", background: "#120d09", color: "#f5edd6" }}>
      <section style={{ width: "100%", maxWidth: 560, padding: 34, border: "1px solid rgba(232,201,122,0.25)", borderRadius: 24, background: "linear-gradient(180deg, #1c130d, #120d09)", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
        <p style={{ margin: "0 0 14px", color: "#e8c97a", fontFamily: "var(--font-jetbrains)", fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase" }}>Weekly intelligence</p>
        <h1 style={{ margin: 0, color: "#f5edd6", fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 7vw, 54px)", lineHeight: 1 }}>{title}</h1>
        <p style={{ margin: "18px 0 0", color: "#d9cdb2", fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.7 }}>{body}</p>
        {state === "confirm" ? (
          <form method="post" action="/api/member-weekly-intelligence/unsubscribe" style={{ marginTop: 28 }}>
            <input type="hidden" name="member" value={memberId} />
            <input type="hidden" name="purpose" value={purpose} />
            <input type="hidden" name="v" value={version} />
            <input type="hidden" name="iat" value={issuedAt} />
            <input type="hidden" name="exp" value={expiresAt} />
            <input type="hidden" name="sig" value={signature} />
            <button type="submit" style={{ border: 0, padding: "12px 18px", borderRadius: 999, background: "linear-gradient(135deg, #c4943a, #e8c97a)", color: "#120d09", fontFamily: "var(--font-dm-sans)", fontWeight: 900, cursor: "pointer" }}>
              Confirm unsubscribe
            </button>
          </form>
        ) : (
          <Link href="/dashboard" style={{ display: "inline-flex", marginTop: 28, padding: "12px 18px", borderRadius: 999, background: "linear-gradient(135deg, #c4943a, #e8c97a)", color: "#120d09", fontFamily: "var(--font-dm-sans)", fontWeight: 900, textDecoration: "none" }}>
            Open member dashboard
          </Link>
        )}
      </section>
    </main>
  );
}
