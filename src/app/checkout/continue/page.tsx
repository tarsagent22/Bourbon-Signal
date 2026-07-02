"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { BillingPlanId } from "@/lib/entitlements";

const VALID_PLANS: BillingPlanId[] = [
  "standard_monthly",
  "standard_annual",
  "barrel_monthly",
  "barrel_annual",
  "bib_lifetime",
];

function normalizePlan(value: string | null): BillingPlanId | null {
  if (VALID_PLANS.includes(value as BillingPlanId)) return value as BillingPlanId;
  if (value === "monthly") return "standard_monthly";
  if (value === "annual") return "standard_annual";
  if (value === "founder") return "bib_lifetime";
  return null;
}

function ContinueCheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const plan = useMemo(() => normalizePlan(searchParams.get("plan")), [searchParams]);

  useEffect(() => {
    if (!plan) {
      router.replace("/pricing");
      return;
    }
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace(`/sign-up?redirect_url=${encodeURIComponent(`/checkout/continue?plan=${plan}`)}`);
      return;
    }

    let cancelled = false;
    async function openCheckout() {
      setError(null);
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error || "Checkout is not available.");
        if (!cancelled) window.location.href = data.url;
      } catch (checkoutError) {
        if (!cancelled) setError(checkoutError instanceof Error ? checkoutError.message : "Checkout is not available.");
      }
    }

    void openCheckout();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, plan, router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "clamp(20px, 5vw, 48px)",
        background: "radial-gradient(circle at 50% 0%, rgba(196,148,58,.16), transparent 34%), var(--color-bg-primary)",
        color: "var(--color-text-primary)",
      }}
    >
      <section
        style={{
          width: "min(440px, 100%)",
          border: "1px solid rgba(196,148,58,.24)",
          borderRadius: "22px",
          padding: "32px",
          background: "linear-gradient(180deg, rgba(24,19,14,.96), rgba(14,11,8,.99))",
          boxShadow: "0 28px 80px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.04)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            color: "var(--color-accent-amber)",
            fontFamily: "var(--font-jetbrains)",
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: ".16em",
            textTransform: "uppercase",
          }}
        >
          Bourbon Signal
        </p>
        <h1
          style={{
            margin: 0,
            color: "var(--color-cream)",
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(32px, 8vw, 46px)",
            lineHeight: .95,
            letterSpacing: "-.04em",
          }}
        >
          Opening checkout.
        </h1>
        <p
          style={{
            margin: "16px 0 0",
            color: "var(--color-text-secondary)",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          {error || "One moment while we connect your account to Stripe."}
        </p>
        {error ? (
          <button
            type="button"
            onClick={() => router.push("/pricing")}
            style={{
              marginTop: "20px",
              border: "1px solid rgba(196,148,58,.45)",
              borderRadius: "12px",
              padding: "12px 16px",
              color: "#17110B",
              background: "linear-gradient(135deg, #C4943A, #D4A44A)",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Back to pricing
          </button>
        ) : null}
      </section>
    </main>
  );
}

export default function ContinueCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <ContinueCheckoutContent />
    </Suspense>
  );
}
