"use client";

import { useRef } from "react";
import { useInView } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";

interface StepData {
  number: string;
  description: string;
}

const steps: StepData[] = [
  {
    number: "01",
    description: "We monitor state liquor control boards, warehouse shipments, and distributor networks daily",
  },
  {
    number: "02",
    description: "Our system filters thousands of data points to surface only confirmed allocations and verified drops",
  },
  {
    number: "03",
    description: "Every drop is tagged by bottle, tier, store location, and county before it reaches you",
  },
  {
    number: "04",
    description: "Instant alerts hit your phone the moment a bottle you're watching lands on a shelf",
  },
];

// Column geometry — fixed coordinate system
const COL_X  = 18;
const COL_W  = 50;
const COL_CX = COL_X + COL_W / 2;   // = 43
const VB_W   = 86;                    // viewBox width

/* ── SVG gradient def ── */
function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="hwh-copper" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(196,148,58,0.08)" />
          <stop offset="50%"  stopColor="rgba(196,148,58,0.15)" />
          <stop offset="100%" stopColor="rgba(196,148,58,0.08)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Sight glass ── */
function SightGlass({ number }: { number: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  return (
    <div
      ref={ref}
      style={{
        width: 42, height: 42,
        borderRadius: "50%",
        border: `2px solid ${isInView ? "#C4943A" : "#3A3530"}`,
        background: "var(--color-bg-primary)",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", zIndex: 2,
        boxShadow: isInView ? "0 0 18px rgba(196,148,58,0.22)" : "none",
        transition: "all 0.5s ease",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", inset: 3, borderRadius: "50%",
        border: `1px solid ${isInView ? "rgba(196,148,58,0.4)" : "rgba(58,53,48,0.5)"}`,
        background: isInView
          ? "radial-gradient(circle, rgba(13,11,7,0.65) 25%, rgba(196,148,58,0.12) 100%)"
          : "radial-gradient(circle, rgba(13,11,7,0.85) 25%, rgba(58,53,48,0.08) 100%)",
        transition: "all 0.5s ease",
      }} />
      <span style={{
        position: "relative", zIndex: 1,
        fontFamily: "var(--font-plus-jakarta)",
        fontSize: 11, fontWeight: 600,
        color: isInView ? "#F5EDD6" : "rgba(245,237,214,0.2)",
        transition: "color 0.5s ease",
      }}>
        {number}
      </span>
    </div>
  );
}

/* ── Column body SVG (stretches height) ── */
function CylinderBody({ plateCount }: { plateCount: number }) {
  const S = "#C4943A";
  const spacing = 100 / (plateCount + 1);
  return (
    <svg viewBox={`0 0 ${VB_W} 100`} preserveAspectRatio="none" fill="none"
      style={{ width: VB_W, height: "100%", display: "block" }}>
      <rect x={COL_X} y="0" width={COL_W} height="100" fill="url(#hwh-copper)" />
      <line x1={COL_X} y1="0" x2={COL_X} y2="100" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X+COL_W} y1="0" x2={COL_X+COL_W} y2="100" stroke={S} strokeWidth="1.5" opacity="0.4" />
      {Array.from({ length: plateCount }).map((_, j) => (
        <line key={j}
          x1={COL_X+4} y1={spacing*(j+1)} x2={COL_X+COL_W-4} y2={spacing*(j+1)}
          stroke={S} strokeWidth="0.6" strokeDasharray="4 3" opacity="0.18" />
      ))}
    </svg>
  );
}

/* ── Flange ── */
function Flange() {
  const S = "#C4943A";
  return (
    <svg viewBox={`0 0 ${VB_W} 14`} fill="none" style={{ width: VB_W, height: 14, display: "block" }}>
      <rect x={COL_X} y="0" width={COL_W} height="14" fill={S} opacity="0.04" />
      <line x1={COL_X-10} y1="3"  x2={COL_X+COL_W+10} y2="3"  stroke={S} strokeWidth="1.2" opacity="0.3" />
      <line x1={COL_X-10} y1="11" x2={COL_X+COL_W+10} y2="11" stroke={S} strokeWidth="1.2" opacity="0.3" />
      <circle cx={COL_X-7}        cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.25" fill="none" />
      <circle cx={COL_X+COL_W+7}  cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.25" fill="none" />
      <circle cx={COL_CX-12} cy="7" r="1.5" fill={S} opacity="0.15" />
      <circle cx={COL_CX}    cy="7" r="1.5" fill={S} opacity="0.15" />
      <circle cx={COL_CX+12} cy="7" r="1.5" fill={S} opacity="0.15" />
    </svg>
  );
}

