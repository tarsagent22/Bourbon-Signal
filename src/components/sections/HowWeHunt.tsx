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
    description: "Every 10 minutes, we check warehouse shipments, store inventories, and allocation lists across NC, VA, and PA.",
    flavor: "We scan state databases",
  },
  {
    number: "02",
    description: "You pick the bottles. You pick the stores. We watch them for you — and email you the second something drops.",
    flavor: "You get alerted",
  },
  {
    number: "03",
    description: "Your alert tells you which ABC board received the shipment, what bottles, and how many cases. You know where to look before anyone else.",
    flavor: "Know where to look",
  },
  {
    number: "04",
    description: "Move before the crowd. When allocated bottles like Pappy, Blanton's, or Weller hit a shelf, minutes matter.",
    flavor: "You grab the bottle",
  },
];

// ── Column geometry ──
const COL_X  = 20;
const COL_W  = 50;
const COL_CX = COL_X + COL_W / 2; // = 45
const VB_W   = 86;
const AC     = "#C4943A"; // amber color

/*
  ── Round pipe system ──

  A pipe run is drawn as a single closed SVG path tracing the outer wall,
  then the inner wall in reverse — giving a filled tube with two visible walls.

  PH  = pipe half-width (wall-to-wall radius = PH). Pipe OD = PH*2.
  BR  = elbow bend radius (centerline). 
        Outer arc radius = BR + PH
        Inner arc radius = BR - PH  (must be > 0, so BR > PH)

  For each 90° turn, the centerline arc sweeps 90°.
  The straight segment STOPS at distance BR from the corner 
  (where the arc begins). This is the tangent point.

  Turn types and their arc centers (relative to corner point C):
    up→right:    arc center = C + (BR, 0)   [right of corner]
    right→down:  arc center = C + (0, BR)   [below corner]  
    down→right:  arc center = C + (BR, 0)   [right of corner] — wait, no.
    
  Let me define by: "which direction does the pipe come FROM, which does it go TO"
  
  Corner C = intersection of the two centerline directions.
  Arc center offset from C: always in the quadrant of the turn's "inside".

  up→right:   inside is top-right   → arc center = (C.x + BR, C.y)
               outer arc: r=BR+PH, from (C.x, C.y+BR+PH) to (C.x+BR+PH, C.y)? No...
               
  Let me think in terms of: the arc CENTER, and which points on the arcs connect to the pipes.
  
  For up→right at corner C=(cx,cy), arc center AC=(cx+BR, cy):
    Outer arc (r=BR+PH):
      - Connects to the LEFT side of the vertical pipe (wall at x = cx-PH):
        Point on outer arc at leftmost extent... that's (AC.x-(BR+PH), AC.y) = (cx+BR-BR-PH, cy) = (cx-PH, cy) ✓
      - Connects to the BOTTOM side of the horizontal pipe (wall at y = cy+PH):
        Point on outer arc at bottom: (AC.x, AC.y+(BR+PH)) = (cx+BR, cy+BR+PH)... 
        But the horiz pipe top wall is at y=cy-PH and bottom wall at y=cy+PH.
        The arc should connect at y=cy+PH on the horizontal pipe going right.
        On the outer arc: we need point where y = cy+PH, x > cx+BR.
        That's (AC.x + sqrt((BR+PH)²-(PH)²)... getting complicated.

  SIMPLER APPROACH: Draw each pipe wall as a separate open path (stroke, not fill).
  Use strokeWidth=1.2 for the wall lines.
  For the elbow, draw TWO arc strokes: one for each wall.
  Each wall arc is a simple quarter-circle.
  
  Wall arcs for up→right at corner C=(cx,cy):
    Arc center = (cx+BR, cy)
    
    LEFT wall of vertical pipe (at x=cx-PH) connects to TOP wall of horizontal pipe (at y=cy-PH):
      This is the INNER wall of the bend.
      Arc: center=(cx+BR, cy), radius=BR-PH
      Starts at: (cx+BR-(BR-PH), cy) = (cx+PH, cy)  [leftmost point of inner arc]
      Ends at:   (cx+BR, cy-(BR-PH)) = (cx+BR, cy-BR+PH)  [topmost point of inner arc]
      ... but LEFT wall of vpipe is at x=cx-PH, not cx+PH. That's the wrong wall.
      
  OK I need to be very careful about which wall connects to which.
  
  Vertical pipe going UP: 
    - Left wall: x = cx - PH  (this is the wall FACING LEFT, which is the OUTSIDE of a right turn)
    - Right wall: x = cx + PH (this is the wall FACING RIGHT, which is the INSIDE of a right turn)
  
  Horizontal pipe going RIGHT:
    - Top wall: y = cy - PH   (OUTSIDE of a downward turn, INSIDE of an upward turn)
    - Bottom wall: y = cy + PH
    
  For up→right: pipe comes from BELOW going UP, turns to go RIGHT.
    The OUTSIDE of the turn is the LEFT+TOP corner region.
    The INSIDE of the turn is the RIGHT+BOTTOM corner region.
    
    Arc center = (cx + BR, cy)  [to the right of corner, in the turn direction]
    
    OUTER wall arc (LEFT wall of vpipe → BOTTOM wall of hpipe):
      - vpipe left wall at x=cx-PH: this arc wall must pass through (cx-PH, cy)
        r_outer = BR+PH, center=(cx+BR, cy)
        Check: distance from (cx+BR, cy) to (cx-PH, cy) = BR+PH ✓
      - hpipe bottom wall at y=cy+PH: arc must end at some point where y=cy+PH
        The arc sweeps from (cx-PH, cy) counterclockwise (sweep=0) to (cx+BR, cy+BR+PH)
        But we want it to end at y=cy+PH on the hpipe, meaning x → ∞ at y=cy+PH on hpipe.
        Actually the hpipe bottom wall AT THE ELBOW end is at (cx+BR, cy+BR+PH)? No.
        
        The hpipe starts at x = cx+BR (centerline) + some offset.
        Wait — the STRAIGHT part of hpipe starts where the elbow ends.
        The elbow takes up BR of space along each direction.
        So hpipe (going right) starts at x = cx + BR, and its bottom wall is at y = cy+PH.
        The outer arc must end at (cx+BR, cy+PH)... let's check:
        distance from arc center (cx+BR, cy) to (cx+BR, cy+PH) = PH. That's r=PH, not BR+PH. ✗
        
  I think the issue is my arc center placement. Let me use a reference diagram approach.
  
  For a 90° pipe elbow from vertical (going up) to horizontal (going right):
  
  The pipe centerline makes a quarter-circle of radius BR.
  The two straight centerline segments meet at point C = (cx, cy).
  The arc center is at (cx+BR, cy) — BR to the right.
  
  The vertical centerline segment runs from (cx, cy+something) UP to (cx, cy+BR) [stops BR before corner]
    Wait — the arc starts at (cx, cy) going upward? No.
    The tangent point where the vertical centerline meets the arc:
    The arc center is (cx+BR, cy). The arc starts where the VERTICAL line is tangent to it.
    A vertical line at x=cx is tangent to a circle at (cx+BR, cy) when the radius points horizontally,
    i.e., at the point (cx, cy) — the leftmost point of the circle. ✓
    
    And the horizontal line at y=cy is tangent to the circle at (cx+BR, cy) at point:
    The topmost point of the circle is (cx+BR, cy-BR). That's where horizontal pipe meets? 
    No — horizontal line y=cy is tangent where the circle's tangent is vertical,
    i.e., at (cx+BR, cy) — the center itself? No that's wrong too.
    
    Horizontal line y=cy intersects circle at cx+BR±BR, so at (cx, cy) and (cx+2BR, cy).
    Tangent to y=cy at (cx+2BR, cy) — that means horizontal pipe starts at x=cx+2BR? Hmm.
    
    Actually: for the centerline arc from vertical to horizontal:
    - Arc center: (cx+BR, cy)
    - Arc start: (cx, cy) — leftmost point, vertical tangent → connects to vertical pipe going down
    - Arc end: (cx+BR, cy-BR) — topmost point, horizontal tangent → connects to horiz pipe going right
    
    So: vertical pipe centerline ends at y = cy (= arc start y)
        horiz pipe centerline starts at x = cx+BR, y = cy-BR (= arc end)
    
    This means the elbow takes the pipe from (cx, cy) curving up-right to (cx+BR, cy-BR).
    Corner "C" isn't where the centerlines intersect at a right angle in the usual sense —
    it's the arc center offset point.

  This is getting confusing because I keep mixing up the "corner" concept.
  
  FINAL CLEAN APPROACH: I'll just hard-code the path for each specific elbow in the lyne arm,
  computing exact coordinates numerically. No generic function needed for 2-3 elbows.
*/

