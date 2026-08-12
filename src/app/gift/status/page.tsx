"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

type GiftStatus = {
  recipientName?: string;
  paymentStatus?: string;
  deliveryStatus?: string;
  scheduledDeliveryAt?: string | null;
  error?: string;
};

function GiftStatusContent() {
  const search = useSearchParams();
  const order = search.get("order") || "";
  const canceled = search.get("canceled") === "1";
  const [status, setStatus] = useState<GiftStatus | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (!order) return;
    fetch(`/api/gifts/status?order=${encodeURIComponent(order)}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => setStatus(ok ? body : { error: body.error || "Gift order unavailable." }))
      .catch(() => setStatus({ error: "Gift order unavailable." }));
  }, [order]);

  async function resumeCheckout() {
    if (!order || resuming) return;
    setResuming(true);
    const response = await fetch("/api/gifts/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order }),
    });
    const result = await response.json() as { url?: string; error?: string };
    if (response.ok && result.url) {
      window.location.href = result.url;
      return;
    }
    setStatus({ error: result.error || "Unable to resume checkout." });
    setResuming(false);
  }

  const canResume = canceled || status?.paymentStatus === "pending" || status?.paymentStatus === "checkout_open";
  return (
    <>
      <Navigation />
      <main style={{ minHeight: "100vh", padding: "150px 20px 90px", background: "var(--color-bg-primary)", color: "var(--color-text-primary)" }}>
        <section style={{ width: "min(620px,100%)", margin: "0 auto", padding: 32, border: "1px solid rgba(196,148,58,.3)", borderRadius: 24, background: "rgba(255,255,255,.035)" }}>
          <p style={{ color: "var(--color-accent-amber)", fontWeight: 900 }}>GIFT STATUS</p>
          <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: 44 }}>{canceled ? "Checkout paused." : status?.paymentStatus === "funded" ? "Your gift is funded." : "We’re checking your gift."}</h1>
          {canceled ? <p>You were not charged by returning here. Your pending order is safe and recoverable.</p> : null}
          {status?.recipientName ? <p>Gift for {status.recipientName}. Payment: {status.paymentStatus}. Delivery: {status.deliveryStatus}{status.scheduledDeliveryAt ? ` on ${new Date(status.scheduledDeliveryAt).toLocaleString()}` : " when funding completes"}.</p> : null}
          {status?.error ? <p role="alert">{status.error}</p> : null}
          {canResume ? <button type="button" onClick={resumeCheckout} disabled={resuming} style={{ margin: "14px 12px 14px 0", border: 0, borderRadius: 10, padding: "12px 16px", background: "var(--color-accent-amber)", color: "#17110b", fontWeight: 900 }}>{resuming ? "Opening checkout…" : "Resume secure checkout"}</button> : null}
          <a href="/gift" style={{ color: "var(--color-accent-amber)" }}>Return to gifts</a>
        </section>
      </main>
      <Footer />
    </>
  );
}

export default function GiftStatusPage() {
  return <Suspense fallback={null}><GiftStatusContent /></Suspense>;
}
