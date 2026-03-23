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

// --- Tier config ---

const TIER_CONFIG: Record<string, { label: string; borderColor: string; pillStyle: React.CSSProperties }> = {
  unicorn: {
    label: "UNICORN",
    borderColor: "var(--color-amber-rich)",
    pillStyle: {
      background: "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)",
      backgroundSize: "200% 200%",
      animation: "shimmer 2s ease infinite",
      color: "#0D0B07",
      fontFamily: "var(--font-dm-sans)",
      fontSize: "9px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      padding: "3px 10px",
      borderRadius: "12px",
      whiteSpace: "nowrap",
    },
  },
  allocated: {
    label: "ALLOCATED",
    borderColor: "var(--color-copper)",
    pillStyle: {
      background: "rgba(184,115,51,0.2)",
      border: "1px solid #B87333",
      color: "#B87333",
      fontFamily: "var(--font-dm-sans)",
      fontSize: "9px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      padding: "3px 10px",
      borderRadius: "12px",
      whiteSpace: "nowrap",
    },
  },
  limited: {
    label: "LIMITED",
    borderColor: "var(--color-silver-muted)",
    pillStyle: {
      background: "rgba(138,138,138,0.15)",
      border: "1px solid #8A8A8A",
      color: "#8A8A8A",
      fontFamily: "var(--font-dm-sans)",
      fontSize: "9px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.1em",
      padding: "3px 10px",
      borderRadius: "12px",
      whiteSpace: "nowrap",
    },
  },
};

// --- Components ---

