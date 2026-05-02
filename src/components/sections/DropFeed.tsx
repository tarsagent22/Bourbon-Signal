"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import CountyLink from "@/components/CountyLink";
import {
  type DropEvent,
  type GroupedDrop,
  type DropLocation,
  groupDrops,
  formatRelativeTime,
  cleanCountyName,
  lookupPricing,
  TIER_CONFIG,
  MULTIPLIER_COLORS,
} from "@/lib/drops";
import DataFreshness from "@/components/DataFreshness";
import { useStatePreferences } from "@/lib/statePreferences";
import { useAuth } from "@/lib/auth";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";

interface DropsResponse {
  drops: DropEvent[];
  total: number;
  lastUpdated: string;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  fallback?: boolean;
  error?: string;
}

const MOCK_DROPS: DropEvent[] = [
  {
    timestamp: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
    brand_name: "Blanton's Single Barrel",
    event_type: "in_store",
    state: "VA",
    state_code: "VA",
    store_city: "Richmond",
    store_address: "West Broad St",
    board_name: "Richmond",
    rarity_tier: "allocated",
    quantity_in_stock: 6,
    quantity_shipped: 0,
    retail_price: 74.99,
  },
  {
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    brand_name: "Weller Antique 107",
    event_type: "in_store",
    state: "NC",
    state_code: "NC",
    store_city: "Raleigh",
    store_address: "Wake County",
    board_name: "Wake",
    rarity_tier: "allocated",
    quantity_in_stock: 3,
    quantity_shipped: 0,
    retail_price: 59.99,
  },
  {
    timestamp: new Date(Date.now() - 23 * 60 * 1000).toISOString(),
    brand_name: "Stagg",
    event_type: "in_store",
    state: "PA",
    state_code: "PA",
    store_city: "Pittsburgh",
    store_address: "Allegheny County",
    board_name: "Pittsburgh",
    rarity_tier: "unicorn",
    quantity_in_stock: 2,
    quantity_shipped: 0,
    retail_price: 64.99,
  },
  {
    timestamp: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    brand_name: "Eagle Rare 10",
    event_type: "in_store",
    state: "VA",
    state_code: "VA",
    store_city: "Virginia Beach",
    store_address: "Lynnhaven Pkwy",
    board_name: "Virginia Beach",
    rarity_tier: "limited",
    quantity_in_stock: 8,
    quantity_shipped: 0,
    retail_price: 42.99,
  },
];

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

function getConfidenceBadge(drop: GroupedDrop): { label: string; tone: "exact" | "online" | "listing" } | null {
  if (drop.state !== "PA") return null;
  if (drop.confidenceTier === "exact_store" || drop.availabilityScope === "exact" || drop.exactStore) {
    return { label: "PA exact", tone: "exact" };
  }
  if (drop.confidenceTier === "online_positive") {
    return { label: "PA online", tone: "online" };
  }
  if (drop.confidenceTier === "listing_only") {
    return { label: "PA listing", tone: "listing" };
  }
  return null;
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
  isFreeUser: boolean;
}

