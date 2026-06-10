"use client";

import { Suspense } from "react";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import FAQ from "@/components/sections/FAQ";
import { MEMBERSHIP_COPY } from "@/lib/site-mode";
import {
  BARREL_ANNUAL_PRICE,
  BARREL_FEATURES,
  BARREL_MONTHLY_PRICE,
  FOUNDER_FEATURES,
  FOUNDER_PRICE,
  FREE_FEATURES,
  STANDARD_ANNUAL_PRICE,
  STANDARD_FEATURES,
  STANDARD_MONTHLY_PRICE,
} from "@/lib/pricing-copy";

type TierTone = "muted" | "standard" | "barrel" | "founder";

function PlanCard({
  eyebrow,
  title,
  price,
  body,
  features,
  tone = "standard",
}: {
  eyebrow: string;
  title: string;
  price: string;
  body: string;
  features: string[];
  tone?: TierTone;
}) {
  const featured = tone === "barrel" || tone === "founder";
  const border = tone === "founder"
    ? "1px solid rgba(212,146,11,0.58)"
    : tone === "barrel"
      ? "1px solid rgba(196,148,58,0.42)"
      : "1px solid rgba(255,255,255,0.08)";

  return (
    <div
      style={{
        flex: "1 1 250px",
        minWidth: 260,
        borderRadius: 22,
        border,
        background: featured
          ? "linear-gradient(180deg, rgba(45,32,17,0.92), rgba(15,12,9,0.98))"
          : "rgba(255,255,255,0.03)",
        boxShadow: featured ? "0 0 60px rgba(196,148,58,0.10)" : "none",
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div>
        <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: featured ? "var(--color-accent-amber)" : "var(--color-text-tertiary)" }}>
          {eyebrow}
        </p>
        <h2 style={{ margin: "12px 0 8px", fontFamily: "var(--font-playfair)", fontSize: 32, lineHeight: 1.05, color: "var(--color-cream)" }}>
          {title}
        </h2>
        <div style={{ fontFamily: "var(--font-playfair)", fontSize: 34, fontWeight: 800, color: featured ? "var(--color-accent-amber)" : "var(--color-text-primary)" }}>
          {price}
        </div>
        <p style={{ margin: "12px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: 14, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
          {body}
        </p>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {features.map((feature) => (
          <div key={feature} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: "var(--font-dm-sans)", fontSize: 14, color: "rgba(245,237,214,0.78)" }}>
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
        <section style={{ width: "100%", paddingTop: "120px", paddingBottom: "44px" }}>
          <div style={{ maxWidth: 980, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)", textAlign: "center" }}>
            <ScrollReveal>
              <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-amber)" }}>
                {MEMBERSHIP_COPY.testerLabel}
              </p>
              <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 6vw, 62px)", lineHeight: 1.02, fontWeight: 700, color: "var(--color-cream)", margin: "14px auto 16px", maxWidth: 780 }}>
                {MEMBERSHIP_COPY.testerHeadline}
              </h1>
              <p style={{ margin: "0 auto", maxWidth: 760, fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.8, color: "var(--color-text-secondary)" }}>
                {MEMBERSHIP_COPY.testerBody}
              </p>
            </ScrollReveal>
          </div>
        </section>

        <section style={{ width: "100%", padding: "10px 0 64px" }}>
          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)" }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "stretch" }}>
              <PlanCard
                eyebrow="Free"
                title="Public Signal"
                price="Free"
                body="A public proof-of-life layer for casual followers and future members."
                features={FREE_FEATURES}
                tone="muted"
              />
              <PlanCard
                eyebrow={MEMBERSHIP_COPY.standardStatus}
                title={MEMBERSHIP_COPY.standardName}
                price={`${STANDARD_MONTHLY_PRICE} · ${STANDARD_ANNUAL_PRICE}`}
                body={MEMBERSHIP_COPY.standardBody}
                features={STANDARD_FEATURES}
              />
              <PlanCard
                eyebrow={MEMBERSHIP_COPY.barrelStatus}
                title={MEMBERSHIP_COPY.barrelName}
                price={`${BARREL_MONTHLY_PRICE} · ${BARREL_ANNUAL_PRICE}`}
                body={MEMBERSHIP_COPY.barrelBody}
                features={BARREL_FEATURES}
                tone="barrel"
              />
              <PlanCard
                eyebrow={MEMBERSHIP_COPY.founderStatus}
                title={MEMBERSHIP_COPY.founderName}
                price={`${FOUNDER_PRICE} once`}
                body={MEMBERSHIP_COPY.founderBody}
                features={FOUNDER_FEATURES}
                tone="founder"
              />
            </div>
          </div>
        </section>

        <section style={{ width: "100%", padding: "0 0 72px" }}>
          <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)", textAlign: "center" }}>
            <ScrollReveal>
              <h2 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 700, color: "var(--color-cream)", marginBottom: 12 }}>
                Founder is intentionally generous.
              </h2>
              <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                Bottled-in-Bond is for the earliest adopters who help shape the product. They get Barrel Proof treatment for a fraction of the cost because their feedback, loyalty, and momentum matter most right now.
              </p>
            </ScrollReveal>
          </div>
        </section>

        <FAQ />
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
