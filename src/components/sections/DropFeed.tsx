"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import BottleLink from "@/components/BottleLink";
import CountyLink from "@/components/CountyLink";
import {
  type DropEvent,
  type GroupedDrop,
  groupDrops,
  formatRelativeTime,
  cleanCountyName,
  lookupPricing,
  TIER_CONFIG,
  MULTIPLIER_COLORS,
} from "@/lib/drops";
import DataFreshness from "@/components/DataFreshness";

interface DropsResponse {
  drops: DropEvent[];
  total: number;
  lastUpdated: string;
}

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
  const pricing = lookupPricing(drop.displayName, drop.retail_price);
  const hasPricing = pricing.msrp !== undefined;
  const multColors = MULTIPLIER_COLORS[drop.rarity_tier] || MULTIPLIER_COLORS.limited;

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
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "17px",
              fontWeight: 600,
              color: "var(--color-cream)",
              lineHeight: 1.3,
            }}
          >
            <BottleLink name={drop.displayName}>{drop.displayName}</BottleLink>
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: "2px" }}>
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "rgba(245,237,214,0.5)",
                lineHeight: 1.3,
              }}
            >
              {description}
            </span>
            {/* Mobile pricing inline — visible only on small screens */}
            {hasPricing && (
              <span
                className="flex md:hidden shrink-0"
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "10px",
                  color: "rgba(245,237,214,0.4)",
                }}
              >
                ${pricing.msrp}
              </span>
            )}
          </div>
        </div>

        {/* Right: pricing + timestamp — desktop */}
        <div
          className="hidden md:flex flex-col items-end justify-center shrink-0"
          style={{ marginLeft: "8px", minWidth: "130px" }}
        >
          {hasPricing ? (
            <>
              {/* MSRP — always visible */}
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "11px",
                  color: "rgba(245,237,214,0.45)",
                  whiteSpace: "nowrap",
                }}
              >
                MSRP ${pricing.msrp}
              </span>
              {/* Secondary price — blurred for free users */}
              {pricing.secondary && (
                <div className="flex items-center gap-1.5" style={{ marginTop: "2px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                      whiteSpace: "nowrap",
                      filter: "blur(4px)",
                      userSelect: "none",
                    }}
                  >
                    {pricing.secondary}
                  </span>
                  {/* Lock icon */}
                  <span
                    title="Unlock with Standard Proof"
                    style={{
                      fontSize: "10px",
                      color: "rgba(245,237,214,0.3)",
                      cursor: "help",
                    }}
                  >
                    🔒
                  </span>
                  {/* Multiplier badge — blurred */}
                  {pricing.multiplier && (
                    <span
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "9px",
                        fontWeight: 700,
                        color: multColors.color,
                        background: multColors.bg,
                        border: `1px solid ${multColors.border}`,
                        borderRadius: "8px",
                        padding: "1px 6px",
                        whiteSpace: "nowrap",
                        filter: "blur(3px)",
                        userSelect: "none",
                      }}
                    >
                      {pricing.multiplier}x
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            /* No pricing — just timestamp */
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
          )}
          {/* Timestamp below pricing */}
          {hasPricing && (
            <span
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: "10px",
                color: "rgba(245,237,214,0.25)",
                whiteSpace: "nowrap",
                marginTop: "3px",
              }}
            >
              {formatRelativeTime(drop.timestamp)}
            </span>
          )}
        </div>

        {/* Mobile timestamp — when no pricing inline */}
        <div
          className="flex md:hidden flex-col items-end justify-center shrink-0"
          style={{ width: "50px" }}
        >
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "10px",
              color: "rgba(245,237,214,0.3)",
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
                    {detail.label === "Counties" ? (
                      <span>
                        {drop.counties.map((c, ci) => (
                          <span key={c}>
                            {ci > 0 && ", "}
                            <CountyLink county={c}>{c}</CountyLink>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span>{detail.value}</span>
                    )}
                  </div>
                ))}
                {/* Secondary market info in expanded panel */}
                {pricing.secondary && (
                  <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ color: "rgba(245,237,214,0.35)", marginRight: "8px" }}>Secondary:</span>
                    <span
                      style={{
                        filter: "blur(4px)",
                        userSelect: "none",
                        color: "var(--color-accent-amber)",
                      }}
                    >
                      {pricing.secondary}
                    </span>
                    <span
                      style={{
                        marginLeft: "6px",
                        fontSize: "10px",
                        color: "rgba(245,237,214,0.3)",
                        cursor: "help",
                      }}
                      title="Average resale price based on recent auction and market data"
                    >
                      ℹ
                    </span>
                    <span
                      style={{
                        marginLeft: "4px",
                        fontSize: "10px",
                        color: "rgba(245,237,214,0.3)",
                      }}
                    >
                      🔒
                    </span>
                  </div>
                )}
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
        paddingTop: "40px",
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

          {/* Data freshness */}
          {data?.lastUpdated && (
            <div style={{ marginTop: "10px" }}>
              <DataFreshness lastUpdated={data.lastUpdated} />
            </div>
          )}

          {/* Divider */}
          <div style={{ margin: "16px 0", borderBottom: "1px solid rgba(196, 148, 58, 0.2)" }} />

          {/* Tier filter pills — larger for header context */}
          <div
            className="flex items-center flex-wrap gap-2"
            style={{
              paddingBottom: "16px",
            }}
          >
            {[
              { label: "Unicorn", bg: "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)", color: "#0D0B07", border: "none" },
              { label: "Allocated", bg: "rgba(184,115,51,0.15)", color: "#B87333", border: "1px solid rgba(184,115,51,0.3)" },
              { label: "Limited", bg: "rgba(138,138,138,0.12)", color: "#8A8A8A", border: "1px solid rgba(138,138,138,0.25)" },
            ].map((pill) => (
              <span
                key={pill.label}
                style={{
                  background: pill.bg,
                  color: pill.color,
                  border: pill.border,
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  padding: "8px 16px",
                  borderRadius: "20px",
                  whiteSpace: "nowrap",
                  cursor: "default",
                }}
              >
                {pill.label}
              </span>
            ))}
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

          {/* Drop count below feed */}
          {data && (
            <div style={{ textAlign: "center", marginTop: "32px" }}>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "rgba(245,237,214,0.5)",
                }}
              >
                {hiddenCount + blurredCount} more drops tracked in real time
              </p>
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
