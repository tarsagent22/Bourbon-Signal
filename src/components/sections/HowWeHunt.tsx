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
// ── Pipe drawing helpers ──
// PW = half-width of pipe interior, so outer walls are at cx±(PW+1), inner fill cx±PW
const PIPE_R = 5;   // inner half-width (total pipe OD = 12px, ID = 10px)
const PR = PIPE_R;

// Flange: a pair of lines perpendicular to pipe direction, with bolt dots
// dir: "h" = horizontal pipe, "v" = vertical pipe
// cx,cy = center of flange
function PipeFlange({ cx, cy, dir, s }: { cx: number; cy: number; dir: "h"|"v"; s: string }) {
  if (dir === "v") {
    // Flanges are horizontal lines across a vertical pipe
    return <>
      <line x1={cx - PR - 4} y1={cy - 2} x2={cx + PR + 4} y2={cy - 2} stroke={s} strokeWidth="1.5" opacity="0.45" />
      <line x1={cx - PR - 4} y1={cy + 2} x2={cx + PR + 4} y2={cy + 2} stroke={s} strokeWidth="1.5" opacity="0.45" />
      <circle cx={cx - PR - 2} cy={cy} r="1.5" fill={s} opacity="0.3" />
      <circle cx={cx + PR + 2} cy={cy} r="1.5" fill={s} opacity="0.3" />
    </>;
  }
  // dir === "h": flanges are vertical lines across a horizontal pipe
  return <>
    <line x1={cx - 2} y1={cy - PR - 4} x2={cx - 2} y2={cy + PR + 4} stroke={s} strokeWidth="1.5" opacity="0.45" />
    <line x1={cx + 2} y1={cy - PR - 4} x2={cx + 2} y2={cy + PR + 4} stroke={s} strokeWidth="1.5" opacity="0.45" />
    <circle cx={cx} cy={cy - PR - 2} r="1.5" fill={s} opacity="0.3" />
    <circle cx={cx} cy={cy + PR + 2} r="1.5" fill={s} opacity="0.3" />
  </>;
}

// Straight vertical pipe segment: x=center, y1=top, y2=bottom
function VPipe({ cx, y1, y2, s }: { cx: number; y1: number; y2: number; s: string }) {
  return <>
    <rect x={cx - PR} y={y1} width={PR * 2} height={y2 - y1} fill={s} fillOpacity="0.06" />
    <line x1={cx - PR} y1={y1} x2={cx - PR} y2={y2} stroke={s} strokeWidth="1.2" opacity="0.45" />
    <line x1={cx + PR} y1={y1} x2={cx + PR} y2={y2} stroke={s} strokeWidth="1.2" opacity="0.45" />
  </>;
}

// Straight horizontal pipe segment: y=center, x1=left, x2=right
function HPipe({ x1, x2, cy, s }: { x1: number; x2: number; cy: number; s: string }) {
  const lx = Math.min(x1, x2); const rx = Math.max(x1, x2);
  return <>
    <rect x={lx} y={cy - PR} width={rx - lx} height={PR * 2} fill={s} fillOpacity="0.06" />
    <line x1={lx} y1={cy - PR} x2={rx} y2={cy - PR} stroke={s} strokeWidth="1.2" opacity="0.45" />
    <line x1={lx} y1={cy + PR} x2={rx} y2={cy + PR} stroke={s} strokeWidth="1.2" opacity="0.45" />
  </>;
}

// 90° elbow fitting: quarter-circle arc
// turn: "right-down" | "right-up" | "left-down" | "left-up"
// cx,cy = center of the arc's circular origin
function Elbow({ cx, cy, turn, s }: { cx: number; cy: number; turn: "right-down"|"right-up"|"left-down"|"left-up"; s: string }) {
  const r = 10; // elbow radius (centerline)
  // Outer arc = r+PR, inner arc = r-PR
  let outerD = ""; let innerD = "";
  // SVG arc: A rx ry x-rot large-arc sweep ex ey
  switch(turn) {
    case "right-down": // coming down, turning right → arc from top to right
      outerD = `M ${cx - (r+PR)} ${cy} A ${r+PR} ${r+PR} 0 0 1 ${cx} ${cy + (r+PR)}`;
      innerD = `M ${cx - (r-PR)} ${cy} A ${r-PR} ${r-PR} 0 0 1 ${cx} ${cy + (r-PR)}`;
      break;
    case "right-up": // coming up, turning right → arc from bottom to right
      outerD = `M ${cx - (r+PR)} ${cy} A ${r+PR} ${r+PR} 0 0 0 ${cx} ${cy - (r+PR)}`;
      innerD = `M ${cx - (r-PR)} ${cy} A ${r-PR} ${r-PR} 0 0 0 ${cx} ${cy - (r-PR)}`;
      break;
    case "left-down": // coming down, turning left
      outerD = `M ${cx + (r+PR)} ${cy} A ${r+PR} ${r+PR} 0 0 0 ${cx} ${cy + (r+PR)}`;
      innerD = `M ${cx + (r-PR)} ${cy} A ${r-PR} ${r-PR} 0 0 0 ${cx} ${cy + (r-PR)}`;
      break;
    case "left-up": // coming up, turning left
      outerD = `M ${cx + (r+PR)} ${cy} A ${r+PR} ${r+PR} 0 0 1 ${cx} ${cy - (r+PR)}`;
      innerD = `M ${cx + (r-PR)} ${cy} A ${r-PR} ${r-PR} 0 0 1 ${cx} ${cy - (r-PR)}`;
      break;
  }
  return <>
    <path d={outerD} stroke={s} strokeWidth="1.2" opacity="0.45" fill="none" />
    <path d={innerD} stroke={s} strokeWidth="1.2" opacity="0.35" fill="none" />
  </>;
}

