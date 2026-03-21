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
  stores?: { store_address: string; quantity: number }[];
}

interface DropsResponse {
  drops: DropEvent[];
  total: number;
  lastUpdated: string;
}

function cleanBrandName(name: string): string {
  if (!name) return "Unknown";
  // If brand_name looks like an nc_code (all digits), skip it
  if (/^\d+$/.test(name)) return "";
  return name
    .replace(/\b(700ML|750ML|1\.00L|1\.75L|375ML|50ML)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getDisplayName(event: DropEvent): string {
  // allocation_assigned sometimes has nc_code as brand_name
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

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay === 1) return "Yesterday";
  return `${diffDay}d ago`;
}

function getEventDescription(event: DropEvent): string {
  switch (event.event_type) {
    case "new_shipment": {
      const board = event.board_name || "Unknown";
      const qty =
        event.quantity_shipped && event.quantity_shipped > 0
          ? ` \u00B7 ${event.quantity_shipped} cases`
          : "";
      return `Shipped to ${board}${qty}`;
    }
    case "in_store": {
      const loc = event.store_address || event.board_name || "Unknown";
      return `In Store: ${loc}`;
    }
    case "store_stock_increase": {
      const storeCount = event.stores?.length || 0;
      const loc = event.store_address || event.board_name || "";
      if (storeCount > 1) return `Stock increase across ${storeCount} stores`;
      return `In Store: ${loc || "Unknown"}`;
    }
    case "allocation_assigned": {
      const board = event.board_name && event.board_name !== "__EMPTY" ? event.board_name : "";
      return board
        ? `Allocation assigned \u00B7 ${board}`
        : "Allocation assigned";
    }
    default:
      return event.event_type;
  }
}

const RARITY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  unicorn: {
    bg: "rgba(212,146,11,0.2)",
    color: "var(--color-accent-amber)",
    label: "UNICORN",
  },
  allocated: {
    bg: "rgba(184,115,51,0.2)",
    color: "var(--color-accent-copper)",
    label: "ALLOCATED",
  },
  limited: {
    bg: "rgba(74,144,164,0.2)",
    color: "var(--color-info)",
    label: "LIMITED",
  },
};

function RarityBadge({ tier }: { tier: string }) {
  const style = RARITY_STYLES[tier] || RARITY_STYLES.limited;
  return (
    <span
      className="shrink-0"
      style={{
        fontFamily: "var(--font-dm-sans)",
        fontSize: "10px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        padding: "3px 8px",
        borderRadius: "4px",
        backgroundColor: style.bg,
        color: style.color,
        whiteSpace: "nowrap",
      }}
    >
      {style.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 px-4 py-4"
      style={{ borderBottom: "1px solid var(--color-card-border)" }}
    >
      <div
        className="shrink-0 rounded"
        style={{
          width: "72px",
          height: "20px",
          background:
            "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
      />
      <div className="flex-1 flex flex-col gap-2">
        <div
          className="rounded"
          style={{
            width: "60%",
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
            width: "40%",
            height: "12px",
            background:
              "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }}
        />
      </div>
      <div
        className="shrink-0 rounded"
        style={{
          width: "60px",
          height: "12px",
          background:
            "linear-gradient(90deg, var(--color-bg-tertiary) 25%, rgba(100,90,80,0.3) 50%, var(--color-bg-tertiary) 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.5s infinite",
        }}
      />
    </div>
  );
}

function FeedRow({
  event,
  isNew,
}: {
  event: DropEvent;
  isNew: boolean;
}) {
  const displayName = getDisplayName(event);
  const description = getEventDescription(event);

  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, y: -20 } : false}
      animate={{
        opacity: 1,
        y: 0,
        backgroundColor: isNew
          ? [
              "rgba(212,146,11,0.08)",
              "rgba(212,146,11,0.08)",
              "transparent",
            ]
          : "transparent",
      }}
      transition={{
        duration: isNew ? 2 : 0.3,
        backgroundColor: { duration: 2, times: [0, 0.3, 1] },
      }}
      className="flex items-center gap-4 px-4 py-4 cursor-default"
      style={{
        borderBottom: "1px solid var(--color-card-border)",
        transition: "background-color 200ms",
      }}
      whileHover={{ backgroundColor: "var(--color-bg-tertiary)" }}
    >
      <RarityBadge tier={event.rarity_tier} />
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          {displayName}
        </div>
        <div
          className="truncate"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: "var(--color-text-secondary)",
            marginTop: "2px",
          }}
        >
          {description}
        </div>
      </div>
      <div
        className="shrink-0 text-right"
        style={{
          fontFamily: "var(--font-jetbrains)",
          fontSize: "12px",
          color: "var(--color-text-tertiary)",
          whiteSpace: "nowrap",
        }}
      >
        {formatRelativeTime(event.timestamp)}
      </div>
    </motion.div>
  );
}

