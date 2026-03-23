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
// ── Pipe constants ──
const PR = 5; // half pipe width — pipe walls are at centerline ± PR

// ── Straight vertical pipe: cx=centerline X, y1/y2=extents ──
function VPipe({ cx, y1, y2, s }: { cx: number; y1: number; y2: number; s: string }) {
  return <>
    <rect x={cx-PR} y={y1} width={PR*2} height={y2-y1} fill={s} fillOpacity="0.05" />
    <line x1={cx-PR} y1={y1} x2={cx-PR} y2={y2} stroke={s} strokeWidth="1.2" opacity="0.5" />
    <line x1={cx+PR} y1={y1} x2={cx+PR} y2={y2} stroke={s} strokeWidth="1.2" opacity="0.5" />
  </>;
}

// ── Straight horizontal pipe: cy=centerline Y, x1/x2=extents ──
function HPipe({ x1, x2, cy, s }: { x1: number; x2: number; cy: number; s: string }) {
  const lx = Math.min(x1,x2); const rx = Math.max(x1,x2);
  return <>
    <rect x={lx} y={cy-PR} width={rx-lx} height={PR*2} fill={s} fillOpacity="0.05" />
    <line x1={lx} y1={cy-PR} x2={rx} y2={cy-PR} stroke={s} strokeWidth="1.2" opacity="0.5" />
    <line x1={lx} y1={cy+PR} x2={rx} y2={cy+PR} stroke={s} strokeWidth="1.2" opacity="0.5" />
  </>;
}

/*
  ── 90° Elbow fitting ──

  The elbow connects a vertical pipe to a horizontal pipe.
  `corner` is the point where the two pipe CENTERLINES would intersect.
  The elbow arc's center is offset from that corner by `ER` in the direction of the turn.

  Turns (from pipe travel direction → new direction):
    "up-to-right":   pipe going up, turns right  → arc center is (corner.x + ER, corner.y)
    "down-to-right": pipe going down, turns right → arc center is (corner.x + ER, corner.y)
    "down-to-left":  pipe going down, turns left  → arc center is (corner.x - ER, corner.y)
    "up-to-left":    pipe going up, turns left    → arc center is (corner.x - ER, corner.y)

  Each elbow draws TWO concentric arcs: outer (r=ER+PR) and inner (r=ER-PR).
  The straight pipe segments must stop exactly at the elbow arc endpoints.
*/
const ER = 10; // elbow bend radius (centerline)

function Elbow({ corner, turn, s }: {
  corner: { x: number; y: number };
  turn: "up-to-right" | "down-to-right" | "down-to-left" | "up-to-left";
  s: string;
}) {
  const { x: cx, y: cy } = corner;
  let outerD = ""; let innerD = "";

  /*
    Arc endpoints and sweep direction per turn:

    "up-to-right":
      Vertical pipe comes from below going up → centerline at x=cx, arrives at y=cy+ER... wait.
      Actually: pipe center is at x=cx going upward. It stops at corner.y.
      Arc center = (cx+ER, cy).
      Outer arc (r=ER+PR): starts at (cx+ER-(ER+PR), cy) = (cx-PR, cy) [left of arc center]
                            ends at   (cx+ER, cy-(ER+PR))              [above arc center]
      Inner arc (r=ER-PR): starts at (cx+ER-(ER-PR), cy) = (cx+PR, cy)
                            ends at   (cx+ER, cy-(ER-PR))
      Sweep: counterclockwise (sweep=0)
  */
  switch(turn) {
    case "up-to-right": {
      // Vertical pipe going UP meets horizontal going RIGHT
      // Arc center: (cx+ER, cy)
      const acx = cx+ER;
      outerD = `M ${acx-(ER+PR)} ${cy} A ${ER+PR} ${ER+PR} 0 0 1 ${acx} ${cy-(ER+PR)}`;
      innerD = `M ${acx-(ER-PR)} ${cy} A ${ER-PR} ${ER-PR} 0 0 1 ${acx} ${cy-(ER-PR)}`;
      break;
    }
    case "down-to-right": {
      // Vertical pipe going DOWN meets horizontal going RIGHT
      // Arc center: (cx+ER, cy)
      const acx = cx+ER;
      outerD = `M ${acx-(ER+PR)} ${cy} A ${ER+PR} ${ER+PR} 0 0 0 ${acx} ${cy+(ER+PR)}`;
      innerD = `M ${acx-(ER-PR)} ${cy} A ${ER-PR} ${ER-PR} 0 0 0 ${acx} ${cy+(ER-PR)}`;
      break;
    }
    case "down-to-left": {
      // Vertical pipe going DOWN meets horizontal going LEFT
      // Arc center: (cx-ER, cy)
      const acx = cx-ER;
      outerD = `M ${acx+(ER+PR)} ${cy} A ${ER+PR} ${ER+PR} 0 0 1 ${acx} ${cy+(ER+PR)}`;
      innerD = `M ${acx+(ER-PR)} ${cy} A ${ER-PR} ${ER-PR} 0 0 1 ${acx} ${cy+(ER-PR)}`;
      break;
    }
    case "up-to-left": {
      // Vertical pipe going UP meets horizontal going LEFT
      // Arc center: (cx-ER, cy)
      const acx = cx-ER;
      outerD = `M ${acx+(ER+PR)} ${cy} A ${ER+PR} ${ER+PR} 0 0 0 ${acx} ${cy-(ER+PR)}`;
      innerD = `M ${acx+(ER-PR)} ${cy} A ${ER-PR} ${ER-PR} 0 0 0 ${acx} ${cy-(ER-PR)}`;
      break;
    }
  }
  return <>
    <path d={outerD} stroke={s} strokeWidth="1.2" opacity="0.5" fill="none" />
    <path d={innerD} stroke={s} strokeWidth="1.2" opacity="0.4" fill="none" />
  </>;
}

