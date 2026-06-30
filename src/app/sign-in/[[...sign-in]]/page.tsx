"use client";

import { SignIn } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

function safeRedirectUrl(value: string | null) {
  if (!value) return "/dashboard";
  try {
    if (value.startsWith("/")) return value.startsWith("//") ? "/dashboard" : value;
    const url = new URL(value);
    if (typeof window !== "undefined" && url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
  return "/dashboard";
}

export default function SignInPage() {
  const searchParams = useSearchParams();
  const redirectUrl = safeRedirectUrl(searchParams.get("redirect_url"));
  const encodedRedirect = encodeURIComponent(redirectUrl);
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(20px, 5vw, 40px)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-baseline gap-0 mb-10"
        style={{ marginBottom: "40px" }}
      >
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

      <SignIn forceRedirectUrl={redirectUrl} signUpForceRedirectUrl={redirectUrl} signUpUrl={`/sign-up?redirect_url=${encodedRedirect}`} />
    </div>
  );
}
