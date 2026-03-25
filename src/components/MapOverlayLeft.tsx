"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Filter } from "lucide-react";
import DataFreshness from "@/components/DataFreshness";
import dropsData from "@/data/drops.json";

interface MapOverlayLeftProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  activeToday: number;
  dropsThisWeek: number;
  isOpen: boolean;
  onToggle: () => void;
}

const filters = ["All", "Unicorn", "Allocated", "Limited"];

const legendItems = [
  {
    color: "var(--color-accent-amber)",
    opacity: 0.9,
    label: "Active today",
    pulse: true,
  },
  {
    color: "var(--color-accent-amber)",
    opacity: 0.5,
    label: "Drop this week",
    pulse: false,
  },
  {
    color: "var(--color-text-tertiary)",
    opacity: 0.3,
    label: "No recent drops",
    pulse: false,
  },
];

export default function MapOverlayLeft({
  activeFilter,
  onFilterChange,
  activeToday,
  dropsThisWeek,
  isOpen,
  onToggle,
}: MapOverlayLeftProps) {
  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="md:hidden"
        onClick={onToggle}
        style={{
          position: "absolute",
          top: 80,
          left: 16,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "var(--color-glass)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--color-card-border)",
          color: "var(--color-accent-amber)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <Filter size={18} />
      </button>

      {/* Desktop panel — always visible */}
      <div
        className="hidden md:block"
        style={{
          position: "absolute",
          top: 80,
          left: 16,
          zIndex: 1000,
          width: 280,
          borderRadius: 12,
          background: "var(--color-glass)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid var(--color-card-border)",
          padding: 20,
          overflowY: "auto",
          maxHeight: "calc(100vh - 100px)",
        }}
      >
        <PanelContent
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
          activeToday={activeToday}
          dropsThisWeek={dropsThisWeek}
        />
      </div>

      {/* Mobile slide-in drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 1001,
                background: "rgba(0,0,0,0.4)",
              }}
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 1002,
                width: 280,
                background: "var(--color-glass)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderRight: "1px solid var(--color-card-border)",
                padding: 20,
                paddingTop: 80,
                overflowY: "auto",
              }}
            >
              <button
                onClick={onToggle}
                style={{
                  position: "absolute",
                  top: 20,
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
              <PanelContent
                activeFilter={activeFilter}
                onFilterChange={onFilterChange}
                activeToday={activeToday}
                dropsThisWeek={dropsThisWeek}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function PanelContent({
  activeFilter,
  onFilterChange,
  activeToday,
  dropsThisWeek,
}: {
  activeFilter: string;
  onFilterChange: (f: string) => void;
  activeToday: number;
  dropsThisWeek: number;
}) {
  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Hunt Map
        </h2>
        <div
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            marginTop: 2,
          }}
        >
          NC ABC Stores
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          Legend
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {legendItems.map((item) => (
            <div
              key={item.label}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <span
                style={{
                  width: item.pulse ? 10 : item.opacity > 0.4 ? 7 : 5,
                  height: item.pulse ? 10 : item.opacity > 0.4 ? 7 : 5,
                  borderRadius: "50%",
                  background: item.color,
                  opacity: item.opacity,
                  display: "inline-block",
                  flexShrink: 0,
                  ...(item.pulse
                    ? { animation: "markerPulse 2s ease-in-out infinite" }
                    : {}),
                }}
              />
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: "var(--color-card-border)",
          marginBottom: 16,
        }}
      />

      {/* Tier filters */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 10,
          }}
        >
          Filter by Tier
        </div>
        <div className="flex gap-2" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: 11,
                fontWeight: 500,
                padding: "4px 10px",
                borderRadius: 20,
                border:
                  activeFilter === f
                    ? "1px solid var(--color-accent-amber)"
                    : "1px solid var(--color-card-border)",
                background:
                  activeFilter === f
                    ? "rgba(196, 148, 58, 0.15)"
                    : "transparent",
                color:
                  activeFilter === f
                    ? "var(--color-accent-amber)"
                    : "var(--color-text-secondary)",
                cursor: "pointer",
                transition: "all 200ms ease",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: "var(--color-card-border)",
          marginBottom: 16,
        }}
      />

      {/* Quick stats */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: 12,
            color: "var(--color-accent-amber)",
          }}
        >
          {activeToday} stores active this week
        </div>
        <div
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: 12,
            color: "var(--color-accent-amber)",
          }}
        >
          {dropsThisWeek} drops this week
        </div>
        <div style={{ marginTop: 4 }}>
          <DataFreshness lastUpdated={(dropsData as { lastUpdated: string }).lastUpdated} />
        </div>
      </div>
    </>
  );
}
