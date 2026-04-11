"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
import { useStatePreferences } from "@/lib/statePreferences";
import { useAuth } from "@/lib/auth";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";

interface DropsResponse {
  drops: DropEvent[];
  total: number;
  lastUpdated: string;
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

  // Blur wall logic — free users: blur last 2 of 8. Paid members: no blur
  const isBlurred = isFreeUser && index >= 6;
  const blurAmount = index === 6 ? "1.5px" : "3px";
  const blurOpacity = index === 6 ? 0.7 : 0.5;

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
  const { isSignedIn } = useAuth();
  const { prefs: areaPrefs } = useAreaPreferences();
  const isFreeUser = !isSignedIn;
  const [data, setData] = useState<DropsResponse | null>(null);
  const [error, setError] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [lastFetch, setLastFetch] = useState<string>("");
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(600);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const [grouped, setGrouped] = useState<GroupedDrop[]>([]);
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());

  const fetchDrops = useCallback(async () => {
    try {
      const res = await fetch("/api/drops");
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
      const nowIso = new Date().toISOString();
      setLastFetch(nowIso);
      setSecondsUntilRefresh(600);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchDrops();
    const interval = setInterval(fetchDrops, 30000);
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

  // Limit displayed drops to 8; only last 2 are blurred
  const MAX_DISPLAYED = 8;
  const displayedGrouped = filteredByArea.slice(0, MAX_DISPLAYED);
  const hiddenCount = data ? Math.max(0, data.total - grouped.length) + Math.max(0, filteredByArea.length - MAX_DISPLAYED) : 0;
  const minutes = Math.floor(secondsUntilRefresh / 60);
  const seconds = secondsUntilRefresh % 60;
  const refreshLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

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
              { label: "Coverage", value: "NC • VA • PA" },
              { label: "Updated", value: data?.lastUpdated ? "live" : "checking" },
              { label: "Next refresh", value: refreshLabel },
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
                {idx < 3 && <span style={{ color: "rgba(245,237,214,0.18)" }}>•</span>}
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
                Real-time bottle intel from monitored state activity.
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
            Unlock maps, dashboards, and deeper bottle intel with member access.
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
                Live feed is temporarily unavailable — showing recent sample activity so you can preview the product experience.
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

              {/* Gradient overlay over blurred rows — only for free users */}
              {isFreeUser && displayedGrouped.length > 6 && (
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
                {hiddenCount > 0 ? `${hiddenCount}+ more drops tracked in real time` : "Updated every 15 minutes"}
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
