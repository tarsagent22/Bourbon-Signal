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
    description: "We monitor state liquor control boards, warehouse shipments, and distributor networks daily",
    flavor: "Proprietary sourcing across every major channel",
  },
  {
    number: "02",
    description: "Our system filters thousands of data points to surface only confirmed allocations and verified drops",
    flavor: "A special formulation — tuned to catch what others miss",
  },
  {
    number: "03",
    description: "Every drop is tagged by bottle, tier, store location, and county before it reaches you",
    flavor: "Organized, searchable, and mapped to your watchlist",
  },
  {
    number: "04",
    description: "Instant alerts hit your phone the moment a bottle you're watching lands on a shelf",
    flavor: "Seconds matter — you'll know before the crowd",
  },
];

// ── Column geometry ──
const COL_X  = 20;
const COL_W  = 50;
const COL_CX = COL_X + COL_W / 2; // = 45
const VB_W   = 86;

// ── Pipe geometry ──
// Each pipe segment is drawn as two parallel lines + fill rect.
// PH = pipe half-width. Pipe walls sit at centerline ± PH.
// Elbows are filled squares at corners — guaranteed connected, no arc math.
const PH = 4; // pipe half-width → pipe OD = 8px

const S = "#C4943A"; // amber color

// ── SVG gradient def ──
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

// ── Straight vertical pipe segment ──
// cx = centerline X, y1 = top, y2 = bottom
function VPipe({ cx, y1, y2 }: { cx: number; y1: number; y2: number }) {
  return (
    <>
      <rect x={cx - PH} y={y1} width={PH * 2} height={y2 - y1} fill={S} fillOpacity={0.07} />
      <line x1={cx - PH} y1={y1} x2={cx - PH} y2={y2} stroke={S} strokeWidth="1.3" opacity="0.55" />
      <line x1={cx + PH} y1={y1} x2={cx + PH} y2={y2} stroke={S} strokeWidth="1.3" opacity="0.55" />
    </>
  );
}

// ── Straight horizontal pipe segment ──
// cy = centerline Y, x1 = left end, x2 = right end
function HPipe({ x1, x2, cy }: { x1: number; x2: number; cy: number }) {
  const lx = Math.min(x1, x2); const rx = Math.max(x1, x2);
  return (
    <>
      <rect x={lx} y={cy - PH} width={rx - lx} height={PH * 2} fill={S} fillOpacity={0.07} />
      <line x1={lx} y1={cy - PH} x2={rx} y2={cy - PH} stroke={S} strokeWidth="1.3" opacity="0.55" />
      <line x1={lx} y1={cy + PH} x2={rx} y2={cy + PH} stroke={S} strokeWidth="1.3" opacity="0.55" />
    </>
  );
}

// ── Square elbow fitting ──
// cx, cy = centerline corner point
// Fills a PH*2 × PH*2 square at the corner — connects any two perpendicular pipe ends
function Elbow({ cx, cy }: { cx: number; cy: number }) {
  return (
    <rect
      x={cx - PH} y={cy - PH}
      width={PH * 2} height={PH * 2}
      fill={S} fillOpacity={0.15}
      stroke={S} strokeWidth="1.3" opacity="0.55"
    />
  );
}

// ── Pipe flange (bolted joint) ──
// dir: "h" = horizontal pipe (flange lines are vertical)
//      "v" = vertical pipe (flange lines are horizontal)
function PipeFlange({ cx, cy, dir }: { cx: number; cy: number; dir: "h" | "v" }) {
  if (dir === "v") {
    return (
      <>
        <line x1={cx - PH - 5} y1={cy - 2} x2={cx + PH + 5} y2={cy - 2} stroke={S} strokeWidth="1.5" opacity="0.5" />
        <line x1={cx - PH - 5} y1={cy + 2} x2={cx + PH + 5} y2={cy + 2} stroke={S} strokeWidth="1.5" opacity="0.5" />
        <circle cx={cx - PH - 3} cy={cy} r="1.5" fill={S} opacity="0.4" />
        <circle cx={cx + PH + 3} cy={cy} r="1.5" fill={S} opacity="0.4" />
      </>
    );
  }
  return (
    <>
      <line x1={cx - 2} y1={cy - PH - 5} x2={cx - 2} y2={cy + PH + 5} stroke={S} strokeWidth="1.5" opacity="0.5" />
      <line x1={cx + 2} y1={cy - PH - 5} x2={cx + 2} y2={cy + PH + 5} stroke={S} strokeWidth="1.5" opacity="0.5" />
      <circle cx={cx} cy={cy - PH - 3} r="1.5" fill={S} opacity="0.4" />
      <circle cx={cx} cy={cy + PH + 3} r="1.5" fill={S} opacity="0.4" />
    </>
  );
}

