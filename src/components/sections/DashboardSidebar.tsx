"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Mail, Smartphone, X, Search } from "lucide-react";
import { fadeUpVariant } from "@/lib/animations";
import type { DropEvent } from "@/lib/drops";
import BottleLink from "@/components/BottleLink";
import { useWatchlistStore } from "@/lib/watchlist";
import { bottles, dropHistory, type Bottle } from "@/data/bottles";

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

const DEFAULT_BOTTLE_IDS = [
  "blantons",
  "weller-12",
  "eh-taylor-single-barrel",
  "eagle-rare",
  "stagg-jr",
];

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

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isWithin24h(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000;
}

function getLastDropDate(bottleId: string): string | null {
  const history = dropHistory[bottleId];
  if (history && history.length > 0) {
    return history[0].date;
  }
  return null;
}

// --- Bottle Search Component ---

function BottleSearch({
  onSelect,
  onClose,
  watchedIds,
}: {
  onSelect: (id: string) => void;
  onClose: () => void;
  watchedIds: string[];
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const results = useMemo(() => {
    if (!query.trim()) return bottles.filter((b) => !watchedIds.includes(b.id)).slice(0, 8);
    const q = query.toLowerCase();
    return bottles
      .filter(
        (b) =>
          !watchedIds.includes(b.id) &&
          (b.name.toLowerCase().includes(q) ||
            b.distillery.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [query, watchedIds]);

  return (
    <div ref={containerRef} style={{ marginTop: "8px" }}>
      {/* Search input */}
      <div
        className="flex items-center"
        style={{
          background: "rgba(0,0,0,0.3)",
          border: "1px solid rgba(196,148,58,0.3)",
          borderRadius: "8px",
          padding: "0 12px",
          gap: "8px",
        }}
      >
        <Search
          size={14}
          style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bottles..."
          style={{
            background: "none",
            border: "none",
            outline: "none",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "14px",
            color: "var(--color-cream)",
            padding: "12px 0",
            width: "100%",
            minHeight: "44px",
          }}
        />
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-tertiary)",
            padding: "4px",
            flexShrink: 0,
            minHeight: "44px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Results list — inline (not absolute) so it pushes content down on mobile */}
      {results.length > 0 && (
        <div
          style={{
            marginTop: "4px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(196,148,58,0.15)",
            borderRadius: "8px",
            overflow: "hidden",
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          {results.map((bottle) => (
            <SearchResultRow
              key={bottle.id}
              bottle={bottle}
              onSelect={() => {
                onSelect(bottle.id);
              }}
            />
          ))}
        </div>
      )}

      {results.length === 0 && query.trim() && (
        <div
          style={{
            marginTop: "4px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(196,148,58,0.15)",
            borderRadius: "8px",
            padding: "20px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "var(--color-text-tertiary)",
            }}
          >
            No bottles found
          </p>
        </div>
      )}
    </div>
  );
}

function SearchResultRow({
  bottle,
  onSelect,
}: {
  bottle: Bottle;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center w-full text-left"
      style={{
        padding: "10px 14px",
        background: hovered ? "rgba(196,148,58,0.08)" : "transparent",
        border: "none",
        cursor: "pointer",
        gap: "10px",
        transition: "background 150ms",
        minHeight: "44px",
      }}
    >
      {/* Tier dot */}
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: TIER_DOT_COLORS[bottle.tier] || TIER_DOT_COLORS.limited,
          flexShrink: 0,
        }}
      />

      {/* Bottle info */}
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--color-cream)",
            lineHeight: 1.3,
          }}
        >
          {bottle.name}
        </div>
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
            lineHeight: 1.3,
            marginTop: "1px",
          }}
        >
          {bottle.distillery}
        </div>
      </div>

      {/* MSRP */}
      <span
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "12px",
          color: "var(--color-text-tertiary)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        ${bottle.msrp}
      </span>
    </button>
  );
}

// --- Watchlist Row with expandable drop detail ---

