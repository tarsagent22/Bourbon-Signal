"use client";

import { useRef } from "react";
import { useInView } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";

interface StepData {
  number: string;
  description: string;
  flavor: string;
}

const steps: StepData[] = [
  {
    number: "01",
    description:
      "We monitor state liquor control boards, warehouse shipments, and distributor networks daily",
    flavor: "Proprietary sourcing across every major channel",
  },
  {
    number: "02",
    description:
      "Our system filters thousands of data points to surface only confirmed allocations and verified drops",
    flavor: "A special formulation — tuned to catch what others miss",
  },
  {
    number: "03",
    description:
      "Every drop is tagged by bottle, tier, store location, and county before it reaches you",
    flavor: "Organized, searchable, and mapped to your watchlist",
  },
  {
    number: "04",
    description:
      "Instant alerts hit your phone the moment a bottle you're watching lands on a shelf",
    flavor: "Seconds matter — you'll know before the crowd",
  },
];

// Column geometry constants — single source of truth
const COL_X = 20;        // left edge of column rect
const COL_W = 54;        // width of column body (fix #6: 50-56px)
const COL_CX = COL_X + COL_W / 2; // center X = 47
const VIEWBOX_W = 90;    // svg viewBox width

/* ── Sight glass — lights up amber on scroll ── */
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
      {/* Fix #5: page font, 12px/600, no space between digits */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontFamily: "var(--font-plus-jakarta)",
          fontSize: "12px",
          fontWeight: 600,
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
      {/* Fix #3: NO step-num div — number is already in the sight glass */}
      <p
        style={{
          fontFamily: "var(--font-plus-jakarta)",
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
          fontFamily: "var(--font-plus-jakarta)",
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
        {/* Fix #6: cylindrical 3-stop copper gradient */}
        <linearGradient id="hwh-copper" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(196,148,58,0.08)" />
          <stop offset="50%"  stopColor="rgba(196,148,58,0.15)" />
          <stop offset="100%" stopColor="rgba(196,148,58,0.08)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Still cap + lyne arm curving off to the right ── */
function StillCap() {
  const S = "#C4943A";
  const PW = 5;          // pipe stroke width
  const lidX = COL_X - 10;
  const lidW = COL_W + 20;
  const lidY = 46;
  const lidH = 6;

  // Lyne arm: rises from center of lid, makes a gentle S-curve right, exits off screen
  // Start: top-center of lid
  const lx0 = COL_CX;
  const ly0 = lidY;
  // Rise up a bit
  const lx1 = COL_CX;
  const ly1 = lidY - 14;
  // Sweep right and down into a curve, then back up and off-screen right
  // Using two cubic bezier segments for the multi-turn look

  return (
    <div style={{ width: "100%", height: "80px", position: "relative", overflow: "visible" }}>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} 80`}
        fill="none"
        overflow="visible"
        style={{ width: `${VIEWBOX_W}px`, height: "80px", overflow: "visible" }}
      >
        {/* Flat lid */}
        <rect x={lidX} y={lidY} width={lidW} height={lidH} fill={S} opacity="0.08" />
        <line x1={lidX} y1={lidY} x2={lidX + lidW} y2={lidY} stroke={S} strokeWidth="1.8" opacity="0.4" />
        <line x1={lidX} y1={lidY + lidH} x2={lidX + lidW} y2={lidY + lidH} stroke={S} strokeWidth="1.2" opacity="0.25" />
        <line x1={lidX} y1={lidY} x2={lidX} y2={lidY + lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1={lidX + lidW} y1={lidY} x2={lidX + lidW} y2={lidY + lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />

        {/* Column walls below lid */}
        <line x1={COL_X} y1={lidY + lidH} x2={COL_X} y2={80} stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1={COL_X + COL_W} y1={lidY + lidH} x2={COL_X + COL_W} y2={80} stroke={S} strokeWidth="1.5" opacity="0.4" />
        <rect x={COL_X} y={lidY + lidH} width={COL_W} height={80 - lidY - lidH} fill="url(#hwh-copper)" />

        {/*
          Lyne arm path (pipe centerline):
          Start at lid center-top, rise up, turn right, dip down in an arc,
          turn right again and exit off the right edge.

          Segment 1: vertical rise from lid top → first elbow
          Segment 2: sweep right and slightly down (first arc)
          Segment 3: level out then rise, exit right off-screen
        */}

        {/* Lyne arm pipe — wide, runs off right edge of screen */}
        <path
          d={`
            M ${lx0} ${ly0}
            L ${lx1} ${ly1}
            C ${lx1} ${ly1 - 10}, ${lx1 + 22} ${ly1 - 10}, ${lx1 + 22} ${ly1 + 6}
            C ${lx1 + 22} ${ly1 + 18}, ${lx1 + 42} ${ly1 + 18}, 600 ${ly1 + 18}
          `}
          stroke={S}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.3"
          fill="none"
        />
        {/* Inner highlight */}
        <path
          d={`
            M ${lx0} ${ly0}
            L ${lx1} ${ly1}
            C ${lx1} ${ly1 - 10}, ${lx1 + 22} ${ly1 - 10}, ${lx1 + 22} ${ly1 + 6}
            C ${lx1 + 22} ${ly1 + 18}, ${lx1 + 42} ${ly1 + 18}, 600 ${ly1 + 18}
          `}
          stroke={S}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.18"
          fill="none"
        />

        {/* Valve wheel — bigger, more visible */}
        <circle cx={lx1 + 38} cy={ly1 + 18} r="8" stroke={S} strokeWidth="1.5" opacity="0.4" fill="none" />
        <line x1={lx1 + 30} y1={ly1 + 18} x2={lx1 + 46} y2={ly1 + 18} stroke={S} strokeWidth="1.2" opacity="0.35" />
        <line x1={lx1 + 38} y1={ly1 + 10} x2={lx1 + 38} y2={ly1 + 26} stroke={S} strokeWidth="1.2" opacity="0.35" />
        <circle cx={lx1 + 38} cy={ly1 + 18} r="2.5" fill={S} opacity="0.2" />
      </svg>
    </div>
  );
}

/* ── Cylinder body — stretches to fill row height ── */
function CylinderBody({ plateCount }: { plateCount: number }) {
  const S = "#C4943A";
  const plates = Array.from({ length: plateCount });
  const spacing = 100 / (plateCount + 1);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} 100`}
      preserveAspectRatio="none"
      fill="none"
      style={{ width: `${VIEWBOX_W}px`, height: "100%", display: "block" }}
    >
      {/* Fix #6: wider body with cylindrical copper gradient */}
      <rect x={COL_X} y="0" width={COL_W} height="100" fill="url(#hwh-copper)" />
      {/* Left wall */}
      <line x1={COL_X} y1="0" x2={COL_X} y2="100" stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Right wall */}
      <line x1={COL_X + COL_W} y1="0" x2={COL_X + COL_W} y2="100" stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Bubble plate dashed lines */}
      {plates.map((_, j) => {
        const y = spacing * (j + 1);
        return (
          <line
            key={j}
            x1={COL_X + 4}
            y1={y}
            x2={COL_X + COL_W - 4}
            y2={y}
            stroke={S}
            strokeWidth="0.6"
            strokeDasharray="4 3"
            opacity="0.18"
          />
        );
      })}
      {/* Fix #7: dashed connector from RIGHT edge of column to step text */}
      {/* This line is drawn in the step row layout instead — see below */}
    </svg>
  );
}

