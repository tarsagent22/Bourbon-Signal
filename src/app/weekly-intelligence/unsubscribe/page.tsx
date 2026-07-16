import Link from "next/link";
import { clerkClient } from "@clerk/nextjs/server";
import {
  verifyWeeklyIntelligenceUnsubscribe,
  weeklyIntelligenceUnsubscribeSecret,
} from "@/lib/member-weekly-email";
import { normalizeNotificationPreferences } from "@/lib/notification-preferences";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type UnsubscribeState = "unsubscribed" | "invalid" | "error";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function WeeklyIntelligenceUnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const memberId = first(params.member).trim();
  const signature = first(params.sig).trim();
  const secret = weeklyIntelligenceUnsubscribeSecret();
  let state: UnsubscribeState = "invalid";

  if (verifyWeeklyIntelligenceUnsubscribe(memberId, signature, secret)) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(memberId);
      const notificationPreferences = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
      await client.users.updateUserMetadata(memberId, {
        publicMetadata: {
          notificationPreferences: {
            ...notificationPreferences,
            weeklyIntelligence: {
              ...notificationPreferences.weeklyIntelligence,
              emailEnabled: false,
              unsubscribedAt: new Date().toISOString(),
            },
          },
        },
      });
      state = "unsubscribed";
    } catch {
      state = "error";
    }
  }

  const title = state === "unsubscribed"
    ? "Weekly brief paused."
    : state === "error"
      ? "We couldn’t update your preference."
      : "This unsubscribe link is invalid.";
  const body = state === "unsubscribed"
    ? "You won’t receive weekly member intelligence. Your real-time alert preferences are unchanged."
    : state === "error"
      ? "Please use your member dashboard to turn off Weekly intelligence email."
      : "The link may be malformed or missing its signature.";

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "32px 18px", background: "#120d09", color: "#f5edd6" }}>
      <section style={{ width: "100%", maxWidth: 560, padding: 34, border: "1px solid rgba(232,201,122,0.25)", borderRadius: 24, background: "linear-gradient(180deg, #1c130d, #120d09)", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
        <p style={{ margin: "0 0 14px", color: "#e8c97a", fontFamily: "var(--font-jetbrains)", fontSize: 11, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase" }}>Weekly intelligence</p>
        <h1 style={{ margin: 0, color: "#f5edd6", fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 7vw, 54px)", lineHeight: 1 }}>{title}</h1>
        <p style={{ margin: "18px 0 0", color: "#d9cdb2", fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.7 }}>{body}</p>
        <Link href="/dashboard" style={{ display: "inline-flex", marginTop: 28, padding: "12px 18px", borderRadius: 999, background: "linear-gradient(135deg, #c4943a, #e8c97a)", color: "#120d09", fontFamily: "var(--font-dm-sans)", fontWeight: 900, textDecoration: "none" }}>
          Open member dashboard
        </Link>
      </section>
    </main>
  );
}
