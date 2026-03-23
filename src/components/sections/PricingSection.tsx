"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

const standardFeatures = [
  "Instant drop alerts — email + SMS",
  "Unlimited watchlist",
  "Full hunt map with store-level data",
  "Warehouse & shipment tracking",
  "Secondary market pricing",
  "Historical drop patterns",
  "Community store intel",
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
      className="py-24 px-6"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div className="mx-auto" style={{ maxWidth: "860px" }}>
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
        <p
          className="text-center mb-12"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "16px",
            color: "rgba(245,237,214,0.5)",
          }}
        >
          Two ways to hunt. One clear choice.
        </p>

        {/* Cards */}
        <motion.div
          className="flex flex-col md:flex-row gap-6 items-stretch"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Standard Proof */}
          <motion.div variants={fadeUpVariant} className="flex-1 order-2 md:order-1">
            <motion.div
              className="h-full"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                padding: "36px",
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
                  marginBottom: "12px",
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
                  $10
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
                $80/year · save 33%
              </p>

              {/* Features */}
              <ul className="mb-8" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {standardFeatures.map((feature) => (
                  <li key={feature} className="flex items-start" style={{ gap: "10px" }}>
                    <span
                      className="shrink-0 flex items-center justify-center"
                      style={{
                        width: "20px",
                        color: "rgba(245,237,214,0.4)",
                        fontSize: "20px",
                        lineHeight: 1,
                      }}
                    >
                      ·
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
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className="w-full cursor-pointer"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(196,148,58,0.4)",
                  color: "var(--color-amber-rich)",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "15px",
                  fontWeight: 600,
                  padding: "14px",
                  borderRadius: "10px",
                  transition: "border-color 200ms, background 200ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-amber-rich)";
                  e.currentTarget.style.background = "rgba(196,148,58,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(196,148,58,0.4)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Start Hunting — $10/mo
              </button>
            </motion.div>
          </motion.div>

          {/* Barrel Proof (hero card) */}
          <motion.div variants={fadeUpVariant} className="flex-1 order-1 md:order-2">
            <motion.div
              className="h-full relative overflow-visible"
              style={{
                background: "rgba(196,148,58,0.06)",
                border: "2px solid var(--color-amber-rich)",
                borderRadius: "16px",
                padding: "36px",
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
              {/* Ribbon badge */}
              <div
                style={{
                  position: "absolute",
                  top: "-1px",
                  right: "24px",
                  background: "var(--color-amber-rich)",
                  color: "#0D0B07",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "6px 14px",
                  borderRadius: "0 0 8px 8px",
                  letterSpacing: "0.1em",
                }}
              >
                FOUNDING MEMBER
              </div>

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
                  $69
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
                Exactly 100 spots. When they are gone, they are gone.
              </p>

              {/* Scarcity progress bar */}
              <div style={{ marginTop: "16px" }}>
                <div className="flex justify-between">
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "11px",
                      color: "rgba(245,237,214,0.5)",
                    }}
                  >
                    Founding spots remaining
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "11px",
                      color: "var(--color-amber-rich)",
                    }}
                  >
                    100 of 100
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "4px",
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: "2px",
                    marginTop: "6px",
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    style={{
                      height: "100%",
                      background: "var(--color-amber-rich)",
                      borderRadius: "2px",
                    }}
                    initial={{ width: "0%" }}
                    whileInView={{ width: "100%" }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Feature divider: ALL STANDARD PROOF FEATURES + */}
              <div
                className="relative flex items-center justify-center"
                style={{ margin: "24px 0" }}
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
                  ALL STANDARD PROOF FEATURES +
                </span>
              </div>

              {/* All standard features */}
              <ul style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {standardFeatures.map((feature) => (
                  <li key={feature} className="flex items-start" style={{ gap: "10px" }}>
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
                  </li>
                ))}
              </ul>

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
              <ul style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {founderExclusives.map((feature) => (
                  <li key={feature} className="flex items-start" style={{ gap: "10px" }}>
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
                  </li>
                ))}
              </ul>

              {/* Social proof */}
              <p
                className="text-center"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  fontStyle: "italic",
                  color: "rgba(245,237,214,0.4)",
                  marginTop: "16px",
                }}
              >
                Become the first founding member.
              </p>

              {/* CTA */}
              <button
                className="w-full cursor-pointer"
                style={{
                  marginTop: "16px",
                  background:
                    "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)",
                  backgroundSize: "200%",
                  backgroundPosition: "left center",
                  color: "#0D0B07",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "15px",
                  fontWeight: 700,
                  padding: "16px",
                  borderRadius: "10px",
                  border: "none",
                  transition: "background-position 300ms, box-shadow 300ms, transform 300ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundPosition = "right center";
                  e.currentTarget.style.boxShadow = "0 0 24px rgba(196,148,58,0.4)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundPosition = "left center";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Claim Your Spot — $69
              </button>

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
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Bottom note */}
        <p
          className="text-center"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: "rgba(245,237,214,0.3)",
            marginTop: "32px",
          }}
        >
          No account needed to browse the public drop feed.
        </p>
      </div>
    </section>
  );
}
