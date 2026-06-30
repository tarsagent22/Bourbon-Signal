"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";

const DEFAULT_ONBOARDING_REDIRECT = "/alerts?welcome=1";

function safeRedirectUrl(value: string | null) {
  if (!value) return DEFAULT_ONBOARDING_REDIRECT;
  try {
    if (value.startsWith("/")) return value.startsWith("//") ? DEFAULT_ONBOARDING_REDIRECT : value;
    const url = new URL(value);
    if (typeof window !== "undefined" && url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_ONBOARDING_REDIRECT;
  }
  return DEFAULT_ONBOARDING_REDIRECT;
}

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const redirectUrl = safeRedirectUrl(searchParams.get("redirect_url"));
  const encodedRedirect = encodeURIComponent(redirectUrl);
  const [ageChecked, setAgeChecked] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("bourbon_signal_age_confirmed") === "1") {
      setAgeChecked(true);
      setConfirmedAge(true);
    }
  }, []);

  const confirmAge = () => {
    window.localStorage.setItem("bourbon_signal_age_confirmed", "1");
    setConfirmedAge(true);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 5vw, 40px)",
        overflowX: "hidden",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "40px" }}>
        <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "baseline", gap: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-playfair)",
              fontWeight: 700,
              fontSize: "32px",
              color: "var(--color-text-primary)",
              letterSpacing: "0.02em",
            }}
          >
            BOURBON SIGNAL
          </span>
          <span
            style={{
              color: "var(--color-accent-amber)",
              fontSize: "10px",
              marginLeft: "3px",
            }}
          >
            ●
          </span>
        </a>
      </div>

      {confirmedAge ? (
        redirectUrl === DEFAULT_ONBOARDING_REDIRECT ? (
          <SignUp forceRedirectUrl="/alerts?welcome=1" signInForceRedirectUrl="/alerts?welcome=1" signInUrl="/sign-in?redirect_url=%2Falerts%3Fwelcome%3D1" />
        ) : (
          <SignUp forceRedirectUrl={redirectUrl} signInForceRedirectUrl={redirectUrl} signInUrl={`/sign-in?redirect_url=${encodedRedirect}`} />
        )
      ) : (
        <section
          aria-labelledby="age-confirmation-title"
          style={{
            width: "100%",
            maxWidth: "460px",
            borderRadius: "18px",
            border: "1px solid rgba(196,148,58,0.24)",
            background: "linear-gradient(180deg, rgba(24,19,14,0.98) 0%, rgba(14,11,8,0.99) 100%)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.72), 0 0 0 1px rgba(196,148,58,0.10)",
            padding: "clamp(24px, 5vw, 34px)",
            color: "var(--color-text-primary)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              color: "var(--color-accent-amber)",
              marginBottom: "12px",
            }}
          >
            Age confirmation
          </p>
          <h1
            id="age-confirmation-title"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "32px",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              marginBottom: "12px",
            }}
          >
            Confirm you are 21 or older.
          </h1>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "15px",
              lineHeight: 1.65,
              color: "var(--color-text-secondary)",
              marginBottom: "22px",
            }}
          >
            Bourbon Signal is an informational service for users of legal drinking age. We do not sell alcohol, but account access requires this confirmation.
          </p>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "14px",
              borderRadius: "12px",
              border: `1px solid ${attempted ? "rgba(255,139,106,0.5)" : "rgba(247,240,224,0.12)"}`,
              background: "rgba(247,240,224,0.045)",
              cursor: "pointer",
              marginBottom: "16px",
            }}
          >
            <input
              type="checkbox"
              checked={ageChecked}
              onChange={(event) => {
                setAttempted(false);
                setAgeChecked(event.target.checked);
              }}
              style={{
                width: "18px",
                height: "18px",
                marginTop: "2px",
                accentColor: "var(--color-accent-amber)",
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
              I confirm that I am at least 21 years old and agree to Bourbon Signal&apos;s{" "}
              <a href="/legal/terms" style={{ color: "var(--color-accent-gold)" }}>Terms</a>{" "}
              and{" "}
              <a href="/legal/disclaimer" style={{ color: "var(--color-accent-gold)" }}>Data & Alcohol Disclaimer</a>.
            </span>
          </label>

          {attempted ? (
            <p style={{ color: "#FFB199", fontSize: "13px", fontWeight: 700, marginBottom: "14px" }}>
              Please confirm you are 21 or older before creating an account.
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (!ageChecked) {
                setAttempted(true);
                return;
              }
              confirmAge();
            }}
            style={{
              width: "100%",
              border: "none",
              borderRadius: "10px",
              padding: "13px 18px",
              background: "linear-gradient(135deg, #D4920B 0%, #F2C14E 100%)",
              color: "#14100C",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "15px",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 10px 28px rgba(212,146,11,0.28)",
            }}
          >
            Continue to account creation
          </button>
        </section>
      )}
    </div>
  );
}
