"use client";

import { Suspense } from "react";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import { MEMBERSHIP_COPY } from "@/lib/site-mode";

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
        <section style={{ width: "100%", minHeight: "72vh", paddingTop: "140px", paddingBottom: "88px", display: "grid", placeItems: "center" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 clamp(20px, 5vw, 48px)", textAlign: "center" }}>
            <ScrollReveal>
              <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-amber)" }}>
                {MEMBERSHIP_COPY.testerLabel}
              </p>
              <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 6vw, 62px)", lineHeight: 1.02, fontWeight: 700, color: "var(--color-cream)", margin: "14px auto 16px" }}>
                Tester access is focused on product feedback right now.
              </h1>
              <p style={{ margin: "0 auto", maxWidth: 680, fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.8, color: "var(--color-text-secondary)" }}>
                Paid membership details are hidden on this branch so testers can try the dashboard, alerts, Bottle Check tracking, collection, and recommendations without pricing noise.
              </p>
              <a
                href="/dashboard"
                style={{ marginTop: 28, display: "inline-flex", background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)", color: "#1A1510", fontFamily: "var(--font-dm-sans)", fontSize: 15, fontWeight: 800, padding: "14px 22px", borderRadius: 10, textDecoration: "none" }}
              >
                Open tester dashboard
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