function FeedRow({ drop, isNew, index, isFreeUser }: FeedRowProps) {
  const visibleLocations = isFreeUser ? drop.locations.slice(0, 1) : drop.locations;
  const hiddenLocationCount = Math.max(drop.locations.length - visibleLocations.length, 0);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [glowing, setGlowing] = useState(isNew);
  const tier = TIER_CONFIG[drop.rarity_tier] || TIER_CONFIG.limited;
  const description = getEventDescription(drop);
  const pricing = lookupPricing(drop.displayName, drop.retail_price ?? undefined);
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
  const confidenceBadge = getConfidenceBadge(drop);
  if (drop.signalLabel) {
    details.push({ label: "Signal", value: drop.signalLabel });
  }
  if (confidenceBadge) {
    details.push({ label: "Confidence", value: confidenceBadge.label });
  }
  if (drop.event_type === "new_shipment" && drop.board_name) {
    details.push({ label: "Board", value: drop.board_name });
  }
  if (drop.retail_price && drop.retail_price > 0) {
    details.push({ label: "Retail Price", value: `$${Math.round(drop.retail_price)}` });
  }
  if (drop.quantity_shipped && drop.quantity_shipped > 0) {
    details.push({ label: "Shipped", value: `${drop.quantity_shipped} case${drop.quantity_shipped === 1 ? "" : "s"}` });
  }
  if (drop.quantity_in_stock && drop.quantity_in_stock > 0) {
    details.push({ label: "In stock", value: `${drop.quantity_in_stock} bottle${drop.quantity_in_stock === 1 ? "" : "s"}` });
  }
  if (drop.locations.length > 0) {
    details.push({
      label: drop.event_type === "new_shipment" ? "Destinations" : "Locations",
      value: `${drop.locations.length} ${drop.locations.length === 1 ? "location" : "locations"}`,
    });
  }

  const hasDetails = details.length > 0 || drop.locations.length > 0;

  // Blur wall logic — free users: 5 clear, #6 half blur, #7 full blur
  const isBlurred = isFreeUser && index >= 5;
  const blurAmount = index === 5 ? "1.5px" : "3px";
  const blurOpacity = index === 5 ? 0.72 : 0.45;

  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: isBlurred ? blurOpacity : 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        filter: isBlurred ? `blur(${blurAmount})` : "none",
        pointerEvents: isBlurred ? "none" : "auto",
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
          background: hovered ? "rgba(196, 148, 58, 0.08)" : "transparent",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
          boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.3)" : "none",
          borderColor: hovered ? "rgba(212, 146, 11, 0.5)" : tier.borderColor,
          transition: "all 200ms ease",
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
          <button
            type="button"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "17px",
              fontWeight: 600,
              color: "var(--color-cream)",
              lineHeight: 1.3,
              background: "none",
              border: "none",
              padding: 0,
              textAlign: "left",
              cursor: hasDetails ? "pointer" : "default",
            }}
          >
            {drop.displayName}
          </button>
          <div className="flex items-center gap-2" style={{ marginTop: "2px" }}>
            {/* State badge */}
            {drop.state && (
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  color: "rgba(245,237,214,0.4)",
                  background: "rgba(245,237,214,0.06)",
                  border: "1px solid rgba(245,237,214,0.1)",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {drop.state}
              </span>
            )}
            {drop.signalLabel && (
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: "rgba(212,146,11,0.8)",
                  background: "rgba(212,146,11,0.08)",
                  border: "1px solid rgba(212,146,11,0.18)",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  textTransform: "uppercase",
                }}
              >
                {drop.signalLabel}
              </span>
            )}
            {confidenceBadge && (
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color:
                    confidenceBadge.tone === "exact"
                      ? "rgba(110,231,183,0.95)"
                      : confidenceBadge.tone === "online"
                        ? "rgba(125,211,252,0.95)"
                        : "rgba(245,237,214,0.7)",
                  background:
                    confidenceBadge.tone === "exact"
                      ? "rgba(110,231,183,0.12)"
                      : confidenceBadge.tone === "online"
                        ? "rgba(125,211,252,0.12)"
                        : "rgba(245,237,214,0.08)",
                  border:
                    confidenceBadge.tone === "exact"
                      ? "1px solid rgba(110,231,183,0.24)"
                      : confidenceBadge.tone === "online"
                        ? "1px solid rgba(125,211,252,0.22)"
                        : "1px solid rgba(245,237,214,0.14)",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  textTransform: "uppercase",
                }}
              >
                {confidenceBadge.label}
              </span>
            )}
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
              {/* Secondary price — blurred for free users only */}
              {pricing.secondary && (
                <div className="flex items-center gap-1.5" style={{ marginTop: "2px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                      whiteSpace: "nowrap",
                      filter: isFreeUser ? "blur(4px)" : "none",
                      userSelect: isFreeUser ? "none" : "auto",
                    }}
                  >
                    {pricing.secondary}
                  </span>
                  {/* Lock icon — only show for free users */}
                  {isFreeUser && (
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
                  )}
                  {/* Multiplier badge */}
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
                        filter: isFreeUser ? "blur(3px)" : "none",
                        userSelect: isFreeUser ? "none" : "auto",
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
                {drop.locations.length > 0 && (
                  <div style={{ marginBottom: details.length > 0 ? "10px" : 0 }}>
                    <div
                      style={{
                        color: "rgba(245,237,214,0.35)",
                        marginBottom: "8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontSize: "10px",
                        fontFamily: "var(--font-jetbrains)",
                      }}
                    >
                      {drop.state ? `${drop.state} signal` : "Signal"}
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {visibleLocations.map((location: DropLocation) => {
                        const destinationLabel = drop.event_type === "new_shipment" ? "Board destination" : "Store";
                        const secondaryLine = location.address || location.boardName;
                        return (
                          <div
                            key={`${location.label}-${location.address ?? ""}`}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "12px",
                              border: "1px solid rgba(245,237,214,0.08)",
                              background: "rgba(245,237,214,0.03)",
                            }}
                          >
                            <div style={{ color: "rgba(245,237,214,0.35)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "10px", fontFamily: "var(--font-jetbrains)" }}>
                              {destinationLabel}
                            </div>
                            <div style={{ color: "var(--color-cream)", fontWeight: 600 }}>
                              <CountyLink county={location.label}>{location.label}</CountyLink>
                            </div>
                            {secondaryLine && (
                              <div style={{ marginTop: "3px", color: "rgba(245,237,214,0.45)" }}>
                                {secondaryLine}
                              </div>
                            )}
                            {location.quantity && (
                              <div style={{ marginTop: "4px", color: "var(--color-accent-amber)" }}>
                                {drop.event_type === "new_shipment"
                                  ? `${location.quantity} case${location.quantity === 1 ? "" : "s"} shipped`
                                  : `${location.quantity} bottle${location.quantity === 1 ? "" : "s"} seen`}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {isFreeUser && hiddenLocationCount > 0 && (
                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: "12px",
                            border: "1px solid rgba(212,146,11,0.18)",
                            background: "rgba(212,146,11,0.06)",
                          }}
                        >
                          <div
                            style={{
                              filter: "blur(4px)",
                              userSelect: "none",
                              color: "rgba(245,237,214,0.45)",
                              marginBottom: "8px",
                            }}
                          >
                            Hidden member locations
                          </div>
                          <div style={{ color: "var(--color-accent-amber)", fontWeight: 600 }}>
                            Become a member to see {hiddenLocationCount === 1 ? "the other location" : `the other ${hiddenLocationCount} locations`}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {details.map((detail, i) => (
                  <div key={detail.label} style={{ marginBottom: i < details.length - 1 ? "4px" : 0 }}>
                    <span style={{ color: "rgba(245,237,214,0.35)", marginRight: "8px" }}>{detail.label}:</span>
                    <span>{detail.value}</span>
                  </div>
                ))}
                {/* Secondary market info in expanded panel */}
                {pricing.secondary && (
                  <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ color: "rgba(245,237,214,0.35)", marginRight: "8px" }}>Secondary:</span>
                    <span
                      style={{
                        filter: isFreeUser ? "blur(4px)" : "none",
                        userSelect: isFreeUser ? "none" : "auto",
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
  const shouldReduceMotion = useReducedMotion();

  const { selectedStates: preferredStates, hasSelectedStates } = useStatePreferences();
  const { isSignedIn, memberTier, isPaidUser } = useAuth();
  const { prefs } = useAreaPreferences();
  const areaPrefs = prefs.areaPreferences;
  const isFreeUser = !isPaidUser;
  const [data, setData] = useState<DropsResponse | null>(null);
  const [error, setError] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [lastFetch, setLastFetch] = useState<string>("");
  const POLL_INTERVAL_SECONDS = 120;
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(POLL_INTERVAL_SECONDS);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const [grouped, setGrouped] = useState<GroupedDrop[]>([]);
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
  const [showMoreCount, setShowMoreCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchDrops = useCallback(async () => {
    try {
      const res = await fetch("/api/drops?limit=50");
      if (!res.ok) throw new Error("fetch failed");
      const json: DropsResponse = await res.json();
      setError(false);

      const sourceDrops = json.drops.length > 0 ? json.drops : MOCK_DROPS;
      const newGrouped = groupDrops(sourceDrops);

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
      setShowMoreCount(0);
      const nowIso = new Date().toISOString();
      setLastFetch(nowIso);
      setSecondsUntilRefresh(POLL_INTERVAL_SECONDS);
    } catch {
      setError(true);
    }
  }, []);

  const fetchOlderDrops = useCallback(async () => {
    if (!isPaidUser || isLoadingMore) return;
    const nextOffset = grouped.length;
    if (data && data.total <= nextOffset) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/drops?limit=50&offset=${nextOffset}`);
      if (!res.ok) throw new Error("fetch failed");
      const json: DropsResponse = await res.json();
      const sourceDrops = json.drops.length > 0 ? json.drops : [];
      if (!sourceDrops.length) return;

      setGrouped((prev) => {
        const existing = new Set(prev.map((drop) => drop.id));
        const nextGrouped = groupDrops(sourceDrops).filter((drop) => !existing.has(drop.id));
        return [...prev, ...nextGrouped];
      });
      setData((prev) => prev ? { ...prev, total: json.total, hasMore: json.hasMore, offset: 0, limit: 50 } : json);
      setShowMoreCount((prev) => prev + 1);
    } catch {
      setError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }, [data, grouped.length, isLoadingMore, isPaidUser]);

  useEffect(() => {
    fetchDrops();
    const interval = setInterval(fetchDrops, POLL_INTERVAL_SECONDS * 1000);
    return () => clearInterval(interval);
  }, [fetchDrops]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsUntilRefresh((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Apply state and tier filters
  const filteredGrouped = grouped.filter((drop) => {
    // State filtering via Zustand store (set by StateSelector above)
    if (hasSelectedStates && preferredStates.length > 0) {
      if (drop.state && !preferredStates.includes(drop.state)) return false;
    }
    if (activeTiers.size > 0 && !activeTiers.has(drop.rarity_tier)) return false;
    return true;
  });

  // Apply area preferences (Clerk-backed per-user preferences)
  // Only apply area prefs if the user is signed in AND has actually set preferences
  const filteredByArea = filteredGrouped.filter((drop) => {
    // Not signed in, or no preferences set = show everything
    if (!isSignedIn || !areaPrefs.states.length) return true;

    // Filter by state
    const dropState = drop.state || "NC";
    if (!areaPrefs.states.includes(dropState)) return false;

    // NC board filter
    if (dropState === "NC" && areaPrefs.ncBoards.length > 0) {
      const board = drop.board_name || "";
      return areaPrefs.ncBoards.some((b) =>
        board.toLowerCase().includes(b.toLowerCase())
      );
    }

    // VA city filter
    if (dropState === "VA" && areaPrefs.vaCities.length > 0) {
      if (drop.counties?.length > 0) {
        return areaPrefs.vaCities.some((city) =>
          drop.counties.some((c) =>
            c.toLowerCase().includes(city.toLowerCase())
          )
        );
      }
    }

    // PA county filter
    if (dropState === "PA" && areaPrefs.paCounties.length > 0) {
      const county = drop.counties?.[0] || "";
      return areaPrefs.paCounties.some((c) =>
        county.toLowerCase().includes(c.toLowerCase())
      );
    }

    return true;
  });

  // Check if area prefs are active
  const hasAreaPrefs = areaPrefs.states.length > 0;

  // Never let the homepage feed go blank if we have recent valid drops.
  const fallbackFeed = filteredGrouped.length > 0 ? filteredGrouped : grouped;
  const feedWasRelaxed = filteredByArea.length === 0 && fallbackFeed.length > 0;
  const finalFeed = filteredByArea.length > 0 ? filteredByArea : fallbackFeed;

  const baseVisibleCount = isPaidUser ? Math.max(10, grouped.length || 10) : 7;
  const canShowMore = isPaidUser && !hasSelectedStates && activeTiers.size === 0 && !hasAreaPrefs && !!data?.hasMore;
  const displayedGrouped = finalFeed.slice(0, isPaidUser ? baseVisibleCount : baseVisibleCount);
  const hiddenCount = data ? Math.max(0, data.total - grouped.length) + Math.max(0, finalFeed.length - displayedGrouped.length) : 0;
  const timerIsStale = !!data?.lastUpdated && Date.now() - new Date(data.lastUpdated).getTime() > POLL_INTERVAL_SECONDS * 1000 * 3;

  return (
    <section
      id="drops"
      style={{
        backgroundColor: "var(--color-bg-warm)",
        paddingTop: "24px",
        paddingBottom: "64px",
        width: "100%",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
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

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.16,
          background:
            "radial-gradient(ellipse 72% 56% at 50% 18%, rgba(196,148,58,0.16) 0%, rgba(196,148,58,0.07) 34%, rgba(196,148,58,0.025) 56%, transparent 74%), linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 24%, transparent 100%)",
        }}
      />

      <div style={{ width: "100%", maxWidth: "680px", paddingLeft: "16px", paddingRight: "16px", position: "relative", zIndex: 1 }}>
        <div>
          {/* Trust row */}
          <motion.div
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
            style={{
              marginBottom: "16px",
              paddingBottom: "14px",
              borderBottom: "1px solid rgba(245,237,214,0.08)",
            }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {[
              { label: "Coverage", value: "NC • VA • PA • IN" },
              { label: "Feed status", value: timerIsStale ? "Refreshing" : data?.lastUpdated ? "Live" : "Checking" },
              { label: "Drops tracked", value: data ? `${data.total.toLocaleString()}+` : "3,400+" },
            ].map((item, idx) => (
              <div
                key={item.label}
                className="flex items-center gap-2"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "rgba(245,237,214,0.72)",
                }}
              >
                <span style={{ color: "rgba(245,237,214,0.42)" }}>{item.label}</span>
                <span style={{ color: "var(--color-cream)", fontWeight: 600 }}>{item.value}</span>
                {idx < 2 && <span style={{ color: "rgba(245,237,214,0.18)" }}>•</span>}
              </div>
            ))}
          </motion.div>

          {/* Header row */}
          <motion.div
            className="flex items-center justify-between gap-4"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: 0.72, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div>
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
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "rgba(245,237,214,0.55)",
                  marginTop: "6px",
                  marginBottom: 0,
                }}
              >
                Recent real drop signals, filtered to actual movement with usable location context.
              </p>
            </div>
            {hasAreaPrefs && (
              <a
                href="/dashboard"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--color-accent-amber)",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  opacity: 0.85,
                  transition: "opacity 150ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
              >
                Filtered to your areas · Edit
              </a>
            )}
          </motion.div>

          {/* Premium member nudge */}
          <motion.div
            style={{
              marginTop: "14px",
              marginBottom: "16px",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              color: "rgba(245,237,214,0.58)",
            }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.58, delay: 0.04, ease: [0.25, 0.1, 0.25, 1] }}
          >
            Track the latest real bottle movement, then unlock deeper hunt intel with member access.
          </motion.div>

          {/* Divider */}
          <div style={{ margin: "16px 0", borderBottom: "1px solid rgba(196, 148, 58, 0.2)" }} />

          {/* Filters row: Tier filter pills */}
          <motion.div
            className="flex items-center flex-wrap gap-2"
            style={{ paddingBottom: "16px" }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: 0.6, delay: 0.06, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Tier filter pills */}
            {[
              { tier: "unicorn", label: "Unicorn", activeBg: "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)", activeColor: "#0D0B07", inactiveBg: "rgba(196,148,58,0.08)", inactiveColor: "rgba(196,148,58,0.5)", border: "1px solid rgba(196,148,58,0.25)" },
              { tier: "allocated", label: "Allocated", activeBg: "rgba(184,115,51,0.3)", activeColor: "#D4943A", inactiveBg: "rgba(184,115,51,0.06)", inactiveColor: "rgba(184,115,51,0.45)", border: "1px solid rgba(184,115,51,0.2)" },
              { tier: "limited", label: "Limited", activeBg: "rgba(138,138,138,0.22)", activeColor: "#AAAAAA", inactiveBg: "rgba(138,138,138,0.05)", inactiveColor: "rgba(138,138,138,0.4)", border: "1px solid rgba(138,138,138,0.18)" },
            ].map((pill) => {
              const isActive = activeTiers.has(pill.tier);
              return (
                <motion.button
                  key={pill.tier}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
                  whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: 0.06 + (pill.tier === "unicorn" ? 0 : pill.tier === "allocated" ? 0.05 : 0.1), ease: [0.25, 0.1, 0.25, 1] }}
                  onClick={() => {
                    setActiveTiers((prev) => {
                      const next = new Set(prev);
                      if (next.has(pill.tier)) {
                        next.delete(pill.tier);
                      } else {
                        next.add(pill.tier);
                      }
                      return next;
                    });
                  }}
                  style={{
                    background: isActive ? pill.activeBg : pill.inactiveBg,
                    color: isActive ? pill.activeColor : pill.inactiveColor,
                    border: isActive ? `1px solid ${pill.tier === "unicorn" ? "rgba(196,148,58,0.6)" : pill.tier === "allocated" ? "rgba(184,115,51,0.45)" : "rgba(138,138,138,0.4)"}` : pill.border,
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    padding: "8px 16px",
                    borderRadius: "20px",
                    whiteSpace: "nowrap" as const,
                    cursor: "pointer",
                    transition: "background 150ms, color 150ms, border-color 150ms",
                    boxShadow: isActive && pill.tier === "unicorn" ? "0 0 8px rgba(196,148,58,0.2)" : "none",
                  }}
                >
                  {pill.label}
                </motion.button>
              );
            })}
          </motion.div>

          {/* Feed rows */}
          {(data?.fallback || feedWasRelaxed) && (
            <div
              style={{
                marginBottom: "18px",
                padding: "12px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(212,146,11,0.16)",
                background: "rgba(212,146,11,0.05)",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "rgba(245,237,214,0.65)",
              }}
            >
              {data?.fallback
                ? "Fresh scan was thin, so this feed is holding on the most recent valid drops instead of going blank."
                : "Your current filters were too narrow, so we’re showing the newest valid drops instead of an empty feed."}
            </div>
          )}
          {error && !data ? (
            <div style={{ position: "relative" }}>
              <div
                style={{
                  marginBottom: "18px",
                  padding: "12px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(212,146,11,0.16)",
                  background: "rgba(212,146,11,0.05)",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "rgba(245,237,214,0.65)",
                }}
              >
                Live feed is temporarily unavailable, so this preview is showing sample activity instead of live drop signals.
              </div>
              <AnimatePresence mode="popLayout">
                {groupDrops(MOCK_DROPS).map((drop, index) => (
                  <FeedRow
                    key={drop.id}
                    drop={drop}
                    isNew={false}
                    index={index}
                    isFreeUser={isFreeUser}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : !data ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </>
          ) : (
            <motion.div
              style={{ position: "relative" }}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
              whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.72, delay: 0.08, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div
                style={isPaidUser && showMoreCount > 0 ? {
                  maxHeight: "980px",
                  overflowY: "auto",
                  paddingRight: "4px",
                } : undefined}
              >
                <AnimatePresence mode="popLayout">
                  {displayedGrouped.map((drop, index) => (
                    <FeedRow
                      key={drop.id}
                      drop={drop}
                      isNew={newIds.has(drop.id)}
                      index={index}
                      isFreeUser={isFreeUser}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {canShowMore && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: "18px" }}>
                  <button
                    type="button"
                    onClick={() => fetchOlderDrops()}
                    disabled={isLoadingMore}
                    style={{
                      padding: "10px 18px",
                      borderRadius: "999px",
                      border: "1px solid rgba(212,146,11,0.28)",
                      background: "rgba(212,146,11,0.08)",
                      color: "var(--color-cream)",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isLoadingMore ? "progress" : "pointer",
                      opacity: isLoadingMore ? 0.7 : 1,
                    }}
                  >
                    {isLoadingMore ? "Loading older drops…" : "Show older drops"}
                  </button>
                </div>
              )}

              {/* Gradient overlay over blurred rows — only for free users */}
              {isFreeUser && displayedGrouped.length > 5 && (
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
            </motion.div>
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
                {hiddenCount > 0 ? `${hiddenCount}+ more recent signals tracked` : isPaidUser ? "Paid members can expand deeper into recent history" : "Live feed updates automatically"}
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

        </div>
      </div>
    </section>
  );
}
