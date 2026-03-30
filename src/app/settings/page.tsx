"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";

// ─── Main page ─────────────────────────────────────────────────────────────────

function SettingsPageContent() {
  const router = useRouter();
  const clerkAuth = useClerkAuth();
  const { user, signOut } = useAuth();

  // Redirect if not authenticated
  useEffect(() => {
    if (!clerkAuth.sessionId) {
      router.push("/sign-in");
    }
  }, [clerkAuth.sessionId, router]);

  const userEmail =
    user?.emailAddresses?.[0]?.emailAddress || "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
        paddingTop: "100px",
        paddingBottom: "80px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 clamp(20px, 5vw, 40px)" }}>

        {/* Page header */}
        <div style={{ marginBottom: "40px" }}>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.15em",
              color: "var(--color-accent-amber)",
              textTransform: "uppercase",
              marginBottom: "10px",
            }}
          >
            Account
          </p>
          <h1
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(28px, 5vw, 36px)",
              fontWeight: 700,
              color: "var(--color-cream)",
              lineHeight: 1.2,
              marginBottom: "8px",
            }}
          >
            Settings
          </h1>
          {userEmail && (
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                color: "var(--color-text-tertiary)",
              }}
            >
              {userEmail}
            </p>
          )}
        </div>

        {/* ── Account ── */}
        <div
          style={{
            background: "var(--color-card-bg)",
            border: "1px solid var(--color-card-border)",
            borderRadius: "12px",
            padding: "28px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--color-cream)",
              marginBottom: "16px",
            }}
          >
            Account
          </h2>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "var(--color-text-tertiary)",
                  marginBottom: "4px",
                }}
              >
                Signed in as
              </p>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                }}
              >
                {userEmail}
              </p>
            </div>
            <button
              onClick={() => signOut()}
              style={{
                padding: "10px 20px",
                borderRadius: "6px",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "var(--color-text-secondary)",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <Navigation />
      <SettingsPageContent />
      <Footer />
    </>
  );
}
