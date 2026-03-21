"use client";

import { motion } from "framer-motion";
import { Factory, Warehouse, Building2, Store } from "lucide-react";
import SectionHeading from "../SectionHeading";
import GlassCard from "../GlassCard";
import ScrollReveal from "../ScrollReveal";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

const pipelineSteps = [
  {
    icon: Factory,
    label: "Distillery",
    note: null,
    glow: false,
  },
  {
    icon: Warehouse,
    label: "State Warehouse",
    note: "We detect it here first",
    glow: true,
  },
  {
    icon: Building2,
    label: "Local Board",
    note: "We track the shipment",
    glow: true,
  },
  {
    icon: Store,
    label: "Store Shelf",
    note: "Community confirms it",
    glow: false,
  },
];

const features = [
  {
    title: "Days of Advance Notice",
    description:
      "Our warehouse monitors catch bottles entering state distribution systems days before they reach stores. Plan your hunt instead of scrambling.",
  },
  {
    title: "Board-Level Tracking",
    description:
      "Know which specific distribution board is receiving a shipment. We tell you exactly where to focus your hunt.",
  },
  {
    title: "Store-Level Intel",
    description:
      "Where available, we track inventory at the store level. No more driving to every liquor store in the county.",
  },
];

export default function IntelligenceAdvantage() {
  return (
    <section
      className="py-24 px-6 sm:px-8 md:px-16 lg:px-24"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          heading="See the Whole Picture"
          subheading="Most trackers tell you a bottle dropped. We tell you it's coming."
        />

        {/* Pipeline timeline */}
        <ScrollReveal>
          <div className="relative mb-20">
            {/* Desktop: horizontal layout */}
            <div className="hidden md:flex items-start justify-between px-4 relative">
              {/* Connecting line — horizontal */}
              <motion.div
                className="absolute top-[34px] left-[60px] right-[60px] h-[3px]"
                style={{ backgroundColor: "var(--color-accent-amber-30)", borderRadius: "2px" }}
                initial={{ scaleX: 0, transformOrigin: "left" }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />

              {pipelineSteps.map((step, i) => (
                <motion.div
                  key={step.label}
                  className="flex flex-col items-center text-center relative z-10"
                  style={{ flex: 1 }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2, duration: 0.5 }}
                >
                  <div
                    className="flex items-center justify-center rounded-full mb-3"
                    style={{
                      width: "68px",
                      height: "68px",
                      backgroundColor: step.glow
                        ? "var(--color-accent-amber-15)"
                        : "var(--color-bg-tertiary)",
                      border: step.glow
                        ? "2.5px solid var(--color-accent-amber)"
                        : "2px solid var(--color-card-border)",
                      boxShadow: step.glow
                        ? "0 0 30px var(--color-accent-amber-30), 0 0 60px var(--color-accent-amber-15)"
                        : "none",
                    }}
                  >
                    <step.icon
                      size={30}
                      style={{
                        color: step.glow
                          ? "var(--color-accent-amber)"
                          : "var(--color-text-tertiary)",
                      }}
                    />
                  </div>
                  <span
                    className="mb-2 text-[14px]"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {step.label}
                  </span>
                  {step.note && (
                    <span
                      className="text-[12px]"
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontStyle: "italic",
                        color: "var(--color-accent-copper)",
                        maxWidth: "140px",
                      }}
                    >
                      &ldquo;{step.note}&rdquo;
                    </span>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Mobile: vertical layout */}
            <div className="flex md:hidden flex-col items-center relative">
              {/* Connecting line — vertical */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 top-[34px] bottom-[34px] w-[3px]"
                style={{ backgroundColor: "var(--color-accent-amber-30)", borderRadius: "2px" }}
                initial={{ scaleY: 0, transformOrigin: "top" }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, ease: "easeOut" }}
              />

              {pipelineSteps.map((step, i) => (
                <motion.div
                  key={step.label}
                  className="flex flex-col items-center text-center relative z-10"
                  style={{ marginBottom: i < pipelineSteps.length - 1 ? "32px" : 0 }}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2, duration: 0.5 }}
                >
                  <div
                    className="flex items-center justify-center rounded-full mb-2"
                    style={{
                      width: "60px",
                      height: "60px",
                      backgroundColor: step.glow
                        ? "var(--color-accent-amber-15)"
                        : "var(--color-bg-tertiary)",
                      border: step.glow
                        ? "2.5px solid var(--color-accent-amber)"
                        : "2px solid var(--color-card-border)",
                      boxShadow: step.glow
                        ? "0 0 30px var(--color-accent-amber-30), 0 0 60px var(--color-accent-amber-15)"
                        : "none",
                    }}
                  >
                    <step.icon
                      size={26}
                      style={{
                        color: step.glow
                          ? "var(--color-accent-amber)"
                          : "var(--color-text-tertiary)",
                      }}
                    />
                  </div>
                  <span
                    className="mb-1 text-[13px]"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {step.label}
                  </span>
                  {step.note && (
                    <span
                      className="text-[11px]"
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontStyle: "italic",
                        color: "var(--color-accent-copper)",
                        maxWidth: "180px",
                      }}
                    >
                      &ldquo;{step.note}&rdquo;
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Feature highlights */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {features.map((feature) => (
            <motion.div key={feature.title} variants={fadeUpVariant}>
              <GlassCard className="h-full !p-8">
                <h3
                  className="mb-3"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "24px",
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    lineHeight: 1.65,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {feature.description}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
