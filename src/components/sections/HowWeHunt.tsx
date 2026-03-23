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
 * Vendome-style copper column still — tall, prominent, vertical.
 * ViewBox: 280 x 560. Column body 70px wide, centered right.
 * 4 sections of ~120px each, separated by riveted bands.
 * Dashed connector lines enter from the left at each section midpoint.
 *
 * Section zones:
 *   S1 (01 The Mash):         y  40–160, mid y=100
 *   S2 (02 The Distillation): y 160–280, mid y=220
 *   S3 (03 The Barrel):       y 280–400, mid y=340
 *   S4 (04 The Pour):         y 400–520, mid y=460
 */
function ColumnStillIllustration() {
  const S = "#C4943A";

  return (
    <svg
      viewBox="0 0 280 560"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        <filter id="copperGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ===== DASHED CONNECTOR LINES from left edge to column ===== */}
      {/* S1 connector — y=100 */}
      <path
        d="M0 100 L90 100 Q110 100 120 100 L130 100"
        stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" fill="none"
      />
      <circle cx="130" cy="100" r="3" fill={S} opacity="0.3" />
      {/* S2 connector — y=220 */}
      <path
        d="M0 220 L90 220 Q110 220 120 220 L130 220"
        stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" fill="none"
      />
      <circle cx="130" cy="220" r="3" fill={S} opacity="0.3" />
      {/* S3 connector — y=340 */}
      <path
        d="M0 340 L90 340 Q110 340 120 340 L130 340"
        stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" fill="none"
      />
      <circle cx="130" cy="340" r="3" fill={S} opacity="0.3" />
      {/* S4 connector — y=460 */}
      <path
        d="M0 460 L90 460 Q110 460 120 460 L130 460"
        stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" fill="none"
      />
      <circle cx="130" cy="460" r="3" fill={S} opacity="0.3" />

      {/* ===== MAIN COLUMN BODY ===== */}
      {/* Left wall */}
      <line x1="130" y1="525" x2="130" y2="42" stroke={S} strokeWidth="1.5" opacity="0.55" />
      {/* Right wall */}
      <line x1="200" y1="525" x2="200" y2="42" stroke={S} strokeWidth="1.5" opacity="0.55" />

      {/* ===== TOP DOME / CAP ===== */}
      <path
        d="M130 42 Q130 18 165 10 Q200 18 200 42"
        stroke={S} strokeWidth="1.5" opacity="0.55" fill="none"
      />
      {/* Vapor pipe curving off top right */}
      <path
        d="M185 18 Q200 4 220 2 Q240 2 255 8"
        stroke={S} strokeWidth="1.5" opacity="0.5" fill="none"
      />
      {/* Vapor pipe end cap */}
      <line x1="255" y1="4" x2="255" y2="12" stroke={S} strokeWidth="1.2" opacity="0.4" />
      {/* Steam wisps */}
      <path d="M258 8 Q264 0 260 -8" stroke={S} strokeWidth="0.8" opacity="0.2" fill="none" />
      <path d="M262 6 Q268 -2 265 -10" stroke={S} strokeWidth="0.6" opacity="0.15" fill="none" />

      {/* ===== BASE / PLATFORM ===== */}
      <path
        d="M130 525 Q130 540 165 546 Q200 540 200 525"
        stroke={S} strokeWidth="1.5" opacity="0.5" fill="none"
      />
      {/* Platform */}
      <rect x="115" y="546" width="100" height="5" rx="1.5" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      {/* Feet */}
      <line x1="125" y1="551" x2="125" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="205" y1="551" x2="205" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="119" y1="558" x2="131" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="199" y1="558" x2="211" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />

      {/* ===== RIVETED BAND at y=160 (S1/S2 boundary) ===== */}
      <rect x="126" y="156" width="78" height="8" rx="2" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <circle cx="140" cy="160" r="2" fill={S} opacity="0.35" />
      <circle cx="155" cy="160" r="2" fill={S} opacity="0.35" />
      <circle cx="170" cy="160" r="2" fill={S} opacity="0.35" />
      <circle cx="185" cy="160" r="2" fill={S} opacity="0.35" />
      <circle cx="200" cy="160" r="2" fill={S} opacity="0.3" />

      {/* ===== RIVETED BAND at y=280 (S2/S3 boundary) ===== */}
      <rect x="126" y="276" width="78" height="8" rx="2" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <circle cx="140" cy="280" r="2" fill={S} opacity="0.35" />
      <circle cx="155" cy="280" r="2" fill={S} opacity="0.35" />
      <circle cx="170" cy="280" r="2" fill={S} opacity="0.35" />
      <circle cx="185" cy="280" r="2" fill={S} opacity="0.35" />
      <circle cx="200" cy="280" r="2" fill={S} opacity="0.3" />

      {/* ===== RIVETED BAND at y=400 (S3/S4 boundary) ===== */}
      <rect x="126" y="396" width="78" height="8" rx="2" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <circle cx="140" cy="400" r="2" fill={S} opacity="0.35" />
      <circle cx="155" cy="400" r="2" fill={S} opacity="0.35" />
      <circle cx="170" cy="400" r="2" fill={S} opacity="0.35" />
      <circle cx="185" cy="400" r="2" fill={S} opacity="0.35" />
      <circle cx="200" cy="400" r="2" fill={S} opacity="0.3" />

      {/* ===== SECTION 1 DETAILS (The Mash) y=40–160 ===== */}
      {/* Pressure gauge on left */}
      <line x1="130" y1="80" x2="108" y2="80" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="100" cy="80" r="8" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="100" y1="75" x2="100" y2="80" stroke={S} strokeWidth="0.8" opacity="0.25" />
      {/* Sight glass on right */}
      <rect x="202" y="70" width="18" height="40" rx="4" stroke={S} strokeWidth="1.2" opacity="0.35" fill="none" />
      <line x1="211" y1="74" x2="211" y2="106" stroke={S} strokeWidth="0.8" opacity="0.2" />
      {/* Internal horizontal plate hint */}
      <line x1="134" y1="120" x2="196" y2="120" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SECTION 2 DETAILS (The Distillation) y=160–280 ===== */}
      {/* Valve on left */}
      <line x1="130" y1="210" x2="110" y2="210" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="104" cy="210" r="6" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      {/* Valve handle */}
      <line x1="98" y1="210" x2="110" y2="210" stroke={S} strokeWidth="0.8" opacity="0.25" />
      {/* Thermometer on right */}
      <line x1="200" y1="200" x2="222" y2="200" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="230" cy="200" r="9" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="230" y1="194" x2="230" y2="200" stroke={S} strokeWidth="0.8" opacity="0.25" />
      <line x1="227" y1="197" x2="230" y2="194" stroke={S} strokeWidth="0.6" opacity="0.2" />
      {/* Sight glass on right lower */}
      <rect x="202" y="230" width="16" height="30" rx="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="210" y1="234" x2="210" y2="256" stroke={S} strokeWidth="0.7" opacity="0.18" />
      {/* Internal plate hint */}
      <line x1="134" y1="250" x2="196" y2="250" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SECTION 3 DETAILS (The Barrel) y=280–400 ===== */}
      {/* Sight glass on left */}
      <rect x="106" y="310" width="22" height="36" rx="5" stroke={S} strokeWidth="1.2" opacity="0.35" fill="none" />
      <line x1="117" y1="314" x2="117" y2="342" stroke={S} strokeWidth="0.8" opacity="0.2" />
      {/* Pipe connecting sight glass to column */}
      <line x1="128" y1="328" x2="130" y2="328" stroke={S} strokeWidth="1" opacity="0.3" />
      <line x1="106" y1="328" x2="104" y2="328" stroke={S} strokeWidth="1" opacity="0.3" />
      {/* Small valve on right */}
      <line x1="200" y1="350" x2="218" y2="350" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="218" y1="344" x2="218" y2="356" stroke={S} strokeWidth="1.2" opacity="0.35" />
      {/* Internal plate hint */}
      <line x1="134" y1="370" x2="196" y2="370" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SECTION 4 DETAILS (The Pour) y=400–520 ===== */}
      {/* Gauge on left */}
      <line x1="130" y1="440" x2="112" y2="440" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="105" cy="440" r="7" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      {/* Outlet pipe on right — liquid out */}
      <line x1="200" y1="470" x2="230" y2="470" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1="230" y1="470" x2="230" y2="500" stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Drip / collection spout */}
      <path d="M230 500 L225 500 L225 510 M230 500 L235 500 L235 510" stroke={S} strokeWidth="1" opacity="0.35" fill="none" />
      {/* Drip drops */}
      <line x1="230" y1="512" x2="230" y2="518" stroke={S} strokeWidth="0.8" opacity="0.2" strokeDasharray="2 3" />
      {/* Sight glass on right */}
      <rect x="202" y="420" width="16" height="28" rx="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="210" y1="424" x2="210" y2="444" stroke={S} strokeWidth="0.7" opacity="0.18" />
      {/* Internal plate hint */}
      <line x1="134" y1="490" x2="196" y2="490" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SUBTLE GLOW on column edges ===== */}
      <line x1="130" y1="525" x2="130" y2="42" stroke={S} strokeWidth="4" opacity="0.05" filter="url(#copperGlow)" />
      <line x1="200" y1="525" x2="200" y2="42" stroke={S} strokeWidth="4" opacity="0.05" filter="url(#copperGlow)" />
    </svg>
  );
}

