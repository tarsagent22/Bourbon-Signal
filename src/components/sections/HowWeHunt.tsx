"use client";

import { useRef } from "react";
import { useInView } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";

interface StepData {
  number: string;
  label: string;
  description: string;
  flavor: string;
}

const steps: StepData[] = [
  {
    number: "01",
    label: "0 1",
    description:
      "We monitor state liquor control boards, warehouse shipments, and distributor networks daily",
    flavor: "Proprietary sourcing across every major channel",
  },
  {
    number: "02",
    label: "0 2",
    description:
      "Our system filters thousands of data points to surface only confirmed allocations and verified drops",
    flavor: "A special formulation — tuned to catch what others miss",
  },
  {
    number: "03",
    label: "0 3",
    description:
      "Every drop is tagged by bottle, tier, store location, and county before it reaches you",
    flavor: "Organized, searchable, and mapped to your watchlist",
  },
  {
    number: "04",
    label: "0 4",
    description:
      "Instant alerts hit your phone the moment a bottle you're watching lands on a shelf",
    flavor: "Seconds matter — you'll know before the crowd",
  },
];

/* ── Sight glass porthole — lights up amber on scroll ── */
function SightGlass({ number, index }: { number: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-18% 0px -18% 0px" });

  return (
    <div
      ref={ref}
      className="flex items-center justify-center"
      style={{
        width: "46px",
        height: "46px",
        borderRadius: "50%",
        border: `2px solid ${isInView ? "#C4943A" : "#3A3530"}`,
        background: "var(--color-bg-primary)",
        position: "relative",
        zIndex: 2,
        boxShadow: isInView
          ? "0 0 20px rgba(196,148,58,0.25), 0 0 4px rgba(196,148,58,0.1)"
          : "none",
        transition: "all 0.5s ease",
      }}
    >
      {/* Inner ring with glass gradient */}
      <div
        style={{
          position: "absolute",
          inset: "3px",
          borderRadius: "50%",
          border: `1px solid ${isInView ? "rgba(196,148,58,0.45)" : "rgba(58,53,48,0.6)"}`,
          background: isInView
            ? "radial-gradient(circle, rgba(13,11,7,0.65) 25%, rgba(196,148,58,0.15) 100%)"
            : "radial-gradient(circle, rgba(13,11,7,0.85) 25%, rgba(58,53,48,0.1) 100%)",
          boxShadow: "inset 0 1px 4px rgba(0,0,0,0.4)",
          transition: "all 0.5s ease",
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontFamily: "var(--font-jetbrains)",
          fontSize: "12px",
          fontWeight: 700,
          color: isInView ? "#F5EDD6" : "rgba(245,237,214,0.25)",
          transition: "color 0.5s ease",
        }}
      >
        {number}
      </span>
    </div>
  );
}

/* ── Step text — slides in from right ── */
function StepText({ step, index }: { step: StepData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-12% 0px -12% 0px" });

  return (
    <div
      ref={ref}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? "translateX(0)" : "translateX(24px)",
        transition: `all 0.6s cubic-bezier(0.25,0.1,0.25,1) ${index * 0.05}s`,
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "13px",
          fontWeight: 600,
          color: "#C4943A",
          letterSpacing: "0.15em",
          marginBottom: "12px",
        }}
      >
        {step.label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "17px",
          fontWeight: 500,
          color: "var(--color-text-primary)",
          lineHeight: 1.55,
          marginBottom: "14px",
        }}
      >
        {step.description}
      </p>
      <p
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "15px",
          fontStyle: "italic",
          color: "rgba(196,148,58,0.45)",
          lineHeight: 1.5,
        }}
      >
        {step.flavor}
      </p>
    </div>
  );
}

/* ── SVG defs — shared gradient, defined once ── */
function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="hwh-copper" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#C4943A" stopOpacity="0.12" />
          <stop offset="40%" stopColor="#C4943A" stopOpacity="0.04" />
          <stop offset="60%" stopColor="#C4943A" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#C4943A" stopOpacity="0.12" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Still cap — dome + lyne arm ── */
function StillCap() {
  const S = "#C4943A";
  return (
    <div style={{ width: "80px", height: "52px", position: "relative" }}>
      <svg viewBox="0 0 90 52" fill="none" style={{ width: "90px", height: "52px" }}>
        {/* Dome rising from cylinder top */}
        <path
          d="M22 52 L22 28 Q22 6 40 2 Q58 6 58 28 L58 52"
          stroke={S}
          strokeWidth="1.5"
          opacity="0.4"
          fill="none"
        />
        {/* Dome fill */}
        <path
          d="M22 52 L22 28 Q22 6 40 2 Q58 6 58 28 L58 52 Z"
          fill={S}
          opacity="0.04"
        />
        {/* Flange ring at base of dome */}
        <line x1="14" y1="52" x2="66" y2="52" stroke={S} strokeWidth="1.8" opacity="0.35" />
        {/* Lyne arm — horizontal pipe extending right */}
        <line x1="58" y1="18" x2="82" y2="18" stroke={S} strokeWidth="1.5" opacity="0.4" />
        {/* Arm pipe walls */}
        <line x1="58" y1="14" x2="82" y2="14" stroke={S} strokeWidth="0.7" opacity="0.2" />
        <line x1="58" y1="22" x2="82" y2="22" stroke={S} strokeWidth="0.7" opacity="0.2" />
        {/* End cap ball */}
        <circle cx="84" cy="18" r="3" stroke={S} strokeWidth="1" opacity="0.35" fill="none" />
      </svg>
    </div>
  );
}

