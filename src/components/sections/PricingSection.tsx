"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";
import { FOUNDING_SPOTS_REMAINING } from "@/data/config";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import {
  STANDARD_ANNUAL_PRICE,
  STANDARD_ANNUAL_SAVINGS,
  STANDARD_FEATURES,
  STANDARD_MONTHLY_PRICE,
  FOUNDER_ACCESS_LINE,
} from "@/lib/pricing-copy";

const founderExclusives = [
  "Inner Circle, private founding Telegram",
  "Numbered Glencairn Topper (#001-100)",
  "Permanent Founder badge on your profile",
  "Exclusive sticker pack",
  "2x entries in all future drawings",
];

const TESTER_MODE = true;

export default function PricingSection() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  const handleCheckout = async (plan: "monthly" | "annual" | "founder") => {
    if (TESTER_MODE) {
      router.push("/dashboard");
      return;
    }
    if (!isSignedIn) {
      router.push(`/sign-up?redirect_url=${encodeURIComponent(`/pricing?checkout=${plan}`)}`);
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
    <section
      id="pricing"
      style={{
        background: "var(--color-bg-primary)",
        paddingTop: "64px",
        paddingBottom: "64px",
        width: "100%",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "860px",
          paddingLeft: "clamp(16px, 4vw, 48px)",
          paddingRight: "clamp(16px, 4vw, 48px)",
        }}
      >
        <h2
          className="text-center mb-3"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "44px",
            fontWeight: 700,
            color: "var(--color-cream)",
            textShadow: "0 0 40px rgba(196,148,58,0.2)",
          }}
        >
          Choose Your Proof
        </h2>
        <div className="mb-12" />

        <motion.div
          className="flex flex-col md:flex-row gap-6"
          style={{ alignItems: "stretch" }}
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          <motion.div variants={fadeUpVariant} className="order-2 md:order-1" style={{ flex: 1, display: "flex" }}>
            <motion.div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                flex: 1,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid #2A2520",
                borderRadius: "16px",
                padding: "36px",
                paddingTop: "50px",
              }}
              whileHover={{ y: -3, boxShadow: "0 8px 30px rgba(0,0,0,0.3)", transition: { duration: 0.3 } }}
            >
              <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "rgba(245,237,214,0.4)", marginBottom: "8px" }}>
                STANDARD PROOF
              </p>

              <div className="flex items-baseline gap-2 mb-1">
                <span style={{ fontFamily: "var(--font-playfair)", fontSize: "56px", fontWeight: 700, color: "var(--color-cream)" }}>{TESTER_MODE ? "Free" : "$5"}</span>
                <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "16px", color: "rgba(245,237,214,0.4)" }}>{TESTER_MODE ? "testing" : "/mo"}</span>
              </div>

              <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "rgba(245,237,214,0.42)", marginBottom: "8px" }}>
                {TESTER_MODE ? "Tester access is open while we validate signal quality." : `Or ${STANDARD_ANNUAL_PRICE}, ${STANDARD_ANNUAL_SAVINGS}.`}
              </p>

              <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "rgba(245,237,214,0.3)", marginBottom: "28px" }}>
                Built for hunters who want cleaner signals and less wasted chasing.
              </p>

              <div style={{ display: "flex", flexDirection: "column" as const }}>
                {STANDARD_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-start" style={{ gap: "10px", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span className="shrink-0" style={{ color: "#5A5550", fontSize: "16px", width: "16px" }}>✓</span>
                    <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "rgba(245,237,214,0.7)" }}>{feature}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "auto", paddingTop: "24px", display: "grid", gap: 10 }}>
                <button onClick={() => handleCheckout("monthly")} style={{ display: "block", width: "100%", boxSizing: "border-box", cursor: "pointer", background: "rgba(196,148,58,0.08)", border: "1px solid rgba(196,148,58,0.4)", color: "rgba(196,148,58,0.9)", fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 500, padding: "13px", borderRadius: "10px", textAlign: "center" }}>
                  {TESTER_MODE ? "Open free dashboard" : `Start monthly, ${STANDARD_MONTHLY_PRICE}`}
                </button>
                <button onClick={() => handleCheckout("annual")} style={{ display: "block", width: "100%", boxSizing: "border-box", cursor: "pointer", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.12)", color: "var(--color-cream)", fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 500, padding: "13px", borderRadius: "10px", textAlign: "center" }}>
                  {TESTER_MODE ? "Build alert setup" : `Go annual, ${STANDARD_ANNUAL_PRICE}`}
                </button>
                <p className="text-center" style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "rgba(245,237,214,0.35)", marginTop: "10px" }}>
                  {TESTER_MODE ? "No payment required during tester validation." : "Same access either way. Annual saves you money."}
                </p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div variants={fadeUpVariant} className="order-1 md:order-2" style={{ flex: 1, display: "flex" }}>
            <motion.div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                flex: 1,
                background: "rgba(196,148,58,0.06)",
                border: "2px solid var(--color-amber-rich)",
                borderRadius: "16px",
                overflow: "hidden",
                padding: 0,
                boxShadow: "0 0 60px rgba(196,148,58,0.12), 0 0 120px rgba(196,148,58,0.06)",
              }}
              whileHover={{ y: -3, boxShadow: "0 0 80px rgba(196,148,58,0.18), 0 0 140px rgba(196,148,58,0.1)", transition: { duration: 0.3 } }}
            >
              <div style={{ width: "100%", backgroundColor: "var(--color-amber-rich)", color: "#0D0B07", fontFamily: "var(--font-dm-sans)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "8px 0", textAlign: "center" }}>
                Founding Member
              </div>

              <div style={{ padding: "36px", display: "flex", flexDirection: "column" as const, flex: 1 }}>
                <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--color-amber-rich)", marginBottom: "8px" }}>
                  BOTTLED IN BOND
                </p>

                <div className="flex items-baseline gap-2 mb-2">
                  <span style={{ fontFamily: "var(--font-playfair)", fontSize: "64px", fontWeight: 700, color: "var(--color-amber-rich)" }}>{TESTER_MODE ? "Free" : "$39"}</span>
                  <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "16px", color: "rgba(245,237,214,0.5)" }}>{TESTER_MODE ? "access" : "one-time"}</span>
                </div>

                <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "rgba(245,237,214,0.72)", marginBottom: "8px" }}>
                  {TESTER_MODE ? "Help validate live signals before paid launch." : "Lock in founder pricing once and keep your access."}
                </p>
                <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "rgba(245,237,214,0.36)", marginBottom: "28px" }}>
                  {FOUNDER_ACCESS_LINE}
                </p>

                <div style={{ display: "flex", flexDirection: "column" as const }}>
                  <div className="flex items-start" style={{ gap: "10px", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span className="shrink-0" style={{ color: "var(--color-amber-rich)", fontSize: "16px", width: "16px" }}>✓</span>
                    <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "rgba(245,237,214,0.82)" }}>{FOUNDER_ACCESS_LINE}</span>
                  </div>
                  {founderExclusives.map((feature) => (
                    <div key={feature} className="flex items-start" style={{ gap: "10px", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span className="shrink-0" style={{ color: "var(--color-amber-rich)", fontSize: "16px", width: "16px" }}>✓</span>
                      <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "rgba(245,237,214,0.82)" }}>{feature}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: "auto", paddingTop: "24px" }}>
                  <button onClick={() => handleCheckout("founder")} style={{ display: "block", width: "100%", boxSizing: "border-box", cursor: "pointer", background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)", color: "#1A1510", fontFamily: "var(--font-dm-sans)", fontSize: "15px", fontWeight: 700, padding: "14px", border: "none", borderRadius: "10px", textAlign: "center" }}>
                    {TESTER_MODE ? "Join tester flow" : "Claim your founder spot, $39"}
                  </button>
                  <p className="text-center" style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "rgba(245,237,214,0.42)", marginTop: "10px" }}>
                    {TESTER_MODE ? "Founder pricing returns after the free testing period." : `${FOUNDING_SPOTS_REMAINING} of 100 spots remaining`}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