// Valve handwheel on a horizontal pipe
function ValveWheel({ cx, cy, s }: { cx: number; cy: number; s: string }) {
  return <>
    {/* Wheel rim */}
    <circle cx={cx} cy={cy} r="9" stroke={s} strokeWidth="1.4" opacity="0.45" fill="none" />
    {/* Spokes */}
    <line x1={cx-9} y1={cy} x2={cx+9} y2={cy} stroke={s} strokeWidth="1" opacity="0.35" />
    <line x1={cx} y1={cy-9} x2={cx} y2={cy+9} stroke={s} strokeWidth="1" opacity="0.35" />
    <line x1={cx-6} y1={cy-6} x2={cx+6} y2={cy+6} stroke={s} strokeWidth="0.8" opacity="0.25" />
    <line x1={cx+6} y1={cy-6} x2={cx-6} y2={cy+6} stroke={s} strokeWidth="0.8" opacity="0.25" />
    {/* Hub */}
    <circle cx={cx} cy={cy} r="2.5" fill={s} opacity="0.3" />
  </>;
}

/* ── Still cap + lyne arm: up → right → down → right → off screen ── */
function StillCap() {
  const S = "#C4943A";
  const lidX = COL_X - 10; const lidW = COL_W + 20;
  const lidY = 46; const lidH = 5;

  // Pipe route (centerline):
  // A: rises from lid top at COL_CX, up 22px
  // Elbow 1 (right-up): turns right at top of vertical rise
  // B: goes right 28px
  // Elbow 2 (right-down): turns down
  // C: drops 18px
  // Elbow 3 (right-down → right): turns right at bottom of drop
  // D: goes right off screen
  const elbow = 10; // elbow centerline radius
  const pipeStartX = COL_CX;
  const pipeStartY = lidY;
  const riseH = 22;

  // A: vertical rise — from lidY up to (lidY - riseH)
  const A_top = lidY - riseH;
  // Elbow1 center: pipe goes up then turns right → elbow center is (pipeStartX + elbow, A_top)
  const E1x = pipeStartX + elbow; const E1y = A_top;
  // B: horizontal right from E1 — from (E1x) to (E1x + 28)
  const B_right = E1x + 28;
  // Elbow2 center: pipe goes right then turns down → (B_right, E1y + elbow)
  const E2x = B_right; const E2y = E1y + elbow;
  // C: vertical drop from E2y down 18px
  const C_bot = E2y + 18;
  // Elbow3 center: pipe goes down then turns right → (E2x + elbow, C_bot)
  const E3x = E2x + elbow; const E3y = C_bot;
  // D: horizontal from E3x right off screen
  // Valve sits 24px into the horizontal run
  const valveX = E3x + 24; const valveY = E3y;

  const svgH = lidY + lidH + 4;

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${svgH}`} fill="none" overflow="visible"
      style={{ width: VIEWBOX_W, height: svgH, display: "block", overflow: "visible" }}>

      {/* ── Lid ── */}
      <rect x={lidX} y={lidY} width={lidW} height={lidH} fill={S} opacity="0.08" />
      <line x1={lidX} y1={lidY} x2={lidX+lidW} y2={lidY} stroke={S} strokeWidth="1.8" opacity="0.4" />
      <line x1={lidX} y1={lidY+lidH} x2={lidX+lidW} y2={lidY+lidH} stroke={S} strokeWidth="1" opacity="0.2" />
      <line x1={lidX} y1={lidY} x2={lidX} y2={lidY+lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={lidX+lidW} y1={lidY} x2={lidX+lidW} y2={lidY+lidH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      {/* Column walls below lid */}
      <line x1={COL_X} y1={lidY+lidH} x2={COL_X} y2={svgH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X+COL_W} y1={lidY+lidH} x2={COL_X+COL_W} y2={svgH} stroke={S} strokeWidth="1.5" opacity="0.4" />
      <rect x={COL_X} y={lidY+lidH} width={COL_W} height={svgH-lidY-lidH} fill="url(#hwh-copper)" />

      {/* ── Segment A: vertical rise ── */}
      <VPipe cx={pipeStartX} y1={A_top} y2={lidY} s={S} />
      <PipeFlange cx={pipeStartX} cy={lidY - 4} dir="v" s={S} />

      {/* ── Elbow 1: up → right ── */}
      <Elbow cx={E1x} cy={E1y} turn="right-up" s={S} />

      {/* ── Segment B: horizontal right ── */}
      <HPipe x1={E1x} x2={B_right} cy={E1y} s={S} />
      <PipeFlange cx={E1x + 8} cy={E1y} dir="h" s={S} />

      {/* ── Elbow 2: right → down ── */}
      <Elbow cx={E2x} cy={E2y} turn="right-down" s={S} />

      {/* ── Segment C: vertical drop ── */}
      <VPipe cx={E2x} y1={E2y} y2={C_bot} s={S} />
      <PipeFlange cx={E2x} cy={E2y + 10} dir="v" s={S} />

      {/* ── Elbow 3: down → right ── */}
      <Elbow cx={E3x} cy={E3y} turn="right-down" s={S} />

      {/* ── Segment D: horizontal off right edge ── */}
      <HPipe x1={E3x} x2={600} cy={E3y} s={S} />
      <PipeFlange cx={E3x + 10} cy={E3y} dir="h" s={S} />

      {/* ── Valve handwheel ── */}
      <ValveWheel cx={valveX} cy={valveY} s={S} />
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

/* ── Spout + product pipe: down → elbow left → off left edge ── */
function StillSpout() {
  const S = "#C4943A";
  const elbow = 10;
  const spoutOutY = 52;
  const spoutOutX = COL_CX;

  // Pipe route:
  // A: short vertical drop from spout outlet
  const A_bot = spoutOutY + 16;
  // Elbow: down → left, center at (spoutOutX - elbow, A_bot)
  const Ex = spoutOutX - elbow; const Ey = A_bot;
  // B: horizontal left off screen, valve 24px in
  const valveX = Ex - 24; const valveY = Ey;

  const svgH = A_bot + elbow + PR + 8;

  return (
    <svg viewBox={`0 0 ${VIEWBOX_W} ${svgH}`} fill="none" overflow="visible"
      style={{ width: VIEWBOX_W, height: svgH, display: "block", overflow: "visible" }}>

      {/* Column walls */}
      <line x1={COL_X} y1="0" x2={COL_X} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <line x1={COL_X+COL_W} y1="0" x2={COL_X+COL_W} y2="22" stroke={S} strokeWidth="1.5" opacity="0.4" />
      <rect x={COL_X} y="0" width={COL_W} height="22" fill="url(#hwh-copper)" />

      {/* Converging spout walls */}
      <path d={`M${COL_X} 22 L${spoutOutX-5} 44 L${spoutOutX-5} ${spoutOutY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
      <path d={`M${COL_X+COL_W} 22 L${spoutOutX+5} 44 L${spoutOutX+5} ${spoutOutY}`} stroke={S} strokeWidth="1.5" opacity="0.35" fill="none" />
      <path d={`M${COL_X} 22 L${spoutOutX-5} 44 L${spoutOutX-5} ${spoutOutY} L${spoutOutX+5} ${spoutOutY} L${spoutOutX+5} 44 L${COL_X+COL_W} 22 Z`} fill={S} opacity="0.04" />

      {/* Outlet flange */}
      <line x1={spoutOutX-PR-4} y1={spoutOutY} x2={spoutOutX+PR+4} y2={spoutOutY} stroke={S} strokeWidth="1.5" opacity="0.4" />

      {/* ── Segment A: short vertical drop ── */}
      <VPipe cx={spoutOutX} y1={spoutOutY} y2={A_bot} s={S} />
      <PipeFlange cx={spoutOutX} cy={spoutOutY + 8} dir="v" s={S} />

      {/* ── Elbow: down → left ── */}
      <Elbow cx={Ex} cy={Ey} turn="left-down" s={S} />

      {/* ── Segment B: horizontal left off screen ── */}
      <HPipe x1={-600} x2={Ex} cy={Ey} s={S} />
      <PipeFlange cx={Ex - 10} cy={Ey} dir="h" s={S} />

      {/* ── Valve handwheel ── */}
      <ValveWheel cx={valveX} cy={valveY} s={S} />
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