// SVG gradient
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

/*
  ── Pipe rendering strategy ──
  
  Draw each pipe as a single <path> that traces the OUTLINE of the pipe run
  (outer wall forward, inner wall backward, closed with linecap).
  This is the standard SVG technique for thick stroked paths with proper joints.
  
  Actually the simplest correct approach: use a single centerline path with
  strokeWidth = PH*2, strokeLinecap="round", strokeLinejoin="round".
  Then overdraw with a slightly thinner darker stroke for the inner highlight.
  This gives a rounded-edge pipe that ALWAYS connects because it's one path.
  
  The "two walls" look comes from: 
    1. Outer glow: wide stroke (PH*2 + 2), very low opacity
    2. Pipe body: stroke PH*2, medium opacity, copper fill
    3. Inner shadow: stroke PH*2 - 4, very dark, low opacity (simulates depth)
  
  This is exactly how industrial pipe diagrams are drawn in SVG.
*/

const PH = 5; // pipe half-width — visible tube width = PH*2 = 10px
const BR = 14; // bend radius for elbows

// Draw a pipe as two visible walls with a gap — looks like a real tube.
// Uses the same centerline path `d` for both strokes.
// Outer stroke = PH*2 draws the full tube.
// Inner "eraser" stroke = PH*2 - 2.5 in bg color cuts out the middle, leaving walls.
function Pipe({ d }: { d: string }) {
  return (
    <g>
      {/* Tube body — copper fill, slightly transparent */}
      <path d={d} stroke={AC} strokeWidth={PH * 2}
        strokeLinecap="round" strokeLinejoin="round"
        fill="none" opacity={0.45} />
      {/* Inner cutout — dark background color to hollow out the tube */}
      <path d={d} stroke="var(--color-bg-primary, #0D0B07)" strokeWidth={PH * 2 - 2.5}
        strokeLinecap="round" strokeLinejoin="round"
        fill="none" opacity={1} />
      {/* Faint interior fill — subtle copper glow inside the tube */}
      <path d={d} stroke={AC} strokeWidth={PH * 2 - 4}
        strokeLinecap="round" strokeLinejoin="round"
        fill="none" opacity={0.06} />
    </g>
  );
}

