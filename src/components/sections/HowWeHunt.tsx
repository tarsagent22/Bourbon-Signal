"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant, fadeRightVariant } from "@/lib/animations";
import ScrollReveal from "@/components/ScrollReveal";

interface Step {
  number: string;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    number: "01",
    title: "The Mash",
    description:
      "Monitoring state liquor boards, warehouse movements, and distributor data daily.",
  },
  {
    number: "02",
    title: "The Distillation",
    description:
      "AI filters noise to surface confirmed allocations and verified drops.",
  },
  {
    number: "03",
    title: "The Barrel",
    description:
      "Every drop tagged by bottle, tier, store, and county.",
  },
  {
    number: "04",
    title: "The Pour",
    description:
      "Instant alerts the moment a bottle you're watching hits a shelf.",
  },
];

/*
 * Vendome-style copper column still — tall, slender, vertical.
 * 4 sections separated by riveted bands, each aligned with a step.
 * Thin amber line art, no fill. ~1:6 aspect ratio.
 *
 * ViewBox: 120 x 700. Column centered at x=60.
 * Section vertical zones (each ~130px tall):
 *   Section 1 (bottom / The Mash):  y 530 → 400
 *   Section 2 (The Distillation):   y 400 → 270
 *   Section 3 (The Barrel):         y 270 → 140
 *   Section 4 (top / The Pour):     y 140 → 50, then vapor pipe
 */
function ColumnStillIllustration() {
  const S = "#C4943A"; // amber stroke color
  return (
    <svg
      viewBox="0 0 120 700"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%" }}
    >
      {/* Glow filter for edges */}
      <defs>
        <filter id="copperGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ===== BASE / PLATFORM ===== */}
      <rect x="20" y="570" width="80" height="6" rx="1" stroke={S} strokeWidth="1.2" opacity="0.5" />
      {/* Base feet */}
      <line x1="30" y1="576" x2="30" y2="584" stroke={S} strokeWidth="1" opacity="0.35" />
      <line x1="90" y1="576" x2="90" y2="584" stroke={S} strokeWidth="1" opacity="0.35" />
      <line x1="25" y1="584" x2="35" y2="584" stroke={S} strokeWidth="1" opacity="0.35" />
      <line x1="85" y1="584" x2="95" y2="584" stroke={S} strokeWidth="1" opacity="0.35" />

      {/* ===== MAIN COLUMN BODY — continuous outline ===== */}
      {/* Left wall */}
      <line x1="35" y1="570" x2="35" y2="68" stroke={S} strokeWidth="1.3" opacity="0.55" />
      {/* Right wall */}
      <line x1="85" y1="570" x2="85" y2="68" stroke={S} strokeWidth="1.3" opacity="0.55" />

      {/* ===== SECTION 1 (bottom) — The Mash: y 530–400 ===== */}
      {/* Bottom cap */}
      <path d="M35 570 Q35 555 60 550 Q85 555 85 570" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      {/* Riveted band at y=530 */}
      <rect x="32" y="397" width="56" height="6" rx="1" stroke={S} strokeWidth="1" opacity="0.45" fill="none" />
      {/* Rivet dots */}
      <circle cx="40" cy="400" r="1.2" fill={S} opacity="0.35" />
      <circle cx="52" cy="400" r="1.2" fill={S} opacity="0.35" />
      <circle cx="64" cy="400" r="1.2" fill={S} opacity="0.35" />
      <circle cx="76" cy="400" r="1.2" fill={S} opacity="0.35" />
      {/* Sight glass */}
      <rect x="86" y="460" width="14" height="30" rx="3" stroke={S} strokeWidth="1" opacity="0.35" fill="none" />
      <line x1="93" y1="463" x2="93" y2="487" stroke={S} strokeWidth="0.6" opacity="0.25" />
      {/* Small inlet pipe */}
      <line x1="85" y1="520" x2="102" y2="520" stroke={S} strokeWidth="1" opacity="0.35" />
      <line x1="102" y1="515" x2="102" y2="525" stroke={S} strokeWidth="1" opacity="0.35" />

      {/* ===== SECTION 2 — The Distillation: y 400–270 ===== */}
      {/* Riveted band at y=270 */}
      <rect x="32" y="267" width="56" height="6" rx="1" stroke={S} strokeWidth="1" opacity="0.45" fill="none" />
      <circle cx="40" cy="270" r="1.2" fill={S} opacity="0.35" />
      <circle cx="52" cy="270" r="1.2" fill={S} opacity="0.35" />
      <circle cx="64" cy="270" r="1.2" fill={S} opacity="0.35" />
      <circle cx="76" cy="270" r="1.2" fill={S} opacity="0.35" />
      {/* Small valve on left */}
      <line x1="35" y1="340" x2="18" y2="340" stroke={S} strokeWidth="1" opacity="0.35" />
      <circle cx="14" cy="340" r="4" stroke={S} strokeWidth="0.8" opacity="0.3" fill="none" />
      {/* Thermometer / gauge on right */}
      <line x1="85" y1="330" x2="100" y2="330" stroke={S} strokeWidth="1" opacity="0.35" />
      <circle cx="105" cy="330" r="6" stroke={S} strokeWidth="0.8" opacity="0.3" fill="none" />
      <line x1="105" y1="326" x2="105" y2="330" stroke={S} strokeWidth="0.6" opacity="0.25" />

      {/* ===== SECTION 3 — The Barrel: y 270–140 ===== */}
      {/* Riveted band at y=140 */}
      <rect x="32" y="137" width="56" height="6" rx="1" stroke={S} strokeWidth="1" opacity="0.45" fill="none" />
      <circle cx="40" cy="140" r="1.2" fill={S} opacity="0.35" />
      <circle cx="52" cy="140" r="1.2" fill={S} opacity="0.35" />
      <circle cx="64" cy="140" r="1.2" fill={S} opacity="0.35" />
      <circle cx="76" cy="140" r="1.2" fill={S} opacity="0.35" />
      {/* Sight glass on left */}
      <rect x="16" y="190" width="18" height="26" rx="3" stroke={S} strokeWidth="1" opacity="0.35" fill="none" />
      <line x1="25" y1="193" x2="25" y2="213" stroke={S} strokeWidth="0.6" opacity="0.25" />
      {/* Small pipe from column to sight glass */}
      <line x1="35" y1="203" x2="34" y2="203" stroke={S} strokeWidth="1" opacity="0.35" />
      {/* Small valve on right */}
      <line x1="85" y1="200" x2="100" y2="200" stroke={S} strokeWidth="1" opacity="0.35" />
      <line x1="100" y1="195" x2="100" y2="205" stroke={S} strokeWidth="1" opacity="0.35" />

      {/* ===== SECTION 4 (top) — The Pour: y 140–50 ===== */}
      {/* Top dome / cap */}
      <path d="M35 68 Q35 48 60 40 Q85 48 85 68" stroke={S} strokeWidth="1.3" opacity="0.5" fill="none" />
      {/* Small gauge on left */}
      <line x1="35" y1="100" x2="20" y2="100" stroke={S} strokeWidth="1" opacity="0.35" />
      <circle cx="15" cy="100" r="5" stroke={S} strokeWidth="0.8" opacity="0.3" fill="none" />
      {/* Vapor pipe curving off from top right */}
      <path
        d="M75 48 Q82 30 90 25 Q100 20 110 22"
        stroke={S}
        strokeWidth="1.3"
        opacity="0.5"
        fill="none"
      />
      {/* Small steam wisps */}
      <path d="M110 22 Q112 15 108 8" stroke={S} strokeWidth="0.8" opacity="0.25" fill="none" />
      <path d="M112 20 Q116 12 113 5" stroke={S} strokeWidth="0.6" opacity="0.2" fill="none" />

      {/* ===== Subtle glow overlay on column edges ===== */}
      <line x1="35" y1="570" x2="35" y2="68" stroke={S} strokeWidth="3" opacity="0.06" filter="url(#copperGlow)" />
      <line x1="85" y1="570" x2="85" y2="68" stroke={S} strokeWidth="3" opacity="0.06" filter="url(#copperGlow)" />
    </svg>
  );
}

