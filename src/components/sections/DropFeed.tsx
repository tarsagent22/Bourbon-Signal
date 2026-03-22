"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import GlassCard from "@/components/GlassCard";
import ScrollReveal from "@/components/ScrollReveal";

interface DropEvent {
  timestamp: string;
  event_type: string;
  brand_name: string;
  tracked_brand_name?: string;
  board_name?: string;
  store_address?: string;
  quantity_shipped?: number;
  quantity?: number;
  rarity_tier: string;
  retail_price?: number;
  stores?: { store_address: string; quantity: number }[];
}

interface GroupedDrop {
  displayName: string;
  event_type: string;
  rarity_tier: string;
  timestamp: string;
  counties: string[];
  board_name?: string;
  store_address?: string;
  retail_price?: number;
  quantity_shipped?: number;
  id: string;
}

interface DropsResponse {
  drops: DropEvent[];
  total: number;
  lastUpdated: string;
}

// --- Data processing ---

function cleanBrandName(name: string): string {
  if (!name) return "Unknown";
  if (/^\d+$/.test(name)) return "";

  let cleaned = name
    .replace(/\b(700ML|750ML|1\.00L|1\.75L|375ML|50ML)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const half = Math.floor(cleaned.length / 2);
  if (cleaned.length > 6) {
    const firstHalf = cleaned.substring(0, half).trim();
    const secondHalf = cleaned.substring(half).trim();
    if (firstHalf === secondHalf) {
      cleaned = firstHalf;
    } else {
      const words = cleaned.split(/\s+/);
      if (words.length >= 4 && words.length % 2 === 0) {
        const mid = words.length / 2;
        const first = words.slice(0, mid).join(" ");
        const second = words.slice(mid).join(" ");
        if (first === second) {
          cleaned = first;
        }
      }
    }
  }

  return cleaned;
}

function getDisplayName(event: DropEvent): string {
  const cleaned = cleanBrandName(event.brand_name);
  if (!cleaned && event.tracked_brand_name) {
    return cleanBrandName(event.tracked_brand_name);
  }
  if (event.tracked_brand_name) {
    const trackedClean = cleanBrandName(event.tracked_brand_name);
    if (trackedClean.length > cleaned.length) return trackedClean;
  }
  return cleaned || "Unknown Bottle";
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "1d ago";
  return `${diffDay}d ago`;
}

function cleanCountyName(board: string): string {
  if (!board || board === "__EMPTY") return "";
  return board
    .replace(/\bABC\b/gi, "")
    .replace(/\bBoard\b/gi, "")
    .replace(/\bCounty\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function groupDrops(drops: DropEvent[]): GroupedDrop[] {
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const groups: Map<string, GroupedDrop> = new Map();

  for (const event of drops) {
    const displayName = getDisplayName(event);
    if (displayName === "Unknown Bottle") continue;

    const ts = new Date(event.timestamp).getTime();
    const bucket = Math.floor(ts / SIX_HOURS);
    const groupKey = `${displayName.toLowerCase()}|${event.event_type}|${bucket}`;

    const existing = groups.get(groupKey);
    if (existing) {
      const county = cleanCountyName(event.board_name || "");
      if (county && !existing.counties.includes(county)) {
        existing.counties.push(county);
      }
      if (event.timestamp > existing.timestamp) {
        existing.timestamp = event.timestamp;
      }
      if (event.quantity_shipped) {
        existing.quantity_shipped = (existing.quantity_shipped || 0) + event.quantity_shipped;
      }
      const rarityOrder: Record<string, number> = { unicorn: 3, allocated: 2, limited: 1 };
      if ((rarityOrder[event.rarity_tier] || 0) > (rarityOrder[existing.rarity_tier] || 0)) {
        existing.rarity_tier = event.rarity_tier;
      }
      if (event.retail_price && !existing.retail_price) {
        existing.retail_price = event.retail_price;
      }
    } else {
      const county = cleanCountyName(event.board_name || "");
      groups.set(groupKey, {
        displayName,
        event_type: event.event_type,
        rarity_tier: event.rarity_tier,
        timestamp: event.timestamp,
        counties: county ? [county] : [],
        board_name: event.board_name,
        store_address: event.store_address,
        retail_price: event.retail_price,
        quantity_shipped: event.quantity_shipped,
        id: groupKey,
      });
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12);
}

// --- Rarity shape config ---

const RARITY_SHAPE: Record<string, { symbol: string; color: string; size: string; glow?: string }> = {
  unicorn: {
    symbol: "◆",
    color: "var(--color-accent-amber)",
    size: "14px",
    glow: "0 0 8px rgba(212,146,11,0.6)",
  },
  allocated: {
    symbol: "●",
    color: "var(--color-accent-copper)",
    size: "12px",
  },
  limited: {
    symbol: "○",
    color: "var(--color-info)",
    size: "12px",
  },
};

// --- State options (dropdown) ---

// --- Components ---

function SkeletonRow() {
  return (
    <div
      className="flex items-center"
      style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", height: "70px" }}
    >
      <div className="flex items-center justify-center" style={{ width: "32px" }}>
        <div
          className="rounded-full"
          style={{
            width: "12px",
            height: "12px",
            background:
              "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      </div>
      <div className="flex-1 flex flex-col gap-2 justify-center" style={{ marginLeft: "12px" }}>
        <div
          className="rounded"
          style={{
            width: "55%",
            height: "14px",
            background:
              "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
        <div
          className="rounded"
          style={{
            width: "35%",
            height: "11px",
            background:
              "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      </div>
      <div className="flex flex-col items-end justify-center" style={{ width: "100px" }}>
        <div
          className="rounded"
          style={{
            width: "56px",
            height: "11px",
            background:
              "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      </div>
    </div>
  );
}

function getEventDescription(drop: GroupedDrop): string {
  switch (drop.event_type) {
    case "new_shipment": {
      if (drop.counties.length > 1) {
        return `→ ${drop.counties.length} NC counties`;
      }
      if (drop.counties.length === 1) {
        return `→ ${drop.counties[0]}`;
      }
      return "→ Shipped";
    }
    case "in_store": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `In store${loc ? ` · ${loc}` : ""}`;
    }
    case "store_stock_increase": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `In store${loc ? ` · ${loc}` : ""}`;
    }
    case "allocation_assigned": {
      return "Allocation assigned";
    }
    default:
      return drop.event_type;
  }
}

function FeedRow({ drop, isNew }: { drop: GroupedDrop; isNew: boolean }) {
  const rarity = RARITY_SHAPE[drop.rarity_tier] || RARITY_SHAPE.limited;
  const description = getEventDescription(drop);

  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, y: -16 } : false}
      animate={{
        opacity: 1,
        y: 0,
        backgroundColor: isNew
          ? ["rgba(212,146,11,0.06)", "rgba(212,146,11,0.06)", "transparent"]
          : "transparent",
      }}
      transition={{
        duration: isNew ? 1.8 : 0.3,
        backgroundColor: { duration: 2, times: [0, 0.3, 1] },
      }}
      className="flex items-center cursor-default group"
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        height: "70px",
        transition: "background-color 200ms",
      }}
      whileHover={{
        backgroundColor: "rgba(212,146,11,0.03)",
      }}
    >
      {/* Left: shape indicator */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: "32px" }}
      >
        <span
          style={{
            fontSize: rarity.size,
            color: rarity.color,
            textShadow: rarity.glow || "none",
            lineHeight: 1,
          }}
        >
          {rarity.symbol}
        </span>
      </div>

      {/* Center: name + description */}
      <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ marginLeft: "12px" }}>
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            lineHeight: 1.3,
          }}
        >
          {drop.displayName}
        </div>
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: "var(--color-text-secondary)",
            marginTop: "2px",
            lineHeight: 1.3,
          }}
        >
          {description}
        </div>
      </div>

      {/* Right: timestamp + MSRP */}
      <div
        className="flex flex-col items-end justify-center shrink-0"
        style={{ width: "100px" }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
            whiteSpace: "nowrap",
          }}
        >
          {formatRelativeTime(drop.timestamp)}
        </span>
        {drop.retail_price && drop.retail_price > 0 && (
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "10px",
              color: "var(--color-accent-amber)",
              marginTop: "2px",
              whiteSpace: "nowrap",
            }}
          >
            ${Math.round(drop.retail_price)} MSRP
          </span>
        )}
      </div>
    </motion.div>
  );
}

