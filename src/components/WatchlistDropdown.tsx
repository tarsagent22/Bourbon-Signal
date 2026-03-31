"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark } from "lucide-react";
import { useWatchlistStore } from "@/lib/watchlist";
import { bottles } from "@/data/bottles";
import { bottleIdFromName } from "@/lib/drops";
import dropsData from "@/data/drops.json";
import type { DropEvent } from "@/lib/drops";

const TIER_DOT_COLORS: Record<string, string> = {
  unicorn: "#C4943A",
  allocated: "#B87333",
  limited: "#8A8A8A",
};

function isWithin24h(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "No drops yet";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WatchlistDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const watchedBottles = useWatchlistStore((s) => s.watchedBottles);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Build watched bottle info by cross-referencing with drops
  const drops = (dropsData as { drops: DropEvent[] }).drops;

  const watchedItems = watchedBottles.map((id) => {
    const bottle = bottles.find((b) => b.id === id);
    if (!bottle) return null;

    // Find most recent drop for this bottle
    const nameLower = bottle.name.toLowerCase();
    const matchingDrops = drops.filter((d) =>
      d.brand_name.toLowerCase().includes(nameLower) ||
      nameLower.includes(d.brand_name.toLowerCase().replace(/\s*(700ml|750ml|1\.00l)\s*/gi, "").trim())
    );
    const latestDrop = matchingDrops.length > 0
      ? matchingDrops.reduce((a, b) =>
          new Date(a.timestamp) > new Date(b.timestamp) ? a : b
        )
      : null;

    return {
      id: bottle.id,
      name: bottle.name,
      tier: bottle.tier,
      lastDrop: latestDrop?.timestamp || null,
      hasNewDrop: latestDrop ? isWithin24h(latestDrop.timestamp) : false,
    };
  }).filter(Boolean) as {
    id: string;
    name: string;
    tier: string;
    lastDrop: string | null;
    hasNewDrop: boolean;
  }[];

  const newDropCount = watchedItems.filter((w) => w.hasNewDrop).length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Icon button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative cursor-pointer"
        style={{
          background: "none",
          border: "none",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Bookmark
          size={20}
          style={{
            color: open
              ? "var(--color-text-primary)"
              : "var(--color-text-secondary)",
            transition: "color 300ms ease",
          }}
        />
        {/* Count badge */}
        {newDropCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-2px",
              right: "-4px",
              minWidth: "16px",
              height: "16px",
              borderRadius: "8px",
              background: "var(--color-accent-amber)",
              color: "#0D0B07",
              fontFamily: "var(--font-jetbrains)",
              fontSize: "9px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            {newDropCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "absolute",
              top: "calc(100% + 12px)",
              right: 0,
              width: "320px",
              maxHeight: "400px",
              overflowY: "auto",
              background: "var(--color-glass)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(16px)",
              border: "1px solid var(--color-card-border)",
              borderRadius: "12px",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
              zIndex: 100,
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 16px 12px",
                borderBottom: "1px solid var(--color-card-border)",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Watchlist
              </h3>
            </div>

            {/* Content */}
            {watchedItems.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center" }}>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                    marginBottom: "12px",
                  }}
                >
                  No bottles watched yet
                </p>
                <a
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--color-accent-amber)",
                    textDecoration: "none",
                  }}
                >
                  Browse The Library
                </a>
              </div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {watchedItems.map((item) => (
                  <a
                    key={item.id}
                    href={`/dashboard?highlight=${bottleIdFromName(item.name)}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center"
                    style={{
                      padding: "10px 16px",
                      gap: "10px",
                      textDecoration: "none",
                      background: item.hasNewDrop
                        ? "rgba(196,148,58,0.06)"
                        : "transparent",
                      transition: "background 150ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!item.hasNewDrop)
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = item.hasNewDrop
                        ? "rgba(196,148,58,0.06)"
                        : "transparent";
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
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--color-cream)",
                        lineHeight: 1.3,
                      }}
                    >
                      {item.name}
                    </span>

                    {/* NEW pill or date */}
                    {item.hasNewDrop ? (
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
                          fontSize: "10px",
                          color: "var(--color-text-tertiary)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {formatShortDate(item.lastDrop)}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}

            {/* Footer */}
            {watchedItems.length > 0 && (
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid var(--color-card-border)",
                  textAlign: "center",
                }}
              >
                <a
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-accent-amber)",
                    textDecoration: "none",
                  }}
                >
                  Manage Watchlist
                </a>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
