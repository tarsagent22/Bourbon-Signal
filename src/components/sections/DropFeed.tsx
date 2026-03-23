"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    .slice(0, 10);
}

// --- Rarity shape config ---

const RARITY_SHAPE: Record<string, { symbol: string; color: string; size: string; glow?: string }> = {
  unicorn: {
    symbol: "\u25C6",
    color: "var(--color-accent-amber)",
    size: "14px",
    glow: "0 0 8px rgba(212,146,11,0.6)",
  },
  allocated: {
    symbol: "\u25CF",
    color: "var(--color-accent-copper)",
    size: "12px",
  },
  limited: {
    symbol: "\u25CB",
    color: "var(--color-info)",
    size: "12px",
  },
};

// --- Components ---

function SkeletonRow() {
  return (
    <div
      className="flex items-center"
      style={{ padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-center shrink-0" style={{ width: "32px" }}>
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
      <div className="flex flex-col items-end justify-center shrink-0" style={{ width: "100px" }}>
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
        return `\u2192 ${drop.counties.length} NC counties`;
      }
      if (drop.counties.length === 1) {
        return `\u2192 ${drop.counties[0]}`;
      }
      return "\u2192 Shipped";
    }
    case "in_store": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `In store${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "store_stock_increase": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `In store${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "allocation_assigned": {
      return "Allocation assigned";
    }
    default:
      return drop.event_type;
  }
}

interface DetailRowProps {
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
}

function DetailRow({ label, value, valueColor, isLast }: DetailRowProps) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "4px 0",
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--color-text-tertiary)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "13px",
          color: valueColor || "var(--color-text-secondary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FeedRow({ drop, isNew }: { drop: GroupedDrop; isNew: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const rarity = RARITY_SHAPE[drop.rarity_tier] || RARITY_SHAPE.limited;
  const description = getEventDescription(drop);
  const [hovered, setHovered] = useState(false);

  // Build detail fields
  const details: { label: string; value: string; valueColor?: string }[] = [];
  if (drop.counties.length > 1) {
    details.push({ label: "Counties", value: drop.counties.join(", ") });
  } else if (drop.counties.length === 1) {
    details.push({ label: "Location", value: drop.counties[0] });
  }
  if (drop.retail_price && drop.retail_price > 0) {
    details.push({ label: "Retail Price", value: `$${Math.round(drop.retail_price)}`, valueColor: "var(--color-accent-amber)" });
  }
  if (drop.quantity_shipped && drop.quantity_shipped > 0) {
    details.push({ label: "Quantity", value: `${drop.quantity_shipped} cases` });
  }

  const hasDetails = details.length > 0;

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
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Main row */}
      <div
        className="flex items-center"
        style={{
          padding: "16px 0",
          cursor: hasDetails ? "pointer" : "default",
        }}
        onClick={() => hasDetails && setExpanded(!expanded)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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
              color: hovered ? "var(--color-accent-amber)" : "var(--color-text-primary)",
              lineHeight: 1.3,
              transition: "color 200ms",
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
      </div>

      {/* Expandable detail panel */}
      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                borderRadius: "8px",
                padding: "12px 16px",
                margin: "8px 0 8px 44px",
              }}
            >
              {details.map((detail, i) => (
                <DetailRow
                  key={detail.label}
                  label={detail.label}
                  value={detail.value}
                  valueColor={detail.valueColor}
                  isLast={i === details.length - 1}
                />
              ))}
              <div
                className="flex justify-end"
                style={{ marginTop: "8px" }}
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(false);
                  }}
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "11px",
                    color: "var(--color-text-tertiary)",
                    cursor: "pointer",
                  }}
                >
                  &#9650; Collapse
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
      className="w-full"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        paddingTop: "96px",
        paddingBottom: "96px",
        paddingLeft: "clamp(16px, 5vw, 48px)",
        paddingRight: "clamp(16px, 5vw, 48px)",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <ScrollReveal delay={0}>
        <div className="mx-auto w-full" style={{ maxWidth: "720px" }}>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <h2
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "28px",
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

          {/* Divider */}
          <div style={{ marginTop: "16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }} />

          {/* Legend row */}
          <div
            className="flex items-center justify-end"
            style={{
              padding: "10px 0",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "10px",
              color: "var(--color-text-tertiary)",
              letterSpacing: "0.05em",
            }}
          >
            <span style={{ color: "var(--color-accent-amber)", textShadow: "0 0 8px rgba(212,146,11,0.6)" }}>{"\u25C6"}</span>
            <span style={{ marginLeft: "4px", marginRight: "12px" }}>Unicorn</span>
            <span style={{ color: "var(--color-accent-copper)" }}>{"\u25CF"}</span>
            <span style={{ marginLeft: "4px", marginRight: "12px" }}>Allocated</span>
            <span style={{ color: "var(--color-info)" }}>{"\u25CB"}</span>
            <span style={{ marginLeft: "4px" }}>Limited</span>
          </div>

          {/* Feed rows — open list */}
          {error && !data ? (
            <div
              className="flex items-center justify-center"
              style={{
                padding: "80px 0",
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

          {/* Bottom separator */}
          <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", marginTop: "4px" }} />

          {/* Member teaser */}
          {data && hiddenCount > 0 && (
            <div
              className="text-center"
              style={{
                marginTop: "16px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
              }}
            >
              Members receive instant alerts. {hiddenCount} additional drops available.
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
