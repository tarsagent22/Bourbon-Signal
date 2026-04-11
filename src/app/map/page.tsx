"use client";

import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

export default function MapPage() {
  return (
    <>
      <Navigation />
      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-bg-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 clamp(20px, 5vw, 40px)",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>🗺️</div>
          <h1
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(32px, 5vw, 44px)",
              fontWeight: 700,
              color: "var(--color-cream)",
              marginBottom: "16px",
              lineHeight: 1.1,
            }}
          >
CaskSignal Map — Coming Soon
          </h1>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "16px",
              color: "var(--color-text-secondary)",
              marginBottom: "32px",
              lineHeight: 1.6,
            }}
          >
            Interactive store-level tracking across NC, VA, and PA. Available for paying members.
          </p>
          <Link
            href="/pricing"
            style={{
              display: "inline-block",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              fontWeight: 600,
              color: "#0D0B0E",
              padding: "14px 32px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, var(--color-accent-amber) 0%, var(--color-accent-gold) 100%)",
              textDecoration: "none",
              transition: "opacity 300ms ease",
            }}
          >
            View Pricing
          </Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