// --- Main component ---

export default function DropFeed() {
  const [data, setData] = useState<DropsResponse | null>(null);
  const [error, setError] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [lastFetch, setLastFetch] = useState<string>("");
  const prevIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const [grouped, setGrouped] = useState<GroupedDrop[]>([]);

  const fetchDrops = useCallback(async () => {
    try {
      const res = await fetch("/api/drops");
      if (!res.ok) throw new Error("fetch failed");
      const json: DropsResponse = await res.json();
      setError(false);

      const newGrouped = groupDrops(json.drops);

      if (!isFirstLoad.current) {
        const incoming = new Set<string>();
        for (const g of newGrouped) {
          if (!prevIdsRef.current.has(g.id)) {
            incoming.add(g.id);
          }
        }
        if (incoming.size > 0) {
          setNewIds(incoming);
          setTimeout(() => setNewIds(new Set()), 2500);
        }
      }

      const nextSet = new Set<string>();
      for (const g of newGrouped) {
        nextSet.add(g.id);
      }
      prevIdsRef.current = nextSet;
      isFirstLoad.current = false;

      setData(json);
      setGrouped(newGrouped);
      setLastFetch(new Date().toISOString());
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchDrops();
    const interval = setInterval(fetchDrops, 30000);
    return () => clearInterval(interval);
  }, [fetchDrops]);

  const hiddenCount = data ? Math.max(0, data.total - grouped.length) : 0;

  return (
    <section
      className="w-full py-20 px-4 sm:px-6"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <ScrollReveal delay={0}>
        <div className="mx-auto" style={{ maxWidth: "56rem" }}>
          {/* Feed GlassCard */}
          <GlassCard
            accent={false}
            hoverable={false}
            style={{
              padding: 0,
              background: "rgba(255, 255, 255, 0.04)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {/* Card header */}
            <div
              className="flex items-center justify-between"
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--color-card-border)",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--color-text-primary)",
                  lineHeight: 1.1,
                  margin: 0,
                }}
              >
                Live Drop Feed
              </h2>

              {/* State dropdown */}
              <select
                defaultValue="nc"
                style={{
                  background: "transparent",
                  border: "1px solid var(--color-card-border)",
                  color: "var(--color-text-secondary)",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent-amber)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-card-border)";
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--color-accent-amber)";
                }}
                onMouseLeave={(e) => {
                  if (document.activeElement !== e.currentTarget) {
                    e.currentTarget.style.borderColor = "var(--color-card-border)";
                  }
                }}
              >
                <option value="nc">North Carolina</option>
                <option value="va" disabled>Virginia — Coming Soon</option>
                <option value="pa" disabled>Pennsylvania — Coming Soon</option>
              </select>
            </div>

            {/* Legend row */}
            <div
              className="flex items-center justify-end"
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                color: "var(--color-text-tertiary)",
                letterSpacing: "0.05em",
              }}
            >
              <span style={{ color: "var(--color-accent-amber)", textShadow: "0 0 8px rgba(212,146,11,0.6)" }}>◆</span>
              <span style={{ marginLeft: "4px", marginRight: "12px" }}>Unicorn</span>
              <span style={{ color: "var(--color-accent-copper)" }}>●</span>
              <span style={{ marginLeft: "4px", marginRight: "12px" }}>Allocated</span>
              <span style={{ color: "var(--color-info)" }}>○</span>
              <span style={{ marginLeft: "4px" }}>Limited</span>
            </div>

            {/* Scrollable feed rows */}
            <div
              className="drop-feed-scroll"
              style={{
                maxHeight: "504px",
                overflowY: "auto",
              }}
            >
              {error && !data ? (
                <div
                  className="flex items-center justify-center"
                  style={{
                    padding: "80px 20px",
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "15px",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Feed temporarily unavailable
                </div>
              ) : !data ? (
                <>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </>
              ) : (
                <AnimatePresence mode="popLayout">
                  {grouped.map((drop) => (
                    <FeedRow
                      key={drop.id}
                      drop={drop}
                      isNew={newIds.has(drop.id)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </GlassCard>

          {/* Locked teaser — below the card */}
          {data && hiddenCount > 0 && (
            <div
              className="text-center"
              style={{
                marginTop: "12px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              🔒 {hiddenCount} more drops available to members
            </div>
          )}

          {/* Last updated */}
          {lastFetch && (
            <div className="text-center" style={{ marginTop: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "11px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                Last updated:{" "}
                {new Date(lastFetch).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>
      </ScrollReveal>
    </section>
  );
}