// Flange ring at a point along a pipe
function Flange({ cx, cy, dir }: { cx: number; cy: number; dir: "h" | "v" }) {
  const ext = PH + 5;
  if (dir === "v") {
    return (
      <>
        <line x1={cx - ext} y1={cy - 2} x2={cx + ext} y2={cy - 2} stroke={AC} strokeWidth="2" opacity="0.5" />
        <line x1={cx - ext} y1={cy + 2} x2={cx + ext} y2={cy + 2} stroke={AC} strokeWidth="2" opacity="0.5" />
        <circle cx={cx - ext + 2} cy={cy} r="2" fill={AC} opacity="0.4" />
        <circle cx={cx + ext - 2} cy={cy} r="2" fill={AC} opacity="0.4" />
      </>
    );
  }
  return (
    <>
      <line x1={cx - 2} y1={cy - ext} x2={cx - 2} y2={cy + ext} stroke={AC} strokeWidth="2" opacity="0.5" />
      <line x1={cx + 2} y1={cy - ext} x2={cx + 2} y2={cy + ext} stroke={AC} strokeWidth="2" opacity="0.5" />
      <circle cx={cx} cy={cy - ext + 2} r="2" fill={AC} opacity="0.4" />
      <circle cx={cx} cy={cy + ext - 2} r="2" fill={AC} opacity="0.4" />
    </>
  );
}

// Valve handwheel
function ValveWheel({ cx, cy }: { cx: number; cy: number }) {
  const r = 11;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} stroke={AC} strokeWidth="1.8" opacity="0.6" fill="none" />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={AC} strokeWidth="1.2" opacity="0.5" />
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={AC} strokeWidth="1.2" opacity="0.5" />
      <line x1={cx - r * 0.7} y1={cy - r * 0.7} x2={cx + r * 0.7} y2={cy + r * 0.7} stroke={AC} strokeWidth="0.9" opacity="0.35" />
      <line x1={cx + r * 0.7} y1={cy - r * 0.7} x2={cx - r * 0.7} y2={cy + r * 0.7} stroke={AC} strokeWidth="0.9" opacity="0.35" />
      <circle cx={cx} cy={cy} r="3" fill={AC} opacity="0.45" />
    </>
  );
}

