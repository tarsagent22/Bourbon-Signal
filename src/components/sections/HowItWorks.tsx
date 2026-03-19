"use client";

import { motion } from "framer-motion";
import { Radar, Zap, Trophy } from "lucide-react";
import SectionHeading from "../SectionHeading";
import GlassCard from "../GlassCard";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

const steps = [
  {
    icon: Radar,
    title: "We Track Everything",
    description:
      "Our engine monitors the NC ABC warehouse every 15 minutes, tracks shipments to local county boards, and watches store-level inventory. We see bottles enter the system days before they hit shelves.",
  },
  {
    icon: Zap,
    title: "You Get Alerted",
    description:
      "The moment a bottle on your watchlist moves — warehouse arrival, board shipment, store shelf — you get an alert. Email and SMS, your choice. No more refreshing Facebook groups.",
  },
  {
    icon: Trophy,
    title: "You Score the Bottle",
    description:
      "Our hunt map shows you exactly where to go. Store-level intel, historical drop patterns, and community confirmations mean you show up when it matters.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-8 md:px-16 lg:px-24" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          heading="How Proof Works"
          subheading="From warehouse to your watchlist in three steps."
        />

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {steps.map((step) => (
            <motion.div key={step.title} variants={fadeUpVariant}>
              <GlassCard className="h-full text-center">
                <step.icon
                  size={40}
                  style={{ color: "var(--color-accent-amber)" }}
                  className="mx-auto mb-5"
                />
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
                  {step.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "16px",
                    lineHeight: 1.7,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {step.description}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
