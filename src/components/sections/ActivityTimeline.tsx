"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

interface TimelineEvent {
  timestamp: string;
  description: string;
  tier: "unicorn" | "allocated" | "limited" | "user";
  type: "drop" | "watchlist";
}

const TIER_DOT_COLORS: Record<string, string> = {
  unicorn: "var(--color-amber-rich)",
  allocated: "var(--color-copper)",
  limited: "var(--color-silver-muted)",
  user: "var(--color-accent-amber)",
};

const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    timestamp: "2026-03-23T01:00:00Z",
    description: "Woodford Reserve Double Double Oaked spotted in 15 Wake County stores",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-22T16:30:00Z",
    description: "King of Kentucky Small Batch 1 shipped to 7 NC counties",
    tier: "unicorn",
    type: "drop",
  },
  {
    timestamp: "2026-03-22T15:00:00Z",
    description: "You added King of Kentucky to your watchlist",
    tier: "user",
    type: "watchlist",
  },
  {
    timestamp: "2026-03-22T11:00:00Z",
    description: "E.H. Taylor Single Barrel dropped in Durham County",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-21T16:30:00Z",
    description: "King of Kentucky Small Batch 2 shipped to 8 counties",
    tier: "unicorn",
    type: "drop",
  },
  {
    timestamp: "2026-03-21T10:00:00Z",
    description: "You added Stagg Jr to your watchlist",
    tier: "user",
    type: "watchlist",
  },
  {
    timestamp: "2026-03-20T14:00:00Z",
    description: "Blanton's allocation assigned — Mecklenburg County",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-19T09:00:00Z",
    description: "Weller 12 restocked in 3 Triangle-area stores",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-18T16:00:00Z",
    description: "You added E.H. Taylor Single Barrel to your watchlist",
    tier: "user",
    type: "watchlist",
  },
  {
    timestamp: "2026-03-17T11:30:00Z",
    description: "Eagle Rare spotted in Greensboro ABC Board",
    tier: "limited",
    type: "drop",
  },
];

function formatTimelineDate(timestamp: string): string {
  const d = new Date(timestamp);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${date} ${time}`;
}

export default function ActivityTimeline() {
  return (
    <section style={{ width: "100%" }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 clamp(16px, 5vw, 48px)",
        }}
      >
        {/* Section header */}
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--color-cream)",
            margin: "0 0 32px 0",
          }}
        >
          Recent Activity
        </h2>

        {/* Timeline */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          style={{ position: "relative", paddingLeft: "24px" }}
        >
          {/* Vertical line */}
          <div
            style={{
              position: "absolute",
              left: "7px",
              top: "8px",
              bottom: "8px",
              width: "2px",
              background: "rgba(196,148,58,0.15)",
              borderRadius: "1px",
            }}
          />

          {TIMELINE_EVENTS.map((event, i) => (
            <motion.div
              key={i}
              variants={fadeUpVariant}
              className="flex"
              style={{
                position: "relative",
                marginBottom: i < TIMELINE_EVENTS.length - 1 ? "24px" : 0,
                minHeight: "44px",
                alignItems: "flex-start",
              }}
            >
              {/* Dot */}
              <div
                style={{
                  position: "absolute",
                  left: "-20px",
                  top: "6px",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: TIER_DOT_COLORS[event.tier],
                  border: "2px solid var(--color-bg-primary)",
                  flexShrink: 0,
                  zIndex: 1,
                }}
              />

              {/* Content */}
              <div style={{ paddingLeft: "4px" }}>
                <div
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "11px",
                    color: "var(--color-text-tertiary)",
                    marginBottom: "4px",
                  }}
                >
                  {formatTimelineDate(event.timestamp)}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    color: event.type === "watchlist"
                      ? "var(--color-text-secondary)"
                      : "var(--color-cream)",
                    lineHeight: 1.5,
                    fontStyle: event.type === "watchlist" ? "italic" : "normal",
                  }}
                >
                  {event.description}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