/*
  ── Lyne arm geometry (top pipe) ──

  Pipe exits lid at (COL_CX, lidY), travels UP, turns RIGHT, travels RIGHT,
  turns DOWN, drops, turns RIGHT again, then exits off the right edge.

  Using strokeLinejoin="round" on a single path means the elbow IS the round pipe bend.
  Just need to define the centerline waypoints correctly.
  
  The SVG path with strokeLinejoin="round" and a large strokeWidth will automatically
  produce rounded elbows at each L command. The radius of the rounded join is determined
  by the strokeWidth. For a proper bend radius effect, I'll use Q (quadratic bezier)
  or a short arc segment at each turn.

  WAYPOINTS for lyne arm centerline (coordinates in the SVG viewBox):
  
  lidY = 44 (top of lid)
  
  p0 = (COL_CX, lidY)          — exits lid center
  p1 = (COL_CX, lidY - 28)     — top of vertical rise (28px up)
  p2 = (COL_CX + 32, lidY - 28) — end of horizontal run right (32px right)  
  p3 = (COL_CX + 32, lidY - 10) — bottom of short drop (18px down)
  p4 = (1000, lidY - 10)        — exits off right edge

  For ROUND elbows at each corner, I'll use quadratic bezier curves.
  A Q bezier from p1 to p2 with control point at the corner gives a 
  smooth rounded turn proportional to the BR value.
  
  Path: M p0 L (p1 - BR vertically) Q p1 (p1 + BR horizontally) L (p2 - BR horiz) Q p2 (p2 + BR vertically down) L (p3 - BR vert) Q p3 (p3 + BR horiz) L p4
*/

