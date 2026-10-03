"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";
import ScrollReveal from "@/components/ScrollReveal";

// ── Mini Drop Feed Mockup ──
function MiniDropFeed() {
  const rows = [
    { bottle: "Blanton's Original", store: "ABC #247, Raleigh", tier: "ALLOCATED", multiplier: "2.4×", bottles: 6 },
    { bottle: "W.L. Weller 12yr", store: "ABC #112, Charlotte", tier: "ALLOCATED", multiplier: "1.8×", bottles: 4 },
    { bottle: "Buffalo Trace", store: "ABC #391, Durham", tier: "LIMITED", multiplier: "1.2×", bottles: 18 },
    { bottle: "Eagle Rare 10yr", store: "ABC #058, Cary", tier: "LIMITED", multiplier: "1.5×", bottles: 8 },
    { bottle: "Pappy 15yr", store: "ABC #112, Charlotte", tier: "UNICORN", multiplier: "12×", bottles: 2 },
  ];

  const tierColors: Record<string, string> = {
    UNICORN: "var(--color-accent-gold)",
    ALLOCATED: "var(--color-accent-amber)",
    LIMITED: "var(--color-accent-copper)",
  };

  return (
    <div
      style={{
        background: "var(--color-bg-secondary)",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(196,148,58,0.12)",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-accent-amber)", animation: "pulseDot 2s infinite" }} />
        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "10px", color: "var(--color-text-tertiary)", letterSpacing: "0.08em" }}>
          LIVE DROPS
        </span>
      </div>

      {/* Drop rows */}
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            padding: "7px 10px",
            borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            borderLeft: `2px solid ${tierColors[row.tier]}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "9px",
                fontWeight: 600,
                color: "var(--color-text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {row.bottle}
            </div>
            <div
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "8px",
                color: "var(--color-text-tertiary)",
                marginTop: "1px",
              }}
            >
              {row.store}
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "9px",
              fontWeight: 700,
              color: tierColors[row.tier],
              flexShrink: 0,
            }}
          >
            {row.multiplier}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Mini Hunt Map — Real map image with pin overlays ──
function MiniHuntMap() {
  // Store pins — coordinates matched to /public/map-preview.png (CartoDB dark_all, zoom 6, tiles 17-19 x 24-25)
  const pins = [
    // Charlotte cluster
    { x: 21, y: 65, hot: true, size: 10 },
    { x: 24, y: 68, hot: false, size: 7 },
    { x: 18, y: 62, hot: false, size: 7 },
    // Raleigh/Durham/Cary cluster
    { x: 34, y: 59, hot: true, size: 10 },
    { x: 33, y: 57, hot: false, size: 7 },
    { x: 33, y: 59, hot: true, size: 8 },
    // Greensboro
    { x: 27, y: 56, hot: false, size: 7 },
    // Wilmington
    { x: 38, y: 76, hot: false, size: 6 },
    // Asheville
    { x: 11, y: 61, hot: false, size: 7 },
    // Virginia — Richmond cluster
    { x: 41, y: 40, hot: true, size: 9 },
    { x: 44, y: 37, hot: false, size: 6 },
    // Virginia Beach / Norfolk
    { x: 48, y: 47, hot: false, size: 6 },
    // Northern VA (Arlington)
    { x: 43, y: 24, hot: false, size: 6 },
    // Scattered NC outliers
    { x: 25, y: 70, hot: false, size: 5 },
    { x: 30, y: 63, hot: false, size: 5 },
  ];

  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "4/3",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(196,148,58,0.12)",
      }}
    >
      {/* Real map background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/map-preview.png"
        alt="NC and VA store map"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "brightness(0.85)",
        }}
      />

      {/* Amber pin overlay dots — key cities */}
      {pins.map((pin, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${pin.x}%`,
            top: `${pin.y}%`,
            transform: "translate(-50%, -50%)",
            zIndex: pin.hot ? 2 : 1,
          }}
        >
          {pin.hot && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: `${pin.size * 2.8}px`,
                height: `${pin.size * 2.8}px`,
                borderRadius: "50%",
                background: "rgba(196,148,58,0.15)",
                animation: "pulseDot 2s ease-in-out infinite",
              }}
            />
          )}
          <div
            style={{
              width: `${pin.size}px`,
              height: `${pin.size}px`,
              borderRadius: "50%",
              background: pin.hot ? "var(--color-accent-amber)" : "rgba(196,148,58,0.38)",
              boxShadow: pin.hot ? "0 0 6px rgba(196,148,58,0.8)" : "none",
              position: "relative",
              zIndex: 1,
            }}
          />
        </div>
      ))}

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 55% 55%, rgba(10,8,6,0) 30%, rgba(10,8,6,0.65) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* NC · VA label */}
      <div
        style={{
          position: "absolute",
          bottom: "7px",
          right: "8px",
          fontFamily: "var(--font-jetbrains)",
          fontSize: "8px",
          color: "rgba(196,148,58,0.5)",
          letterSpacing: "0.1em",
        }}
      >
        NC · VA
      </div>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          top: "7px",
          left: "8px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-accent-amber)" }} />
        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "8px", color: "rgba(196,148,58,0.6)" }}>
          Active drops
        </span>
      </div>
    </div>
  );
}

// Feature cards
interface FeatureCardProps {
  caption: string;
  children: React.ReactNode;
}

function FeatureCard({ caption, children }: FeatureCardProps) {
  return (
    <motion.div
      variants={fadeUpVariant}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* Mockup */}
      <div
        style={{
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid var(--color-card-border)",
          background: "var(--color-card-bg)",
          padding: "10px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        {children}
      </div>

      {/* Caption */}
      <p
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--color-text-secondary)",
          textAlign: "center",
          margin: 0,
        }}
      >
        {caption}
      </p>
    </motion.div>
  );
}

export default function MemberPreview() {
  return (
    <section
      style={{
        backgroundColor: "var(--color-bg-tertiary)",
        paddingTop: "72px",
        paddingBottom: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 40px)",
        }}
      >
        {/* Heading */}
        <ScrollReveal>
          <h2
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(26px, 5vw, 36px)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              textAlign: "center",
              margin: "0 auto 8px",
            }}
          >
            What Members Get
          </h2>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              color: "var(--color-text-tertiary)",
              textAlign: "center",
              marginBottom: "40px",
            }}
          >
            Every tool you need to find the bottle before anyone else.
          </p>
        </ScrollReveal>

        {/* Cards grid — 2×2 on desktop, stacked on mobile */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid gap-5 member-preview-grid"
        >
          <FeatureCard caption="Real-time drop intel, tailored to you">
            <MiniDropFeed />
          </FeatureCard>

          <FeatureCard caption="Store-level tracking across states">
            <MiniHuntMap />
          </FeatureCard>

        </motion.div>
      </div>
    </section>
  );
}

