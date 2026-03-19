"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import SectionHeading from "../SectionHeading";
import GlassCard from "../GlassCard";
import Badge from "../Badge";
import Button from "../Button";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

const founderFeatures = [
  "Instant drop alerts — email + SMS",
  "Unlimited watchlist",
  "Full hunt map with store-level data",
  "Warehouse & shipment tracking",
  "Secondary market pricing",
  "Historical drop patterns",
  "Community store intel",
  "Priority support",
  "The Inner Circle (private founding Telegram group)",
  "Numbered Glencairn topper (#001-100)",
  "Permanent Founder badge on your profile",
  "Exclusive sticker pack",
  "Bonus entries in all future drawings",
];

const standardFeatures = [
  "Instant drop alerts — email + SMS",
  "Unlimited watchlist",
  "Full hunt map with store-level data",
  "Warehouse & shipment tracking",
  "Secondary market pricing",
  "Historical drop patterns",
  "Community store intel",
];

const freeFeatures = [
  "Public drop feed (delayed 24-48hr)",
  "Bottle reference cards",
  "Basic store locator",
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="py-24 px-8 md:px-16 lg:px-24"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div className="mx-auto max-w-[1200px]">
        <SectionHeading heading="Choose Your Level" />

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Free Tier */}
          <motion.div variants={fadeUpVariant} className="order-2 md:order-1">
            <GlassCard className="h-full">
              <h3
                className="mb-4"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                }}
              >
                Free
              </h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "36px",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Free
                </span>
              </div>
              <p
                className="mb-6"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                }}
              >
                No account required
              </p>

              <ul className="space-y-3 mb-8">
                {freeFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      size={18}
                      className="shrink-0 mt-0.5"
                      style={{ color: "var(--color-text-tertiary)" }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "15px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button variant="ghost" className="w-full opacity-70">
                Browse the Feed
              </Button>
            </GlassCard>
          </motion.div>

          {/* Standard Proof Monthly */}
          <motion.div variants={fadeUpVariant} className="order-3 md:order-2">
            <GlassCard className="h-full">
              <h3
                className="mb-4"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                }}
              >
                Standard Proof
              </h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "48px",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  $10
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  /mo
                </span>
              </div>
              <p
                className="mb-6"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                $80/year (save 33%)
              </p>

              <ul className="space-y-3 mb-8">
                {standardFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      size={18}
                      className="shrink-0 mt-0.5"
                      style={{ color: "var(--color-text-secondary)" }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "15px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button variant="ghost" className="w-full">
                Start Hunting — $10/mo
              </Button>
            </GlassCard>
          </motion.div>

          {/* Bottled-In-Bond Founding Member */}
          <motion.div variants={fadeUpVariant} className="order-1 md:order-3">
            <div className="relative">
              {/* Ambient glow behind card */}
              <div
                className="absolute inset-0 -m-4 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.15) 0%, transparent 70%)",
                  borderRadius: "20px",
                }}
              />
              <GlassCard accent className="relative h-full p-8">
                <div className="mb-4">
                  <Badge variant="allocated">FOUNDING MEMBER</Badge>
                </div>
                <h3
                  className="mb-4"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Bottled-In-Bond
                </h3>
                <div className="flex items-baseline gap-2 mb-1">
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "48px",
                      fontWeight: 700,
                      color: "var(--color-accent-amber)",
                    }}
                  >
                    $69
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "16px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    one-time
                  </span>
                </div>
                <p
                  className="mb-2"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Lifetime access. No monthly fees. Ever.
                </p>
                <p
                  className="mb-6"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontStyle: "italic",
                    color: "var(--color-accent-copper)",
                  }}
                >
                  Exactly 100 spots. When they&apos;re gone, they&apos;re gone.
                </p>

                {/* Live counter */}
                <div
                  className="flex items-center justify-center gap-2 mb-6 rounded-lg py-2 px-4"
                  style={{
                    backgroundColor: "rgba(212, 146, 11, 0.08)",
                    border: "1px solid rgba(212, 146, 11, 0.15)",
                  }}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: "var(--color-accent-amber)",
                      animation: "pulseDot 2s ease-in-out infinite",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                    }}
                  >
                    100 of 100
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "14px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    remaining
                  </span>
                </div>

                <ul className="space-y-3 mb-8">
                  {founderFeatures.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check
                        size={18}
                        className="shrink-0 mt-0.5"
                        style={{ color: "var(--color-accent-amber)" }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-dm-sans)",
                          fontSize: "15px",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button variant="primary" className="w-full">
                  Claim Your Spot — $69
                </Button>
                <p
                  className="mt-4 text-center"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontStyle: "italic",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  100 lifetime spots. This offer will never return.
                </p>
              </GlassCard>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