/* ── Cap + lyne arm curving off right ── */
function StillCap() {
  const S = "#C4943A";
  const lidX = COL_X - 8; const lidW = COL_W + 16;
  const lidY = 38; const lidH = 5;
  const lx = COL_CX; const ly = lidY;
  // Lyne arm: up from lid, arc right, exit off-screen right
  const armPath = `M${lx} ${ly} L${lx} ${ly-12} C${lx} ${ly-22} ${lx+20} ${ly-22} ${lx+20} ${ly-10} C${lx+20} ${ly} ${lx+40} ${ly} ${VB_W+30} ${ly}`;
  return (
    <svg viewBox={`0 0 ${VB_W} ${lidY+lidH+2}`} fill="none" overflow="visible"
      style={{ width: VB_W, height: lidY+lidH+2, display: "block", overflow: "visible" }}>
      {/* Lid */}
      <rect x={lidX} y={lidY} width={lidW} height={lidH} fill={S} opacity="0.08" />
      <line x1={lidX} y1={lidY} x2={lidX+lidW} y2={lidY} stroke={S} strokeWidth="1.8" opacity="0.4" />
      <line x1={lidX} y1={lidY+lidH} x2={lidX+lidW} y2={lidY+lidH} stroke={S} strokeWidth="1" opacity="0.2" />
      <line x1={lidX} y1={lidY} x2={lidX} y2={lidY+lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={lidX+lidW} y1={lidY} x2={lidX+lidW} y2={lidY+lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Column walls below lid to bottom of viewbox */}
      <rect x={COL_X} y={lidY+lidH} width={COL_W} height={2} fill="url(#hwh-copper)" />
      <line x1={COL_X}      y1={lidY+lidH} x2={COL_X}      y2={lidY+lidH+2} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X+COL_W} y1={lidY+lidH} x2={COL_X+COL_W} y2={lidY+lidH+2} stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Lyne arm pipe — thick stroke for pipe body */}
      <path d={armPath} stroke={S} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" fill="none" />
      <path d={armPath} stroke={S} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" fill="none" />
      {/* Valve wheel mid-run */}
      <circle cx={lx+32} cy={ly} r="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1={lx+28} y1={ly} x2={lx+36} y2={ly} stroke={S} strokeWidth="0.8" opacity="0.25" />
      <line x1={lx+32} y1={ly-4} x2={lx+32} y2={ly+4} stroke={S} strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
}