// ── Valve handwheel ──
function ValveWheel({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r="9" stroke={S} strokeWidth="1.5" opacity="0.55" fill="none" />
      <line x1={cx - 9} y1={cy} x2={cx + 9} y2={cy} stroke={S} strokeWidth="1.1" opacity="0.45" />
      <line x1={cx} y1={cy - 9} x2={cx} y2={cy + 9} stroke={S} strokeWidth="1.1" opacity="0.45" />
      <line x1={cx - 6} y1={cy - 6} x2={cx + 6} y2={cy + 6} stroke={S} strokeWidth="0.8" opacity="0.3" />
      <line x1={cx + 6} y1={cy - 6} x2={cx - 6} y2={cy + 6} stroke={S} strokeWidth="0.8" opacity="0.3" />
      <circle cx={cx} cy={cy} r="2.5" fill={S} opacity="0.4" />
    </>
  );
}

/*
  ── Still cap + lyne arm ──

  Route (all in px, viewBox coords = DOM coords since width=VB_W):
    Start  : (COL_CX, lidY)           — exit top of lid
    Up     : (COL_CX, lidY) → (COL_CX, y1)        segment A (vertical, going UP)
    Elbow  : corner at (COL_CX, y1)                square elbow
    Right  : (COL_CX, y1) → (x2, y1)              segment B (horizontal, going RIGHT)
    Elbow  : corner at (x2, y1)                    square elbow
    Down   : (x2, y1) → (x2, y3)                  segment C (vertical, going DOWN)
    Elbow  : corner at (x2, y3)                    square elbow
    Right  : (x2, y3) → (far right off screen)     segment D (horizontal, going RIGHT)

  Key y coords:
    lidY = 44  (top of lid)
    y1   = lidY - 22  = 22  (top of rise)
    y3   = y1 + 16   = 38  (bottom of drop, same level as segment D)

  Key x coords:
    COL_CX = 45 (pipe exits center of column)
    x2     = COL_CX + 28 = 73 (right turn then drop then final right run)
*/
function StillCap() {
  const lidX = COL_X - 8; const lidW = COL_W + 16;
  const lidY = 44; const lidH = 5;

  // Pipe centerline waypoints
  const pX  = COL_CX;      // vertical pipe X (centerline)
  const y1  = lidY - 22;   // top of vertical rise (corner A)
  const x2  = pX + 28;     // horizontal run end / top of drop (corner B)
  const y3  = y1 + 16;     // bottom of drop (corner C) — exit goes right from here

  // Valve sits 28px into segment D
  const valveX = x2 + 28;

  const svgH = lidY + lidH + 2;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${svgH}`}
      fill="none"
      overflow="visible"
      style={{ width: VB_W, height: svgH, display: "block", overflow: "visible" }}
    >
      {/* Flat lid */}
      <rect x={lidX} y={lidY} width={lidW} height={lidH} fill={S} opacity="0.08" />
      <line x1={lidX}       y1={lidY}       x2={lidX + lidW} y2={lidY}       stroke={S} strokeWidth="1.8" opacity="0.45" />
      <line x1={lidX}       y1={lidY + lidH} x2={lidX + lidW} y2={lidY + lidH} stroke={S} strokeWidth="1"   opacity="0.2"  />
      <line x1={lidX}       y1={lidY}       x2={lidX}        y2={lidY + lidH} stroke={S} strokeWidth="1.5" opacity="0.45" />
      <line x1={lidX + lidW} y1={lidY}       x2={lidX + lidW} y2={lidY + lidH} stroke={S} strokeWidth="1.5" opacity="0.45" />

      {/* Column walls below lid (to bottom of viewbox) */}
      <line x1={COL_X}       y1={lidY + lidH} x2={COL_X}       y2={svgH} stroke={S} strokeWidth="1.5" opacity="0.45" />
      <line x1={COL_X+COL_W} y1={lidY + lidH} x2={COL_X+COL_W} y2={svgH} stroke={S} strokeWidth="1.5" opacity="0.45" />
      <rect x={COL_X} y={lidY + lidH} width={COL_W} height={svgH - lidY - lidH} fill="url(#hwh-copper)" />

      {/* Segment A: vertical rise — from y1 up to lidY */}
      <VPipe cx={pX} y1={y1} y2={lidY} />
      <PipeFlange cx={pX} cy={lidY - 5} dir="v" />

      {/* Corner A: up→right */}
      <Elbow cx={pX} cy={y1} />

      {/* Segment B: horizontal right — from pX to x2 */}
      <HPipe x1={pX} x2={x2} cy={y1} />
      <PipeFlange cx={pX + (x2 - pX) / 2} cy={y1} dir="h" />

      {/* Corner B: right→down */}
      <Elbow cx={x2} cy={y1} />

      {/* Segment C: vertical drop — from y1 to y3 */}
      <VPipe cx={x2} y1={y1} y2={y3} />

      {/* Corner C: down→right */}
      <Elbow cx={x2} cy={y3} />

      {/* Segment D: horizontal right — off screen */}
      <HPipe x1={x2} x2={600} cy={y3} />
      <PipeFlange cx={valveX - 14} cy={y3} dir="h" />

      {/* Valve handwheel */}
      <ValveWheel cx={valveX} cy={y3} />
    </svg>
  );
}

// ── Column body ──
function CylinderBody({ plateCount }: { plateCount: number }) {
  const plates = Array.from({ length: plateCount });
  const spacing = 100 / (plateCount + 1);
  return (
    <svg viewBox={`0 0 ${VB_W} 100`} preserveAspectRatio="none" fill="none"
      style={{ width: VB_W, height: "100%", display: "block" }}>
      <rect x={COL_X} y="0" width={COL_W} height="100" fill="url(#hwh-copper)" />
      <line x1={COL_X}       y1="0" x2={COL_X}       y2="100" stroke={S} strokeWidth="1.5" opacity="0.45" />
      <line x1={COL_X+COL_W} y1="0" x2={COL_X+COL_W} y2="100" stroke={S} strokeWidth="1.5" opacity="0.45" />
      {plates.map((_, j) => (
        <line key={j}
          x1={COL_X + 4} y1={spacing * (j + 1)}
          x2={COL_X + COL_W - 4} y2={spacing * (j + 1)}
          stroke={S} strokeWidth="0.6" strokeDasharray="4 3" opacity="0.18" />
      ))}
    </svg>
  );
}

// ── Flange between column sections ──
function Flange() {
  return (
    <svg viewBox={`0 0 ${VB_W} 14`} fill="none" style={{ width: VB_W, height: 14, display: "block" }}>
      <rect x={COL_X} y="0" width={COL_W} height="14" fill={S} opacity="0.04" />
      <line x1={COL_X - 10} y1="3"  x2={COL_X + COL_W + 10} y2="3"  stroke={S} strokeWidth="1.2" opacity="0.35" />
      <line x1={COL_X - 10} y1="11" x2={COL_X + COL_W + 10} y2="11" stroke={S} strokeWidth="1.2" opacity="0.35" />
      <circle cx={COL_X - 7}       cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.3" fill="none" />
      <circle cx={COL_X+COL_W + 7} cy="7" r="3" stroke={S} strokeWidth="0.8" opacity="0.3" fill="none" />
      <circle cx={COL_CX - 12} cy="7" r="1.5" fill={S} opacity="0.2" />
      <circle cx={COL_CX}      cy="7" r="1.5" fill={S} opacity="0.2" />
      <circle cx={COL_CX + 12} cy="7" r="1.5" fill={S} opacity="0.2" />
    </svg>
  );
}

/*
  ── Spout + product pipe ──

  Route:
    Start  : (COL_CX, spoutOutY)      — bottom of converging spout
    Down   : → (COL_CX, y1)           segment A (short vertical drop)
    Elbow  : corner at (COL_CX, y1)   square elbow
    Left   : → off left edge          segment B (horizontal, going LEFT)

  Key coords:
    spoutOutY = 50
    y1 = spoutOutY + 18  (drop before turning left)
    Pipe exits left at y = y1
    Valve sits 26px left of elbow corner
*/
function StillSpout() {
  const spoutOutY = 50;
  const y1 = spoutOutY + 18;      // corner: down→left
  const valveX = COL_CX - 26;
  const svgH = y1 + PH + 10;

  return (
    <svg viewBox={`0 0 ${VB_W} ${svgH}`} fill="none" overflow="visible"
      style={{ width: VB_W, height: svgH, display: "block", overflow: "visible" }}>

      {/* Column walls at top */}
      <line x1={COL_X}       y1="0" x2={COL_X}       y2="20" stroke={S} strokeWidth="1.5" opacity="0.45" />
      <line x1={COL_X+COL_W} y1="0" x2={COL_X+COL_W} y2="20" stroke={S} strokeWidth="1.5" opacity="0.45" />
      <rect x={COL_X} y="0" width={COL_W} height="20" fill="url(#hwh-copper)" />

      {/* Converging spout */}
      <path d={`M${COL_X} 20 L${COL_CX-5} 42 L${COL_CX-5} ${spoutOutY}`}
        stroke={S} strokeWidth="1.5" opacity="0.4" fill="none" />
      <path d={`M${COL_X+COL_W} 20 L${COL_CX+5} 42 L${COL_CX+5} ${spoutOutY}`}
        stroke={S} strokeWidth="1.5" opacity="0.4" fill="none" />
      <path d={`M${COL_X} 20 L${COL_CX-5} 42 L${COL_CX-5} ${spoutOutY} L${COL_CX+5} ${spoutOutY} L${COL_CX+5} 42 L${COL_X+COL_W} 20 Z`}
        fill={S} opacity="0.04" />

      {/* Outlet flange at spout bottom */}
      <line x1={COL_CX - PH - 5} y1={spoutOutY} x2={COL_CX + PH + 5} y2={spoutOutY}
        stroke={S} strokeWidth="1.5" opacity="0.45" />

      {/* Segment A: vertical drop */}
      <VPipe cx={COL_CX} y1={spoutOutY} y2={y1} />
      <PipeFlange cx={COL_CX} cy={spoutOutY + 8} dir="v" />

      {/* Corner: down→left */}
      <Elbow cx={COL_CX} cy={y1} />

      {/* Segment B: horizontal left — off screen */}
      <HPipe x1={-600} x2={COL_CX} cy={y1} />
      <PipeFlange cx={valveX + 14} cy={y1} dir="h" />

      {/* Valve handwheel */}
      <ValveWheel cx={valveX} cy={y1} />
    </svg>
  );
}

// ── Sight glass ──
function SightGlass({ number, index }: { number: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-15% 0px -15% 0px" });
  return (
    <div ref={ref} style={{
      width: 44, height: 44, borderRadius: "50%",
      border: `2px solid ${isInView ? "#C4943A" : "#3A3530"}`,
      background: "var(--color-bg-primary)",
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", zIndex: 2,
      boxShadow: isInView ? "0 0 18px rgba(196,148,58,0.22)" : "none",
      transition: "all 0.5s ease",
    }}>
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

// ── Step text ──
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
        fontFamily: "var(--font-plus-jakarta)", fontSize: 16, fontWeight: 500,
        color: "var(--color-text-primary)", lineHeight: 1.55, marginBottom: 10,
      }}>
        {step.description}
      </p>
      <p style={{
        fontFamily: "var(--font-plus-jakarta)", fontSize: 14, fontStyle: "italic",
        color: "rgba(196,148,58,0.4)", lineHeight: 1.5,
      }}>
        {step.flavor}
      </p>
    </div>
  );
}

// ── Step row ──
function StepRow({ step, index }: { step: StepData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  return (
    <div style={{ display: "flex", alignItems: "center", minHeight: 190 }}>
      {/* Still column slice */}
      <div ref={ref} style={{ width: VB_W, flexShrink: 0, alignSelf: "stretch", position: "relative" }}>
        <CylinderBody plateCount={index === 0 ? 2 : 3} />
        {/* Sight glass centered on column body */}
        <div style={{
          position: "absolute", top: "50%", left: COL_CX,
          transform: "translate(-50%, -50%)",
        }}>
          <SightGlass number={step.number} index={index} />
        </div>
        {/* Solid connector line from right edge of column to step text */}
        <div style={{
          position: "absolute", top: "50%", left: VB_W,
          width: 32, height: 1,
          background: isInView ? "rgba(196,148,58,0.35)" : "rgba(58,53,48,0.2)",
          transition: "background 0.5s ease",
          transform: "translateY(-50%)",
        }} />
      </div>
      {/* Step text */}
      <div style={{ flex: 1, paddingLeft: 32 }}>
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

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 40px" }}>
        {/* Header */}
        <ScrollReveal>
          <p style={{
            fontFamily: "var(--font-plus-jakarta)", fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.2em",
            color: "var(--color-accent-amber)", marginBottom: 14,
            textAlign: "center",
          }}>
            THE PROCESS
          </p>
          <h2 style={{
            fontFamily: "var(--font-fraunces)", fontSize: "clamp(32px,6vw,44px)",
            fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 14,
            textAlign: "center",
          }}>
            The Process
          </h2>
          <p style={{
            fontFamily: "var(--font-plus-jakarta)", fontSize: 16,
            color: "var(--color-text-secondary)", lineHeight: 1.6,
            maxWidth: 480, margin: "0 auto 52px",
            textAlign: "center",
          }}>
            From raw data to your phone in minutes. Same process, distilled for speed.
          </p>
        </ScrollReveal>

        {/* Still + Steps */}
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
