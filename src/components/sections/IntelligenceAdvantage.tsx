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
    glow: true,
  },
];

const features = [
  {
    title: "Days of Advance Notice",
    description:
      "Our warehouse monitor catches bottles entering the NC system days before they reach stores. Plan your hunt instead of scrambling.",
  },
  {
    title: "Board-Level Tracking",
    description:
      "Know which specific county board is receiving a shipment. Durham? Wake? Mecklenburg? We tell you where to focus.",
  },
  {
    title: "Store-Level Intel",
    description:
      "Where available, we track inventory at the store level. No more driving to every ABC in the county.",
  },
];

export default function IntelligenceAdvantage() {
  return (
    <section
      className="py-24 px-6"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          heading="See the Whole Picture"
          subheading="Most trackers tell you a bottle dropped. We tell you it's coming."
        />

        {/* Pipeline timeline */}
        <ScrollReveal>
          <div className="relative mb-20 overflow-x-auto">
            <div className="flex items-start justify-between min-w-[600px] px-4 relative">
              {/* Connecting line */}
              <motion.div
                className="absolute top-[28px] left-[60px] right-[60px] h-[2px]"
                style={{ backgroundColor: "rgba(212, 146, 11, 0.2)" }}
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
                      width: "56px",
                      height: "56px",
                      backgroundColor: step.glow
                        ? "rgba(212, 146, 11, 0.15)"
                        : "var(--color-bg-tertiary)",
                      border: step.glow
                        ? "2px solid var(--color-accent-amber)"
                        : "2px solid var(--color-card-border)",
                      boxShadow: step.glow
                        ? "0 0 20px rgba(212, 146, 11, 0.2)"
                        : "none",
                    }}
                  >
                    <step.icon
                      size={24}
                      style={{
                        color: step.glow
                          ? "var(--color-accent-amber)"
                          : "var(--color-text-tertiary)",
                      }}
                    />
                  </div>
                  <span
                    className="mb-2"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {step.label}
                  </span>
                  {step.note && (
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "12px",
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
              <GlassCard className="h-full">
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
                    fontSize: "16px",
                    lineHeight: 1.6,
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