/* ── Cylinder body section — stretches to fill row height ── */
function CylinderBody({ plateCount }: { plateCount: number }) {
  const S = "#C4943A";
  const plates = Array.from({ length: plateCount });
  const spacing = 100 / (plateCount + 1);

  return (
    <svg
      viewBox="0 0 80 100"
      preserveAspectRatio="none"
      fill="none"
      style={{ width: "80px", height: "100%", display: "block" }}
    >
      {/* Body fill */}
      <rect x="14" y="0" width="52" height="100" fill="url(#hwh-copper)" />
      {/* Left wall */}
      <line x1="14" y1="0" x2="14" y2="100" stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Right wall */}
      <line x1="66" y1="0" x2="66" y2="100" stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Bubble plate dashed lines */}
      {plates.map((_, j) => {
        const y = spacing * (j + 1);
        return (
          <line
            key={j}
            x1="18"
            y1={y}
            x2="62"
            y2={y}
            stroke={S}
            strokeWidth="0.6"
            strokeDasharray="4 3"
            opacity="0.18"
          />
        );
      })}
    </svg>
  );
}

/* ── Riveted flange between sections ── */
function Flange() {
  const S = "#C4943A";
  return (
    <div style={{ width: "80px", height: "14px" }}>
      <svg viewBox="0 0 80 14" fill="none" style={{ width: "80px", height: "14px" }}>
        {/* Fill between flanges */}
        <rect x="14" y="0" width="52" height="14" fill={S} opacity="0.04" />
        {/* Top flange line — extends past walls */}
        <line x1="4" y1="3" x2="76" y2="3" stroke={S} strokeWidth="1.2" opacity="0.3" />
        {/* Bottom flange line */}
        <line x1="4" y1="11" x2="76" y2="11" stroke={S} strokeWidth="1.2" opacity="0.3" />
        {/* Bolt circles at ends */}
        <circle cx="7" cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.25" fill="none" />
        <circle cx="73" cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.25" fill="none" />
        {/* Center bolts */}
        <circle cx="28" cy="7" r="1.5" fill={S} opacity="0.15" />
        <circle cx="40" cy="7" r="1.5" fill={S} opacity="0.15" />
        <circle cx="52" cy="7" r="1.5" fill={S} opacity="0.15" />
      </svg>
    </div>
  );
}

/* ── Collection vessel / spout at bottom ── */
function StillSpout() {
  const S = "#C4943A";
  return (
    <div style={{ width: "80px", height: "80px" }}>
      <svg viewBox="0 0 80 80" fill="none" style={{ width: "80px", height: "80px" }}>
        {/* Continuing walls */}
        <line x1="14" y1="0" x2="14" y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1="66" y1="0" x2="66" y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <rect x="14" y="0" width="52" height="22" fill={S} opacity="0.04" />
        {/* Narrowing to spout */}
        <path d="M14 22 L24 40 L24 58" stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        <path d="M66 22 L56 40 L56 58" stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        {/* Spout valve */}
        <line x1="20" y1="58" x2="60" y2="58" stroke={S} strokeWidth="1.5" opacity="0.3" />
        {/* Drip */}
        <line x1="40" y1="60" x2="40" y2="68" stroke={S} strokeWidth="0.8" opacity="0.2" strokeDasharray="2 2" />
        <circle cx="40" cy="72" r="2" fill={S} opacity="0.2" />
      </svg>
    </div>
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
      {/* Shared SVG defs */}
      <SvgDefs />

      <div
        className="mx-auto"
        style={{
          maxWidth: "900px",
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
              letterSpacing: "0.2em",
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
            How we hunt
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

        {/* Still + Steps layout */}
        <div className="mx-auto" style={{ maxWidth: "720px" }}>
          {/* Still cap */}
          <StillCap />

          {steps.map((step, i) => (
            <div key={step.number}>
              {/* Step row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: "200px",
                }}
              >
                {/* Left: cylinder body + sight glass */}
                <div
                  style={{
                    width: "80px",
                    flexShrink: 0,
                    alignSelf: "stretch",
                    position: "relative",
                  }}
                >
                  <CylinderBody plateCount={i === 0 ? 2 : 3} />
                  {/* Sight glass centered on left wall */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "14px",
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <SightGlass number={step.number} index={i} />
                  </div>
                </div>

                {/* Right: step text */}
                <div style={{ flex: 1, paddingLeft: "40px" }}>
                  <StepText step={step} index={i} />
                </div>
              </div>

              {/* Flange between sections */}
              {i < steps.length - 1 && <Flange />}
            </div>
          ))}

          {/* Still spout */}
          <StillSpout />
        </div>
      </div>
    </section>
  );
}