/* ── Spout + product pipe flowing off left ── */
function StillSpout() {
  const S = "#C4943A";
  const outY = 48;
  // Product pipe: drops from spout, curves left, exits off-screen left
  const pipePath = `M${COL_CX} ${outY} L${COL_CX} ${outY+10} C${COL_CX} ${outY+22} ${COL_CX-14} ${outY+22} ${COL_CX-14} ${outY+12} C${COL_CX-14} ${outY+4} ${COL_CX-32} ${outY+4} ${-30} ${outY+4}`;
  return (
    <svg viewBox={`0 0 ${VB_W} 80`} fill="none" overflow="visible"
      style={{ width: VB_W, height: 80, display: "block", overflow: "visible" }}>
      {/* Walls */}
      <line x1={COL_X}      y1="0" x2={COL_X}      y2="20" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X+COL_W} y1="0" x2={COL_X+COL_W} y2="20" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <rect x={COL_X} y="0" width={COL_W} height="20" fill="url(#hwh-copper)" />
      {/* Taper */}
      <path d={`M${COL_X} 20 L${COL_CX-5} 40 L${COL_CX-5} ${outY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
      <path d={`M${COL_X+COL_W} 20 L${COL_CX+5} 40 L${COL_CX+5} ${outY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
      <path d={`M${COL_X} 20 L${COL_CX-5} 40 L${COL_CX-5} ${outY} L${COL_CX+5} ${outY} L${COL_CX+5} 40 L${COL_X+COL_W} 20 Z`} fill={S} opacity="0.04" />
      {/* Outlet valve */}
      <line x1={COL_CX-10} y1={outY} x2={COL_CX+10} y2={outY} stroke={S} strokeWidth="1.5" opacity="0.3" />
      {/* Product pipe */}
      <path d={pipePath} stroke={S} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" fill="none" />
      <path d={pipePath} stroke={S} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" fill="none" />
      {/* Valve on pipe */}
      <circle cx={COL_CX-22} cy={outY+4} r="4" stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
      <line x1={COL_CX-26} y1={outY+4} x2={COL_CX-18} y2={outY+4} stroke={S} strokeWidth="0.8" opacity="0.25" />
      <line x1={COL_CX-22} y1={outY}   x2={COL_CX-22} y2={outY+8} stroke={S} strokeWidth="0.8" opacity="0.25" />
    </svg>
  );
}

/* ── Step text ── */
function StepText({ step, index }: { step: StepData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  return (
    <div ref={ref} style={{
      opacity: isInView ? 1 : 0,
      transform: isInView ? "translateX(0)" : "translateX(20px)",
      transition: `all 0.6s cubic-bezier(0.25,0.1,0.25,1) ${index * 0.05}s`,
    }}>
      <p style={{
        fontFamily: "var(--font-plus-jakarta)",
        fontSize: 16, fontWeight: 500,
        color: "var(--color-text-primary)",
        lineHeight: 1.55, margin: 0,
      }}>
        {step.description}
      </p>
    </div>
  );
}

/* ── Desktop: still column left, step text right ── */
function StepRowDesktop({ step, index }: { step: StepData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  return (
    <div style={{ display: "flex", alignItems: "center", minHeight: 180 }}>
      {/* Still column slice */}
      <div ref={ref} style={{ width: VB_W, flexShrink: 0, alignSelf: "stretch", position: "relative" }}>
        <CylinderBody plateCount={index === 0 ? 2 : 3} />
        {/* Sight glass centered on column */}
        <div style={{
          position: "absolute", top: "50%", left: COL_CX,
          transform: "translate(-50%, -50%)",
        }}>
          <SightGlass number={step.number} />
        </div>
        {/* Dashed connector from right edge to step text */}
        <svg style={{ position: "absolute", top: "50%", left: VB_W, transform: "translateY(-50%)" }}
          width="28" height="1" overflow="visible">
          <line x1="0" y1="0.5" x2="28" y2="0.5"
            stroke="#3A3530" strokeWidth="1" strokeDasharray="4 2"
            opacity={isInView ? 0.5 : 0.15} style={{ transition: "opacity 0.5s" }} />
        </svg>
      </div>
      {/* Step text */}
      <div style={{ flex: 1, paddingLeft: 36 }}>
        <StepText step={step} index={index} />
      </div>
    </div>
  );
}

/* ── Mobile: sight glass + text side by side, no still column ── */
function StepRowMobile({ step, index }: { step: StepData; index: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "20px 0",
      borderTop: index === 0 ? "none" : "1px solid rgba(196,148,58,0.1)" }}>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <SightGlass number={step.number} />
      </div>
      <div style={{ flex: 1 }}>
        <StepText step={step} index={index} />
      </div>
    </div>
  );
}

export default function HowWeHunt() {
  return (
    <section id="how-we-hunt" style={{
      backgroundColor: "var(--color-bg-primary)",
      paddingTop: 80, paddingBottom: 80, width: "100%",
    }}>
      <SvgDefs />

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px" }}>
        {/* Header */}
        <ScrollReveal>
          <p className="text-center" style={{
            fontFamily: "var(--font-plus-jakarta)", fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.2em",
            color: "var(--color-accent-amber)", marginBottom: 14,
          }}>
            THE PROCESS
          </p>
          <h2 className="text-center" style={{
            fontFamily: "var(--font-fraunces)", fontSize: "clamp(32px, 6vw, 44px)",
            fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 14,
          }}>
            The Process
          </h2>
          <p className="text-center mx-auto" style={{
            fontFamily: "var(--font-plus-jakarta)", fontSize: 16,
            color: "var(--color-text-secondary)", maxWidth: 480, marginBottom: 56,
            lineHeight: 1.6,
          }}>
            From raw data to your phone in minutes. Distilled for speed.
          </p>
        </ScrollReveal>

        {/* ── Desktop layout (still + steps side by side) ── */}
        <div className="hidden md:block">
          <StillCap />
          {steps.map((step, i) => (
            <div key={step.number}>
              <StepRowDesktop step={step} index={i} />
              {i < steps.length - 1 && <Flange />}
            </div>
          ))}
          <StillSpout />
        </div>

        {/* ── Mobile layout (sight glass + text, stacked) ── */}
        <div className="md:hidden">
          {steps.map((step, i) => (
            <StepRowMobile key={step.number} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
