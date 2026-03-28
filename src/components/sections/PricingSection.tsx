"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";
import { FOUNDING_SPOTS_REMAINING } from "@/data/config";

const standardFeatures = [
  "Personalized drop alerts — your bottles, your stores",
  "Watchlist — track the exact bottles you're hunting",
  "Store alerts — only stores within your range",
  "Secondary market pricing",
];

const comingSoonFeatures = [
  "Hunt map with store-level data",
  "Member dashboard",
];

const founderExclusives = [
  "Inner Circle — private founding Telegram",
  "Numbered Glencairn Topper (#001–100)",
  "Permanent Founder badge on your profile",
  "Exclusive sticker pack",
  "2× entries in all future drawings",
];

export default function PricingSection() {
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
        {/* Heading */}
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

        {/* Cards */}
        <motion.div
          className="flex flex-col md:flex-row gap-6"
          style={{ alignItems: "stretch" }}
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Standard Proof */}
          <motion.div
            variants={fadeUpVariant}
            className="order-2 md:order-1"
            style={{ flex: 1, display: "flex" }}
          >
            <motion.div
              style={{
                display: "flex",
                flexDirection: "column" as const,
                flex: 1,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid #2A2520",
                borderRadius: "16px",
                padding: "36px",
                paddingTop: "65px",
              }}
              whileHover={{
                y: -3,
                boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
                transition: { duration: 0.3 },
              }}
            >
              {/* Tier label */}
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "rgba(245,237,214,0.4)",
                  marginBottom: "8px",
                }}
              >
                STANDARD PROOF
              </p>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-1">
                <span
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "56px",
                    fontWeight: 700,
                    color: "var(--color-cream)",
                  }}
                >
                  $5
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    color: "rgba(245,237,214,0.4)",
                  }}
                >
                  /mo
                </span>
              </div>

              {/* Annual note */}
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "rgba(245,237,214,0.3)",
                  marginBottom: "28px",
                }}
              >
                $40/year · save 33%
              </p>

              {/* Features */}
              <div style={{ display: "flex", flexDirection: "column" as const }}>
                {standardFeatures.map((feature, i) => (
                  <div
                    key={feature}
                    className="flex items-start"
                    style={{
                      gap: "10px",
                      padding: "9px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <span
                      className="shrink-0"
                      style={{
                        color: "#5A5550",
                        fontSize: "16px",
                        width: "16px",
                      }}
                    >
                      ✓
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        color: "rgba(245,237,214,0.7)",
                      }}
                    >
                      {feature}
                    </span>
                  </div>
                ))}
                {comingSoonFeatures.map((feature) => (
                  <div
                    key={feature}
                    className="flex items-start"
                    style={{
                      gap: "10px",
                      padding: "9px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <span
                      className="shrink-0"
                      style={{
                        color: "rgba(196,148,58,0.4)",
                        fontSize: "16px",
                        width: "16px",
                      }}
                    >
                      ◎
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        color: "rgba(245,237,214,0.4)",
                        fontStyle: "italic",
                      }}
                    >
                      {feature} <span style={{ fontSize: "11px", color: "rgba(196,148,58,0.5)" }}>coming soon</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA — pushed to bottom */}
              <div style={{ marginTop: "auto", paddingTop: "24px" }}>
                <a
                  href="/pricing"
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    cursor: "pointer",
                    background: "rgba(196,148,58,0.08)",
                    border: "1px solid rgba(196,148,58,0.4)",
                    color: "rgba(196,148,58,0.9)",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    fontWeight: 500,
                    padding: "13px",
                    borderRadius: "10px",
                    transition: "border-color 200ms, background 200ms, color 200ms",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(196,148,58,0.7)";
                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(196,148,58,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(196,148,58,0.4)";
                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(196,148,58,0.08)";
                  }}
                >
                  Start Free Trial
                </a>
                <p
                  className="text-center"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    color: "rgba(245,237,214,0.35)",
                    marginTop: "10px",
                  }}
                >
                  7 days free · Cancel anytime · No card required
                </p>
              </div>
            </motion.div>
          </motion.div>

          {/* Barrel Proof (hero card) */}
          <motion.div
            variants={fadeUpVariant}
            className="order-1 md:order-2"
            style={{ flex: 1, display: "flex" }}
          >
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
                boxShadow:
                  "0 0 60px rgba(196,148,58,0.12), 0 0 120px rgba(196,148,58,0.06)",
                animation: "borderPulse 3s ease infinite",
              }}
              whileHover={{
                y: -3,
                boxShadow:
                  "0 0 80px rgba(196,148,58,0.18), 0 0 140px rgba(196,148,58,0.1)",
                transition: { duration: 0.3 },
              }}
            >
              {/* Founding Member ribbon — full width strip inside card */}
              <div
                style={{
                  width: "100%",
                  backgroundColor: "var(--color-amber-rich)",
                  color: "#0D0B07",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "8px 0",
                  textAlign: "center",
                }}
              >
                Founding Member
              </div>

              {/* Card content */}
              <div style={{ padding: "36px", display: "flex", flexDirection: "column" as const, flex: 1 }}>

              {/* Tier label */}
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "var(--color-amber-rich)",
                  marginBottom: "8px",
                }}
              >
                BOTTLED IN BOND
              </p>

              {/* Price */}
              <div className="flex items-baseline gap-2 mb-2">
                <span
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "64px",
                    fontWeight: 700,
                    color: "var(--color-amber-rich)",
                  }}
                >
                  $39
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    color: "rgba(245,237,214,0.5)",
                  }}
                >
                  one-time
                </span>
              </div>

              {/* Tagline */}
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--color-cream)",
                  marginBottom: "4px",
                }}
              >
                Lifetime access. No monthly fees. Ever.
              </p>

              {/* Scarcity note */}
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  fontStyle: "italic",
                  color: "rgba(196,148,58,0.8)",
                }}
              >
                Exactly 100 spots. When they're gone, they're gone.
              </p>

              {/* Scarcity progress bar */}
              <div style={{ marginTop: "16px", marginBottom: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "11px", color: "rgba(245,237,214,0.5)" }}>Founding spots remaining</span>
                  <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-amber-rich)" }}>{FOUNDING_SPOTS_REMAINING} / 100</span>
                </div>
                <div style={{ width: "100%", height: "4px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "2px" }}>
                  <motion.div
                    style={{
                      height: "4px",
                      backgroundColor: "var(--color-amber-rich)",
                      borderRadius: "2px",
                      originX: 0,
                      boxShadow: "0 0 8px rgba(196,148,58,0.6)",
                      animation: "barPulse 2s ease infinite",
                    }}
                    initial={{ width: "0%" }}
                    whileInView={{ width: `${100 - FOUNDING_SPOTS_REMAINING}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Collapsed standard features — single line */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", marginTop: "16px" }}>
                <span style={{ color: "var(--color-amber-rich)", fontSize: "16px" }}>✓</span>
                <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-cream)", fontWeight: 500 }}>
                  All Standard Proof features, forever
                </span>
              </div>

              {/* Founding exclusives divider */}
              <div
                className="relative flex items-center justify-center"
                style={{ margin: "20px 0" }}
              >
                <div
                  style={{
                    position: "absolute",
                    width: "100%",
                    height: "1px",
                    background: "rgba(196,148,58,0.15)",
                  }}
                />
                <span
                  style={{
                    position: "relative",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    color: "rgba(196,148,58,0.5)",
                    background: "var(--color-bg-secondary)",
                    padding: "0 12px",
                  }}
                >
                  FOUNDING MEMBER EXCLUSIVES
                </span>
              </div>

              {/* Founder exclusives */}
              <div style={{ display: "flex", flexDirection: "column" as const }}>
                {founderExclusives.map((feature, i) => (
                  <div
                    key={feature}
                    className="flex items-start"
                    style={{
                      gap: "10px",
                      padding: "9px 0",
                      borderBottom:
                        i < founderExclusives.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    <span
                      className="shrink-0"
                      style={{
                        color: "var(--color-amber-rich)",
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "16px",
                        width: "16px",
                      }}
                    >
                      ✓
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        color: "var(--color-cream)",
                      }}
                    >
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA — pushed to bottom */}
              <div style={{ marginTop: "auto", paddingTop: "24px" }}>
                {/* Social proof — sits right above button */}
                <p
                  className="text-center"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 500,
                    fontStyle: "italic",
                    color: "rgba(245,237,214,0.55)",
                    marginBottom: "14px",
                  }}
                >
                  Join the founding 100.
                </p>
                <a
                  href="/pricing"
                  style={{
                    display: "block",
                    width: "100%",
                    boxSizing: "border-box",
                    cursor: "pointer",
                    background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    color: "#1A1510",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    fontWeight: 700,
                    padding: "16px",
                    border: "none",
                    borderRadius: "10px",
                    boxShadow: "0 4px 20px rgba(196,148,58,0.3)",
                    transition: "box-shadow 300ms, transform 300ms",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 6px 30px rgba(196,148,58,0.5)";
                    (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 20px rgba(196,148,58,0.3)";
                    (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
                  }}
                >
                  Claim Your Spot — $39
                </a>
              </div>

              {/* Note below button */}
              <p
                className="text-center"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  color: "rgba(245,237,214,0.35)",
                  marginTop: "10px",
                }}
              >
                Secure checkout · Lifetime access · Never pay again
              </p>
              </div>{/* end card content */}
            </motion.div>
          </motion.div>
        </motion.div>

      </div>
    </section>
  );
}
