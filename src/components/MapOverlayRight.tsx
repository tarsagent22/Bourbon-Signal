"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, List } from "lucide-react";
import { cleanBrandName } from "@/lib/drops";
import BottleLink from "@/components/BottleLink";

interface RecentDrop {
  brand_name: string;
  rarity_tier: string;
  timestamp: string;
  store_address: string;
  county: string;
  city: string;
  event_type: string;
  storeId: string;
}

interface MapOverlayRightProps {
  recentDrops: RecentDrop[];
  isOpen: boolean;
  onToggle: () => void;
  onDropClick: (storeId: string) => void;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  activeThisWeek?: number;
  dropsThisWeek?: number;
}

const legendItems = [
  { color: "var(--color-accent-amber)", opacity: 0.9, label: "Active this week", pulse: true },
  { color: "var(--color-accent-amber)", opacity: 0.5, label: "Drop this week", pulse: false },
  { color: "var(--color-text-tertiary)", opacity: 0.3, label: "No recent drops", pulse: false },
];

const filters = ["All", "Unicorn", "Allocated", "Limited"];

function tierBorderColor(tier: string): string {
  switch (tier) {
    case "unicorn":
      return "#C4943A";
    case "allocated":
      return "#B87333";
    case "limited":
      return "#8A8A8A";
    default:
      return "var(--color-text-tertiary)";
  }
}

function formatFeedEntry(drop: RecentDrop): { name: string; detail: string } {
  const name = cleanBrandName(drop.brand_name);
  if (drop.event_type === "new_shipment") {
    return { name, detail: `Shipped to ${drop.county || drop.city}` };
  }
  if (drop.event_type === "in_store") {
    return { name, detail: drop.city || drop.county };
  }
  return { name, detail: drop.county || drop.city };
}

function timeAgo(ts: string): string {
  const now = new Date();
  const then = new Date(ts);
  const diffMs = now.getTime() - then.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function DropList({
  recentDrops,
  onDropClick,
}: {
  recentDrops: RecentDrop[];
  onDropClick: (storeId: string) => void;
}) {
  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Recent Drops
        </h2>
        <span
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: 11,
            color: "var(--color-text-tertiary)",
          }}
        >
          {recentDrops.length}
        </span>
      </div>

      {/* Drop list */}
      <div
        className="drop-feed-scroll"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
          maxHeight: "calc(100% - 50px)",
        }}
      >
        {recentDrops.map((drop, i) => {
          const entry = formatFeedEntry(drop);
          return (
            <button
              key={i}
              onClick={() => onDropClick(drop.storeId)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                background: "transparent",
                border: "none",
                borderLeft: `3px solid ${tierBorderColor(drop.rarity_tier)}`,
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "background 200ms ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(196, 148, 58, 0.08)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: 13,
                    color: "var(--color-text-primary)",
                    lineHeight: 1.3,
                    marginBottom: 3,
                  }}
                >
                  <BottleLink name={entry.name}>{entry.name}</BottleLink>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: 11,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {entry.detail}
                </div>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: 10,
                  color: "var(--color-text-tertiary)",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                {timeAgo(drop.timestamp)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function LegendAndFilters({ activeFilter, onFilterChange, activeThisWeek, dropsThisWeek }: {
  activeFilter?: string; onFilterChange?: (f: string) => void; activeThisWeek?: number; dropsThisWeek?: number;
}) {
  if (!onFilterChange) return null;
  return (
    <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--color-card-border)" }}>
      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {legendItems.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: item.pulse ? 10 : 7, height: item.pulse ? 10 : 7, borderRadius: "50%",
              background: item.color, opacity: item.opacity,
              animation: item.pulse ? "pulse-marker 2s ease-in-out infinite" : "none",
            }} />
            <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: 11, color: "var(--color-text-secondary)" }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {filters.map((f) => (
          <button key={f} onClick={() => onFilterChange(f)} style={{
            fontFamily: "var(--font-dm-sans)", fontSize: 11, padding: "4px 10px", borderRadius: 20, cursor: "pointer",
            border: activeFilter === f ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
            background: activeFilter === f ? "#C4943A" : "transparent",
            color: activeFilter === f ? "#1A1510" : "var(--color-text-secondary)",
            fontWeight: activeFilter === f ? 600 : 400, transition: "all 200ms ease",
          }}>{f}</button>
        ))}
      </div>
      {/* Stats */}
      <div style={{ display: "flex", gap: 16 }}>
        <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)" }}>
          {activeThisWeek ?? 0} active this week
        </span>
        <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {dropsThisWeek ?? 0} drops
        </span>
      </div>
    </div>
  );
}

export default function MapOverlayRight({
  recentDrops,
  isOpen,
  onToggle,
  onDropClick,
  activeFilter,
  onFilterChange,
  activeThisWeek,
  dropsThisWeek,
}: MapOverlayRightProps) {
  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="md:hidden"
        onClick={onToggle}
        style={{
          position: "absolute",
          top: 80,
          right: 16,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "var(--color-glass)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--color-card-border)",
          color: "var(--color-accent-amber)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <List size={18} />
      </button>

      {/* Desktop panel */}
      <div
        className="hidden md:flex"
        style={{
          position: "absolute",
          top: 80,
          right: 16,
          zIndex: 1000,
          width: 320,
          borderRadius: 12,
          background: "var(--color-glass)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--color-card-border)",
          padding: 20,
          maxHeight: "calc(100vh - 100px)",
          flexDirection: "column",
        }}
      >
        <LegendAndFilters activeFilter={activeFilter} onFilterChange={onFilterChange} activeThisWeek={activeThisWeek} dropsThisWeek={dropsThisWeek} />
        <DropList recentDrops={recentDrops} onDropClick={onDropClick} />
      </div>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
              className="md:hidden"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1001,
                background: "rgba(0,0,0,0.4)",
              }}
            />
            {/* Bottom sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="md:hidden"
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1002,
                height: "50vh",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                background: "var(--color-glass)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(16px)",
                borderTop: "1px solid var(--color-card-border)",
                padding: 20,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Handle bar */}
              <div
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  background: "var(--color-text-tertiary)",
                  margin: "0 auto 12px",
                  opacity: 0.5,
                }}
              />
              <button
                onClick={onToggle}
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  background: "none",
                  border: "none",
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
              <LegendAndFilters activeFilter={activeFilter} onFilterChange={onFilterChange} activeThisWeek={activeThisWeek} dropsThisWeek={dropsThisWeek} />
              <DropList
                recentDrops={recentDrops}
                onDropClick={(storeId) => {
                  onToggle();
                  onDropClick(storeId);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