function WatchlistRow({
  bottle,
  isExpanded,
  onToggle,
  onRemove,
}: {
  bottle: Bottle;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const lastDropDate = getLastDropDate(bottle.id);
  const isNew = isWithin24h(lastDropDate);
  const history = dropHistory[bottle.id];

  return (
    <div>
      {/* Row */}
      <div
        className="flex items-center"
        style={{
          padding: "10px 12px",
          borderRadius: "8px",
          background: isExpanded
            ? "rgba(196,148,58,0.08)"
            : isNew
              ? "rgba(196,148,58,0.06)"
              : hovered
                ? "rgba(255,255,255,0.02)"
                : "transparent",
          cursor: "pointer",
          gap: "10px",
          minHeight: "44px",
          transition: "background 150ms",
          position: "relative",
        }}
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Tier dot */}
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: TIER_DOT_COLORS[bottle.tier] || TIER_DOT_COLORS.limited,
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
              flexShrink: 0,
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
            onRemove();
          }}
          className="shrink-0"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-tertiary)",
            padding: "4px",
            borderRadius: "4px",
            opacity: hovered ? 1 : 0,
            transition: "opacity 150ms",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "24px",
            minHeight: "24px",
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
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "12px 12px 12px 28px",
                borderLeft: `2px solid ${TIER_DOT_COLORS[bottle.tier] || TIER_DOT_COLORS.limited}`,
                marginLeft: "2px",
                marginBottom: "4px",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--color-text-tertiary)",
                  marginBottom: "8px",
                }}
              >
                Most Recent Drop
              </p>

              {history && history.length > 0 ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "13px",
                        color: "var(--color-cream)",
                        lineHeight: 1.4,
                      }}
                    >
                      {history[0].location}
                    </div>
                    <div
                      className="flex items-center gap-3"
                      style={{
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: "11px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      <span>{formatFullDate(history[0].date)}</span>
                      {history[0].quantity && (
                        <span>
                          {history[0].quantity}{" "}
                          {history[0].quantity === 1 ? "bottle" : "bottles"}
                        </span>
                      )}
                    </div>
                  </div>

                  {history.length > 1 && (
                    <a
                      href="/bottles"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "inline-block",
                        marginTop: "10px",
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "var(--color-accent-amber)",
                        textDecoration: "none",
                        transition: "opacity 200ms",
                      }}
                    >
                      View all {history.length} drops →
                    </a>
                  )}
                </>
              ) : (
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                    fontStyle: "italic",
                  }}
                >
                  No drops recorded yet
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Main Sidebar ---

interface DashboardSidebarProps {
  drops: DropEvent[];
  miniMap?: React.ReactNode;
}

export default function DashboardSidebar({ drops, miniMap }: DashboardSidebarProps) {
  const { watchedBottles, addBottle, removeBottle } = useWatchlistStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedBottleId, setExpandedBottleId] = useState<string | null>(null);
  const hasInitialized = useRef(false);

  // Pre-populate with defaults if store is empty on first mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (watchedBottles.length === 0) {
      DEFAULT_BOTTLE_IDS.forEach((id) => addBottle(id));
    }
  }, [watchedBottles.length, addBottle]);

  // Resolve watched bottle IDs to bottle objects
  const watchlist = useMemo(() => {
    return watchedBottles
      .map((id) => bottles.find((b) => b.id === id))
      .filter((b): b is Bottle => b !== undefined);
  }, [watchedBottles]);

  const handleToggleExpand = useCallback(
    (id: string) => {
      setExpandedBottleId((prev) => (prev === id ? null : id));
    },
    []
  );

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
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "12px",
              color: "var(--color-text-tertiary)",
            }}
          >
            {watchlist.length} bottle{watchlist.length !== 1 ? "s" : ""}
          </span>
        </div>

        {watchlist.length === 0 && !searchOpen ? (
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
              Add bottles to start tracking drops
            </p>
            <button
              onClick={() => setSearchOpen(true)}
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-accent-amber)",
                background: "transparent",
                border: "1px solid rgba(196,148,58,0.3)",
                borderRadius: "8px",
                padding: "10px 20px",
                cursor: "pointer",
                transition: "all 200ms ease",
                minHeight: "44px",
              }}
            >
              + Add Your First Bottle
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              {watchlist.map((bottle) => (
                <WatchlistRow
                  key={bottle.id}
                  bottle={bottle}
                  isExpanded={expandedBottleId === bottle.id}
                  onToggle={() => handleToggleExpand(bottle.id)}
                  onRemove={() => {
                    removeBottle(bottle.id);
                    if (expandedBottleId === bottle.id) {
                      setExpandedBottleId(null);
                    }
                  }}
                />
              ))}
            </div>

            {/* Search or Add button */}
            {searchOpen ? (
              <BottleSearch
                onSelect={(id) => {
                  addBottle(id);
                  setSearchOpen(false);
                }}
                onClose={() => setSearchOpen(false)}
                watchedIds={watchedBottles}
              />
            ) : (
              <button
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
            )}
          </>
        )}
      </motion.div>

      {/* Mini Map */}
      {miniMap && <div style={{ marginTop: "20px" }}>{miniMap}</div>}

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
          background: on
            ? "var(--color-bg-primary)"
            : "var(--color-text-tertiary)",
          transition: "left 200ms ease, background 200ms ease",
        }}
      />
    </button>
  );
}

function AlertPreferences() {
  const [alerts, setAlerts] = useState<
    Record<string, { sms: boolean; email: boolean }>
  >({
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
          <Smartphone
            size={11}
            style={{ color: "var(--color-text-tertiary)" }}
          />
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
              <span style={{ marginRight: "8px", opacity: 0.5 }}>
                {tier.icon}
              </span>
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
