"use client";

import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import PricingCards from "@/components/sections/PricingCards";
import FeatureComparison from "@/components/sections/FeatureComparison";
import FAQ from "@/components/sections/FAQ";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

export default function PricingPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  const handleCheckout = async (plan: "monthly" | "annual" | "founder") => {
    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=/pricing`);
      return;
    }
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  return (
    <>
      <Navigation />
      <motion.main
        className="overflow-x-hidden"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Section 1: Page Header */}
        <section
          style={{
            width: "100%",
            paddingTop: "120px",
            paddingBottom: "0",
          }}
        >
          <div
            style={{
              maxWidth: 1000,
              margin: "0 auto",
              padding: "0 clamp(20px, 5vw, 48px)",
              textAlign: "center",
            }}
          >
            <ScrollReveal>
              <h1
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(32px, 5vw, 48px)",
                  fontWeight: 700,
                  color: "var(--color-cream)",
                  marginBottom: "48px",
                  textAlign: "center",
                }}
              >
                Choose Your Proof
              </h1>
            </ScrollReveal>
          </div>
        </section>

        {/* Section 2: Pricing Cards */}
        <PricingCards />

        {/* Section 3: Feature Comparison */}
        <FeatureComparison />

        {/* Section 4: FAQ */}
        <FAQ />

        {/* Section 6: Final CTA */}
        <section
          style={{
            width: "100%",
            paddingTop: "48px",
            paddingBottom: "96px",
          }}
        >
          <div
            style={{
              maxWidth: 600,
              margin: "0 auto",
              padding: "0 clamp(20px, 5vw, 48px)",
              textAlign: "center",
            }}
          >
            <ScrollReveal>
              <h2
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(24px, 4vw, 32px)",
                  fontWeight: 700,
                  color: "var(--color-cream)",
                  marginBottom: "12px",
                  textAlign: "center",
                }}
              >
                The hunt starts now.
              </h2>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                  marginBottom: "24px",
                  textAlign: "center",
                }}
              >
                100 founding spots. $69. Lifetime.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => handleCheckout("founder")}
                  style={{
                    width: "100%",
                    maxWidth: "320px",
                    cursor: "pointer",
                    background:
                      "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    color: "#1A1510",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    fontWeight: 700,
                    padding: "16px",
                    border: "none",
                    borderRadius: "10px",
                    boxShadow: "0 4px 20px rgba(196,148,58,0.3)",
                    transition: "box-shadow 300ms, transform 300ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 6px 30px rgba(196,148,58,0.5)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 4px 20px rgba(196,148,58,0.3)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  Claim Your Spot — $39
                </button>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    color: "var(--color-text-tertiary)",
                    textAlign: "center",
                  }}
                >
                  7-day money-back guarantee. Cancel anytime.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </motion.main>
      <Footer />
    </>
  );
}
