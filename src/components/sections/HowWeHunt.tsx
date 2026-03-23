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

/* ── Sight glass — circular porthole with double-ring effect ── */
function SightGlass({ number, index }: { number: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20% 0px -20% 0px" });

  return (
    <motion.div
      ref={ref}
      className="shrink-0 flex items-center justify-center"
      style={{
        width: "48px",
        height: "48px",
        borderRadius: "50%",
        /* Opaque background covers the pipe behind it */
        background: "var(--color-bg-primary)",
        border: "2px solid #C4943A",
        position: "relative",
        zIndex: 2,
        boxShadow: isInView
          ? "0 0 24px rgba(196,148,58,0.3), 0 0 6px rgba(196,148,58,0.15)"
          : "none",
        transition: "box-shadow 0.6s cubic-bezier(0.25,0.1,0.25,1)",
        transitionDelay: `${index * 0.05}s`,
      }}
    >
      {/* Inner glass area with radial gradient */}
      <div
        style={{
          position: "absolute",
          inset: "4px",
          borderRadius: "50%",
          border: "1px solid rgba(196,148,58,0.35)",
          background: isInView
            ? "radial-gradient(circle at center, rgba(13,11,7,0.8) 0%, rgba(196,148,58,0.18) 80%, rgba(196,148,58,0.25) 100%)"
            : "radial-gradient(circle at center, rgba(13,11,7,0.9) 0%, rgba(196,148,58,0.06) 80%, rgba(196,148,58,0.1) 100%)",
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4)",
          transition: "background 0.6s cubic-bezier(0.25,0.1,0.25,1)",
          transitionDelay: `${index * 0.05}s`,
        }}
      />
      {/* Step number — cream colored for readability */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontFamily: "var(--font-jetbrains)",
          fontSize: "13px",
          fontWeight: 700,
          color: isInView ? "var(--color-cream)" : "rgba(245,237,214,0.35)",
          transition: "color 0.6s cubic-bezier(0.25,0.1,0.25,1)",
          transitionDelay: `${index * 0.05}s`,
        }}
      >
        {number}
      </span>
    </motion.div>
  );
}

/* ── Bolted flange — two parallel lines crossing the pipe ── */
function BoltedFlange() {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: "48px",
        height: "16px",
        position: "relative",
        zIndex: 3,
      }}
    >
      <svg width="28" height="12" viewBox="0 0 28 12" fill="none">
        {/* Top flange line */}
        <line x1="2" y1="2" x2="26" y2="2" stroke="#C4943A" strokeWidth="1.5" opacity="0.4" />
        {/* Bottom flange line */}
        <line x1="2" y1="10" x2="26" y2="10" stroke="#C4943A" strokeWidth="1.5" opacity="0.4" />
        {/* Bolt dots */}
        <circle cx="5" cy="6" r="1.5" fill="#C4943A" opacity="0.35" />
        <circle cx="14" cy="6" r="1.5" fill="#C4943A" opacity="0.35" />
        <circle cx="23" cy="6" r="1.5" fill="#C4943A" opacity="0.35" />
      </svg>
    </div>
  );
}

/* ── Step text with slide-in animation ── */
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

/* ── Still cap — dome with lyne arm ── */
function StillCap() {
  return (
    <div
      className="flex justify-center"
      style={{ width: "48px", height: "34px", position: "relative", zIndex: 3 }}
    >
      <svg width="60" height="34" viewBox="0 0 60 34" fill="none" style={{ marginLeft: "-6px" }}>
        {/* Dome / half-circle cap */}
        <path
          d="M14 34 L14 18 Q14 4 24 2 Q34 4 34 18 L34 34"
          stroke="#C4943A"
          strokeWidth="2"
          opacity="0.55"
          fill="none"
        />
        {/* Cap flange ring */}
        <line x1="10" y1="34" x2="38" y2="34" stroke="#C4943A" strokeWidth="2" opacity="0.45" />
        {/* Lyne arm extending right */}
        <line x1="34" y1="12" x2="54" y2="12" stroke="#C4943A" strokeWidth="1.8" opacity="0.4" />
        {/* Lyne arm pipe walls */}
        <line x1="34" y1="9" x2="54" y2="9" stroke="#C4943A" strokeWidth="0.8" opacity="0.25" />
        <line x1="34" y1="15" x2="54" y2="15" stroke="#C4943A" strokeWidth="0.8" opacity="0.25" />
        {/* Lyne arm end cap */}
        <line x1="54" y1="8" x2="54" y2="16" stroke="#C4943A" strokeWidth="1.2" opacity="0.35" />
        {/* Steam wisps */}
        <path d="M56 11 L59 8" stroke="#C4943A" strokeWidth="0.6" opacity="0.2" />
        <path d="M56 13 L58 16" stroke="#C4943A" strokeWidth="0.5" opacity="0.15" />
      </svg>
    </div>
  );
}