/* ── Connector line from right edge of column to step text ── */
function ConnectorLine({ isInView }: { isInView: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        // starts at right edge of column, extends to step text
        left: `${VIEWBOX_W}px`,
        width: "32px",
        height: "1px",
        borderTop: "1px dashed #3A3530",
        borderTopStyle: "dashed",
        opacity: isInView ? 0.6 : 0.2,
        transition: "opacity 0.5s ease",
        // dash pattern via backgroundImage trick since border-dash isn't reliable cross-browser
        background: "none",
      }}
    >
      <svg
        width="32"
        height="1"
        style={{ position: "absolute", top: "-0.5px", left: 0 }}
      >
        <line
          x1="0"
          y1="0.5"
          x2="32"
          y2="0.5"
          stroke="#3A3530"
          strokeWidth="1"
          strokeDasharray="4 2"
        />
      </svg>
    </div>
  );
}

/* ── Riveted flange between sections ── */
function Flange() {
  const S = "#C4943A";
  return (
    <div style={{ width: `${VIEWBOX_W}px`, height: "14px" }}>
      <svg viewBox={`0 0 ${VIEWBOX_W} 14`} fill="none" style={{ width: `${VIEWBOX_W}px`, height: "14px" }}>
        <rect x={COL_X} y="0" width={COL_W} height="14" fill={S} opacity="0.04" />
        {/* Flange lines extend past walls */}
        <line x1={COL_X - 10} y1="3" x2={COL_X + COL_W + 10} y2="3" stroke={S} strokeWidth="1.2" opacity="0.3" />
        <line x1={COL_X - 10} y1="11" x2={COL_X + COL_W + 10} y2="11" stroke={S} strokeWidth="1.2" opacity="0.3" />
        {/* Bolt circles */}
        <circle cx={COL_X - 7} cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.25" fill="none" />
        <circle cx={COL_X + COL_W + 7} cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.25" fill="none" />
        {/* Center bolts */}
        <circle cx={COL_CX - 12} cy="7" r="1.5" fill={S} opacity="0.15" />
        <circle cx={COL_CX} cy="7" r="1.5" fill={S} opacity="0.15" />
        <circle cx={COL_CX + 12} cy="7" r="1.5" fill={S} opacity="0.15" />
      </svg>
    </div>
  );
}

