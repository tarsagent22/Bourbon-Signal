"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import SectionHeading from "../SectionHeading";
import GlassCard from "../GlassCard";
import Badge from "../Badge";
import Button from "../Button";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

const freeFeatures = [
  "Delayed drop alerts (24-48 hr)",
  "Public drop feed access",
  "3-bottle watchlist",
  "Basic dashboard",
];

const proFeatures = [
  "Instant drop alerts — email + SMS",
  "Unlimited watchlist",
  "Full hunt map with store-level data",
  "Warehouse & shipment tracking",
  "Secondary market pricing",
  "Historical drop patterns",
  "Community store intel",
  "Priority support",
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      className="py-24 px-6"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div className="mx-auto max-w-[900px]">
        <SectionHeading heading="Choose Your Level" />

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Free Trial */}
          <motion.div variants={fadeUpVariant}>
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
                Free Trial
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
                  $0
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
                for 7 days
              </p>

              <ul className="space-y-3 mb-8">
                {freeFeatures.map((feature) => (
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
                Start Free Trial
              </Button>
            </GlassCard>
          </motion.div>

          {/* High Proof */}
          <motion.div variants={fadeUpVariant}>
            <div className="relative">
              {/* Ambient glow behind card */}
              <div
                className="absolute inset-0 -m-4 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(212, 146, 11, 0.1) 0%, transparent 70%)",
                  borderRadius: "20px",
                }}
              />
              <GlassCard accent className="relative h-full p-8">
                <div className="mb-4">
                  <Badge variant="allocated">FOUNDING RATE</Badge>
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
                  High Proof
                </h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "48px",
                      fontWeight: 700,
                      color: "var(--color-accent-amber)",
                    }}
                  >
                    $7.99
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
                  <span style={{ textDecoration: "line-through" }}>
                    $14.99/mo
                  </span>{" "}
                  after founding period
                </p>

                <ul className="space-y-3 mb-8">
                  {proFeatures.map((feature) => (
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
                  Join the Hunt — $7.99/mo
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
                  First 100 members lock this rate forever.
                </p>
              </GlassCard>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