/* ── Collection vessel / barrel at bottom ── */
function CollectionVessel() {
  return (
    <div
      className="flex justify-center"
      style={{ width: "48px", height: "40px", position: "relative", zIndex: 3 }}
    >
      <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
        {/* Pipe coming down into vessel */}
        <line x1="21" y1="0" x2="21" y2="8" stroke="#C4943A" strokeWidth="1.5" opacity="0.45" />
        <line x1="27" y1="0" x2="27" y2="8" stroke="#C4943A" strokeWidth="1.5" opacity="0.45" />
        {/* Valve / shutoff */}
        <line x1="16" y1="8" x2="32" y2="8" stroke="#C4943A" strokeWidth="1.8" opacity="0.4" />
        {/* Collection barrel — small trapezoid/barrel outline */}
        <path
          d="M14 14 L14 34 Q14 38 24 38 Q34 38 34 34 L34 14"
          stroke="#C4943A"
          strokeWidth="1.5"
          opacity="0.4"
          fill="none"
        />
        {/* Barrel top rim */}
        <path
          d="M14 14 Q14 11 24 10 Q34 11 34 14"
          stroke="#C4943A"
          strokeWidth="1.2"
          opacity="0.35"
          fill="none"
        />
        {/* Barrel mid-band */}
        <line x1="14" y1="25" x2="34" y2="25" stroke="#C4943A" strokeWidth="0.8" opacity="0.2" />
        {/* Drip into barrel */}
        <line x1="24" y1="8" x2="24" y2="13" stroke="#C4943A" strokeWidth="0.8" opacity="0.25" strokeDasharray="2 2" />
      </svg>
    </div>
  );
}

/* ── Pipe segment — rendered in the flow, not through sight glasses ── */
function PipeSegment({ height }: { height: string }) {
  return (
    <div
      className="flex justify-center"
      style={{
        width: "48px",
        height,
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Outer pipe */}
      <div
        style={{
          width: "4px",
          height: "100%",
          borderRadius: "2px",
          background: "rgba(196,148,58,0.15)",
          boxShadow: "0 0 0 1px rgba(196,148,58,0.1)",
          position: "relative",
        }}
      >
        {/* Inner lighter line */}
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
      </div>
    </div>
  );
}

export default function HowWeHunt() {
  const pipeRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: pipeRef,
    offset: ["start 0.8", "end 0.3"],
  });

  const fillScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);
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
          maxWidth: "900px",
          paddingLeft: "clamp(24px, 5vw, 56px)",
          paddingRight: "clamp(24px, 5vw, 56px)",
        }}
      >
        {/* Section header — centered */}
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

        {/* Steps with integrated pipe-still */}
        <div
          ref={pipeRef}
          className="mx-auto"
          style={{
            maxWidth: "620px",
            position: "relative",
          }}
        >
          {/* ===== Scroll-driven fill overlay — absolute, behind everything ===== */}
          <div
            style={{
              position: "absolute",
              left: "22px",
              top: "34px",
              bottom: "40px",
              width: "4px",
              zIndex: 0,
              overflow: "hidden",
              borderRadius: "2px",
            }}
          >
            <motion.div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "2px",
                background: "linear-gradient(to bottom, #C4943A, #D4A44A)",
                transformOrigin: "top",
                scaleY: fillScaleY,
                opacity: fillOpacity,
                boxShadow: "0 0 10px rgba(196,148,58,0.4), 0 0 24px rgba(196,148,58,0.15)",
              }}
            />
          </div>

          {/* Still cap */}
          <StillCap />

          {/* Steps — pipe segments flow between sight glasses */}
          {steps.map((step, i) => (
            <div key={step.number}>
              {/* Pipe segment ABOVE this sight glass */}
              <PipeSegment height={i === 0 ? "20px" : "12px"} />

              {/* Step row: sight glass + content */}
              <div
                className="flex items-center"
                style={{ gap: "40px" }}
              >
                <SightGlass number={step.number} index={i} />
                <StepContent step={step} index={i} />
              </div>

              {/* Pipe segment BELOW this sight glass */}
              <PipeSegment height="20px" />

              {/* Bolted flange between steps (not after last) */}
              {i < steps.length - 1 && (
                <>
                  <BoltedFlange />
                  <PipeSegment height="8px" />
                </>
              )}
            </div>
          ))}

          {/* Collection vessel at bottom */}
          <CollectionVessel />
        </div>
      </div>
    </section>
  );
}
