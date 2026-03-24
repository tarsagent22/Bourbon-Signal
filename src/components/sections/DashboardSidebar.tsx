"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { fadeUpVariant } from "@/lib/animations";
import type { DropEvent } from "@/lib/drops";

interface WatchlistItem {
  name: string;
  tier: "unicorn" | "allocated" | "limited";
  lastDrop: string | null;
}

const INITIAL_WATCHLIST: WatchlistItem[] = [
  { name: "Pappy Van Winkle 23", tier: "unicorn", lastDrop: null },
  { name: "Blanton's", tier: "allocated", lastDrop: "2026-03-20T14:00:00Z" },
  { name: "Weller 12", tier: "allocated", lastDrop: "2026-03-18T09:30:00Z" },
  { name: "E.H. Taylor Single Barrel", tier: "allocated", lastDrop: "2026-03-22T11:00:00Z" },
  { name: "Eagle Rare", tier: "limited", lastDrop: "2026-03-23T08:15:00Z" },
  { name: "King of Kentucky", tier: "unicorn", lastDrop: "2026-03-22T16:30:00Z" },
  { name: "Stagg Jr", tier: "allocated", lastDrop: "2026-03-15T10:00:00Z" },
];

const TIER_DOT_COLORS: Record<string, string> = {
  unicorn: "var(--color-amber-rich)",
  allocated: "var(--color-copper)",
  limited: "var(--color-silver-muted)",
};

function isWithin24h(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "No drops yet";
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface DashboardSidebarProps {
  drops: DropEvent[];
}

export default function DashboardSidebar({ drops }: DashboardSidebarProps) {
  const [watchlist] = useState<WatchlistItem[]>(INITIAL_WATCHLIST);

  const weeklyTrend = useMemo(() => {
    // Use latest drop timestamp as reference so chart is meaningful with demo data
    const latest = drops.length > 0
      ? Math.max(...drops.map((d) => new Date(d.timestamp).getTime()))
      : Date.now();
    const days: { label: string; count: number }[] = [];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(latest - i * 86400000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const count = drops.filter((d) => {
        const t = new Date(d.timestamp).getTime();
        return t >= dayStart.getTime() && t <= dayEnd.getTime();
      }).length;

      days.push({
        label: dayNames[dayStart.getDay()],
        count,
      });
    }

    return days;
  }, [drops]);

  const totalWeek = weeklyTrend.reduce((sum, d) => sum + d.count, 0);
  const maxCount = Math.max(...weeklyTrend.map((d) => d.count), 1);

  return (
    <div style={{ flex: "1 1 40%", minWidth: 0 }}>
      {/* Watchlist */}
      <motion.div
        variants={fadeUpVariant}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        style={{
          background: "rgba(0,0,0,0.15)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.04)",
          padding: "20px",
          marginBottom: "20px",
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: "16px" }}
        >
          <h3
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--color-cream)",
              margin: 0,
            }}
          >
            My Watchlist
          </h3>
          <button
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              color: "var(--color-text-tertiary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 8px",
              minHeight: "44px",
              display: "flex",
              alignItems: "center",
            }}
          >
            Edit
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {watchlist.map((item) => {
            const isNew = isWithin24h(item.lastDrop);
            return (
              <div
                key={item.name}
                className="flex items-center"
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: isNew
                    ? "rgba(196,148,58,0.06)"
                    : "transparent",
                  animation: isNew ? "pulseDot 3s ease-in-out infinite" : undefined,
                  gap: "10px",
                  minHeight: "44px",
                }}
              >
                {/* Tier dot */}
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: TIER_DOT_COLORS[item.tier] || TIER_DOT_COLORS.limited,
                    flexShrink: 0,
                  }}
                />

                {/* Name */}
                <span
                  className="flex-1 truncate"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(13px, 2vw, 14px)",
                    fontWeight: 500,
                    color: "var(--color-cream)",
                    lineHeight: 1.3,
                  }}
                >
                  {item.name}
                </span>

                {/* NEW pill or last drop date */}
                {isNew ? (
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "9px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#0D0B07",
                      background: "var(--color-accent-amber)",
                      padding: "2px 8px",
                      borderRadius: "8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    NEW
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      color: "var(--color-text-tertiary)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {formatShortDate(item.lastDrop)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Bottle button */}
        <button
          className="w-full"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--color-accent-amber)",
            background: "none",
            border: "1px solid rgba(196,148,58,0.2)",
            borderRadius: "8px",
            padding: "12px 16px",
            cursor: "pointer",
            marginTop: "12px",
            transition: "all 200ms ease",
            minHeight: "44px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(196,148,58,0.08)";
            e.currentTarget.style.borderColor = "rgba(196,148,58,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.borderColor = "rgba(196,148,58,0.2)";
          }}
        >
          + Add Bottle
        </button>
      </motion.div>

      {/* Drop Trends */}
      <motion.div
        variants={fadeUpVariant}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
        style={{
          background: "rgba(0,0,0,0.15)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.04)",
          padding: "20px",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--color-cream)",
            margin: "0 0 20px 0",
          }}
        >
          Drop Trends
        </h3>

        {/* Bar chart */}
        <div
          className="flex items-end justify-between"
          style={{ height: "100px", gap: "8px" }}
        >
          {weeklyTrend.map((day, i) => (
            <div
              key={i}
              className="flex flex-col items-center flex-1"
              style={{ height: "100%", justifyContent: "flex-end", gap: "6px" }}
            >
              {/* Bar track + fill */}
              <div
                style={{
                  width: "100%",
                  maxWidth: "32px",
                  height: "80px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "4px",
                  position: "relative",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max((day.count / maxCount) * 100, day.count > 0 ? 8 : 0)}%`,
                    background: "var(--color-accent-amber)",
                    borderRadius: "4px 4px 0 0",
                    opacity: 0.8,
                    transition: "height 0.6s ease",
                  }}
                />
              </div>
              {/* Day label */}
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "10px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {day.label}
              </span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div
          style={{
            marginTop: "16px",
            fontFamily: "var(--font-jetbrains)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
          }}
        >
          <span style={{ color: "var(--color-accent-amber)", fontWeight: 600 }}>
            {totalWeek}
          </span>{" "}
          drops this week
        </div>
      </motion.div>
    </div>
  );
}
