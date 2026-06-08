"use client";

import { Suspense } from "react";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import FeatureComparison from "@/components/sections/FeatureComparison";
import FAQ from "@/components/sections/FAQ";
import { MEMBERSHIP_COPY } from "@/lib/site-mode";

function PlanPreviewCard({
  eyebrow,
  title,
  body,
  features,
  featured = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 280,
        borderRadius: 18,
        border: featured ? "1px solid rgba(196,148,58,0.42)" : "1px solid rgba(255,255,255,0.08)",
        background: featured ? "rgba(196,148,58,0.08)" : "rgba(255,255,255,0.03)",
        boxShadow: featured ? "0 0 60px rgba(196,148,58,0.10)" : "none",
        padding: 28,
      }}
    >
      <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: featured ? "var(--color-accent-amber)" : "var(--color-text-tertiary)" }}>
        {eyebrow}
      </p>
      <h2 style={{ margin: "12px 0 10px", fontFamily: "var(--font-playfair)", fontSize: 32, color: "var(--color-cream)" }}>
        {title}
      </h2>
      <p style={{ margin: "0 0 22px", fontFamily: "var(--font-dm-sans)", fontSize: 15, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
        {body}
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {features.map((feature) => (
          <div key={feature} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: "var(--font-dm-sans)", fontSize: 14, color: "rgba(245,237,214,0.76)" }}>
            <span style={{ color: featured ? "var(--color-accent-amber)" : "rgba(245,237,214,0.38)" }}>✓</span>
            <span>{feature}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingPageContent() {
  return (
    <>
      <Navigation />
      <motion.main
        className="overflow-x-hidden"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <section style={{ width: "100%", paddingTop: "120px", paddingBottom: "48px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)", textAlign: "center" }}>
            <ScrollReveal>
              <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-amber)" }}>
                {MEMBERSHIP_COPY.testerLabel}
              </p>
              <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 6vw, 56px)", lineHeight: 1.05, fontWeight: 700, color: "var(--color-cream)", margin: "14px auto 16px", maxWidth: 760 }}>
                {MEMBERSHIP_COPY.testerHeadline}
              </h1>
              <p style={{ margin: "0 auto", maxWidth: 720, fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.8, color: "var(--color-text-secondary)" }}>
                {MEMBERSHIP_COPY.testerBody}
              </p>
            </ScrollReveal>
          </div>
        </section>

        <section style={{ width: "100%", padding: "10px 0 56px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)" }}>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "stretch" }}>
              <PlanPreviewCard
                eyebrow={MEMBERSHIP_COPY.standardStatus}
                title={MEMBERSHIP_COPY.standardName}
                body={MEMBERSHIP_COPY.standardBody}
                features={[
                  "Live member drop feed",
                  "Personal dashboard and watchlist",
                  "Custom bottle and territory alerts",
                  "Bottle Finder for smarter hunts",
                ]}
              />
              <PlanPreviewCard
                eyebrow={MEMBERSHIP_COPY.founderStatus}
                title={MEMBERSHIP_COPY.founderName}
                body={MEMBERSHIP_COPY.founderBody}
                featured
                features={[
                  "Everything in Standard Proof",
                  "Permanent founder badge",
                  "Private founding-member channel",
                  MEMBERSHIP_COPY.founderTease,
                ]}
              />
            </div>
          </div>
        </section>

        <FeatureComparison />
        <FAQ />

        <section style={{ width: "100%", paddingTop: "48px", paddingBottom: "96px" }}>
          <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)", textAlign: "center" }}>
            <ScrollReveal>
              <h2 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(24px, 4vw, 32px)", fontWeight: 700, color: "var(--color-cream)", marginBottom: 12 }}>
                Want in before hard launch?
              </h2>
              <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: 24 }}>
                Join as a founding tester, build your watchlist, and help us tune alert quality before paid memberships open.
              </p>
              <a
                href="/dashboard"
                style={{ display: "inline-flex", background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)", color: "#1A1510", fontFamily: "var(--font-dm-sans)", fontSize: 15, fontWeight: 800, padding: "14px 22px", borderRadius: 10, textDecoration: "none" }}
              >
                Open free setup
              </a>
            </ScrollReveal>
          </div>
        </section>
      </motion.main>
      <Footer />
    </>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageContent />
    </Suspense>
  );
}
