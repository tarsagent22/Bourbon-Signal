"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { user, isLoaded } = useUser();
  const [activationStatus, setActivationStatus] = useState<"idle" | "syncing" | "active" | "error">("idle");

  useEffect(() => {
    if (!sessionId || !isLoaded || activationStatus !== "idle") return;
    let cancelled = false;
    setActivationStatus("syncing");
    fetch("/api/checkout/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not activate membership");
        if (user) await user.reload();
        if (!cancelled) setActivationStatus("active");
      })
      .catch(() => {
        if (!cancelled) setActivationStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [activationStatus, isLoaded, sessionId, user]);

  return (
    <div
      style={{
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(40px, 8vw, 80px) clamp(20px, 5vw, 40px)",
      }}
    >
      {/* Amber glow ambient */}
      <div
        style={{
          position: "fixed",
          top: "30%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "400px",
          background: "radial-gradient(ellipse, rgba(196,148,58,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "rgba(196,148,58,0.12)",
            border: "1px solid rgba(196,148,58,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
            fontSize: "28px",
          }}
        >
          🥃
        </div>

        {/* Heading */}
        <h1
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 700,
            color: "var(--color-cream)",
            marginBottom: "16px",
            lineHeight: 1.2,
          }}
        >
          You&apos;re in. Welcome to Bourbon Signal.
        </h1>

        {/* Subheading — covers both founder and standard */}
        <div
          style={{
            background: "rgba(196,148,58,0.06)",
            border: "1px solid rgba(196,148,58,0.2)",
            borderRadius: "12px",
            padding: "20px 24px",
            marginBottom: "32px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "15px",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {activationStatus === "syncing" ? "Activating your membership now…" : activationStatus === "active" ? "Your membership is active. If you chose a recurring plan, billing follows the cadence shown at checkout. If you claimed lifetime access, it is tied to this account." : "Your membership is being activated. If you chose a recurring plan, billing follows the cadence shown at checkout. If you claimed lifetime access, it is tied to this account."}
          </p>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
              marginTop: "10px",
              marginBottom: 0,
            }}
          >
            {activationStatus === "error" ? "If access does not update in a moment, refresh this page or contact support with the checkout session shown below." : "Next step: set your alert areas and watchlist so Bourbon Signal can match source-backed drops to the bottles and markets you care about."}
          </p>
        </div>

        {/* What's next */}
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "14px",
            color: "var(--color-text-secondary)",
            marginBottom: "32px",
            lineHeight: 1.6,
          }}
        >
          Drop alerts are live for paid members. Start building your watchlist and we&apos;ll notify you when source-backed signals match your bottles.
        </p>

        {/* CTA */}
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
            color: "#1A1510",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "16px",
            fontWeight: 700,
            padding: "16px 40px",
            borderRadius: "10px",
            textDecoration: "none",
            boxShadow: "0 4px 20px rgba(196,148,58,0.3)",
            transition: "box-shadow 300ms, transform 300ms",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.boxShadow =
              "0 6px 30px rgba(196,148,58,0.5)";
            (e.currentTarget as HTMLAnchorElement).style.transform =
              "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.boxShadow =
              "0 4px 20px rgba(196,148,58,0.3)";
            (e.currentTarget as HTMLAnchorElement).style.transform =
              "translateY(0)";
          }}
        >
          Start Hunting →
        </Link>

        {/* Session ID (hidden but available for debugging) */}
        {sessionId && (
          <p
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              color: "rgba(245,237,214,0.15)",
              marginTop: "32px",
            }}
          >
            {sessionId}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <>
      <Navigation />
      <main
        style={{
          background: "var(--color-bg-primary)",
          minHeight: "100vh",
        }}
      >
        <Suspense fallback={<div style={{ minHeight: "80vh" }} />}>
          <SuccessContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