export default function DropFeed() {
  const [data, setData] = useState<DropsResponse | null>(null);
  const [error, setError] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [lastFetch, setLastFetch] = useState<string>("");
  const prevTimestampsRef = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const fetchDrops = useCallback(async () => {
    try {
      const res = await fetch("/api/drops");
      if (!res.ok) throw new Error("fetch failed");
      const json: DropsResponse = await res.json();
      setError(false);

      // Detect new rows
      if (!isFirstLoad.current) {
        const incoming = new Set<string>();
        for (const d of json.drops) {
          const key = `${d.timestamp}-${d.brand_name}-${d.event_type}-${d.board_name || d.store_address || ""}`;
          if (!prevTimestampsRef.current.has(key)) {
            incoming.add(key);
          }
        }
        if (incoming.size > 0) {
          setNewIds(incoming);
          setTimeout(() => setNewIds(new Set()), 2500);
        }
      }

      // Update prev set
      const nextSet = new Set<string>();
      for (const d of json.drops) {
        nextSet.add(
          `${d.timestamp}-${d.brand_name}-${d.event_type}-${d.board_name || d.store_address || ""}`
        );
      }
      prevTimestampsRef.current = nextSet;
      isFirstLoad.current = false;

      setData(json);
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

  const visibleDrops = data?.drops.slice(0, 12) || [];

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
        <div className="flex items-start justify-between mb-1">
          <h2
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "36px",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              lineHeight: 1.1,
            }}
          >
            Live Drop Feed
          </h2>
          <div className="flex items-center gap-2 shrink-0 mt-2">
            <span
              style={{
                width: "8px",
                height: "8px",
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
                letterSpacing: "0.12em",
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
            fontSize: "15px",
            color: "var(--color-text-secondary)",
            marginBottom: "6px",
          }}
        >
          Allocated bourbon activity across North Carolina — updated in real
          time.
        </p>
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            fontStyle: "italic",
            color: "var(--color-text-tertiary)",
            marginBottom: "32px",
          }}
        >
          Members see this feed the moment it happens. You&apos;re seeing a
          delayed view.
        </p>

        {/* Feed */}
        <div
          style={{
            borderTop: "1px solid var(--color-card-border)",
            borderRadius: "8px",
            overflow: "hidden",
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
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </>
          ) : (
            <AnimatePresence mode="popLayout">
              {visibleDrops.map((event, i) => {
                const key = `${event.timestamp}-${event.brand_name}-${event.event_type}-${event.board_name || event.store_address || ""}-${i}`;
                const rowKey = `${event.timestamp}-${event.brand_name}-${event.event_type}-${event.board_name || event.store_address || ""}`;
                return (
                  <FeedRow
                    key={key}
                    event={event}
                    isNew={newIds.has(rowKey)}
                  />
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Blurred teaser row */}
        {data && data.total > 12 && (
          <div
            className="relative flex items-center justify-center"
            style={{
              padding: "20px",
              borderBottom: "1px solid var(--color-card-border)",
              background:
                "linear-gradient(to bottom, var(--color-bg-secondary), transparent)",
              filter: "blur(0px)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                backdropFilter: "blur(4px)",
                background: "rgba(13,11,14,0.6)",
              }}
            />
            <div className="relative flex items-center gap-2">
              <Lock
                size={14}
                style={{ color: "var(--color-text-tertiary)" }}
              />
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                Join to see all {data.total} recent drops
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
