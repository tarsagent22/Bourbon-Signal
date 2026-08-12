"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function RedemptionClient({ token, redirectUrl }: { token: string; redirectUrl: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function redeem() {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`); return; }
    if (pending) return;
    setPending(true);
    const response = await fetch("/api/gifts/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const result = await response.json() as { error?: string; founderNumber?: number | null; accessExpiresAt?: string | null };
    if (!response.ok) { setMessage(result.error || "This gift cannot be redeemed."); setPending(false); return; }
    setMessage(result.founderNumber ? `Gift redeemed. Founder #${result.founderNumber} is yours.` : result.accessExpiresAt ? `Gift redeemed through ${new Date(result.accessExpiresAt).toLocaleDateString()}.` : "Gift redeemed.");
  }
  return <section style={{ width: "min(560px,100%)", padding: 34, border: "1px solid rgba(196,148,58,.32)", borderRadius: 24, background: "rgba(255,255,255,.035)", textAlign: "center" }}><p style={{ color: "var(--color-accent-amber)", fontWeight: 900 }}>A BOURBON SIGNAL GIFT</p><h1 style={{ margin: "14px 0", fontFamily: "var(--font-playfair)", fontSize: 46 }}>Your signal is waiting.</h1><p style={{ color: "var(--color-text-secondary)", lineHeight: 1.65 }}>Sign in or create the account whose verified primary email received the gift. Gift codes are single-use and cannot be redeemed by the purchaser.</p>{message ? <p role="status">{message}</p> : <button type="button" onClick={redeem} disabled={pending || !isLoaded} style={{ marginTop: 18, border: 0, borderRadius: 13, padding: "14px 22px", background: "var(--color-accent-amber)", color: "#17110b", fontWeight: 900 }}>{pending ? "Redeeming…" : isSignedIn ? "Redeem gift" : "Sign in to redeem"}</button>}</section>;
}
