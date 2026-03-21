"use client";

import { motion } from "framer-motion";
import { Radar, Zap, MapPin, Trophy } from "lucide-react";
import SectionHeading from "../SectionHeading";
import GlassCard from "../GlassCard";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

function MiniSparklines() {
  const bars = [35, 55, 42, 68, 80, 62, 90, 75, 85, 95, 70, 88];
  return (
    <div className="flex items-end gap-1 mt-4" style={{ height: "48px" }}>
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            backgroundColor: i >= 8 ? "var(--color-accent-amber)" : "rgba(212, 146, 11, 0.25)",
            minWidth: "6px",
          }}
          initial={{ height: 0 }}
          whileInView={{ height: `${h}%` }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.05, duration: 0.4, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function MiniHuntMap() {
  const dots = [
    { x: "20%", y: "30%", pulse: true },
    { x: "55%", y: "25%", pulse: false },
    { x: "70%", y: "55%", pulse: true },
    { x: "35%", y: "65%", pulse: false },
    { x: "80%", y: "35%", pulse: true },
    { x: "45%", y: "45%", pulse: false },
  ];
  return (
    <div
      className="relative mt-4 rounded-lg overflow-hidden"
      style={{
        height: "100px",
        backgroundColor: "rgba(13, 11, 14, 0.5)",
        border: "1px solid var(--color-card-border)",
      }}
    >
      {/* Grid lines */}
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(212, 146, 11, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(212, 146, 11, 0.05) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }} />
      {dots.map((dot, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: dot.x,
            top: dot.y,
            width: dot.pulse ? "10px" : "6px",
            height: dot.pulse ? "10px" : "6px",
            backgroundColor: dot.pulse ? "var(--color-accent-amber)" : "rgba(212, 146, 11, 0.4)",
            boxShadow: dot.pulse ? "0 0 12px rgba(212, 146, 11, 0.6)" : "none",
            animation: dot.pulse ? "pulseDot 2s ease-in-out infinite" : "none",
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 sm:py-32 px-6 sm:px-8 md:px-16 lg:px-24" style={{ backgroundColor: "var(--color-bg-primary)" }}>
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          heading="How Proof Works"
          subheading="From warehouse to your watchlist in three steps."
        />

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-4"
          style={{
            gridTemplateColumns: undefined,
          }}
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Large card 1: We Track Everything (2/3 width) */}
          <motion.div variants={fadeUpVariant} className="md:col-span-2">
            <GlassCard className="h-full !p-8">
              <div className="flex items-center gap-3 mb-2">
                <Radar
                  size={28}
                  style={{ color: "var(--color-accent-amber)" }}
                />
                <p
                  className="uppercase"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    letterSpacing: "0.15em",
                    color: "var(--color-accent-amber)",
                    fontWeight: 500,
                  }}
                >
                  Step 1
                </p>
              </div>
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
                We Track Everything
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "15px",
                  lineHeight: 1.65,
                  color: "var(--color-text-secondary)",
                }}
              >
                Our engine monitors state warehouses every 15 minutes, tracks shipments to local
                distribution boards, and watches store-level inventory.
              </p>
              <MiniSparklines />
              <div className="flex items-center gap-4 mt-3">
                <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "12px", color: "var(--color-text-tertiary)" }}>
                  Warehouse activity — last 12 hrs
                </span>
                <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "12px", fontWeight: 600, color: "var(--color-accent-amber)" }}>
                  ▲ 23% today
                </span>
              </div>
            </GlassCard>
          </motion.div>

          {/* Small card 1: Instant Alerts (1/3 width) */}
          <motion.div variants={fadeUpVariant} className="md:col-span-1">
            <GlassCard className="h-full !p-8 flex flex-col items-center justify-center text-center">
              <div
                className="flex items-center justify-center rounded-full mb-4"
                style={{
                  width: "56px",
                  height: "56px",
                  backgroundColor: "rgba(212, 146, 11, 0.12)",
                  border: "1px solid var(--color-card-border)",
                }}
              >
                <Zap size={28} style={{ color: "var(--color-accent-amber)" }} />
              </div>
              <p
                className="uppercase mb-2"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  letterSpacing: "0.15em",
                  color: "var(--color-accent-amber)",
                  fontWeight: 500,
                }}
              >
                Step 2
              </p>
              <h3
                className="mb-2"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "24px",
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: "var(--color-text-primary)",
                }}
              >
                Instant Alerts
              </h3>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "32px",
                  fontWeight: 700,
                  color: "var(--color-accent-amber)",
                }}
              >
                &lt; 2 min
              </span>
              <p
                className="mt-1"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Average alert delivery
              </p>
            </GlassCard>
          </motion.div>

          {/* Small card 2: Store-Level Intel (1/3 width) */}
          <motion.div variants={fadeUpVariant} className="md:col-span-1">
            <GlassCard className="h-full !p-8 flex flex-col items-center justify-center text-center">
              <div
                className="flex items-center justify-center rounded-full mb-4"
                style={{
                  width: "56px",
                  height: "56px",
                  backgroundColor: "rgba(212, 146, 11, 0.12)",
                  border: "1px solid var(--color-card-border)",
                }}
              >
                <MapPin size={28} style={{ color: "var(--color-accent-amber)" }} />
              </div>
              <p
                className="uppercase mb-2"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  letterSpacing: "0.15em",
                  color: "var(--color-accent-amber)",
                  fontWeight: 500,
                }}
              >
                Intel
              </p>
              <h3
                className="mb-2"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "24px",
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: "var(--color-text-primary)",
                }}
              >
                Store-Level Intel
              </h3>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "32px",
                  fontWeight: 700,
                  color: "var(--color-accent-amber)",
                }}
              >
                847
              </span>
              <p
                className="mt-1"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Stores monitored nationwide
              </p>
            </GlassCard>
          </motion.div>

          {/* Large card 2: You Score the Bottle (2/3 width) */}
          <motion.div variants={fadeUpVariant} className="md:col-span-2">
            <GlassCard className="h-full !p-8">
              <div className="flex items-center gap-3 mb-2">
                <Trophy
                  size={28}
                  style={{ color: "var(--color-accent-amber)" }}
                />
                <p
                  className="uppercase"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    letterSpacing: "0.15em",
                    color: "var(--color-accent-amber)",
                    fontWeight: 500,
                  }}
                >
                  Step 3
                </p>
              </div>
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
                You Score the Bottle
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "15px",
                  lineHeight: 1.65,
                  color: "var(--color-text-secondary)",
                }}
              >
                Our hunt map shows you exactly where to go. Store-level intel, historical
                drop patterns, and community confirmations mean you show up when it matters.
              </p>
              <MiniHuntMap />
            </GlassCard>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
