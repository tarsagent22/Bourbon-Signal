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
 * ViewBox: 280 x 560. Column body 70px wide (x=130–200).
 * 4 sections of ~120px each, separated by riveted bands.
 * Dashed connector lines enter from the left, aligned to step TITLES
 * (upper portion of each section, not the midpoint).
 *
 * Section zones:
 *   S1 (01 The Mash):         y  40–160, title-line y=70
 *   S2 (02 The Distillation): y 160–280, title-line y=190
 *   S3 (03 The Barrel):       y 280–400, title-line y=310
 *   S4 (04 The Pour):         y 400–520, title-line y=430
 *
 * Top: slightly domed flat cap with straight vapor pipe exiting right.
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

      {/* ===== DASHED CONNECTOR LINES — aligned to step titles ===== */}
      {/* S1 connector — y=70 */}
      <line x1="0" y1="70" x2="127" y2="70" stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" />
      <circle cx="130" cy="70" r="3" fill={S} opacity="0.3" />
      {/* S2 connector — y=190 */}
      <line x1="0" y1="190" x2="127" y2="190" stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" />
      <circle cx="130" cy="190" r="3" fill={S} opacity="0.3" />
      {/* S3 connector — y=310 */}
      <line x1="0" y1="310" x2="127" y2="310" stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" />
      <circle cx="130" cy="310" r="3" fill={S} opacity="0.3" />
      {/* S4 connector — y=430 */}
      <line x1="0" y1="430" x2="127" y2="430" stroke={S} strokeWidth="1.2" strokeDasharray="6 5" opacity="0.35" />
      <circle cx="130" cy="430" r="3" fill={S} opacity="0.3" />

      {/* ===== MAIN COLUMN BODY ===== */}
      <line x1="130" y1="525" x2="130" y2="38" stroke={S} strokeWidth="1.5" opacity="0.55" />
      <line x1="200" y1="525" x2="200" y2="38" stroke={S} strokeWidth="1.5" opacity="0.55" />

      {/* ===== TOP — flat domed cap + straight vapor pipe ===== */}
      {/* Slight dome */}
      <path d="M130 38 Q130 26 165 22 Q200 26 200 38" stroke={S} strokeWidth="1.5" opacity="0.55" fill="none" />
      {/* Flat cap ring */}
      <line x1="126" y1="38" x2="204" y2="38" stroke={S} strokeWidth="1.5" opacity="0.45" />
      {/* Straight vapor pipe exiting right from top of dome */}
      <line x1="200" y1="30" x2="248" y2="30" stroke={S} strokeWidth="1.5" opacity="0.45" />
      {/* Pipe walls (top and bottom of pipe) */}
      <line x1="200" y1="26" x2="248" y2="26" stroke={S} strokeWidth="1" opacity="0.3" />
      <line x1="200" y1="34" x2="248" y2="34" stroke={S} strokeWidth="1" opacity="0.3" />
      {/* End cap */}
      <line x1="248" y1="24" x2="248" y2="36" stroke={S} strokeWidth="1.2" opacity="0.4" />
      {/* Small steam wisps from end */}
      <path d="M250 28 L258 24" stroke={S} strokeWidth="0.8" opacity="0.2" />
      <path d="M250 32 L256 36" stroke={S} strokeWidth="0.6" opacity="0.15" />

      {/* ===== BASE / PLATFORM ===== */}
      <path d="M130 525 Q130 538 165 544 Q200 538 200 525" stroke={S} strokeWidth="1.5" opacity="0.5" fill="none" />
      <rect x="115" y="544" width="100" height="5" rx="1.5" stroke={S} strokeWidth="1.2" opacity="0.45" fill="none" />
      <line x1="125" y1="549" x2="125" y2="556" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="205" y1="549" x2="205" y2="556" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="119" y1="556" x2="131" y2="556" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="199" y1="556" x2="211" y2="556" stroke={S} strokeWidth="1.2" opacity="0.35" />

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
      <line x1="130" y1="100" x2="108" y2="100" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="100" cy="100" r="8" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="100" y1="95" x2="100" y2="100" stroke={S} strokeWidth="0.8" opacity="0.25" />
      {/* Sight glass on right */}
      <rect x="202" y="60" width="18" height="40" rx="4" stroke={S} strokeWidth="1.2" opacity="0.35" fill="none" />
      <line x1="211" y1="64" x2="211" y2="96" stroke={S} strokeWidth="0.8" opacity="0.2" />
      {/* Internal horizontal plate hint */}
      <line x1="134" y1="130" x2="196" y2="130" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SECTION 2 DETAILS (The Distillation) y=160–280 ===== */}
      {/* Valve on left */}
      <line x1="130" y1="220" x2="110" y2="220" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="104" cy="220" r="6" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="98" y1="220" x2="110" y2="220" stroke={S} strokeWidth="0.8" opacity="0.25" />
      {/* Thermometer on right */}
      <line x1="200" y1="200" x2="222" y2="200" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="230" cy="200" r="9" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="230" y1="194" x2="230" y2="200" stroke={S} strokeWidth="0.8" opacity="0.25" />
      <line x1="227" y1="197" x2="230" y2="194" stroke={S} strokeWidth="0.6" opacity="0.2" />
      {/* Sight glass on right lower */}
      <rect x="202" y="235" width="16" height="30" rx="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="210" y1="239" x2="210" y2="261" stroke={S} strokeWidth="0.7" opacity="0.18" />
      {/* Internal plate hint */}
      <line x1="134" y1="255" x2="196" y2="255" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SECTION 3 DETAILS (The Barrel) y=280–400 ===== */}
      {/* Sight glass on left */}
      <rect x="104" y="320" width="24" height="36" rx="5" stroke={S} strokeWidth="1.2" opacity="0.35" fill="none" />
      <line x1="116" y1="324" x2="116" y2="352" stroke={S} strokeWidth="0.8" opacity="0.2" />
      <line x1="128" y1="338" x2="130" y2="338" stroke={S} strokeWidth="1" opacity="0.3" />
      {/* Small valve on right */}
      <line x1="200" y1="350" x2="218" y2="350" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1="218" y1="344" x2="218" y2="356" stroke={S} strokeWidth="1.2" opacity="0.35" />
      {/* Internal plate hint */}
      <line x1="134" y1="375" x2="196" y2="375" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SECTION 4 DETAILS (The Pour) y=400–520 ===== */}
      {/* Gauge on left */}
      <line x1="130" y1="450" x2="112" y2="450" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <circle cx="105" cy="450" r="7" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      {/* Outlet pipe on right — liquid out */}
      <line x1="200" y1="470" x2="230" y2="470" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1="230" y1="470" x2="230" y2="500" stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Drip / collection spout */}
      <path d="M230 500 L225 500 L225 510 M230 500 L235 500 L235 510" stroke={S} strokeWidth="1" opacity="0.35" fill="none" />
      <line x1="230" y1="512" x2="230" y2="518" stroke={S} strokeWidth="0.8" opacity="0.2" strokeDasharray="2 3" />
      {/* Sight glass on right */}
      <rect x="202" y="430" width="16" height="28" rx="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1="210" y1="434" x2="210" y2="454" stroke={S} strokeWidth="0.7" opacity="0.18" />
      {/* Internal plate hint */}
      <line x1="134" y1="495" x2="196" y2="495" stroke={S} strokeWidth="0.6" opacity="0.15" strokeDasharray="3 4" />

      {/* ===== SUBTLE GLOW on column edges ===== */}
      <line x1="130" y1="525" x2="130" y2="38" stroke={S} strokeWidth="4" opacity="0.05" filter="url(#copperGlow)" />
      <line x1="200" y1="525" x2="200" y2="38" stroke={S} strokeWidth="4" opacity="0.05" filter="url(#copperGlow)" />
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

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {/* ===== DESKTOP: CSS grid 55%/45%, side by side ===== */}
          <div
            className="hidden lg:grid"
            style={{
              gridTemplateColumns: "55% 45%",
              minHeight: "500px",
            }}
          >
            {/* Left — Steps with generous spacing */}
            <motion.div
              variants={fadeUpVariant}
              className="flex flex-col"
              style={{ justifyContent: "stretch" }}
            >
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  variants={fadeUpVariant}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "flex-start",
                    paddingTop: "20px",
                    paddingRight: "24px",
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
                      paddingTop: "4px",
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
                        marginBottom: "8px",
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

          {/* ===== MOBILE: timeline with vertical amber line, NO still ===== */}
          <div
            className="flex lg:hidden"
            style={{ position: "relative" }}
          >
            {/* Vertical amber timeline line */}
            <div
              style={{
                position: "absolute",
                left: "13px",
                top: "32px",
                bottom: "32px",
                width: "1px",
                background: "linear-gradient(to bottom, var(--color-accent-amber), rgba(196,148,58,0.15))",
              }}
            />

            <div className="flex flex-col w-full">
              {steps.map((step, i) => (
                <motion.div
                  key={step.number}
                  variants={fadeUpVariant}
                  className="flex items-start"
                  style={{
                    paddingTop: i === 0 ? "0px" : "60px",
                    paddingBottom: i === steps.length - 1 ? "0px" : "0px",
                  }}
                >
                  {/* Step number — sits on top of the timeline */}
                  <div
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      border: "1px solid rgba(196,148,58,0.4)",
                      background: "var(--color-bg-primary)",
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--color-accent-amber)",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {step.number}
                  </div>

                  {/* Step content */}
                  <div style={{ marginLeft: "16px", flex: 1 }}>
                    <h3
                      style={{
                        fontFamily: "var(--font-playfair)",
                        fontSize: "19px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        marginBottom: "6px",
                        lineHeight: 1.4,
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
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