function StillCap() {
  const lidX = COL_X - 10; const lidW = COL_W + 20;
  const lidY = 44; const lidH = 5;
  const svgH = lidY + lidH + 2;

  // Pipe centerline waypoints
  const px = COL_CX;       // vertical centerline x
  const p0y = lidY;         // exit point (top of lid)
  const p1y = lidY - 34;    // top of rise (more headroom)
  const p2x = px + 40;      // right end of horizontal run (wider spacing)
  const p3y = lidY - 2;     // bottom of drop — more room between elbow 2 and 3

  // Rounded corner path using Q bezier — control point at corner, radius = BR
  // Corner 1: (px, p1y) — up→right
  // Corner 2: (p2x, p1y) — right→down  
  // Corner 3: (p2x, p3y) — down→right
  const lyneArm = [
    `M ${px} ${p0y}`,
    `L ${px} ${p1y + BR}`,               // straight up, stop BR before corner
    `Q ${px} ${p1y} ${px + BR} ${p1y}`,  // round corner: up→right
    `L ${p2x - BR} ${p1y}`,              // straight right, stop BR before corner
    `Q ${p2x} ${p1y} ${p2x} ${p1y + BR}`, // round corner: right→down
    `L ${p2x} ${p3y - BR}`,              // straight down, stop BR before corner
    `Q ${p2x} ${p3y} ${p2x + BR} ${p3y}`, // round corner: down→right
    `L 3000 ${p3y}`,                     // straight right — well past right edge of any viewport
  ].join(" ");

  // Flange + valve positions
  const f1y = p0y + (p1y - p0y) * 0.4;  // on vertical rise
  const valveX = p2x + BR + 30;          // on final horizontal run

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${svgH}`}
      fill="none"
      overflow="visible"
      style={{ width: VB_W, height: svgH, display: "block", overflow: "visible" }}
    >
      {/* Flat lid */}
      <rect x={lidX} y={lidY} width={lidW} height={lidH} fill={AC} opacity="0.08" />
      <line x1={lidX} y1={lidY} x2={lidX + lidW} y2={lidY} stroke={AC} strokeWidth="1.8" opacity="0.45" />
      <line x1={lidX} y1={lidY + lidH} x2={lidX + lidW} y2={lidY + lidH} stroke={AC} strokeWidth="1" opacity="0.2" />
      <line x1={lidX} y1={lidY} x2={lidX} y2={lidY + lidH} stroke={AC} strokeWidth="1.5" opacity="0.45" />
      <line x1={lidX + lidW} y1={lidY} x2={lidX + lidW} y2={lidY + lidH} stroke={AC} strokeWidth="1.5" opacity="0.45" />
      {/* Column walls below lid */}
      <line x1={COL_X} y1={lidY + lidH} x2={COL_X} y2={svgH} stroke={AC} strokeWidth="1.5" opacity="0.45" />
      <line x1={COL_X + COL_W} y1={lidY + lidH} x2={COL_X + COL_W} y2={svgH} stroke={AC} strokeWidth="1.5" opacity="0.45" />
      <rect x={COL_X} y={lidY + lidH} width={COL_W} height={svgH - lidY - lidH} fill="url(#hwh-copper)" />

      {/* Lyne arm pipe */}
      <Pipe d={lyneArm} />

      {/* Flange at lid exit */}
      <Flange cx={px} cy={p0y - 3} dir="v" />

      {/* ── Elbow 1 (up→right) flanges ── */}
      {/* Entry: on vertical segment, just before curve starts */}
      <Flange cx={px} cy={p1y + BR + 3} dir="v" />
      {/* Exit: on horizontal segment, just after curve ends */}
      <Flange cx={px + BR + 3} cy={p1y} dir="h" />

      {/* ── Elbow 2 (right→down) flanges ── */}
      <Flange cx={p2x - BR - 3} cy={p1y} dir="h" />
      <Flange cx={p2x} cy={p1y + BR + 3} dir="v" />

      {/* ── Elbow 3 (down→right) flanges ── */}
      <Flange cx={p2x} cy={p3y - BR - 3} dir="v" />
      <Flange cx={p2x + BR + 3} cy={p3y} dir="h" />

      {/* Flange further along final horizontal run */}
      <Flange cx={valveX - 16} cy={p3y} dir="h" />

      {/* Valve handwheel */}
      <ValveWheel cx={valveX} cy={p3y} />
    </svg>
  );
}

// Column body
function CylinderBody({ plateCount }: { plateCount: number }) {
  const plates = Array.from({ length: plateCount });
  const spacing = 100 / (plateCount + 1);
  return (
    <svg viewBox={`0 0 ${VB_W} 100`} preserveAspectRatio="none" fill="none"
      style={{ width: VB_W, height: "100%", display: "block" }}>
      <rect x={COL_X} y="0" width={COL_W} height="100" fill="url(#hwh-copper)" />
      <line x1={COL_X} y1="0" x2={COL_X} y2="100" stroke={AC} strokeWidth="1.5" opacity="0.45" />
      <line x1={COL_X + COL_W} y1="0" x2={COL_X + COL_W} y2="100" stroke={AC} strokeWidth="1.5" opacity="0.45" />
      {plates.map((_, j) => (
        <line key={j}
          x1={COL_X + 4} y1={spacing * (j + 1)}
          x2={COL_X + COL_W - 4} y2={spacing * (j + 1)}
          stroke={AC} strokeWidth="0.6" strokeDasharray="4 3" opacity="0.18" />
      ))}
    </svg>
  );
}

// Riveted flange between sections
function SectionFlange() {
  return (
    <svg viewBox={`0 0 ${VB_W} 14`} fill="none" style={{ width: VB_W, height: 14, display: "block" }}>
      <rect x={COL_X} y="0" width={COL_W} height="14" fill={AC} opacity="0.04" />
      <line x1={COL_X - 10} y1="3" x2={COL_X + COL_W + 10} y2="3" stroke={AC} strokeWidth="1.2" opacity="0.35" />
      <line x1={COL_X - 10} y1="11" x2={COL_X + COL_W + 10} y2="11" stroke={AC} strokeWidth="1.2" opacity="0.35" />
      <circle cx={COL_X - 7} cy="7" r="3" stroke={AC} strokeWidth="0.8" opacity="0.3" fill="none" />
      <circle cx={COL_X + COL_W + 7} cy="7" r="3" stroke={AC} strokeWidth="0.8" opacity="0.3" fill="none" />
      <circle cx={COL_CX - 12} cy="7" r="1.5" fill={AC} opacity="0.2" />
      <circle cx={COL_CX} cy="7" r="1.5" fill={AC} opacity="0.2" />
      <circle cx={COL_CX + 12} cy="7" r="1.5" fill={AC} opacity="0.2" />
    </svg>
  );
}

/*
  ── Product pipe geometry (bottom) ──

  Exits bottom of spout at (COL_CX, spoutOutY), drops straight down,
  rounds a left turn, exits off the left edge.

  Waypoints:
  p0 = (COL_CX, spoutOutY)       — exits spout
  p1 = (COL_CX, spoutOutY + 24)  — bottom of drop, before left turn
  p2 = (-1000, spoutOutY + 24)   — exits off left edge

  Rounded corner at (COL_CX, p1y) turning left:
  Path:
    M p0
    L (COL_CX, p1y - BR)              straight down
    Q (COL_CX, p1y) (COL_CX - BR, p1y)  round corner: down→left
    L (-1000, p1y)                     off left edge
*/
function StillSpout() {
  const spoutOutY = 50;
  const p1y = spoutOutY + 26;
  const svgH = p1y + PH + 10;

  const productPipe = [
    `M ${COL_CX} ${spoutOutY}`,
    `L ${COL_CX} ${p1y - BR}`,
    `Q ${COL_CX} ${p1y} ${COL_CX - BR} ${p1y}`,
    `L -3000 ${p1y}`,
  ].join(" ");

  const valveX = COL_CX - BR - 28;
  const flangeX = COL_CX - BR - 10;

  return (
    <svg viewBox={`0 0 ${VB_W} ${svgH}`} fill="none" overflow="visible"
      style={{ width: VB_W, height: svgH, display: "block", overflow: "visible" }}>

      {/* Column walls at top */}
      <line x1={COL_X} y1="0" x2={COL_X} y2="20" stroke={AC} strokeWidth="1.5" opacity="0.45" />
      <line x1={COL_X + COL_W} y1="0" x2={COL_X + COL_W} y2="20" stroke={AC} strokeWidth="1.5" opacity="0.45" />
      <rect x={COL_X} y="0" width={COL_W} height="20" fill="url(#hwh-copper)" />

      {/* Converging spout */}
      <path d={`M${COL_X} 20 L${COL_CX - 5} 42 L${COL_CX - 5} ${spoutOutY}`}
        stroke={AC} strokeWidth="1.5" opacity="0.4" fill="none" />
      <path d={`M${COL_X + COL_W} 20 L${COL_CX + 5} 42 L${COL_CX + 5} ${spoutOutY}`}
        stroke={AC} strokeWidth="1.5" opacity="0.4" fill="none" />
      <path d={`M${COL_X} 20 L${COL_CX - 5} 42 L${COL_CX - 5} ${spoutOutY} L${COL_CX + 5} ${spoutOutY} L${COL_CX + 5} 42 L${COL_X + COL_W} 20 Z`}
        fill={AC} opacity="0.04" />

      {/* Product pipe */}
      <Pipe d={productPipe} />

      {/* Flange at spout exit */}
      <Flange cx={COL_CX} cy={spoutOutY + 3} dir="v" />

      {/* ── Elbow (down→left) flanges ── */}
      {/* Entry: on vertical segment, just before curve */}
      <Flange cx={COL_CX} cy={p1y - BR - 3} dir="v" />
      {/* Exit: on horizontal segment, just after curve */}
      <Flange cx={COL_CX - BR - 3} cy={p1y} dir="h" />

      {/* Flange further along horizontal run */}
      <Flange cx={flangeX} cy={p1y} dir="h" />

      {/* Valve */}
      <ValveWheel cx={valveX} cy={p1y} />
    </svg>
  );
}

// Sight glass
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

// Step text
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

// Step row
function StepRow({ step, index }: { step: StepData; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-10% 0px -10% 0px" });
  return (
    <div style={{ display: "flex", alignItems: "center", minHeight: 190 }}>
      <div ref={ref} style={{ width: VB_W, flexShrink: 0, alignSelf: "stretch", position: "relative" }}>
        <CylinderBody plateCount={index === 0 ? 2 : 3} />
        <div style={{
          position: "absolute", top: "50%", left: COL_CX,
          transform: "translate(-50%, -50%)",
        }}>
          <SightGlass number={step.number} index={index} />
        </div>

      </div>
      <div style={{ flex: 1, paddingLeft: 28 }}>
        <StepText step={step} index={index} />
      </div>
    </div>
  );
}

export default function HowWeHunt() {
  return (
    <section id="how-we-hunt" style={{
      backgroundColor: "var(--color-bg-tertiary)",
      paddingTop: 56, paddingBottom: 56, width: "100%",
      overflow: "hidden", // clip pipes at page edges — no horizontal scrollbar
    }}>
      <SvgDefs />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 40px", overflow: "visible" }}>
        <ScrollReveal>
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

        <div>
          <StillCap />
          {steps.map((step, i) => (
            <div key={step.number}>
              <StepRow step={step} index={i} />
              {i < steps.length - 1 && <SectionFlange />}
            </div>
          ))}
          <StillSpout />
        </div>
      </div>
    </section>
  );
}
