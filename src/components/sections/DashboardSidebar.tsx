"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Mail, Smartphone, X, Search, ChevronRight } from "lucide-react";
import { fadeUpVariant } from "@/lib/animations";
import type { DropEvent } from "@/lib/drops";
import BottleLink from "@/components/BottleLink";
import { useWatchlistStore } from "@/lib/watchlist";
import { bottles, dropHistory } from "@/data/bottles";

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

const DEFAULT_BOTTLES = [
  "blantons",
  "weller-12",
  "eh-taylor-single-barrel",
  "eagle-rare",
  "stagg-jr",
];

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "No drops yet";
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isWithin24h(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

interface DashboardSidebarProps {
  drops: DropEvent[];
  miniMap?: React.ReactNode;
}

export default function DashboardSidebar({ drops, miniMap }: DashboardSidebarProps) {
  const { watchedBottles, addBottle, removeBottle } = useWatchlistStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedBottle, setExpandedBottle] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-populate on first mount if empty
  useEffect(() => {
    if (watchedBottles.length === 0) {
      DEFAULT_BOTTLES.forEach((id) => addBottle(id));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive watchlist from store
  const watchlist = useMemo(() => {
    return watchedBottles
      .map((id) => bottles.find((b) => b.id === id))
      .filter((b): b is NonNullable<typeof b> => b != null);
  }, [watchedBottles]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return bottles
      .filter(
        (b) =>
          b.name.toLowerCase().includes(q) && !watchedBottles.includes(b.id)
      )
      .slice(0, 6);
  }, [searchQuery, watchedBottles]);

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchOpen]);

  // Close search on Escape
  useEffect(() => {
    if (!searchOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const handleAddBottle = useCallback(
    (id: string) => {
      addBottle(id);
      setSearchOpen(false);
      setSearchQuery("");
    },
    [addBottle]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedBottle((prev) => (prev === id ? null : id));
  }, []);

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
              {watchlist.map((bottle) => {
                const history = dropHistory[bottle.id];
                const lastDropDate = history?.[0]?.date ?? null;
                const isNew = isWithin24h(lastDropDate);
                const isExpanded = expandedBottle === bottle.id;

                return (
                  <div key={bottle.id}>
                    <div
                      className="flex items-center group"
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: isNew
                          ? "rgba(196,148,58,0.06)"
                          : isExpanded
                          ? "rgba(255,255,255,0.03)"
                          : "transparent",
                        animation: isNew
                          ? "pulseDot 3s ease-in-out infinite"
                          : undefined,
                        gap: "10px",
                        minHeight: "44px",
                        cursor: "pointer",
                        transition: "background 150ms ease",
                      }}
                      onClick={() => toggleExpand(bottle.id)}
                      onMouseEnter={(e) => {
                        if (!isNew && !isExpanded)
                          e.currentTarget.style.background =
                            "rgba(255,255,255,0.02)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isNew && !isExpanded)
                          e.currentTarget.style.background = "transparent";
                      }}
                    >
                      {/* Tier dot */}
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background:
                            TIER_DOT_COLORS[bottle.tier] ||
                            TIER_DOT_COLORS.limited,
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
                        <BottleLink name={bottle.name}>{bottle.name}</BottleLink>
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
                          {formatShortDate(lastDropDate)}
                        </span>
                      )}

                      {/* Remove button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBottle(bottle.id);
                          if (expandedBottle === bottle.id)
                            setExpandedBottle(null);
                        }}
                        className="opacity-0 group-hover:opacity-100"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px",
                          color: "var(--color-text-tertiary)",
                          transition: "color 150ms ease, opacity 150ms ease",
                          flexShrink: 0,
                          minWidth: "24px",
                          minHeight: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--color-alert)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color =
                            "var(--color-text-tertiary)";
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {/* Expandable detail panel */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          style={{ overflow: "hidden" }}
                        >
                          <DropDetailPanel bottleId={bottle.id} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Add Bottle button / Search */}
            <div ref={searchRef} style={{ position: "relative", marginTop: "12px" }}>
              <AnimatePresence mode="wait">
                {searchOpen ? (
                  <motion.div
                    key="search"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "0 12px",
                        borderRadius: "8px",
                        border: "1px solid rgba(196,148,58,0.3)",
                        background: "rgba(0,0,0,0.2)",
                        minHeight: "44px",
                      }}
                    >
                      <Search
                        size={14}
                        style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
                      />
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search bottles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          flex: 1,
                          background: "none",
                          border: "none",
                          outline: "none",
                          fontFamily: "var(--font-dm-sans)",
                          fontSize: "13px",
                          color: "var(--color-cream)",
                          padding: "12px 0",
                          minHeight: "44px",
                        }}
                      />
                      <button
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery("");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px",
                          color: "var(--color-text-tertiary)",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Search results dropdown */}
                    {searchQuery.trim() && (
                      <div
                        style={{
                          marginTop: "4px",
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.06)",
                          background: "rgba(13,11,7,0.95)",
                          backdropFilter: "blur(12px)",
                          overflow: "hidden",
                          maxHeight: "280px",
                          overflowY: "auto",
                        }}
                      >
                        {searchResults.length === 0 ? (
                          <div
                            style={{
                              padding: "16px",
                              textAlign: "center",
                              fontFamily: "var(--font-dm-sans)",
                              fontSize: "13px",
                              color: "var(--color-text-tertiary)",
                            }}
                          >
                            No matching bottles
                          </div>
                        ) : (
                          searchResults.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => handleAddBottle(b.id)}
                              className="w-full"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "10px 14px",
                                background: "transparent",
                                border: "none",
                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "background 150ms ease",
                                minHeight: "44px",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background =
                                  "rgba(196,148,58,0.08)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                              }}
                            >
                              {/* Tier dot */}
                              <span
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  background:
                                    TIER_DOT_COLORS[b.tier] ||
                                    TIER_DOT_COLORS.limited,
                                  flexShrink: 0,
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontFamily: "var(--font-playfair)",
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "var(--color-cream)",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {b.name}
                                </div>
                                <div
                                  style={{
                                    fontFamily: "var(--font-dm-sans)",
                                    fontSize: "11px",
                                    color: "var(--color-text-tertiary)",
                                    lineHeight: 1.3,
                                    marginTop: "2px",
                                  }}
                                >
                                  {b.distillery}
                                </div>
                              </div>
                              <span
                                style={{
                                  fontFamily: "var(--font-jetbrains)",
                                  fontSize: "12px",
                                  color: "var(--color-accent-amber)",
                                  flexShrink: 0,
                                }}
                              >
                                ${b.msrp}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.button
                    key="add-btn"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full"
                    onClick={() => setSearchOpen(true)}
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
                      transition: "all 200ms ease",
                      minHeight: "44px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "rgba(196,148,58,0.08)";
                      e.currentTarget.style.borderColor =
                        "rgba(196,148,58,0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none";
                      e.currentTarget.style.borderColor =
                        "rgba(196,148,58,0.2)";
                    }}
                  >
                    + Add Bottle
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
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

/* Drop detail panel shown when a watchlist row is expanded */
function DropDetailPanel({ bottleId }: { bottleId: string }) {
  const history = dropHistory[bottleId];

  return (
    <div
      style={{
        padding: "12px 12px 12px 28px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "10px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--color-text-tertiary)",
          margin: "0 0 8px 0",
        }}
      >
        Most Recent Drop
      </p>

      {!history || history.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: "var(--color-text-tertiary)",
            margin: 0,
          }}
        >
          No drops recorded yet
        </p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: "12px",
                color: "var(--color-cream)",
              }}
            >
              {new Date(history[0].date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}
            >
              {history[0].location}
            </span>
            {history[0].quantity != null && (
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "11px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                Qty: {history[0].quantity}
              </span>
            )}
          </div>

          {history.length > 1 && (
            <a
              href="/bottles"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-accent-amber)",
                textDecoration: "none",
                marginTop: "8px",
                transition: "opacity 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "0.8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "1";
              }}
            >
              View all {history.length} drops
              <ChevronRight size={12} />
            </a>
          )}
        </>
      )}
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