function SkeletonRow() {
  const shimmerBg =
    "linear-gradient(90deg, rgba(196,148,58,0.08) 25%, rgba(196,148,58,0.15) 50%, rgba(196,148,58,0.08) 75%)";
  return (
    <div
      className="flex items-center"
      style={{
        padding: "16px 20px",
        borderLeft: "3px solid rgba(196,148,58,0.1)",
      }}
    >
      <div className="shrink-0" style={{ width: "70px" }}>
        <div
          className="rounded-full"
          style={{
            width: "54px",
            height: "16px",
            background: shimmerBg,
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.5s infinite",
          }}
        />
      </div>
      <div className="flex-1 flex flex-col gap-2 justify-center" style={{ marginLeft: "8px" }}>
        <div
          className="rounded"
          style={{
            width: "55%",
            height: "14px",
            background: shimmerBg,
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.5s infinite",
          }}
        />
        <div
          className="rounded"
          style={{
            width: "35%",
            height: "11px",
            background: shimmerBg,
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.5s infinite",
          }}
        />
      </div>
      <div className="flex flex-col items-end justify-center shrink-0" style={{ width: "90px" }}>
        <div
          className="rounded"
          style={{
            width: "50px",
            height: "11px",
            background: shimmerBg,
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.5s infinite",
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

function TierBadge({ tier }: { tier: string }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.limited;
  return (
    <span style={config.pillStyle as React.CSSProperties}>
      {config.label}
    </span>
  );
}

interface FeedRowProps {
  drop: GroupedDrop;
  isNew: boolean;
  index: number;
}

function FeedRow({ drop, isNew, index }: FeedRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [glowing, setGlowing] = useState(isNew);
  const tier = TIER_CONFIG[drop.rarity_tier] || TIER_CONFIG.limited;
  const description = getEventDescription(drop);

  // Glow timer for newest drop
  useEffect(() => {
    if (isNew && index === 0) {
      setGlowing(true);
      const timer = setTimeout(() => setGlowing(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [isNew, index]);

  // Build detail fields
  const details: { label: string; value: string }[] = [];
  if (drop.counties.length > 0) {
    details.push({ label: "Counties", value: drop.counties.join(", ") });
  }
  if (drop.retail_price && drop.retail_price > 0) {
    details.push({ label: "Retail Price", value: `$${Math.round(drop.retail_price)}` });
  }
  if (drop.quantity_shipped && drop.quantity_shipped > 0) {
    details.push({ label: "Quantity", value: `${drop.quantity_shipped} cases` });
  }

  const hasDetails = details.length > 0;

  // Blur wall logic
  const isBlurred = index >= 3;
  const blurAmount = index === 3 ? "1.5px" : index === 4 ? "3px" : "5px";
  const blurOpacity = index === 3 ? 0.7 : index === 4 ? 0.5 : 0.3;

  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: isBlurred ? blurOpacity : 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        filter: isBlurred ? `blur(${blurAmount})` : "none",
        pointerEvents: isBlurred && index >= 5 ? "none" : "auto",
        ...(glowing && index === 0
          ? { animation: "newDropGlow 2s ease infinite" }
          : {}),
      }}
    >
      {/* Main row */}
      <div
        className="flex items-center"
        style={{
          padding: "16px 20px",
          borderLeft: `3px solid ${tier.borderColor}`,
          cursor: hasDetails ? "pointer" : "default",
          background: hovered ? "rgba(196, 148, 58, 0.04)" : "transparent",
          transition: "background 200ms, border-color 200ms",
        }}
        onClick={() => hasDetails && !isBlurred && setExpanded(!expanded)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Left: tier badge */}
        <div className="flex items-center justify-center shrink-0" style={{ width: "70px" }}>
          <TierBadge tier={drop.rarity_tier} />
        </div>

        {/* Center: name + description */}
        <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ marginLeft: "8px" }}>
          <div
            className="truncate"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "17px",
              fontWeight: 600,
              color: "var(--color-cream)",
              lineHeight: 1.3,
            }}
          >
            {drop.displayName}
          </div>
          <div
            className="truncate"
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              color: "rgba(245,237,214,0.5)",
              marginTop: "2px",
              lineHeight: 1.3,
            }}
          >
            {description}
          </div>
        </div>

        {/* Right: timestamp */}
        <div
          className="flex flex-col items-end justify-center shrink-0"
          style={{ width: "90px" }}
        >
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              color: "rgba(245,237,214,0.35)",
              whiteSpace: "nowrap",
            }}
          >
            {formatRelativeTime(drop.timestamp)}
          </span>
        </div>
      </div>

      {/* Expandable detail panel */}
      {!isBlurred && (
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
                  padding: "12px 20px 12px 101px",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  color: "rgba(245,237,214,0.5)",
                }}
              >
                {details.map((detail, i) => (
                  <div key={detail.label} style={{ marginBottom: i < details.length - 1 ? "4px" : 0 }}>
                    <span style={{ color: "rgba(245,237,214,0.35)", marginRight: "8px" }}>{detail.label}:</span>
                    <span>{detail.value}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
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
  const visibleCount = Math.min(grouped.length, 3);
  const blurredCount = grouped.length - visibleCount;

  return (
    <section
      style={{
        backgroundColor: "var(--color-bg-warm)",
        paddingTop: "96px",
        paddingBottom: "96px",
        width: "100%",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
      }}
    >
      <style>{`
        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes newDropGlow {
          0%, 100% { box-shadow: inset 3px 0 0 rgba(196,148,58,0.4), 0 0 0 rgba(196,148,58,0); }
          50% { box-shadow: inset 3px 0 0 rgba(196,148,58,1), 0 0 20px rgba(196,148,58,0.15); }
        }
      `}</style>

      <div style={{ width: "100%", maxWidth: "680px", paddingLeft: "16px", paddingRight: "16px" }}>
        <ScrollReveal delay={0}>
          {/* Header row */}
          <div className="flex items-center justify-between">
            <h2
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "32px",
                fontWeight: 700,
                color: "var(--color-cream)",
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
                background: "#1A1510",
                border: "1px solid var(--color-amber-rich)",
                color: "var(--color-cream)",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                padding: "6px 14px",
                borderRadius: "20px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="nc">North Carolina</option>
              <option value="va" disabled>Virginia — Coming Soon</option>
              <option value="pa" disabled>Pennsylvania — Coming Soon</option>
            </select>
          </div>

          {/* Divider */}
          <div style={{ margin: "16px 0", borderBottom: "1px solid rgba(196, 148, 58, 0.2)" }} />

          {/* Legend row */}
          <div
            className="flex items-center justify-end gap-3"
            style={{
              paddingBottom: "12px",
              transform: "scale(0.8)",
              transformOrigin: "right center",
            }}
          >
            <TierBadge tier="unicorn" />
            <TierBadge tier="allocated" />
            <TierBadge tier="limited" />
          </div>

          {/* Feed rows */}
          {error && !data ? (
            <div
              className="flex items-center justify-center"
              style={{
                padding: "80px 0",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "15px",
                color: "rgba(245,237,214,0.35)",
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
            <div style={{ position: "relative" }}>
              <AnimatePresence mode="popLayout">
                {grouped.map((drop, index) => (
                  <FeedRow
                    key={drop.id}
                    drop={drop}
                    isNew={newIds.has(drop.id)}
                    index={index}
                  />
                ))}
              </AnimatePresence>

              {/* Gradient overlay over blurred rows */}
              {grouped.length > 3 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: "100%",
                    height: "160px",
                    background: "linear-gradient(to bottom, transparent 0%, var(--color-bg-warm) 100%)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          )}

          {/* CTA below feed */}
          {data && (
            <div style={{ textAlign: "center", marginTop: "32px" }}>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "rgba(245,237,214,0.5)",
                  marginBottom: "12px",
                }}
              >
                {hiddenCount + blurredCount} more drops tracked in real time
              </p>
              <button
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#0D0B07",
                  background: "var(--color-amber-rich)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "12px 28px",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                }}
              >
                Join ProofHunt — $69
              </button>
            </div>
          )}

          {/* Last updated */}
          {lastFetch && (
            <div className="text-center" style={{ marginTop: "16px" }}>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "11px",
                  color: "rgba(245,237,214,0.25)",
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
        </ScrollReveal>
      </div>
    </section>
  );
}
