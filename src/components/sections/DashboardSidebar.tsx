"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Bell, Mail, Smartphone } from "lucide-react";
import { fadeUpVariant } from "@/lib/animations";
import type { DropEvent } from "@/lib/drops";
import BottleLink from "@/components/BottleLink";
import { useWatchlistStore } from "@/lib/watchlist";

export interface WatchlistItem {
  name: string;
  tier: "unicorn" | "allocated" | "limited";
  lastDrop: string | null;
}

export const INITIAL_WATCHLIST: WatchlistItem[] = [
  { name: "Pappy Van Winkle 23", tier: "unicorn", lastDrop: null },
  { name: "Blanton's", tier: "allocated", lastDrop: "2026-03-20T14:00:00Z" },
  { name: "Weller 12", tier: "allocated", lastDrop: "2026-03-18T09:30:00Z" },
  { name: "E.H. Taylor Single Barrel", tier: "allocated", lastDrop: "2026-03-22T11:00:00Z" },
  { name: "Eagle Rare", tier: "limited", lastDrop: "2026-03-23T08:15:00Z" },
  { name: "King of Kentucky", tier: "unicorn", lastDrop: "2026-03-22T16:30:00Z" },
  { name: "Stagg Jr", tier: "allocated", lastDrop: "2026-03-15T10:00:00Z" },
];

const TIER_DOT_COLORS: Record<string, string> = {
  unicorn: "#C4943A",
  allocated: "#B87333",
  limited: "#8A8A8A",
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
  miniMap?: React.ReactNode;
}

export default function DashboardSidebar({ drops, miniMap }: DashboardSidebarProps) {
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
          padding: "24px",
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
              fontSize: "24px",
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

        {watchlist.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <p
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "18px",
                color: "var(--color-cream)",
                marginBottom: "8px",
              }}
            >
              Your watchlist is empty
            </p>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
                marginBottom: "20px",
              }}
            >
              Add bottles from The Library to start tracking drops
            </p>
            <a
              href="/bottles"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-accent-amber)",
                background: "transparent",
                border: "1px solid rgba(196,148,58,0.3)",
                borderRadius: "8px",
                padding: "10px 20px",
                textDecoration: "none",
                display: "inline-block",
                transition: "all 200ms ease",
              }}
            >
              Browse The Library
            </a>
          </div>
        ) : (
        <>
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
                  <BottleLink name={item.name}>{item.name}</BottleLink>
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
        </>
        )}
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
          padding: "24px",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "24px",
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

      {/* Mini Map */}
      {miniMap && (
        <div style={{ marginTop: "20px" }}>
          {miniMap}
        </div>
      )}

      {/* Alert Preferences */}
      <AlertPreferences />
    </div>
  );
}

const ALERT_TIERS = [
  { key: "unicorn", label: "Unicorn", icon: "◆" },
  { key: "allocated", label: "Allocated", icon: "●" },
  { key: "limited", label: "Limited", icon: "○" },
] as const;

function ToggleSwitch({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: "36px",
        height: "20px",
        borderRadius: "10px",
        border: "none",
        background: on ? "var(--color-accent-amber)" : "rgba(255,255,255,0.08)",
        position: "relative",
        cursor: "pointer",
        transition: "background 200ms ease",
        flexShrink: 0,
        minHeight: "20px",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: on ? "18px" : "2px",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: on ? "var(--color-bg-primary)" : "var(--color-text-tertiary)",
          transition: "left 200ms ease, background 200ms ease",
        }}
      />
    </button>
  );
}

function AlertPreferences() {
  const [alerts, setAlerts] = useState<Record<string, { sms: boolean; email: boolean }>>({
    unicorn: { sms: true, email: true },
    allocated: { sms: false, email: true },
    limited: { sms: false, email: false },
  });

  const toggle = useCallback(
    (tier: string, channel: "sms" | "email") => {
      setAlerts((prev) => ({
        ...prev,
        [tier]: { ...prev[tier], [channel]: !prev[tier][channel] },
      }));
    },
    []
  );

  return (
    <motion.div
      variants={fadeUpVariant}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      style={{
        background: "rgba(0,0,0,0.15)",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.04)",
        padding: "24px",
        marginTop: "20px",
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{ marginBottom: "16px" }}
      >
        <Bell size={14} style={{ color: "var(--color-accent-amber)" }} />
        <h3
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--color-cream)",
            margin: 0,
          }}
        >
          Alert Preferences
        </h3>
      </div>

      {/* Channel headers */}
      <div
        className="flex items-center justify-end gap-6"
        style={{
          marginBottom: "12px",
          paddingRight: "2px",
        }}
      >
        <div className="flex items-center gap-1">
          <Smartphone size={11} style={{ color: "var(--color-text-tertiary)" }} />
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "10px",
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            SMS
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Mail size={11} style={{ color: "var(--color-text-tertiary)" }} />
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "10px",
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Email
          </span>
        </div>
      </div>

      {/* Tier toggles */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {ALERT_TIERS.map((tier) => (
          <div
            key={tier.key}
            className="flex items-center justify-between"
            style={{
              padding: "8px 10px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.02)",
              minHeight: "44px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
              }}
            >
              <span style={{ marginRight: "8px", opacity: 0.5 }}>{tier.icon}</span>
              {tier.label}
            </span>
            <div className="flex items-center gap-6">
              <ToggleSwitch
                on={alerts[tier.key].sms}
                onToggle={() => toggle(tier.key, "sms")}
              />
              <ToggleSwitch
                on={alerts[tier.key].email}
                onToggle={() => toggle(tier.key, "email")}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