export default function HowWeHunt() {
  return (
    <section
      id="how-we-hunt"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        paddingTop: "96px",
        paddingBottom: "96px",
        width: "100%",
      }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: "1100px",
          paddingLeft: "clamp(16px, 4vw, 48px)",
          paddingRight: "clamp(16px, 4vw, 48px)",
        }}
      >
        {/* Section header */}
        <ScrollReveal>
          <p
            className="text-center"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--color-accent-amber)",
              marginBottom: "16px",
            }}
          >
            THE PROCESS
          </p>
          <h2
            className="text-center"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "44px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: "16px",
            }}
          >
            How We Hunt
          </h2>
          <p
            className="text-center mx-auto"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "17px",
              color: "var(--color-text-secondary)",
              maxWidth: "520px",
              marginBottom: "72px",
            }}
          >
            From raw data to your phone in minutes. Same process, distilled for speed.
          </p>
        </ScrollReveal>

        {/* Two-column layout: steps left (55%), still right (45%) */}
        <motion.div
          className="flex flex-col lg:flex-row gap-8 lg:gap-0"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Left — Steps (55%) */}
          <motion.div
            className="w-full"
            style={{ flex: "0 0 55%" }}
            variants={fadeUpVariant}
          >
            <div className="flex flex-col" style={{ height: "100%" }}>
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  variants={fadeUpVariant}
                  className="flex items-start gap-5"
                  style={{
                    flex: 1,
                    padding: "28px 0",
                    borderBottom:
                      i < steps.length - 1
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "none",
                  }}
                >
                  {/* Step number */}
                  <span
                    className="shrink-0"
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "var(--color-accent-amber)",
                      width: "28px",
                      paddingTop: "3px",
                    }}
                  >
                    {step.number}
                  </span>

                  {/* Step content */}
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        fontFamily: "var(--font-playfair)",
                        fontSize: "20px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        marginBottom: "6px",
                      }}
                    >
                      {step.title}
                    </h3>
                    <p
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.6,
                      }}
                    >
                      {step.description}
                    </p>
                  </div>

                  {/* Dashed connector line — hidden on mobile, visible on lg */}
                  <div
                    className="hidden lg:flex items-center shrink-0"
                    style={{ width: "60px", height: "100%", paddingTop: "10px" }}
                  >
                    <svg width="60" height="2" viewBox="0 0 60 2" fill="none">
                      <line
                        x1="0"
                        y1="1"
                        x2="60"
                        y2="1"
                        stroke="#C4943A"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                        opacity="0.35"
                      />
                    </svg>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right — Column still (45%) — desktop only inline, mobile below */}
          <motion.div
            className="hidden lg:flex items-stretch justify-center"
            style={{ flex: "0 0 45%", paddingLeft: "0px" }}
            variants={fadeRightVariant}
          >
            <div style={{ width: "90px", height: "100%" }}>
              <ColumnStillIllustration />
            </div>
          </motion.div>

          {/* Mobile still — centered, smaller */}
          <motion.div
            className="flex lg:hidden justify-center"
            style={{ marginTop: "40px" }}
            variants={fadeUpVariant}
          >
            <div style={{ width: "60px", height: "360px" }}>
              <ColumnStillIllustration />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
