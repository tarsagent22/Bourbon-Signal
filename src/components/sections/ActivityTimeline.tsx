"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";
import BottleLink from "@/components/BottleLink";
import CountyLink from "@/components/CountyLink";

interface TimelineEvent {
  timestamp: string;
  description: string;
  bottleName?: string;
  county?: string;
  tier: "unicorn" | "allocated" | "limited" | "user";
  type: "drop" | "watchlist";
}

const TIER_DOT_COLORS: Record<string, string> = {
  unicorn: "#C4943A",
  allocated: "#B87333",
  limited: "#8A8A8A",
  user: "#C4943A",
};

const TIMELINE_EVENTS: TimelineEvent[] = [
  {
    timestamp: "2026-03-23T01:00:00Z",
    description: "{bottle} spotted in 15 {county} stores",
    bottleName: "Woodford Reserve Double Double Oaked",
    county: "Wake",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-22T16:30:00Z",
    description: "{bottle} shipped to 7 NC counties",
    bottleName: "King of Kentucky Small Batch",
    tier: "unicorn",
    type: "drop",
  },
  {
    timestamp: "2026-03-22T15:00:00Z",
    description: "You added {bottle} to your watchlist",
    bottleName: "King of Kentucky",
    tier: "user",
    type: "watchlist",
  },
  {
    timestamp: "2026-03-22T11:00:00Z",
    description: "{bottle} dropped in {county}",
    bottleName: "E.H. Taylor Single Barrel",
    county: "Durham",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-21T16:30:00Z",
    description: "{bottle} shipped to 8 counties",
    bottleName: "King of Kentucky Small Batch",
    tier: "unicorn",
    type: "drop",
  },
  {
    timestamp: "2026-03-21T10:00:00Z",
    description: "You added {bottle} to your watchlist",
    bottleName: "Stagg Jr",
    tier: "user",
    type: "watchlist",
  },
  {
    timestamp: "2026-03-20T14:00:00Z",
    description: "{bottle} allocation assigned — {county}",
    bottleName: "Blanton's",
    county: "Mecklenburg",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-19T09:00:00Z",
    description: "{bottle} restocked in 3 Triangle-area stores",
    bottleName: "Weller 12",
    county: "Triangle",
    tier: "allocated",
    type: "drop",
  },
  {
    timestamp: "2026-03-18T16:00:00Z",
    description: "You added {bottle} to your watchlist",
    bottleName: "E.H. Taylor Single Barrel",
    tier: "user",
    type: "watchlist",
  },
  {
    timestamp: "2026-03-17T11:30:00Z",
    description: "{bottle} spotted in {county} ABC Board",
    bottleName: "Eagle Rare",
    county: "Greensboro",
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

function renderTimelineDescription(event: TimelineEvent): React.ReactNode {
  const parts = event.description.split(/(\{bottle\}|\{county\})/);
  return parts.map((part, i) => {
    if (part === "{bottle}" && event.bottleName) {
      return <BottleLink key={i} name={event.bottleName}>{event.bottleName}</BottleLink>;
    }
    if (part === "{county}" && event.county) {
      return <CountyLink key={i} county={event.county}>{event.county}</CountyLink>;
    }
    return part;
  });
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
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--color-cream)",
            margin: "0 0 32px 0",
          }}
        >
          Recent Activity
        </h2>

        {TIMELINE_EVENTS.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <p
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "18px",
                color: "var(--color-cream)",
                marginBottom: "8px",
              }}
            >
              No recent activity
            </p>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              Activity will appear here as drops are detected
            </p>
          </div>
        ) : (
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
                  {renderTimelineDescription(event)}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
        )}
      </div>
    </section>
  );
}
