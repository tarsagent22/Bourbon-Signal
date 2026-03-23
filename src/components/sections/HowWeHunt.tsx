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

/* ── Fix #4: flat-lid cap + thin pipe + valve arm ── */
function StillCap() {
  const S = "#C4943A";
  // Lid is COL_W + 10px each side => from COL_X-10 to COL_X+COL_W+10
  const lidX = COL_X - 10;
  const lidW = COL_W + 20;
  const lidY = 36; // top of the lid rect
  const lidH = 6;  // lid height
  // Pipe: 4px wide, 20px tall, centered at COL_CX, sits above the lid
  const pipeX = COL_CX - 2;
  const pipeTop = lidY - 20;
  // Valve arm: extends right from center of pipe, 20px, ending in circle
  const armY = pipeTop + 8;
  const armEndX = COL_CX + 22;

  return (
    <div style={{ width: `${VIEWBOX_W}px`, height: "52px", position: "relative" }}>
      <svg viewBox={`0 0 ${VIEWBOX_W} 52`} fill="none" style={{ width: `${VIEWBOX_W}px`, height: "52px" }}>
        {/* Thin vertical pipe above lid */}
        <rect x={pipeX} y={pipeTop} width="4" height="20" fill={S} opacity="0.2" />
        <line x1={pipeX} y1={pipeTop} x2={pipeX} y2={lidY} stroke={S} strokeWidth="0.8" opacity="0.35" />
        <line x1={pipeX + 4} y1={pipeTop} x2={pipeX + 4} y2={lidY} stroke={S} strokeWidth="0.8" opacity="0.35" />

        {/* Horizontal valve arm extending right */}
        <line x1={COL_CX} y1={armY} x2={armEndX} y2={armY} stroke={S} strokeWidth="1.5" opacity="0.4" />
        {/* Valve circle at end */}
        <circle cx={armEndX + 3} cy={armY} r="3" stroke={S} strokeWidth="1" opacity="0.35" fill="none" />

        {/* Flat lid rect */}
        <rect x={lidX} y={lidY} width={lidW} height={lidH} fill={S} opacity="0.08" />
        <line x1={lidX} y1={lidY} x2={lidX + lidW} y2={lidY} stroke={S} strokeWidth="1.8" opacity="0.4" />
        <line x1={lidX} y1={lidY + lidH} x2={lidX + lidW} y2={lidY + lidH} stroke={S} strokeWidth="1.2" opacity="0.25" />
        {/* Two small vertical lines on each end going down from top of lid */}
        <line x1={lidX} y1={lidY} x2={lidX} y2={lidY + 6} stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1={lidX + lidW} y1={lidY} x2={lidX + lidW} y2={lidY + 6} stroke={S} strokeWidth="1.5" opacity="0.4" />

        {/* Column walls connecting to cap */}
        <line x1={COL_X} y1={lidY + lidH} x2={COL_X} y2={52} stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1={COL_X + COL_W} y1={lidY + lidH} x2={COL_X + COL_W} y2={52} stroke={S} strokeWidth="1.5" opacity="0.4" />
        <rect x={COL_X} y={lidY + lidH} width={COL_W} height={52 - lidY - lidH} fill="url(#hwh-copper)" />
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

/* ── Fix #8: spout + drip + bourbon bottle at bottom ── */
function StillSpout() {
  const S = "#C4943A";
  // Bottle shape: simple outline
  const bottleX = COL_CX - 14;
  const bottleY = 72;
  return (
    <div style={{ width: `${VIEWBOX_W}px`, height: "120px" }}>
      <svg viewBox={`0 0 ${VIEWBOX_W} 120`} fill="none" style={{ width: `${VIEWBOX_W}px`, height: "120px" }}>
        {/* Continuing walls */}
        <line x1={COL_X} y1="0" x2={COL_X} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1={COL_X + COL_W} y1="0" x2={COL_X + COL_W} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <rect x={COL_X} y="0" width={COL_W} height="22" fill="url(#hwh-copper)" />

        {/* Narrowing to spout — converges to center */}
        <path d={`M${COL_X} 22 L${COL_CX - 6} 42 L${COL_CX - 6} 58`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        <path d={`M${COL_X + COL_W} 22 L${COL_CX + 6} 42 L${COL_CX + 6} 58`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        {/* Spout fill */}
        <path d={`M${COL_X} 22 L${COL_CX - 6} 42 L${COL_CX - 6} 58 L${COL_CX + 6} 58 L${COL_CX + 6} 42 L${COL_X + COL_W} 22 Z`} fill={S} opacity="0.04" />

        {/* Spout valve line */}
        <line x1={COL_CX - 12} y1="58" x2={COL_CX + 12} y2="58" stroke={S} strokeWidth="1.5" opacity="0.3" />

        {/* Drip line from spout to bottle */}
        <line x1={COL_CX} y1="60" x2={COL_CX} y2={bottleY + 4} stroke={S} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.3" />
        {/* Drip drop */}
        <ellipse cx={COL_CX} cy={bottleY + 2} rx="2" ry="2.5" fill={S} opacity="0.35" />

        {/* Bottle outline */}
        {/* Neck */}
        <rect x={bottleX + 9} y={bottleY + 4} width="10" height="14" rx="1" stroke={S} strokeWidth="1" opacity="0.3" fill={S} fillOpacity="0.04" />
        {/* Shoulder curve */}
        <path d={`M${bottleX + 9} ${bottleY + 18} Q${bottleX + 4} ${bottleY + 22} ${bottleX + 2} ${bottleY + 28}`} stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
        <path d={`M${bottleX + 19} ${bottleY + 18} Q${bottleX + 24} ${bottleY + 22} ${bottleX + 26} ${bottleY + 28}`} stroke={S} strokeWidth="1" opacity="0.3" fill="none" />
        {/* Body */}
        <rect x={bottleX + 2} y={bottleY + 28} width="24" height="30" rx="2" stroke={S} strokeWidth="1" opacity="0.3" fill={S} fillOpacity="0.06" />
        {/* Bottom */}
        <line x1={bottleX + 2} y1={bottleY + 58} x2={bottleX + 26} y2={bottleY + 58} stroke={S} strokeWidth="1.2" opacity="0.3" />
        {/* Label line detail */}
        <line x1={bottleX + 5} y1={bottleY + 38} x2={bottleX + 23} y2={bottleY + 38} stroke={S} strokeWidth="0.6" opacity="0.2" />
        <line x1={bottleX + 5} y1={bottleY + 48} x2={bottleX + 23} y2={bottleY + 48} stroke={S} strokeWidth="0.6" opacity="0.2" />
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
            How we hunt
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