/* ── Spout + product pipe flowing off left edge ── */
function StillSpout() {
  const S = "#C4943A";
  const PW = 5;
  const bCX = COL_CX;

  // Spout narrows from column base down to a small outlet, then a pipe
  // curves left and exits off the left edge of the screen
  const spoutOutY = 52;   // Y where spout outlet is
  const spoutOutX = bCX;  // center of spout outlet

  return (
    <div style={{ width: "100%", height: "90px", position: "relative", overflow: "visible" }}>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} 90`}
        fill="none"
        overflow="visible"
        style={{ width: `${VIEWBOX_W}px`, height: "90px", overflow: "visible" }}
      >
        {/* Continuing column walls */}
        <line x1={COL_X} y1="0" x2={COL_X} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1={COL_X + COL_W} y1="0" x2={COL_X + COL_W} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <rect x={COL_X} y="0" width={COL_W} height="22" fill="url(#hwh-copper)" />

        {/* Converging spout walls */}
        <path d={`M${COL_X} 22 L${spoutOutX - 5} 44 L${spoutOutX - 5} ${spoutOutY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        <path d={`M${COL_X + COL_W} 22 L${spoutOutX + 5} 44 L${spoutOutX + 5} ${spoutOutY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        <path d={`M${COL_X} 22 L${spoutOutX - 5} 44 L${spoutOutX - 5} ${spoutOutY} L${spoutOutX + 5} ${spoutOutY} L${spoutOutX + 5} 44 L${COL_X + COL_W} 22 Z`} fill={S} opacity="0.04" />

        {/*
          Product pipe: exits spout bottom, drops slightly,
          curves left, levels out, exits off left edge
        */}
        {/* Product pipe — wide, runs off left edge of screen */}
        <path
          d={`
            M ${spoutOutX} ${spoutOutY}
            L ${spoutOutX} ${spoutOutY + 10}
            C ${spoutOutX} ${spoutOutY + 24}, ${spoutOutX - 16} ${spoutOutY + 24}, ${spoutOutX - 16} ${spoutOutY + 14}
            C ${spoutOutX - 16} ${spoutOutY + 6}, ${spoutOutX - 36} ${spoutOutY + 6}, -500 ${spoutOutY + 6}
          `}
          stroke={S}
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.3"
          fill="none"
        />
        {/* Inner highlight */}
        <path
          d={`
            M ${spoutOutX} ${spoutOutY}
            L ${spoutOutX} ${spoutOutY + 10}
            C ${spoutOutX} ${spoutOutY + 24}, ${spoutOutX - 16} ${spoutOutY + 24}, ${spoutOutX - 16} ${spoutOutY + 14}
            C ${spoutOutX - 16} ${spoutOutY + 6}, ${spoutOutX - 36} ${spoutOutY + 6}, -500 ${spoutOutY + 6}
          `}
          stroke={S}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.18"
          fill="none"
        />

        {/* Valve wheel — bigger, more visible */}
        <circle cx={spoutOutX - 28} cy={spoutOutY + 6} r="8" stroke={S} strokeWidth="1.5" opacity="0.4" fill="none" />
        <line x1={spoutOutX - 36} y1={spoutOutY + 6} x2={spoutOutX - 20} y2={spoutOutY + 6} stroke={S} strokeWidth="1.2" opacity="0.35" />
        <line x1={spoutOutX - 28} y1={spoutOutY - 2} x2={spoutOutX - 28} y2={spoutOutY + 14} stroke={S} strokeWidth="1.2" opacity="0.35" />
        <circle cx={spoutOutX - 28} cy={spoutOutY + 6} r="2.5" fill={S} opacity="0.2" />
      </svg>
    </div>
  );
}

/* ── Step row — manages sight glass centering + connector ── */
function StepRow({ step, index }: { step: StepData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-12% 0px -12% 0px" });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: "200px",
      }}
    >
      {/* Left: cylinder body + sight glass centered on column */}
      <div
        ref={ref}
        style={{
          width: `${VIEWBOX_W}px`,
          flexShrink: 0,
          alignSelf: "stretch",
          position: "relative",
        }}
      >
        <CylinderBody plateCount={index === 0 ? 2 : 3} />

        {/* Fix #2: sight glass centered ON the column body — center X = COL_CX */}
        {/* COL_CX in viewBox coords maps to (COL_CX / VIEWBOX_W * 90px) in DOM */}
        {/* Since viewBox width = VIEWBOX_W and rendered width = VIEWBOX_W px, it's 1:1 */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${COL_CX}px`,          // center of column
            transform: "translate(-50%, -50%)",
          }}
        >
          <SightGlass number={step.number} index={index} />
        </div>

        {/* Fix #7: dashed connector from right edge of column */}
        <ConnectorLine isInView={isInView} />
      </div>

      {/* Right: step text */}
      <div style={{ flex: 1, paddingLeft: "40px" }}>
        <StepText step={step} index={index} />
      </div>
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
      <SvgDefs />

      {/* Fix #1: center entire section with max-width 800px */}
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "0 40px",
        }}
      >
        {/* Section header — centered over same max-width */}
        <ScrollReveal>
          <p
            className="text-center"
            style={{
              fontFamily: "var(--font-plus-jakarta)",
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
              fontFamily: "var(--font-fraunces)",
              fontSize: "44px",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              marginBottom: "16px",
            }}
          >
            The Process
          </h2>
          <p
            className="text-center mx-auto"
            style={{
              fontFamily: "var(--font-plus-jakarta)",
              fontSize: "17px",
              color: "var(--color-text-secondary)",
              maxWidth: "520px",
              marginBottom: "72px",
            }}
          >
            From raw data to your phone in minutes. Same process, distilled for speed.
          </p>
        </ScrollReveal>

        {/* Still + Steps — same max-width container */}
        <div>
          <StillCap />

          {steps.map((step, i) => (
            <div key={step.number}>
              <StepRow step={step} index={i} />
              {i < steps.length - 1 && <Flange />}
            </div>
          ))}

          <StillSpout />
        </div>
      </div>
    </section>
  );
}
