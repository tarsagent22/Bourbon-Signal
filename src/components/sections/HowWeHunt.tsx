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

/* ── Spout + drip + Weller-style bottle at bottom ── */
function StillSpout() {
  const S = "#C4943A";

  // Weller silhouette: tall, lean, slight waist, pronounced square shoulders, long neck
  // All coords relative to bottleOriginX / bottleOriginY
  const bCX = COL_CX;          // bottle center X
  const bTop = 72;             // top of bottle (mouth)

  // Proportions (scaled to ~28px wide, ~88px tall — tall & lean like Weller)
  const bHalfW  = 14;          // half-width of body
  const bNeckHW = 4;           // half-width of neck
  const bCapH   = 6;           // aluminum cap height
  const bNeckH  = 18;          // neck height
  const bShoulderH = 10;       // shoulder transition height
  const bBodyH  = 52;          // body height
  const bBaseY  = bTop + bCapH + bNeckH + bShoulderH + bBodyH;

  // Key Y coords
  const capTop      = bTop;
  const neckTop     = bTop + bCapH;
  const shoulderTop = neckTop + bNeckH;
  const bodyTop     = shoulderTop + bShoulderH;
  const bodyBot     = bodyTop + bBodyH;

  return (
    <div style={{ width: `${VIEWBOX_W}px`, height: "190px" }}>
      <svg viewBox={`0 0 ${VIEWBOX_W} 190`} fill="none" style={{ width: `${VIEWBOX_W}px`, height: "190px" }}>
        {/* Continuing column walls */}
        <line x1={COL_X} y1="0" x2={COL_X} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <line x1={COL_X + COL_W} y1="0" x2={COL_X + COL_W} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
        <rect x={COL_X} y="0" width={COL_W} height="22" fill="url(#hwh-copper)" />

        {/* Narrowing to spout */}
        <path d={`M${COL_X} 22 L${bCX - 6} 42 L${bCX - 6} 58`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        <path d={`M${COL_X + COL_W} 22 L${bCX + 6} 42 L${bCX + 6} 58`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
        <path d={`M${COL_X} 22 L${bCX - 6} 42 L${bCX - 6} 58 L${bCX + 6} 58 L${bCX + 6} 42 L${COL_X + COL_W} 22 Z`} fill={S} opacity="0.04" />

        {/* Spout valve */}
        <line x1={bCX - 12} y1="58" x2={bCX + 12} y2="58" stroke={S} strokeWidth="1.5" opacity="0.3" />

        {/* Dashed drip line */}
        <line x1={bCX} y1="60" x2={bCX} y2={capTop - 1} stroke={S} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.25" />
        {/* Drip teardrop just above bottle mouth */}
        <ellipse cx={bCX} cy={capTop - 3} rx="2" ry="3" fill={S} opacity="0.4" />

        {/* ── Weller bottle silhouette ── */}

        {/* Aluminum cap — flat rectangular top, slightly wider than neck */}
        <rect
          x={bCX - bNeckHW - 1} y={capTop}
          width={(bNeckHW + 1) * 2} height={bCapH}
          rx="1"
          stroke={S} strokeWidth="1" opacity="0.5"
          fill={S} fillOpacity="0.1"
        />
        {/* Cap rim line at bottom */}
        <line x1={bCX - bNeckHW - 2} y1={capTop + bCapH} x2={bCX + bNeckHW + 2} y2={capTop + bCapH} stroke={S} strokeWidth="1" opacity="0.4" />

        {/* Long straight neck */}
        <line x1={bCX - bNeckHW} y1={neckTop} x2={bCX - bNeckHW} y2={shoulderTop} stroke={S} strokeWidth="1" opacity="0.4" />
        <line x1={bCX + bNeckHW} y1={neckTop} x2={bCX + bNeckHW} y2={shoulderTop} stroke={S} strokeWidth="1" opacity="0.4" />

        {/* Weller-style pronounced square-ish shoulders — sharp then straight down */}
        {/* Left shoulder: curves sharply outward */}
        <path
          d={`M${bCX - bNeckHW} ${shoulderTop} C${bCX - bNeckHW} ${shoulderTop + 6} ${bCX - bHalfW} ${shoulderTop + 4} ${bCX - bHalfW} ${bodyTop}`}
          stroke={S} strokeWidth="1" opacity="0.4" fill="none"
        />
        {/* Right shoulder */}
        <path
          d={`M${bCX + bNeckHW} ${shoulderTop} C${bCX + bNeckHW} ${shoulderTop + 6} ${bCX + bHalfW} ${shoulderTop + 4} ${bCX + bHalfW} ${bodyTop}`}
          stroke={S} strokeWidth="1" opacity="0.4" fill="none"
        />

        {/* Body — tall straight sides with very subtle waist */}
        {/* Left wall — very slight inward curve at center (Weller has mild waist) */}
        <path
          d={`M${bCX - bHalfW} ${bodyTop} C${bCX - bHalfW + 1} ${bodyTop + bBodyH * 0.45} ${bCX - bHalfW + 1} ${bodyTop + bBodyH * 0.55} ${bCX - bHalfW} ${bodyBot}`}
          stroke={S} strokeWidth="1" opacity="0.4" fill="none"
        />
        {/* Right wall */}
        <path
          d={`M${bCX + bHalfW} ${bodyTop} C${bCX + bHalfW - 1} ${bodyTop + bBodyH * 0.45} ${bCX + bHalfW - 1} ${bodyTop + bBodyH * 0.55} ${bCX + bHalfW} ${bodyBot}`}
          stroke={S} strokeWidth="1" opacity="0.4" fill="none"
        />

        {/* Body fill */}
        <path
          d={`M${bCX - bHalfW} ${bodyTop} C${bCX - bHalfW + 1} ${bodyTop + bBodyH * 0.45} ${bCX - bHalfW + 1} ${bodyTop + bBodyH * 0.55} ${bCX - bHalfW} ${bodyBot} L${bCX + bHalfW} ${bodyBot} C${bCX + bHalfW - 1} ${bodyTop + bBodyH * 0.55} ${bCX + bHalfW - 1} ${bodyTop + bBodyH * 0.45} ${bCX + bHalfW} ${bodyTop} Z`}
          fill={S} opacity="0.05"
        />

        {/* Flat base */}
        <line x1={bCX - bHalfW} y1={bodyBot} x2={bCX + bHalfW} y2={bodyBot} stroke={S} strokeWidth="1.2" opacity="0.4" />

        {/* Label area — two fine horizontal lines suggesting a label */}
        <line x1={bCX - bHalfW + 3} y1={bodyTop + 14} x2={bCX + bHalfW - 3} y2={bodyTop + 14} stroke={S} strokeWidth="0.5" opacity="0.2" />
        <line x1={bCX - bHalfW + 3} y1={bodyTop + 34} x2={bCX + bHalfW - 3} y2={bodyTop + 34} stroke={S} strokeWidth="0.5" opacity="0.2" />
        {/* "W" hint — a tiny subtle mark center label */}
        <path
          d={`M${bCX - 5} ${bodyTop + 18} L${bCX - 3} ${bodyTop + 26} L${bCX} ${bodyTop + 21} L${bCX + 3} ${bodyTop + 26} L${bCX + 5} ${bodyTop + 18}`}
          stroke={S} strokeWidth="0.7" opacity="0.2" fill="none"
        />
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