// ── Flange ring (bolted joint between segments) ──
function PipeFlange({ cx, cy, dir, s }: { cx: number; cy: number; dir: "h"|"v"; s: string }) {
  if (dir === "v") return <>
    <line x1={cx-PR-5} y1={cy-2} x2={cx+PR+5} y2={cy-2} stroke={s} strokeWidth="1.5" opacity="0.45" />
    <line x1={cx-PR-5} y1={cy+2} x2={cx+PR+5} y2={cy+2} stroke={s} strokeWidth="1.5" opacity="0.45" />
    <circle cx={cx-PR-3} cy={cy} r="1.5" fill={s} opacity="0.35" />
    <circle cx={cx+PR+3} cy={cy} r="1.5" fill={s} opacity="0.35" />
  </>;
  return <>
    <line x1={cx-2} y1={cy-PR-5} x2={cx-2} y2={cy+PR+5} stroke={s} strokeWidth="1.5" opacity="0.45" />
    <line x1={cx+2} y1={cy-PR-5} x2={cx+2} y2={cy+PR+5} stroke={s} strokeWidth="1.5" opacity="0.45" />
    <circle cx={cx} cy={cy-PR-3} r="1.5" fill={s} opacity="0.35" />
    <circle cx={cx} cy={cy+PR+3} r="1.5" fill={s} opacity="0.35" />
  </>;
}

// ── Valve handwheel ──
function ValveWheel({ cx, cy, s }: { cx: number; cy: number; s: string }) {
  return <>
    <circle cx={cx} cy={cy} r="9" stroke={s} strokeWidth="1.5" opacity="0.5" fill="none" />
    <line x1={cx-9} y1={cy} x2={cx+9} y2={cy} stroke={s} strokeWidth="1" opacity="0.4" />
    <line x1={cx} y1={cy-9} x2={cx} y2={cy+9} stroke={s} strokeWidth="1" opacity="0.4" />
    <line x1={cx-6} y1={cy-6} x2={cx+6} y2={cy+6} stroke={s} strokeWidth="0.8" opacity="0.3" />
    <line x1={cx+6} y1={cy-6} x2={cx-6} y2={cy+6} stroke={s} strokeWidth="0.8" opacity="0.3" />
    <circle cx={cx} cy={cy} r="2.5" fill={s} opacity="0.35" />
  </>;
}

