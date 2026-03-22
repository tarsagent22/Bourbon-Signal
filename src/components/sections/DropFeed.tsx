"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock } from "lucide-react";

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

  // Remove duplicated halves: "King of Kentucky King of Kentucky" → "King of Kentucky"
  const half = Math.floor(cleaned.length / 2);
  if (cleaned.length > 6) {
    const firstHalf = cleaned.substring(0, half).trim();
    const secondHalf = cleaned.substring(half).trim();
    if (firstHalf === secondHalf) {
      cleaned = firstHalf;
    } else {
      // Try splitting by words and checking for repeated sequences
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

    // Group key: brand name + event type + 6-hour time bucket
    const ts = new Date(event.timestamp).getTime();
    const bucket = Math.floor(ts / SIX_HOURS);
    const groupKey = `${displayName.toLowerCase()}|${event.event_type}|${bucket}`;

    const existing = groups.get(groupKey);
    if (existing) {
      // Merge counties
      const county = cleanCountyName(event.board_name || "");
      if (county && !existing.counties.includes(county)) {
        existing.counties.push(county);
      }
      // Keep most recent timestamp
      if (event.timestamp > existing.timestamp) {
        existing.timestamp = event.timestamp;
      }
      // Accumulate quantities
      if (event.quantity_shipped) {
        existing.quantity_shipped = (existing.quantity_shipped || 0) + event.quantity_shipped;
      }
      // Keep highest rarity
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

// --- Rarity config ---

const RARITY_CONFIG: Record<string, { barColor: string; label: string }> = {
  unicorn: { barColor: "#D4920B", label: "UNICORN" },
  allocated: { barColor: "#B87333", label: "ALLOC" },
  limited: { barColor: "#4A90A4", label: "LIMITED" },
};

// --- Components ---

function SkeletonRow() {
  return (
    <div
      className="flex items-stretch gap-4"
      style={{ padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
    >
      <div className="flex flex-col items-center" style={{ width: "60px" }}>
        <div
          className="rounded"
          style={{
            width: "4px",
            height: "100%",
            minHeight: "40px",
            background:
              "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      </div>
      <div className="flex-1 flex flex-col gap-2 justify-center">
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
      <div className="flex flex-col items-end justify-center" style={{ width: "120px" }}>
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

function CountyChips({ counties }: { counties: string[] }) {
  if (counties.length === 0) return null;
  const visible = counties.slice(0, 3);
  const remaining = counties.length - visible.length;

  return (
    <div className="flex flex-wrap gap-1" style={{ marginTop: "4px" }}>
      {visible.map((c) => (
        <span
          key={c}
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "10px",
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            padding: "1px 6px",
            borderRadius: "3px",
            backgroundColor: "rgba(255,255,255,0.04)",
            whiteSpace: "nowrap",
          }}
        >
          {c}
        </span>
      ))}
      {remaining > 0 && (
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "10px",
            fontWeight: 500,
            color: "var(--color-text-tertiary)",
            padding: "1px 6px",
          }}
        >
          +{remaining} more
        </span>
      )}
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
      return `📍 In store${loc ? ` · ${loc}` : ""}`;
    }
    case "store_stock_increase": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `📍 In store${loc ? ` · ${loc}` : ""}`;
    }
    case "allocation_assigned": {
      return "📋 Allocation assigned";
    }
    default:
      return drop.event_type;
  }
}

function FeedRow({ drop, isNew }: { drop: GroupedDrop; isNew: boolean }) {
  const rarity = RARITY_CONFIG[drop.rarity_tier] || RARITY_CONFIG.limited;
  const description = getEventDescription(drop);
  const showChips = drop.event_type === "new_shipment" && drop.counties.length > 1;

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
      className="flex items-stretch gap-0 cursor-default group"
      style={{
        padding: "16px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        transition: "background-color 200ms",
      }}
      whileHover={{
        backgroundColor: "rgba(212,146,11,0.03)",
      }}
    >
      {/* Left: rarity bar + badge */}
      <div
        className="flex flex-col items-center shrink-0"
        style={{ width: "60px", gap: "6px" }}
      >
        <div
          style={{
            width: "4px",
            flex: 1,
            minHeight: "28px",
            borderRadius: "2px",
            backgroundColor: rarity.barColor,
            opacity: 0.7,
            transition: "opacity 200ms",
          }}
          className="group-hover:!opacity-100"
        />
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "9px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            color: rarity.barColor,
            whiteSpace: "nowrap",
          }}
        >
          {rarity.label}
        </span>
      </div>

      {/* Center: name + description + chips */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "16px",
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
        {showChips && <CountyChips counties={drop.counties} />}
      </div>

      {/* Right: timestamp + price */}
      <div
        className="flex flex-col items-end justify-center shrink-0"
        style={{ width: "120px", paddingRight: "4px" }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: "12px",
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
              fontSize: "11px",
              color: "var(--color-accent-amber)",
              marginTop: "2px",
              whiteSpace: "nowrap",
            }}
          >
            ${Math.round(drop.retail_price)} retail
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

      // Detect new rows (after grouping)
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

      // Update prev set
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

      <div className="mx-auto" style={{ maxWidth: "900px" }}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "32px",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              lineHeight: 1.1,
            }}
          >
            Live Drop Feed
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "var(--color-success)",
                display: "inline-block",
                animation: "pulseDot 2s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "var(--color-success)",
              }}
            >
              LIVE
            </span>
          </div>
        </div>

        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "14px",
            color: "var(--color-text-tertiary)",
            marginTop: "6px",
          }}
        >
          Allocated bourbon activity across North Carolina
        </p>

        {/* Separator */}
        <div
          style={{
            height: "1px",
            backgroundColor: "var(--color-card-border)",
            marginTop: "20px",
            marginBottom: "0",
          }}
        />

        {/* Feed */}
        <div>
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

        {/* Locked teaser row */}
        {data && hiddenCount > 0 && (
          <div
            className="relative flex items-center justify-center"
            style={{
              padding: "20px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: "blur(4px)",
                background:
                  "linear-gradient(to bottom, transparent, rgba(13,11,14,0.5))",
              }}
            />
            <div className="relative flex items-center gap-2">
              <Lock
                size={13}
                style={{ color: "var(--color-text-tertiary)" }}
              />
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                Members see {hiddenCount} more recent drops in real time
              </span>
            </div>
          </div>
        )}

        {/* Last updated */}
        {lastFetch && (
          <div className="flex justify-end mt-3">
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
    </section>
  );
}
