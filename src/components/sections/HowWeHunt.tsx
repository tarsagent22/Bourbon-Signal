"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
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

/* Sight glass marker — circular porthole with step number */
function SightGlass({ number, index }: { number: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20% 0px -20% 0px" });

  return (
    <motion.div
      ref={ref}
      className="shrink-0 flex items-center justify-center"
      style={{
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        border: "2.5px solid #C4943A",
        background: isInView
          ? "radial-gradient(circle, rgba(196,148,58,0.2) 0%, rgba(196,148,58,0.08) 70%)"
          : "var(--color-bg-primary)",
        boxShadow: isInView
          ? "0 0 20px rgba(196,148,58,0.25), inset 0 0 12px rgba(196,148,58,0.15)"
          : "inset 0 2px 4px rgba(0,0,0,0.3)",
        fontFamily: "var(--font-jetbrains)",
        fontSize: "13px",
        fontWeight: 700,
        color: isInView ? "#C4943A" : "rgba(196,148,58,0.4)",
        position: "relative",
        zIndex: 2,
        transition: "all 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)",
        transitionDelay: `${index * 0.05}s`,
      }}
    >
      {/* Inner ring — porthole glass effect */}
      <div
        style={{
          position: "absolute",
          inset: "4px",
          borderRadius: "50%",
          border: "1px solid rgba(196,148,58,0.2)",
          pointerEvents: "none",
        }}
      />
      {number}
    </motion.div>
  );
}

/* Riveted band crossing the pipe */
function RivetedBand() {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: "44px",
        height: "12px",
        position: "relative",
        zIndex: 3,
      }}
    >
      {/* Horizontal band */}
      <div
        style={{
          width: "28px",
          height: "4px",
          borderRadius: "1px",
          border: "1px solid rgba(196,148,58,0.3)",
          background: "rgba(196,148,58,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-evenly",
          padding: "0 3px",
        }}
      >
        {/* Rivet dots */}
        <div style={{ width: "2px", height: "2px", borderRadius: "50%", background: "#C4943A", opacity: 0.4 }} />
        <div style={{ width: "2px", height: "2px", borderRadius: "50%", background: "#C4943A", opacity: 0.4 }} />
        <div style={{ width: "2px", height: "2px", borderRadius: "50%", background: "#C4943A", opacity: 0.4 }} />
      </div>
    </div>
  );
}

/* Step text content with slide-in animation */
function StepContent({ step, index }: { step: Step; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });

  return (
    <motion.div
      ref={ref}
      style={{
        flex: 1,
        opacity: isInView ? 1 : 0,
        transform: isInView ? "translateX(0)" : "translateX(20px)",
        transition: `opacity 0.6s cubic-bezier(0.25,0.1,0.25,1) ${index * 0.05}s, transform 0.6s cubic-bezier(0.25,0.1,0.25,1) ${index * 0.05}s`,
      }}
    >
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
    </motion.div>
  );
}

/* Still cap — small dome at top of pipe */
function StillCap() {
  return (
    <div
      className="flex justify-center"
      style={{ width: "44px", height: "28px", position: "relative", zIndex: 3 }}
    >
      <svg width="44" height="28" viewBox="0 0 44 28" fill="none">
        {/* Dome */}
        <path
          d="M16 28 L16 16 Q16 4 22 2 Q28 4 28 16 L28 28"
          stroke="#C4943A"
          strokeWidth="2"
          opacity="0.55"
          fill="none"
        />
        {/* Cap ring */}
        <line x1="13" y1="28" x2="31" y2="28" stroke="#C4943A" strokeWidth="1.5" opacity="0.4" />
        {/* Small vent pipe */}
        <line x1="28" y1="10" x2="38" y2="10" stroke="#C4943A" strokeWidth="1.2" opacity="0.35" />
        <line x1="38" y1="7" x2="38" y2="13" stroke="#C4943A" strokeWidth="1" opacity="0.3" />
      </svg>
    </div>
  );
}