/* Smaller mobile version without connector lines */
function ColumnStillMobile() {
  const S = "#C4943A";

  return (
    <svg
      viewBox="100 0 180 560"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        <filter id="copperGlowM" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Column walls */}
      <line x1="130" y1="525" x2="130" y2="42" stroke={S} strokeWidth="1.5" opacity="0.55" />
      <line x1="200" y1="525" x2="200" y2="42" stroke={S} strokeWidth="1.5" opacity="0.55" />

      {/* Top dome */}
      <path d="M130 42 Q130 18 165 10 Q200 18 200 42" stroke={S} strokeWidth="1.5" opacity="0.55" fill="none" />
      {/* Vapor pipe */}
      <path d="M185 18 Q200 4 220 2 Q240 2 255 8" stroke={S} strokeWidth="1.5" opacity="0.5" fill="none" />
      <line x1="255" y1="4" x2="255" y2="12" stroke={S} strokeWidth="1.2" opacity="0.4" />

      {/* Base */}
      <path d="M130 525 Q130 540 165 546 Q200 540 200 525" stroke={S} strokeWidth="1.5" opacity="0.5" fill="none" />
      <rect x="115" y="546" width="100" height="5" rx="1.5" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <line x1="125" y1="551" x2="125" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="205" y1="551" x2="205" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="119" y1="558" x2="131" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="199" y1="558" x2="211" y2="558" stroke={S} strokeWidth="1.2" opacity="0.35" />

      {/* Riveted bands */}
      <rect x="126" y="156" width="78" height="8" rx="2" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <circle cx="140" cy="160" r="2" fill={S} opacity="0.35" />
      <circle cx="155" cy="160" r="2" fill={S} opacity="0.35" />
      <circle cx="170" cy="160" r="2" fill={S} opacity="0.35" />
      <circle cx="185" cy="160" r="2" fill={S} opacity="0.35" />

      <rect x="126" y="276" width="78" height="8" rx="2" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <circle cx="140" cy="280" r="2" fill={S} opacity="0.35" />
      <circle cx="155" cy="280" r="2" fill={S} opacity="0.35" />
      <circle cx="170" cy="280" r="2" fill={S} opacity="0.35" />
      <circle cx="185" cy="280" r="2" fill={S} opacity="0.35" />

      <rect x="126" y="396" width="78" height="8" rx="2" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <circle cx="140" cy="400" r="2" fill={S} opacity="0.35" />
      <circle cx="155" cy="400" r="2" fill={S} opacity="0.35" />
      <circle cx="170" cy="400" r="2" fill={S} opacity="0.35" />
      <circle cx="185" cy="400" r="2" fill={S} opacity="0.35" />

      {/* Section details — same as main but without connectors */}
      {/* S1 */}
      <circle cx="100" cy="80" r="8" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="130" y1="80" x2="108" y2="80" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <rect x="202" y="70" width="18" height="40" rx="4" stroke={S} strokeWidth="1.2" opacity="0.35" fill="none" />
      <line x1="211" y1="74" x2="211" y2="106" stroke={S} strokeWidth="0.8" opacity="0.2" />

      {/* S2 */}
      <line x1="130" y1="210" x2="110" y2="210" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="104" cy="210" r="6" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="200" y1="200" x2="222" y2="200" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="230" cy="200" r="9" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <rect x="202" y="230" width="16" height="30" rx="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />

      {/* S3 */}
      <rect x="106" y="310" width="22" height="36" rx="5" stroke={S} strokeWidth="1.2" opacity="0.35" fill="none" />
      <line x1="117" y1="314" x2="117" y2="342" stroke={S} strokeWidth="0.8" opacity="0.2" />
      <line x1="200" y1="350" x2="218" y2="350" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="218" y1="344" x2="218" y2="356" stroke={S} strokeWidth="1.2" opacity="0.35" />

      {/* S4 */}
      <line x1="130" y1="440" x2="112" y2="440" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="105" cy="440" r="7" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="200" y1="470" x2="230" y2="470" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1="230" y1="470" x2="230" y2="500" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <path d="M230 500 L225 500 L225 510 M230 500 L235 500 L235 510" stroke={S} strokeWidth="1" opacity="0.35" fill="none" />
      <rect x="202" y="420" width="16" height="28" rx="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />

      {/* Glow */}
      <line x1="130" y1="525" x2="130" y2="42" stroke={S} strokeWidth="4" opacity="0.05" filter="url(#copperGlowM)" />
      <line x1="200" y1="525" x2="200" y2="42" stroke={S} strokeWidth="4" opacity="0.05" filter="url(#copperGlowM)" />
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

        {/* Desktop: CSS grid 55% / 45%. Mobile: stacked. */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* Desktop layout */}
          <div
            className="hidden lg:grid"
            style={{
              gridTemplateColumns: "55% 45%",
              minHeight: "480px",
            }}
          >
            {/* Left — Steps */}
            <motion.div
              variants={fadeUpVariant}
              className="flex flex-col"
              style={{ justifyContent: "stretch" }}
            >
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  variants={fadeUpVariant}
                  className="flex items-center"
                  style={{
                    flex: 1,
                    paddingRight: "0px",
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
                      width: "32px",
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
                </motion.div>
              ))}
            </motion.div>

            {/* Right — Column still, full height of grid row */}
            <motion.div
              variants={fadeRightVariant}
              className="flex items-stretch justify-center"
            >
              <div style={{ width: "100%", maxWidth: "260px" }}>
                <ColumnStillIllustration />
              </div>
            </motion.div>
          </div>

          {/* Mobile layout — stacked */}
          <div className="flex flex-col lg:hidden">
            <motion.div variants={fadeUpVariant} className="flex flex-col">
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  variants={fadeUpVariant}
                  className="flex items-start gap-4"
                  style={{
                    padding: "24px 0",
                    borderBottom:
                      i < steps.length - 1
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "none",
                  }}
                >
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
                  <div>
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
                </motion.div>
              ))}
            </motion.div>

            {/* Mobile still — centered below steps */}
            <motion.div
              variants={fadeUpVariant}
              className="flex justify-center"
              style={{ marginTop: "48px" }}
            >
              <div style={{ width: "140px", height: "400px" }}>
                <ColumnStillMobile />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
