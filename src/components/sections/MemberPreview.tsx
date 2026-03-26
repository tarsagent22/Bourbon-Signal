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
                fontFamily: "var(--font-jetbrains)",
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

// ── Mini Hunt Map Mockup ──
function MiniHuntMap() {
  // Store pins as [x%, y%] within the card, with a hot indicator
  const pins = [
    { x: 28, y: 35, hot: true, label: "12 drops" },
    { x: 55, y: 25, hot: false, label: "3 drops" },
    { x: 70, y: 55, hot: true, label: "8 drops" },
    { x: 40, y: 65, hot: false, label: "1 drop" },
    { x: 82, y: 38, hot: false, label: "2 drops" },
    { x: 20, y: 70, hot: true, label: "5 drops" },
  ];

  return (
    <div
      style={{
        background: "var(--color-bg-tertiary)",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(196,148,58,0.12)",
        position: "relative",
        aspectRatio: "4/3",
      }}
    >
      {/* Faux map grid lines */}
      <svg
        viewBox="0 0 200 150"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.18,
        }}
      >
        {/* Horizontal roads */}
        {[30, 55, 80, 110, 130].map((y) => (
          <line key={y} x1="0" y1={y} x2="200" y2={y} stroke="#4a7c59" strokeWidth="1" />
        ))}
        {/* Vertical roads */}
        {[40, 80, 120, 160].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="150" stroke="#4a7c59" strokeWidth="1" />
        ))}
        {/* A subtle diagonal (highway) */}
        <line x1="0" y1="150" x2="200" y2="0" stroke="#4a7c59" strokeWidth="0.8" />
      </svg>

      {/* Map overlay tint */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 50% 50%, rgba(13,11,7,0) 40%, rgba(13,11,7,0.6) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Store pins */}
      {pins.map((pin, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${pin.x}%`,
            top: `${pin.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            style={{
              width: pin.hot ? "10px" : "7px",
              height: pin.hot ? "10px" : "7px",
              borderRadius: "50%",
              background: pin.hot ? "var(--color-accent-amber)" : "rgba(196,148,58,0.45)",
              boxShadow: pin.hot ? "0 0 8px rgba(196,148,58,0.7)" : "none",
              animation: pin.hot ? "pulseDot 2s ease-in-out infinite" : "none",
            }}
          />
        </div>
      ))}

      {/* State label overlay */}
      <div
        style={{
          position: "absolute",
          bottom: "8px",
          right: "8px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "9px",
          color: "rgba(196,148,58,0.6)",
          letterSpacing: "0.08em",
        }}
      >
        NC · VA
      </div>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          top: "8px",
          left: "8px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-accent-amber)" }} />
        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "8px", color: "var(--color-text-tertiary)" }}>
          Active drops
        </span>
      </div>
    </div>
  );
}

// ── Mini SMS Alert Mockup ──
function MiniSmsAlert() {
  const messages = [
    {
      from: "ProofHunt",
      text: "🦄 Pappy 15yr dropped at ABC #112 Charlotte — 2 bottles. Grab it now.",
      time: "9:04 AM",
      incoming: true,
    },
    {
      from: "You",
      text: "On my way 🏃",
      time: "9:05 AM",
      incoming: false,
    },
  ];

  return (
    <div
      style={{
        background: "var(--color-bg-secondary)",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* SMS header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: "7px",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "rgba(196,148,58,0.15)",
            border: "1px solid rgba(196,148,58,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
          }}
        >
          🥃
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "10px", fontWeight: 600, color: "var(--color-text-primary)" }}>
            ProofHunt
          </div>
          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "9px", color: "var(--color-text-tertiary)" }}>
            Text Message
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: msg.incoming ? "flex-start" : "flex-end",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                background: msg.incoming
                  ? "rgba(196,148,58,0.12)"
                  : "rgba(59,130,246,0.2)",
                border: msg.incoming
                  ? "1px solid rgba(196,148,58,0.2)"
                  : "1px solid rgba(59,130,246,0.25)",
                borderRadius: msg.incoming ? "2px 10px 10px 10px" : "10px 2px 10px 10px",
                padding: "6px 8px",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "9px",
                  color: "var(--color-text-primary)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {msg.text}
              </p>
            </div>
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "8px",
                color: "var(--color-text-tertiary)",
                marginTop: "2px",
              }}
            >
              {msg.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Feature Card ──
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
          maxWidth: "800px",
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

        {/* Cards grid */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "20px",
          }}
        >
          <FeatureCard caption="Real-time drop intel, unblurred">
            <MiniDropFeed />
          </FeatureCard>

          <FeatureCard caption="Store-level tracking across states">
            <MiniHuntMap />
          </FeatureCard>

          <FeatureCard caption="Instant SMS + email alerts">
            <MiniSmsAlert />
          </FeatureCard>
        </motion.div>
      </div>
    </section>
  );
}
