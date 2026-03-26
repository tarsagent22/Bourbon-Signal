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
  // Store pins scattered realistically — clusters near cities, outliers spread out
  const pins = [
    // Charlotte cluster
    { x: 32, y: 62, hot: true, size: 10 },
    { x: 36, y: 67, hot: false, size: 7 },
    { x: 28, y: 58, hot: false, size: 7 },
    // Raleigh/Durham/Cary cluster
    { x: 68, y: 42, hot: true, size: 10 },
    { x: 73, y: 46, hot: false, size: 7 },
    { x: 64, y: 38, hot: true, size: 8 },
    // Greensboro
    { x: 52, y: 44, hot: false, size: 7 },
    // Wilmington
    { x: 78, y: 72, hot: false, size: 6 },
    // Asheville
    { x: 18, y: 50, hot: false, size: 7 },
    // Virginia — Richmond cluster
    { x: 72, y: 22, hot: true, size: 9 },
    { x: 78, y: 18, hot: false, size: 6 },
    // Northern VA
    { x: 68, y: 12, hot: false, size: 6 },
    // Scattered outliers
    { x: 44, y: 55, hot: false, size: 5 },
    { x: 56, y: 30, hot: false, size: 5 },
    { x: 88, y: 55, hot: false, size: 5 },
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

// ── Mini SMS Alert Mockup — iPhone iMessage style ──
function MiniSmsAlert() {
  const messages = [
    {
      text: "🥃 Blanton's Original — ABC Store #247, Raleigh. 6 bottles. Spotted 3 min ago",
      time: "9:04 AM",
    },
    {
      text: "🔥 Weller 12 Year — Store #189, Cary. 2 bottles. Spotted just now",
      time: "9:06 AM",
    },
  ];

  return (
    <div
      style={{
        background: "#1C1C1E",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* iPhone status bar + contact header */}
      <div
        style={{
          padding: "8px 10px 6px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "#2C2C2E",
          display: "flex",
          alignItems: "center",
          gap: "7px",
        }}
      >
        {/* Back chevron */}
        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "rgba(10,132,255,0.9)", fontWeight: 400 }}>‹</span>
        {/* Avatar */}
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(196,148,58,0.4) 0%, rgba(184,115,51,0.6) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            flexShrink: 0,
          }}
        >
          🥃
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "10px", fontWeight: 600, color: "var(--color-text-primary)" }}>
            ProofHunt
          </div>
          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "8px", color: "rgba(255,255,255,0.4)" }}>
            iMessage
          </div>
        </div>
        {/* Video/call icons placeholder */}
        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "11px", color: "rgba(10,132,255,0.8)" }}>⊙</span>
      </div>

      {/* Message bubbles */}
      <div style={{ padding: "10px 10px 6px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "88%",
                background: "#3A3A3C",
                borderRadius: "2px 14px 14px 14px",
                padding: "7px 10px",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "9px",
                  color: "rgba(255,255,255,0.9)",
                  lineHeight: 1.55,
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
                color: "rgba(255,255,255,0.3)",
                marginTop: "3px",
                marginLeft: "4px",
              }}
            >
              {msg.time}
            </span>
          </div>
        ))}
      </div>

      {/* iPhone input bar */}
      <div
        style={{
          padding: "5px 8px 8px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            padding: "5px 10px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "9px",
            color: "rgba(255,255,255,0.22)",
          }}
        >
          iMessage
        </div>
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "rgba(10,132,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            color: "white",
            flexShrink: 0,
          }}
        >
          ↑
        </div>
      </div>
    </div>
  );
}

// ── Mini Email Inbox Mockup — Apple Mail dark mode style ──
function MiniEmailInbox() {
  const emails = [
    {
      subject: "🦄 Pappy Van Winkle 15yr — ABC Store #112, Charlotte (2 bottles)",
      preview: "Spotted 4 min ago. Tap to open map.",
      time: "9:04 AM",
    },
    {
      subject: "🥃 Blanton's Original — ABC Store #247, Raleigh (6 bottles)",
      preview: "Spotted 12 min ago. 6 bottles remaining.",
      time: "9:12 AM",
    },
    {
      subject: "📦 Weller Special Reserve — ABC Store #391, Durham (12 bottles)",
      preview: "Spotted 31 min ago. Lower demand — good chance.",
      time: "9:31 AM",
    },
  ];

  return (
    <div
      style={{
        background: "#1C1C1E",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Inbox header */}
      <div
        style={{
          padding: "7px 10px 6px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#2C2C2E",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          Inbox
        </span>
        <div
          style={{
            background: "var(--color-accent-amber)",
            borderRadius: "10px",
            padding: "1px 6px",
            fontFamily: "var(--font-jetbrains)",
            fontSize: "9px",
            fontWeight: 700,
            color: "#0D0B0E",
            lineHeight: "14px",
          }}
        >
          3
        </div>
      </div>

      {/* Email rows */}
      {emails.map((email, i) => (
        <div
          key={i}
          style={{
            padding: "8px 10px",
            borderBottom: i < emails.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            display: "flex",
            alignItems: "flex-start",
            gap: "7px",
          }}
        >
          {/* Unread indicator dot */}
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--color-accent-amber)",
              flexShrink: 0,
              marginTop: "4px",
            }}
          />

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "4px" }}>
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  flexShrink: 0,
                }}
              >
                ProofHunt Alerts
              </span>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "8px",
                  color: "var(--color-text-tertiary)",
                  flexShrink: 0,
                }}
              >
                {email.time}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "8.5px",
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginTop: "2px",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
              } as React.CSSProperties}
            >
              {email.subject}
            </div>
            <div
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "8px",
                color: "var(--color-text-tertiary)",
                marginTop: "1px",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {email.preview}
            </div>
          </div>
        </div>
      ))}
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
          className="grid gap-5"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          <FeatureCard caption="Real-time drop intel, unblurred">
            <MiniDropFeed />
          </FeatureCard>

          <FeatureCard caption="Store-level tracking across states">
            <MiniHuntMap />
          </FeatureCard>

          <FeatureCard caption="Instant SMS alerts">
            <MiniSmsAlert />
          </FeatureCard>

          <FeatureCard caption="Email alerts — never miss a drop">
            <MiniEmailInbox />
          </FeatureCard>
        </motion.div>
      </div>
    </section>
  );
}