/* Spout / collection vessel at bottom of pipe */
function StillSpout() {
  return (
    <div
      className="flex justify-center"
      style={{ width: "44px", height: "32px", position: "relative", zIndex: 3 }}
    >
      <svg width="44" height="32" viewBox="0 0 44 32" fill="none">
        {/* Pipe narrowing to spout */}
        <line x1="18" y1="0" x2="18" y2="12" stroke="#C4943A" strokeWidth="1.5" opacity="0.45" />
        <line x1="26" y1="0" x2="26" y2="12" stroke="#C4943A" strokeWidth="1.5" opacity="0.45" />
        {/* Valve */}
        <line x1="14" y1="12" x2="30" y2="12" stroke="#C4943A" strokeWidth="1.5" opacity="0.4" />
        {/* Drip lines */}
        <line x1="22" y1="14" x2="22" y2="20" stroke="#C4943A" strokeWidth="1" opacity="0.3" strokeDasharray="2 2" />
        <line x1="22" y1="23" x2="22" y2="27" stroke="#C4943A" strokeWidth="1" opacity="0.2" strokeDasharray="1 3" />
        {/* Collection drop */}
        <circle cx="22" cy="30" r="1.5" fill="#C4943A" opacity="0.25" />
      </svg>
    </div>
  );
}

export default function HowWeHunt() {
  const pipeRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: pipeRef,
    offset: ["start 0.8", "end 0.3"],
  });

  // Map scroll progress to pipe fill (0 to 1)
  const fillScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
  // Glow intensity tied to progress
  const fillOpacity = useTransform(scrollYProgress, [0, 0.2, 1], [0, 0.6, 0.8]);

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
          paddingLeft: "clamp(24px, 5vw, 56px)",
          paddingRight: "clamp(24px, 5vw, 56px)",
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

        {/* Steps with integrated pipe */}
        <div
          ref={pipeRef}
          className="mx-auto"
          style={{
            maxWidth: "580px",
            position: "relative",
          }}
        >
          {/* ===== COPPER PIPE — runs full height of steps area ===== */}
          <div
            style={{
              position: "absolute",
              left: "21px",
              top: "28px",
              bottom: "32px",
              width: "4px",
              zIndex: 1,
            }}
          >
            {/* Outer pipe — darker edge */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "2px",
                background: "rgba(196,148,58,0.15)",
                boxShadow: "0 0 0 1px rgba(196,148,58,0.1)",
              }}
            />
            {/* Inner pipe — lighter center line for 3D tube effect */}
            <div
              style={{
                position: "absolute",
                left: "1px",
                right: "1px",
                top: 0,
                bottom: 0,
                borderRadius: "1px",
                background: "rgba(196,148,58,0.25)",
              }}
            />
            {/* Scroll-driven fill overlay */}
            <motion.div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "2px",
                background: "linear-gradient(to bottom, #C4943A, #D4A44A)",
                transformOrigin: "top",
                scaleY: fillScaleY,
                opacity: fillOpacity,
                boxShadow: "0 0 8px rgba(196,148,58,0.4), 0 0 20px rgba(196,148,58,0.15)",
              }}
            />
          </div>

          {/* Still cap at top */}
          <StillCap />

          {/* Steps */}
          {steps.map((step, i) => (
            <div key={step.number}>
              {/* Step row */}
              <div
                className="flex items-center"
                style={{
                  gap: "32px",
                  padding: "36px 0",
                }}
              >
                {/* Sight glass on pipe */}
                <SightGlass number={step.number} index={i} />

                {/* Step text */}
                <StepContent step={step} index={i} />
              </div>

              {/* Riveted band between steps (not after last) */}
              {i < steps.length - 1 && <RivetedBand />}
            </div>
          ))}

          {/* Still spout at bottom */}
          <StillSpout />
        </div>
      </div>
    </section>
  );
}