/* ── Still cap + lyne arm: up → right → down → right → off screen ──
   
   Pipe centerline route:
     Start: (COL_CX, lidY) — exits top of lid
     Segment A: goes UP to corner1
     Corner1: (COL_CX, lidY - riseH)  → turn "up-to-right"
       arc center: (COL_CX + ER, lidY - riseH)
       A ends at: y = corner1.y  (pipe stops at corner y)
       B starts at: x = COL_CX + ER + ER = COL_CX + 2*ER  (arc center x + ER)
     Segment B: goes RIGHT from x=(COL_CX+2*ER) to corner2.x
     Corner2: (COL_CX + 2*ER + runB, corner1.y) → turn "right-to-down" (horizontal→vertical down)
       arc center: (corner2.x, corner1.y + ER)
       B ends at: x = corner2.x
       C starts at: y = corner1.y + 2*ER
     Segment C: goes DOWN from y=(corner1.y+2*ER) to corner3.y
     Corner3: (corner2.x, corner1.y + 2*ER + dropC) → turn "down-to-right"
       arc center: (corner2.x + ER, corner3.y)
       C ends at: y = corner3.y
       D starts at: x = corner2.x + 2*ER
     Segment D: goes RIGHT from x=(corner2.x+2*ER) off screen
*/
function StillCap() {
  const S = "#C4943A";
  const lidX = COL_X - 10; const lidW = COL_W + 20;
  const lidY = 46; const lidH = 5;

  const riseH = 24;   // how far up segment A goes
  const runB  = 20;   // length of horizontal segment B
  const dropC = 16;   // how far down segment C goes

  // Corner positions (where centerlines intersect)
  const c1 = { x: COL_CX, y: lidY - riseH };
  const c2 = { x: c1.x + 2*ER + runB, y: c1.y };
  const c3 = { x: c2.x, y: c1.y + 2*ER + dropC };

  // Segment endpoints (stop before elbow arc starts)
  const A_y2 = c1.y;           // segment A: from lidY going up to c1.y
  const B_x1 = c1.x + 2*ER;   // segment B: from here going right
  const B_x2 = c2.x;
  const C_y1 = c1.y + 2*ER;   // segment C: from here going down
  const C_y2 = c3.y;
  const D_x1 = c2.x + 2*ER;   // segment D: from here going right off screen

  const valveX = D_x1 + 26;
  const svgH = lidY + lidH + 4;

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${svgH}`} fill="none" overflow="visible"
      style={{ width: VIEWBOX_W, height: svgH, display: "block", overflow: "visible" }}>

      {/* Lid */}
      <rect x={lidX} y={lidY} width={lidW} height={lidH} fill={S} opacity="0.08" />
      <line x1={lidX} y1={lidY} x2={lidX+lidW} y2={lidY} stroke={S} strokeWidth="1.8" opacity="0.4" />
      <line x1={lidX} y1={lidY+lidH} x2={lidX+lidW} y2={lidY+lidH} stroke={S} strokeWidth="1" opacity="0.2" />
      <line x1={lidX} y1={lidY} x2={lidX} y2={lidY+lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={lidX+lidW} y1={lidY} x2={lidX+lidW} y2={lidY+lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X} y1={lidY+lidH} x2={COL_X} y2={svgH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X+COL_W} y1={lidY+lidH} x2={COL_X+COL_W} y2={svgH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <rect x={COL_X} y={lidY+lidH} width={COL_W} height={svgH-lidY-lidH} fill="url(#hwh-copper)" />

      {/* Segment A: vertical rise from lid top */}
      <VPipe cx={COL_CX} y1={A_y2} y2={lidY} s={S} />
      <PipeFlange cx={COL_CX} cy={lidY-4} dir="v" s={S} />

      {/* Elbow 1: up-to-right — corner at c1 */}
      <Elbow corner={c1} turn="up-to-right" s={S} />

      {/* Segment B: horizontal right */}
      <HPipe x1={B_x1} x2={B_x2} cy={c1.y} s={S} />
      <PipeFlange cx={B_x1 + (B_x2-B_x1)/2} cy={c1.y} dir="h" s={S} />

      {/* Elbow 2: right-to-down — pipe going right turns down
          For "right-to-down": arc center is (c2.x, c2.y+ER), same as "down-to-right" mirrored
          Outer arc: M(c2.x, c2.y-PR) → A(ER+PR) → (c2.x+ER+PR, c2.y+ER) ... 
          Actually this is "horizontal→down" = pipe was going right, now goes down.
          Arc center = (c2.x, c2.y+ER).
          Outer: starts at (c2.x, c2.y-(ER+PR)) ... no.
          
          Think of it: coming FROM LEFT going RIGHT, hitting corner c2, turning DOWN.
          The pipe was horizontal (going right), now vertical (going down).
          Arc center offset: below c2 → (c2.x, c2.y + ER)... but we need pipe walls to connect.
          
          Horizontal pipe right wall is at cy+PR. Arc must start there.
          Arc center = (c2.x, c2.y+ER).
          Outer arc (ER+PR): starts at (c2.x-(ER+PR), c2.y+ER) — no that's wrong too.
          
          Correct: for a right→down elbow, arc center = (c2.x, c2.y+ER).
          Top of arc (where horiz pipe ends): (c2.x - (ER+PR) ... 
          
          Let me use a path-based approach for this elbow instead:
      */}
      {/* Elbow 2: right→down via path (more reliable) */}
      {(() => {
        const acx = c2.x; const acy = c2.y + ER;
        // Outer wall (ER+PR radius): from (acx-(ER+PR), acy) clockwise to (acx, acy-(ER+PR))... 
        // wait, going right→down means:
        // horiz pipe: top wall at cy-PR, bottom wall at cy+PR, both ending at x=c2.x
        // vert pipe below: left wall at cx-PR, right wall at cx+PR, starting at y=c2.y+2*ER (= C_y1)
        // Arc center for outer corner (outside of bend) = (c2.x - PR, c2.y + PR) ... 
        // 
        // Simplest correct approach: use two separate arcs for the two walls.
        // For right→down: 
        //   OUTER wall of bend (top-right corner): arc center=(c2.x, c2.y), r=PR, 90° CW
        //     from (c2.x, c2.y-PR) to (c2.x+PR, c2.y) — this is WRONG direction
        // 
        // Let me think in terms of which wall is on the outside of the curve:
        // Pipe going RIGHT then turning DOWN: the outside of the curve is the TOP-RIGHT.
        // Outer wall arc: large radius = ER+PR, center = (c2.x, c2.y+ER)
        //   starts at (c2.x-(ER+PR), c2.y+ER)... no.
        //
        // OK I'll use a single-stroke approach with two path lines closing around the bend:
        const ro = ER + PR; // outer radius
        const ri = ER - PR; // inner radius
        // Arc center at (c2.x, c2.y + ER) — below corner
        // Outer arc: from top (c2.x, c2.y+ER - ro) = (c2.x, c2.y+ER-ER-PR) = (c2.x, c2.y-PR)
        //            sweeps CW to right: (c2.x + ro, c2.y+ER) = (c2.x+ER+PR, c2.y+ER)
        // Inner arc: from (c2.x, c2.y-PR+2PR) = (c2.x, c2.y+PR)  
        //            sweeps CW to (c2.x+ER-PR, c2.y+ER)
        const outerD = `M ${c2.x} ${c2.y-PR} A ${ro} ${ro} 0 0 1 ${c2.x+ro} ${c2.y+ER}`;
        const innerD = `M ${c2.x} ${c2.y+PR} A ${ri} ${ri} 0 0 1 ${c2.x+ri} ${c2.y+ER}`;
        return <>
          <path d={outerD} stroke={S} strokeWidth="1.2" opacity="0.5" fill="none" />
          <path d={innerD} stroke={S} strokeWidth="1.2" opacity="0.4" fill="none" />
        </>;
      })()}

      {/* Segment C: vertical drop */}
      <VPipe cx={c2.x} y1={C_y1} y2={C_y2} s={S} />
      <PipeFlange cx={c2.x} cy={C_y1 + (C_y2-C_y1)/2} dir="v" s={S} />

      {/* Elbow 3: down-to-right — corner at c3 */}
      <Elbow corner={c3} turn="down-to-right" s={S} />

      {/* Segment D: horizontal right off screen */}
      <HPipe x1={D_x1} x2={600} cy={c3.y} s={S} />
      <PipeFlange cx={D_x1+8} cy={c3.y} dir="h" s={S} />

      {/* Valve */}
      <ValveWheel cx={valveX} cy={c3.y} s={S} />
    </svg>
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

/* ── Spout + product pipe: down → elbow left → off left edge ──
   
   Pipe going DOWN turns LEFT:
   Corner c = (COL_CX, spoutOutY + dropA)
   Arc center = (c.x - ER, c.y)
   Outer arc (ER+PR): from (c.x, c.y-(ER+PR))... 
   
   Actually for down→left:
   Vertical pipe going down, left wall at cx-PR, right wall at cx+PR.
   It meets corner c. Now turns left (horizontal going LEFT).
   Arc center = (c.x - ER, c.y).
   Outer wall of bend (right side of vert pipe / top of horiz pipe):
     arc center offset: the outer wall is at cx+PR going down, and cy-PR going left.
     Use ER+PR for outside arc, ER-PR for inside arc.
   Outside arc (ER+PR): from (c.x+PR, c.y) going to (c.x-ER, c.y+PR+ER)... 
   
   Correct:
   Arc center = (c.x-ER, c.y).
   Outer arc r=(ER+PR): starts at (c.x-ER+(ER+PR), c.y) = (c.x+PR, c.y)
                         ends at   (c.x-ER, c.y+(ER+PR))
   Sweep: clockwise (1) going from right side down
   Inner arc r=(ER-PR): starts at (c.x-ER+(ER-PR), c.y) = (c.x-PR, c.y)
                         ends at   (c.x-ER, c.y+(ER-PR))
   Sweep: clockwise (1)
*/
function StillSpout() {
  const S = "#C4943A";
  const spoutOutY = 52;
  const dropA = 18; // vertical drop before elbow

  const c = { x: COL_CX, y: spoutOutY + dropA }; // corner
  // Elbow arc center
  const acx = c.x - ER; const acy = c.y;
  const ro = ER + PR; const ri = ER - PR;
  // Outer arc: from (c.x+PR, c.y) CW to (acx, c.y+ro) = (c.x-ER, c.y+ER+PR)
  const outerArc = `M ${c.x+PR} ${acy} A ${ro} ${ro} 0 0 1 ${acx} ${acy+ro}`;
  // Inner arc: from (c.x-PR, c.y) CW to (acx, c.y+ri) = (c.x-ER, c.y+ER-PR)
  const innerArc = `M ${c.x-PR} ${acy} A ${ri} ${ri} 0 0 1 ${acx} ${acy+ri}`;

  // Horizontal segment B exits elbow going left at y = c.y + ER (centerline)
  const hCY = c.y + ER;
  const B_x2 = c.x - 2*ER; // segment B ends here (elbow fills the rest)

  const valveX = B_x2 - 22;
  const svgH = c.y + ER + PR + 10;

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${svgH}`} fill="none" overflow="visible"
      style={{ width: VIEWBOX_W, height: svgH, display: "block", overflow: "visible" }}>

      {/* Column walls */}
      <line x1={COL_X} y1="0" x2={COL_X} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X+COL_W} y1="0" x2={COL_X+COL_W} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <rect x={COL_X} y="0" width={COL_W} height="22" fill="url(#hwh-copper)" />

      {/* Converging spout walls */}
      <path d={`M${COL_X} 22 L${COL_CX-5} 44 L${COL_CX-5} ${spoutOutY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
      <path d={`M${COL_X+COL_W} 22 L${COL_CX+5} 44 L${COL_CX+5} ${spoutOutY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
      <path d={`M${COL_X} 22 L${COL_CX-5} 44 L${COL_CX-5} ${spoutOutY} L${COL_CX+5} ${spoutOutY} L${COL_CX+5} 44 L${COL_X+COL_W} 22 Z`} fill={S} opacity="0.04" />

      {/* Outlet flange */}
      <line x1={COL_CX-PR-4} y1={spoutOutY} x2={COL_CX+PR+4} y2={spoutOutY} stroke={S} strokeWidth="1.5" opacity="0.4" />

      {/* Segment A: vertical drop to corner */}
      <VPipe cx={COL_CX} y1={spoutOutY} y2={c.y} s={S} />
      <PipeFlange cx={COL_CX} cy={spoutOutY+8} dir="v" s={S} />

      {/* Elbow: down→left */}
      <path d={outerArc} stroke={S} strokeWidth="1.2" opacity="0.5" fill="none" />
      <path d={innerArc} stroke={S} strokeWidth="1.2" opacity="0.4" fill="none" />

      {/* Segment B: horizontal left off screen */}
      <HPipe x1={-600} x2={B_x2} cy={hCY} s={S} />
      <PipeFlange cx={B_x2 - 10} cy={hCY} dir="h" s={S} />

      {/* Valve */}
      <ValveWheel cx={valveX} cy={hCY} s={S} />
    </svg>
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
