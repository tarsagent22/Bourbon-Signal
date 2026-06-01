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
  formatStateLabel,
  lookupPricing,
  TIER_CONFIG,
  MULTIPLIER_COLORS,
} from "@/lib/drops";
import DataFreshness from "@/components/DataFreshness";
import { AVAILABLE_STATES, useStatePreferences } from "@/lib/statePreferences";
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

function latestSignalRows(drops: DropEvent[], limit: number = 20): GroupedDrop[] {
  const rows: GroupedDrop[] = [];
  for (const drop of drops) {
    const row = groupDrops([drop], 1)[0];
    if (!row) continue;
    rows.push({
      ...row,
      id: [row.id, drop.timestamp, drop.store_id, drop.store_address, drop.display_location, drop.sourceUrl].filter(Boolean).join("|"),
    });
  }
  return rows
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))
    .slice(0, limit);
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

function getConfidenceBadge(drop: GroupedDrop): { label: string; tone: "exact" | "online" | "listing" } | null {
  if (drop.canAlertAsInventory || drop.exactStore || drop.availabilityScope === "exact" || drop.locationPrecision === "store_level") {
    return { label: "Store-level", tone: "exact" };
  }
  if (drop.state === "KY") {
    if (drop.confidenceTier === "exact_today_distillery") return { label: "KY today", tone: "exact" };
    if (drop.confidenceTier === "official_release_live") return { label: "KY live", tone: "online" };
    if (drop.confidenceTier === "official_window_open" || drop.availabilityScope === "release_window") return { label: "KY window", tone: "online" };
    if (drop.confidenceTier === "official_announcement" || drop.confidenceTier === "venue_signal") return { label: "KY official", tone: "listing" };
    return null;
  }
  if (drop.state === "NC") {
    if (drop.event_type === "nc_board_shipment_snapshot" || drop.availabilityScope === "board") return { label: "NC board", tone: "online" };
    if (drop.event_type === "nc_statewide_warehouse_stock" || drop.availabilityScope === "warehouse") return { label: "NC radar", tone: "listing" };
  }
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

function getAccuracyBadge(drop: GroupedDrop): { label: string; caption: string; tone: "exact" | "official" | "positive" } {
  if (drop.canAlertAsInventory || drop.exactStore || drop.availabilityScope === "exact" || drop.locationPrecision === "store_level") {
    return { label: "Verified", caption: "Store-level positive", tone: "exact" };
  }

  if (drop.state === "KY" || drop.confidenceTier?.startsWith("official")) {
    return { label: "Official", caption: "Source-confirmed", tone: "official" };
  }

  if (drop.state === "NC" && (drop.event_type === "nc_board_shipment_snapshot" || drop.event_type === "nc_statewide_warehouse_stock")) {
    return { label: "Official", caption: drop.event_type === "nc_board_shipment_snapshot" ? "Board-level shipment" : "Warehouse radar", tone: "official" };
  }

  return { label: "Positive", caption: "Noise-filtered", tone: "positive" };
}

function getEventDescription(drop: GroupedDrop): string {
  if (drop.signalLabel) {
    if (drop.locations.length > 1) {
      return `${drop.locations.length} locations`;
    }
    const loc = drop.locations[0]?.label || cleanCountyName(drop.store_address || drop.board_name || "");
    return loc || "Recent positive signal";
  }

  if (drop.state === "KY") {
    switch (drop.event_type) {
      case "in_stock":
        return "Available at distillery";
      case "in_store":
        return "Pickup window open";
      case "new_allocation":
        return "Entry window open";
      case "allocation_assigned":
        return "Winner notice";
      case "restock":
        return "Official update";
      default:
        return "Kentucky release signal";
    }
  }
  switch (drop.event_type) {
    case "nc_board_shipment_snapshot": {
      const loc = cleanCountyName(drop.board_name || drop.locations[0]?.label || "");
      return `Board shipment${loc ? ` · ${loc}` : ""}`;
    }
    case "nc_statewide_warehouse_stock": {
      return "NC warehouse radar";
    }
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
    case "store_delivery_snapshot": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `Store delivery${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "store_inventory_result": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `In stock${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "browser_assisted_store_inventory_limited_supply": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `Limited supply${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "browser_assisted_store_inventory_in_stock": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `In stock${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "allocation_assigned": {
      return "Allocation assigned";
    }
    default:
      return "Recent bottle signal";
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
  const stateLabel = drop.displayState || formatStateLabel(drop.state);
  const primaryLocation = drop.locations[0]?.label || description;
  const locationSummary = drop.locations.length > 1 ? `${drop.locations.length} locations` : primaryLocation;
  const signalLabel = drop.signalLabel || "Bottle signal";
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
  const accuracyBadge = getAccuracyBadge(drop);
  if (drop.signalLabel) {
    details.push({ label: "Signal", value: drop.signalLabel });
  }
  if (confidenceBadge) {
    details.push({ label: "Confidence", value: confidenceBadge.label });
  }
  if ((drop.event_type === "new_shipment" || drop.event_type === "nc_board_shipment_snapshot") && drop.board_name) {
    details.push({ label: "Board", value: drop.board_name });
  }
  if (drop.event_type === "nc_board_shipment_snapshot") {
    details.push({ label: "Precision", value: "Board-level shipment, store unknown" });
  }
  if (drop.event_type === "nc_statewide_warehouse_stock") {
    details.push({ label: "Precision", value: "Statewide warehouse radar, board/store unknown" });
  }
  if (drop.retail_price && drop.retail_price > 0) {
    details.push({ label: "Retail Price", value: `$${Math.round(drop.retail_price)}` });
  }
  if (drop.quantity_shipped && drop.quantity_shipped > 0) {
    details.push({ label: drop.event_type === "nc_board_shipment_snapshot" ? "Board received" : "Shipped", value: `${drop.quantity_shipped} unit${drop.quantity_shipped === 1 ? "" : "s"}` });
  }
  if (drop.quantity_in_stock && drop.quantity_in_stock > 0) {
    details.push({ label: drop.event_type === "nc_statewide_warehouse_stock" ? "Warehouse" : "In stock", value: `${drop.quantity_in_stock} unit${drop.quantity_in_stock === 1 ? "" : "s"}` });
  }
  if (drop.locations.length > 0) {
    details.push({
      label: drop.event_type === "new_shipment" || drop.event_type === "nc_board_shipment_snapshot" ? "Destinations" : "Locations",
      value: `${drop.locations.length} ${drop.locations.length === 1 ? "location" : "locations"}`,
    });
  }

  const hasDetails = details.length > 0 || drop.locations.length > 0;

  // Blur wall logic — free users: 5 clear, #6 half blur, #7 full blur
  const isBlurred = isFreeUser && index >= 5;
  const blurOpacity = index === 5 ? 0.72 : 0.45;

  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, y: -12 } : false}
      animate={{ opacity: isBlurred ? blurOpacity : 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        filter: "none",
        pointerEvents: isBlurred ? "none" : "auto",
        ...(glowing && index === 0
          ? { animation: "newDropGlow 2s ease infinite" }
          : {}),
      }}
    >
      {/* Mobile card */}
      <div
        className="md:hidden"
        onClick={() => hasDetails && !isBlurred && setExpanded(!expanded)}
        style={{
          position: "relative",
          marginBottom: "12px",
          padding: "15px 15px 14px",
          borderRadius: "22px",
          border: `1px solid ${glowing && index === 0 ? "rgba(196,148,58,0.42)" : "rgba(245,237,214,0.085)"}`,
          background:
            index === 0
              ? "linear-gradient(145deg, rgba(196,148,58,0.14) 0%, rgba(31,22,12,0.94) 42%, rgba(12,10,7,0.96) 100%)"
              : "linear-gradient(145deg, rgba(245,237,214,0.055) 0%, rgba(24,18,12,0.92) 44%, rgba(11,9,7,0.94) 100%)",
          boxShadow: index === 0 ? "0 18px 42px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.045)" : "0 14px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.035)",
          overflow: "hidden",
          cursor: hasDetails ? "pointer" : "default",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "3px",
            background: tier.borderColor,
            opacity: index === 0 ? 1 : 0.72,
          }}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2" style={{ marginBottom: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "9px",
                  fontWeight: 800,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: signalLabel === "In stock" ? "rgba(110,231,183,0.96)" : "rgba(212,146,11,0.96)",
                  background: signalLabel === "In stock" ? "rgba(110,231,183,0.10)" : "rgba(212,146,11,0.10)",
                  border: signalLabel === "In stock" ? "1px solid rgba(110,231,183,0.20)" : "1px solid rgba(212,146,11,0.22)",
                  borderRadius: "999px",
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {signalLabel}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "9px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color:
                    accuracyBadge.tone === "exact"
                      ? "rgba(110,231,183,0.96)"
                      : accuracyBadge.tone === "official"
                        ? "rgba(125,211,252,0.95)"
                        : "rgba(245,237,214,0.56)",
                  background:
                    accuracyBadge.tone === "exact"
                      ? "rgba(110,231,183,0.09)"
                      : accuracyBadge.tone === "official"
                        ? "rgba(125,211,252,0.09)"
                        : "rgba(245,237,214,0.055)",
                  border:
                    accuracyBadge.tone === "exact"
                      ? "1px solid rgba(110,231,183,0.18)"
                      : accuracyBadge.tone === "official"
                        ? "1px solid rgba(125,211,252,0.18)"
                        : "1px solid rgba(245,237,214,0.10)",
                  borderRadius: "999px",
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {accuracyBadge.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(245,237,214,0.42)",
                }}
              >
                {stateLabel}
              </span>
            </div>

            <div
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "21px",
                fontWeight: 700,
                color: "var(--color-cream)",
                lineHeight: 1.08,
                letterSpacing: "-0.015em",
              }}
            >
              {drop.displayName}
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0, paddingTop: "1px" }}>
            <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "rgba(245,237,214,0.38)", whiteSpace: "nowrap" }}>
              Confirmed {formatRelativeTime(drop.timestamp)}
            </div>
            {hasPricing && (
              <div style={{ marginTop: "8px", fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "rgba(245,237,214,0.58)", whiteSpace: "nowrap" }}>
                ${pricing.msrp} MSRP
              </div>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-between gap-3"
          style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(245,237,214,0.07)" }}
        >
          <div className="min-w-0">
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "rgba(245,237,214,0.43)", marginBottom: "2px" }}>
              {drop.signalCategory === "delivery" ? "Delivery area" : "Availability"}
            </div>
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 650, color: "rgba(245,237,214,0.86)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {locationSummary}
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            <span style={{ ...(tier.pillStyle as React.CSSProperties), fontSize: "8px", padding: "4px 8px" }}>
              {tier.label}
            </span>
            {confidenceBadge && (
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "8px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(110,231,183,0.86)",
                  background: "rgba(110,231,183,0.075)",
                  border: "1px solid rgba(110,231,183,0.16)",
                  borderRadius: "999px",
                  padding: "4px 7px",
                  whiteSpace: "nowrap",
                }}
              >
                {confidenceBadge.label}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: "10px",
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "rgba(245,237,214,0.45)",
          }}
        >
          <span>{accuracyBadge.caption}</span>
          <span style={{ color: "rgba(245,237,214,0.34)" }}>{hasDetails ? "Tap for more" : "More shown"}</span>
        </div>

        {pricing.secondary && (
          <div
            style={{
              marginTop: "10px",
              fontFamily: "var(--font-dm-sans)",
              fontSize: "11px",
              fontWeight: 600,
              color: "rgba(212,146,11,0.74)",
              letterSpacing: "0.01em",
            }}
          >
            {isFreeUser ? "Market intel locked 🔒" : `Market intel: ${pricing.secondary}`}
          </div>
        )}
      </div>

      {/* Main row */}
      <div
        className="hidden md:flex items-center"
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
            {stateLabel && (
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
                {stateLabel}
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
              {/* Secondary price — locked for free users only */}
              {pricing.secondary && (
                <div className="flex items-center gap-1.5" style={{ marginTop: "2px" }}>
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                      whiteSpace: "nowrap",
                      userSelect: isFreeUser ? "none" : "auto",
                    }}
                  >
                    {isFreeUser ? "Member intel" : pricing.secondary}
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
                        userSelect: isFreeUser ? "none" : "auto",
                      }}
                    >
                      {isFreeUser ? "PRO" : `${pricing.multiplier}x`}
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
              Confirmed {formatRelativeTime(drop.timestamp)}
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
            Confirmed {formatRelativeTime(drop.timestamp)}
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
                      {stateLabel ? `${stateLabel} signal` : "Signal"}
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {visibleLocations.map((location: DropLocation) => {
                        const destinationLabel = drop.signalCategory === "delivery" ? "Delivery location" : "Store / source";
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
                              userSelect: "none",
                              color: "rgba(245,237,214,0.45)",
                              marginBottom: "8px",
                            }}
                          >
                            Additional member locations
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
                        userSelect: isFreeUser ? "none" : "auto",
                        color: "var(--color-accent-amber)",
                      }}
                    >
                      {isFreeUser ? "Member intel" : pricing.secondary}
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

  const {
    selectedStates: preferredStates,
    hasSelectedStates,
    setSelectedStates,
    clearPreferences,
  } = useStatePreferences();
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
      const newGrouped = latestSignalRows(sourceDrops, 50);

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
        const nextGrouped = latestSignalRows(sourceDrops, 50).filter((drop) => !existing.has(drop.id));
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

  // Always keep at least five recent signals visible, even if filters are narrow.
  const minimumVisibleSignals = 5;
  const fallbackFeed = filteredGrouped.length > 0 ? filteredGrouped : grouped;
  const feedWasRelaxed = filteredByArea.length < minimumVisibleSignals && grouped.length > filteredByArea.length;
  const finalFeed = filteredByArea.length >= minimumVisibleSignals
    ? filteredByArea
    : [...filteredByArea, ...grouped.filter((drop) => !filteredByArea.some((visible) => visible.id === drop.id))].slice(0, Math.max(minimumVisibleSignals, filteredByArea.length || fallbackFeed.length));

  const baseVisibleCount = isPaidUser ? Math.max(10, grouped.length || 10) : 7;
  const canShowMore = isPaidUser && !hasSelectedStates && activeTiers.size === 0 && !hasAreaPrefs && !!data?.hasMore;
  const displayedGrouped = finalFeed.slice(0, isPaidUser ? baseVisibleCount : baseVisibleCount);
  const hiddenCount = data ? Math.max(0, data.total - grouped.length) + Math.max(0, finalFeed.length - displayedGrouped.length) : 0;
  const dropCountsByState = grouped.reduce((counts, drop) => {
    const state = drop.state || "NC";
    counts.set(state, (counts.get(state) || 0) + 1);
    return counts;
  }, new Map<string, number>());
  const feedStateOptions = AVAILABLE_STATES.filter((state) => !("comingSoon" in state && state.comingSoon));
  const stateFilterSummary = !hasSelectedStates || preferredStates.length === 0
    ? "Showing all supported states"
    : `Showing ${preferredStates.map((code) => AVAILABLE_STATES.find((state) => state.code === code)?.name || code).join(", ")}`;

  return (
    <section
      id="drops"
      style={{
        backgroundColor: "var(--color-bg-warm)",
        scrollMarginTop: "88px",
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
        @media (max-width: 767px) {
          #drops { padding-top: 18px !important; }
          .dropfeed-shell { padding-left: 18px !important; padding-right: 18px !important; }
          .dropfeed-title { font-size: 34px !important; letter-spacing: -0.03em !important; }
          .dropfeed-subcopy { font-size: 14px !important; line-height: 1.45 !important; max-width: 30ch; }
          .dropfeed-nudge { display:none; }
          .dropfeed-filter-row { overflow-x: auto; flex-wrap: nowrap !important; padding-bottom: 18px !important; margin-left: -2px; scrollbar-width: none; }
          .dropfeed-filter-row::-webkit-scrollbar { display:none; }
          .dropfeed-detail-panel { padding: 4px 2px 14px 8px !important; }
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

      <div className="dropfeed-shell" style={{ width: "100%", maxWidth: "680px", paddingLeft: "16px", paddingRight: "16px", position: "relative", zIndex: 1 }}>
        <div>
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
                className="dropfeed-title"
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
                className="dropfeed-subcopy"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "rgba(245,237,214,0.55)",
                  marginTop: "6px",
                  marginBottom: 0,
                }}
              >
                Source-filtered positive bottle signals with freshness and evidence level shown on every card.
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
            className="dropfeed-nudge"
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
            Built to avoid false alarms: out-of-stock rows, lottery pages, statewide catalog noise, and weak allocation chatter are filtered before they reach this feed.
          </motion.div>

          {/* Divider */}
          <div style={{ margin: "16px 0", borderBottom: "1px solid rgba(196, 148, 58, 0.2)" }} />

          <motion.div
            className="dropfeed-state-panel"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: 0.58, delay: 0.04, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="dropfeed-state-panel-head">
              <div>
                <span>State coverage</span>
                <strong>{stateFilterSummary}</strong>
              </div>
              {hasSelectedStates && preferredStates.length > 0 ? (
                <button type="button" onClick={clearPreferences}>Show all</button>
              ) : null}
            </div>
            <div className="dropfeed-state-chips" aria-label="Filter drop feed by state">
              <button
                type="button"
                className={`dropfeed-state-chip ${!hasSelectedStates || preferredStates.length === 0 ? "active" : ""}`}
                onClick={clearPreferences}
                aria-pressed={!hasSelectedStates || preferredStates.length === 0}
              >
                <strong>All</strong>
                <span>Every active market</span>
                <em>{grouped.length}</em>
              </button>
              {feedStateOptions.map((state) => {
                const active = hasSelectedStates && preferredStates.includes(state.code);
                const nextStates = active
                  ? preferredStates.filter((code) => code !== state.code)
                  : [...preferredStates, state.code];
                return (
                  <button
                    key={state.code}
                    type="button"
                    className={`dropfeed-state-chip ${active ? "active" : ""}`}
                    onClick={() => setSelectedStates(nextStates)}
                    aria-pressed={active}
                  >
                    <strong>{state.code}</strong>
                    <span>{state.name}</span>
                    <em>{dropCountsByState.get(state.code) || 0}</em>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Filters row: Tier filter pills */}
          <motion.div
            className="dropfeed-filter-row flex items-center flex-wrap gap-2"
            style={{ paddingBottom: "16px" }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: 0.6, delay: 0.06, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Tier filter pills */}
            {[
              { tier: "all", label: "All signals", activeBg: "rgba(245,237,214,0.13)", activeColor: "var(--color-cream)", inactiveBg: "rgba(245,237,214,0.035)", inactiveColor: "rgba(245,237,214,0.5)", border: "1px solid rgba(245,237,214,0.12)" },
              { tier: "unicorn", label: "Unicorn", activeBg: "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)", activeColor: "#0D0B07", inactiveBg: "rgba(196,148,58,0.08)", inactiveColor: "rgba(196,148,58,0.5)", border: "1px solid rgba(196,148,58,0.25)" },
              { tier: "allocated", label: "Allocated", activeBg: "rgba(184,115,51,0.3)", activeColor: "#D4943A", inactiveBg: "rgba(184,115,51,0.06)", inactiveColor: "rgba(184,115,51,0.45)", border: "1px solid rgba(184,115,51,0.2)" },
              { tier: "limited", label: "Limited", activeBg: "rgba(138,138,138,0.22)", activeColor: "#AAAAAA", inactiveBg: "rgba(138,138,138,0.05)", inactiveColor: "rgba(138,138,138,0.4)", border: "1px solid rgba(138,138,138,0.18)" },
            ].map((pill) => {
              const isAll = pill.tier === "all";
              const isActive = isAll ? activeTiers.size === 0 : activeTiers.has(pill.tier);
              return (
                <motion.button
                  key={pill.tier}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
                  whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.45, delay: 0.06 + (pill.tier === "unicorn" ? 0 : pill.tier === "allocated" ? 0.05 : 0.1), ease: [0.25, 0.1, 0.25, 1] }}
                  onClick={() => {
                    if (isAll) {
                      setActiveTiers(new Set());
                      return;
                    }
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
                    border: isActive ? `1px solid ${pill.tier === "all" ? "rgba(245,237,214,0.22)" : pill.tier === "unicorn" ? "rgba(196,148,58,0.6)" : pill.tier === "allocated" ? "rgba(184,115,51,0.45)" : "rgba(138,138,138,0.4)"}` : pill.border,
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    padding: "8px 16px",
                    borderRadius: "20px",
                    whiteSpace: "nowrap" as const,
                    cursor: "pointer",
                    transition: "background 150ms, color 150ms, border-color 150ms",
                    boxShadow: isActive ? (pill.tier === "unicorn" ? "0 0 8px rgba(196,148,58,0.2)" : "inset 0 1px 0 rgba(255,255,255,0.045)") : "none",
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
                className="dropfeed-detail-panel"
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
                {hiddenCount > 0 ? `${hiddenCount}+ more positive signals tracked` : isPaidUser ? "Paid members can expand deeper into recent history" : "Live feed updates automatically"}
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
