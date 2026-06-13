"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import CountyLink from "@/components/CountyLink";
import {
  type DropEvent,
  type GroupedDrop,
  type DropLocation,
  groupDrops,
  formatDropTime,
  cleanCountyName,
  formatStateLabel,
  lookupPricing,
  TIER_CONFIG,
} from "@/lib/drops";
import DataFreshness from "@/components/DataFreshness";
import { AVAILABLE_STATES, useStatePreferences } from "@/lib/statePreferences";
import { useAuth } from "@/lib/auth";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import { useSightings } from "@/hooks/useSightings";
import { useStores } from "@/hooks/useStores";
import { makeSightingId, type MemberSighting, type SignalReportKind } from "@/lib/sightings";

type DropSortMode = "newest" | "nearby" | "rarity" | "az";

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

function memberSightingToGrouped(sighting: MemberSighting): GroupedDrop {
  return {
    displayName: sighting.bottleName,
    event_type: "user_sighting",
    rarity_tier: "limited",
    timestamp: sighting.createdAt,
    counties: sighting.storeCity ? [sighting.storeCity] : [],
    store_address: sighting.storeAddress,
    retail_price: sighting.price ?? undefined,
    quantity_in_stock: sighting.quantityEstimate ? 1 : undefined,
    state: sighting.storeState,
    id: sighting.id,
    signalLabel: "User submitted",
    confidenceTier: "member_sighting",
    availabilityScope: "exact",
    exactStore: true,
    locationPrecision: "store_level",
    canAlertAsInventory: false,
    signalCategory: "community",
    displayState: sighting.storeState,
    locations: [
      {
        label: sighting.storeName,
        city: sighting.storeCity,
        address: sighting.storeAddress,
        quantity: sighting.quantityEstimate ? 1 : undefined,
      },
    ],
    ...(sighting.quantityEstimate ? { userQuantityEstimate: sighting.quantityEstimate } : {}),
    ...(sighting.notes ? { userNotes: sighting.notes } : {}),
    isUserSighting: true,
  } as GroupedDrop;
}

function normalizeFilterText(value?: string | null) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function dropCountyCandidates(drop: GroupedDrop) {
  return Array.from(
    new Set(
      [
        ...(drop.counties || []),
        drop.board_name,
        drop.locations[0]?.label,
        drop.locations[0]?.city,
      ]
        .map((value) => cleanCountyName(String(value || "")).trim())
        .filter(Boolean)
    )
  );
}

function getDropRarityRank(drop: GroupedDrop) {
  return drop.rarity_tier === "unicorn" ? 3 : drop.rarity_tier === "allocated" ? 2 : 1;
}

function distanceMiles(a?: { lat: number; lng: number } | null, b?: { lat?: number; lng?: number }) {
  if (!a || b?.lat == null || b?.lng == null) return Number.POSITIVE_INFINITY;
  const r = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  return 2 * r * Math.asin(Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng));
}

function latestSignalRows(drops: DropEvent[], limit: number = 20): GroupedDrop[] {
  const rows: GroupedDrop[] = [];
  for (const drop of drops) {
    if (
      (drop.state === "NC" || drop.state_code === "NC") &&
      (drop.event_type === "nc_statewide_warehouse_stock" || drop.availability_scope === "warehouse")
    ) {
      continue;
    }
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
  }
  if (drop.state !== "PA") return null;
  if (drop.confidenceTier === "exact_store" || drop.availabilityScope === "exact" || drop.exactStore) {
    return { label: "PA source", tone: "exact" };
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
    return { label: "Source-reported", caption: "Store-level signal; verify before driving", tone: "exact" };
  }

  if (drop.state === "KY" || drop.confidenceTier?.startsWith("official")) {
    return { label: "Official", caption: "Official source signal", tone: "official" };
  }

  if (drop.state === "NC" && drop.event_type === "nc_board_shipment_snapshot") {
    return { label: "Official", caption: "Board-level shipment", tone: "official" };
  }

  return { label: "Positive", caption: "Noise-filtered", tone: "positive" };
}

function getEventDescription(drop: GroupedDrop): string {
  if (drop.signalLabel) {
    if (drop.locations.length > 1) {
      return `${drop.locations.length} locations`;
    }
    const loc = drop.locations[0]?.label || cleanCountyName(drop.store_address || drop.board_name || "");
    return loc || "Recent bottle drop";
  }

  if (drop.state === "KY") {
    switch (drop.event_type) {
      case "in_stock":
        return "Available - distillery";
      case "in_store":
        return "Pickup window open";
      case "new_allocation":
        return "Entry window open";
      case "allocation_assigned":
        return "Winner notice";
      case "restock":
        return "Official update";
      default:
        return "Kentucky bottle release";
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
      return `Availability reported${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "browser_assisted_store_inventory_limited_supply": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `Limited supply reported${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "browser_assisted_store_inventory_in_stock": {
      const loc = cleanCountyName(drop.store_address || drop.board_name || "");
      return `Availability reported${loc ? ` \u00B7 ${loc}` : ""}`;
    }
    case "allocation_assigned": {
      return "Allocation assigned";
    }
    default:
      return "Recent bottle drop";
  }
}

function getPrimarySignalMeta(drop: GroupedDrop, locationSummary: string, stateLabel: string) {
  const parts = [stateLabel, locationSummary].filter(Boolean);
  return parts.join(" · ") || "Recent drop or shipment";
}

function TierBadge({ tier }: { tier: string }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.limited;
  return (
    <span className={`drop-tier-badge tier-${tier}`} style={{ borderColor: config.borderColor }}>
      {config.label}
    </span>
  );
}

interface FeedRowProps {
  drop: GroupedDrop;
  isNew: boolean;
  index: number;
  isFreeUser: boolean;
  reportKind?: SignalReportKind;
  onReport?: (drop: GroupedDrop, kind: SignalReportKind) => void;
}

function FeedRow({ drop, isNew, index, isFreeUser, reportKind, onReport }: FeedRowProps) {
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
  const primaryMeta = getPrimarySignalMeta(drop, locationSummary, stateLabel);
  const signalLabel = drop.signalLabel || "Bottle drop";
  const pricing = lookupPricing(drop.displayName, drop.retail_price ?? undefined);
  const hasPricing = pricing.msrp !== undefined;
  const isUserSighting = Boolean((drop as GroupedDrop & { isUserSighting?: boolean }).isUserSighting);
  const userQuantityEstimate = (drop as GroupedDrop & { userQuantityEstimate?: string }).userQuantityEstimate;
  const canQuickReport = !isUserSighting && (drop.canAlertAsInventory || drop.exactStore || drop.availabilityScope === "exact" || drop.locationPrecision === "store_level");
  const addSightingHref = `/sightings?bottle=${encodeURIComponent(drop.displayName)}${drop.state ? `&state=${encodeURIComponent(drop.state)}` : ""}`;

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
    details.push({ label: "Drop type", value: drop.signalLabel });
  }
  if (isUserSighting) {
    details.push({ label: "Evidence", value: "Submitted by a member; verify before driving" });
  } else {
    details.push({ label: "Evidence", value: `${accuracyBadge.label} · ${accuracyBadge.caption}` });
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
  if (drop.retail_price && drop.retail_price > 0) {
    details.push({ label: "Retail Price", value: `$${Math.round(drop.retail_price)}` });
  }
  if (drop.quantity_shipped && drop.quantity_shipped > 0) {
    details.push({ label: drop.event_type === "nc_board_shipment_snapshot" ? "Board received" : "Shipped", value: `${drop.quantity_shipped} unit${drop.quantity_shipped === 1 ? "" : "s"}` });
  }
  if (isUserSighting && userQuantityEstimate) {
    details.push({ label: "Member estimate", value: userQuantityEstimate });
  } else if (drop.quantity_in_stock && drop.quantity_in_stock > 0) {
    details.push({ label: drop.event_type === "nc_statewide_warehouse_stock" ? "Warehouse" : "Source-reported", value: `${drop.quantity_in_stock} unit${drop.quantity_in_stock === 1 ? "" : "s"}` });
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

        <div className="flex items-center justify-between gap-3" style={{ marginBottom: "8px" }}>
          <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
            <TierBadge tier={drop.rarity_tier} />
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

          <div className="dropfeed-card-meta flex items-center gap-2" style={{ minWidth: 0 }}>
            {hasPricing && (
              <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "rgba(245,237,214,0.5)", whiteSpace: "nowrap" }}>
                ${pricing.msrp} MSRP
              </span>
            )}
            <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "10px", color: "rgba(245,237,214,0.38)", whiteSpace: "nowrap" }}>
              {formatDropTime(drop)}
            </span>
          </div>
        </div>

        <div
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "21px",
            fontWeight: 700,
            color: "var(--color-cream)",
            lineHeight: 1.05,
            letterSpacing: "-0.015em",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {drop.displayName}
        </div>

        {isUserSighting ? (
          <div style={{ marginTop: "8px", display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid rgba(196,148,58,0.28)", background: "rgba(196,148,58,0.09)", borderRadius: "999px", padding: "5px 8px", color: "rgba(232,201,122,0.95)", fontFamily: "var(--font-jetbrains)", fontSize: "9px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            User submitted
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3" style={{ marginTop: "12px", paddingTop: "11px", borderTop: "1px solid rgba(245,237,214,0.07)" }}>
          <div className="min-w-0">
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 650, color: "rgba(245,237,214,0.86)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {primaryMeta}
            </div>
          </div>

          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            {hasDetails ? <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "rgba(245,237,214,0.38)" }}>Details</span> : null}
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
          <span>{signalLabel}</span>
          <span style={{ color: "rgba(245,237,214,0.34)" }}>{hasDetails ? "Tap for details" : "More shown"}</span>
        </div>

        {!isFreeUser ? (
          <div className="flex items-center gap-2" style={{ marginTop: "11px", flexWrap: "wrap" }} onClick={(event) => event.stopPropagation()}>
            {canQuickReport ? (
              <>
                <button type="button" className={`sighting-chip ${reportKind === "seen" ? "active" : ""}`} onClick={() => onReport?.(drop, "seen")}>Seen</button>
                <button type="button" className={`sighting-chip ${reportKind === "not_seen" ? "active caution" : ""}`} onClick={() => onReport?.(drop, "not_seen")}>Not seen</button>
              </>
            ) : !isUserSighting ? (
              <a className="sighting-chip" href={addSightingHref}>Add sighting</a>
            ) : null}
          </div>
        ) : null}

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
        {/* Center: name + description */}
        <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ marginLeft: "0" }}>
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
          <div className="flex items-center gap-2" style={{ marginTop: "2px", flexWrap: "wrap" }}>
            <TierBadge tier={drop.rarity_tier} />
            {isUserSighting ? (
              <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: "9px", fontWeight: 800, letterSpacing: "0.08em", color: "rgba(232,201,122,0.95)", background: "rgba(196,148,58,0.09)", border: "1px solid rgba(196,148,58,0.26)", padding: "2px 6px", borderRadius: "999px", textTransform: "uppercase" }}>
                User submitted
              </span>
            ) : null}
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
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "rgba(245,237,214,0.5)",
                lineHeight: 1.3,
              }}
            >
              {primaryMeta}
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

        {!isFreeUser ? (
          <div className="hidden md:flex items-center gap-2" style={{ marginLeft: "10px" }} onClick={(event) => event.stopPropagation()}>
            {canQuickReport ? (
              <>
                <button type="button" className={`sighting-chip ${reportKind === "seen" ? "active" : ""}`} onClick={() => onReport?.(drop, "seen")}>Seen</button>
                <button type="button" className={`sighting-chip ${reportKind === "not_seen" ? "active caution" : ""}`} onClick={() => onReport?.(drop, "not_seen")}>Not seen</button>
              </>
            ) : !isUserSighting ? (
              <a className="sighting-chip" href={addSightingHref}>Add sighting</a>
            ) : null}
          </div>
        ) : null}

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
              {formatDropTime(drop)}
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
              {formatDropTime(drop)}
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
            {formatDropTime(drop)}
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
                      {stateLabel ? `${stateLabel} drop/shipment` : "Drop/shipment"}
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {visibleLocations.map((location: DropLocation) => {
                        const destinationLabel = drop.signalCategory === "delivery" ? "Shipment destination" : "Source location";
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
                                  : `${location.quantity} bottle${location.quantity === 1 ? "" : "s"} reported`}
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
  } = useStatePreferences();
  const { isSignedIn } = useAuth();
  const { prefs } = useAreaPreferences();
  const { sightings, reportsBySignalId, addSignalReport } = useSightings(isSignedIn);
  const { stores } = useStores();
  const areaPrefs = prefs.areaPreferences;
  const isFreeUser = !isSignedIn;
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
  const [bottleSearch, setBottleSearch] = useState("");
  const [urlStateFilter, setUrlStateFilter] = useState<string | null>(null);
  const [countyFilter, setCountyFilter] = useState("ALL");
  const [sortMode, setSortMode] = useState<DropSortMode>("newest");
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null);
  const [nearMeStatus, setNearMeStatus] = useState<string | null>(null);
  const [visibleDropCount, setVisibleDropCount] = useState(() => (isSignedIn ? 10 : 7));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextDropOffset, setNextDropOffset] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bottleParam = params.get("bottle") || "";
    const stateParam = params.get("state")?.toUpperCase() || null;
    if (bottleParam) setBottleSearch(bottleParam);
    if (stateParam) setUrlStateFilter(stateParam);
  }, []);

  const feedStateParam = urlStateFilter || (hasSelectedStates && preferredStates.length === 1
    ? preferredStates[0]
    : !hasSelectedStates && isSignedIn && areaPrefs.states.length === 1
      ? areaPrefs.states[0]
      : null);

  const fetchDrops = useCallback(async () => {
    try {
      const query = new URLSearchParams({ limit: "200" });
      if (feedStateParam) query.set("state", feedStateParam);
      const res = await fetch(`/api/drops?${query.toString()}`);
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
      setNextDropOffset((json.offset ?? 0) + (json.limit ?? json.drops.length));
      setVisibleDropCount(isSignedIn ? 10 : 7);
      const nowIso = new Date().toISOString();
      setLastFetch(nowIso);
      setSecondsUntilRefresh(POLL_INTERVAL_SECONDS);
    } catch {
      setError(true);
    }
  }, [feedStateParam, isSignedIn]);

  useEffect(() => {
    setVisibleDropCount(isSignedIn ? 10 : 7);
  }, [isSignedIn, hasSelectedStates, preferredStates.join("|"), feedStateParam, activeTiers, bottleSearch, countyFilter, sortMode]);


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

  const storeCoordinateLookup = new Map<string, { lat: number; lng: number }>();
  for (const store of stores) {
    if (store.lat == null || store.lng == null) continue;
    const keys = [store.address, store.displayLabel, store.name]
      .map(normalizeFilterText)
      .filter(Boolean);
    for (const key of keys) storeCoordinateLookup.set(key, { lat: store.lat, lng: store.lng });
  }

  const getDropDistance = (drop: GroupedDrop) => {
    if (!nearMe) return Number.POSITIVE_INFINITY;
    const keys = [drop.store_address, drop.locations[0]?.address, drop.locations[0]?.label]
      .map(normalizeFilterText)
      .filter(Boolean);
    let best = Number.POSITIVE_INFINITY;
    for (const [storeKey, coords] of storeCoordinateLookup.entries()) {
      if (!keys.some((key) => key && (storeKey.includes(key) || key.includes(storeKey)))) continue;
      best = Math.min(best, distanceMiles(nearMe, coords));
    }
    return best;
  };

  const matchesActiveFeedFilters = (drop: GroupedDrop) => {
    // State filtering via URL signal links or the feed state selector.
    if (feedStateParam && drop.state && drop.state !== feedStateParam) return false;
    if (activeTiers.size > 0 && !activeTiers.has(drop.rarity_tier)) return false;
    const bottleNeedle = normalizeFilterText(bottleSearch);
    if (bottleNeedle && !normalizeFilterText(drop.displayName).includes(bottleNeedle)) return false;
    if (countyFilter !== "ALL") {
      const countyNeedle = normalizeFilterText(countyFilter);
      if (!dropCountyCandidates(drop).some((county) => normalizeFilterText(county).includes(countyNeedle))) return false;
    }
    if (sortMode === "nearby" && nearMe && getDropDistance(drop) === Number.POSITIVE_INFINITY) return false;
    return true;
  };

  const matchesSavedAreaPreferences = (drop: GroupedDrop) => {
    // The drop-feed state selector is an explicit browsing control and must
    // override saved alert-area preferences. Saved areas are only a default
    // when the user has not chosen a feed state/filter in this session.
    if (feedStateParam || hasSelectedStates) return true;

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
  };

  // Apply state, tier, bottle, county, near-me, and saved-area filters.
  const filteredGrouped = grouped.filter(matchesActiveFeedFilters);
  const filteredByArea = filteredGrouped.filter(matchesSavedAreaPreferences);

  const countyOptions = Array.from(
    new Set(
      grouped
        .filter((drop) => {
          if (feedStateParam && drop.state && drop.state !== feedStateParam) return false;
          return activeTiers.size === 0 || activeTiers.has(drop.rarity_tier);
        })
        .flatMap(dropCountyCandidates)
        .map((county) => county.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const memberSightingRows = isSignedIn ? sightings.map(memberSightingToGrouped) : [];
  const finalFeed = [...memberSightingRows, ...filteredByArea].sort((a, b) => {
    if (sortMode === "az") return a.displayName.localeCompare(b.displayName) || +new Date(b.timestamp) - +new Date(a.timestamp);
    if (sortMode === "rarity") return getDropRarityRank(b) - getDropRarityRank(a) || +new Date(b.timestamp) - +new Date(a.timestamp);
    if (sortMode === "nearby" && nearMe) return getDropDistance(a) - getDropDistance(b) || +new Date(b.timestamp) - +new Date(a.timestamp);
    return +new Date(b.timestamp) - +new Date(a.timestamp);
  });
  const selectedStateLabel = feedStateParam ? AVAILABLE_STATES.find((state) => state.code === feedStateParam)?.name || feedStateParam : null;

  const baseVisibleCount = isSignedIn ? visibleDropCount : 7;
  const canShowMore = isSignedIn && (finalFeed.length > baseVisibleCount || !!data?.hasMore);
  const displayedGrouped = finalFeed.slice(0, baseVisibleCount);
  const hiddenCount = data ? Math.max(0, data.total - grouped.length) + Math.max(0, finalFeed.length - displayedGrouped.length) : 0;
  const feedStateOptions = AVAILABLE_STATES.filter((state) => state.active && !("comingSoon" in state && state.comingSoon));
  const stateFilterSummary = !hasSelectedStates || preferredStates.length === 0
    ? "Showing all covered states"
    : `Showing ${preferredStates.map((code) => AVAILABLE_STATES.find((state) => state.code === code)?.name || code).join(", ")}`;
  const stateDropdownValue = !hasSelectedStates || preferredStates.length === 0
    ? "ALL"
    : preferredStates.length === 1
      ? preferredStates[0]
      : "MULTI";

  const fetchOlderDrops = async () => {
    if (!isSignedIn || isLoadingMore) return;
    let nextOffset = nextDropOffset;
    if (data && data.total <= nextOffset) return;

    setIsLoadingMore(true);
    try {
      let latestJson: DropsResponse | null = null;
      let accumulated: GroupedDrop[] = [];
      let accumulatedMatchingCount = 0;
      let attempts = 0;
      const existingIds = new Set(grouped.map((drop) => drop.id));

      while (attempts < 24) {
        const query = new URLSearchParams({ limit: "100", offset: String(nextOffset) });
        if (feedStateParam) query.set("state", feedStateParam);
        const res = await fetch(`/api/drops?${query.toString()}`);
        if (!res.ok) throw new Error("fetch failed");
        const json: DropsResponse = await res.json();
        latestJson = json;

        const sourceDrops = json.drops.length > 0 ? json.drops : [];
        const nextRows = latestSignalRows(sourceDrops, 100).filter((drop) => !existingIds.has(drop.id));
        for (const row of nextRows) existingIds.add(row.id);
        accumulated = [...accumulated, ...nextRows];
        accumulatedMatchingCount += nextRows.filter((drop) => matchesActiveFeedFilters(drop) && matchesSavedAreaPreferences(drop)).length;

        nextOffset = (json.offset ?? nextOffset) + (json.limit ?? sourceDrops.length);
        const exhausted = !json.hasMore || nextOffset >= json.total || sourceDrops.length === 0;
        if (accumulatedMatchingCount >= 10 || exhausted) break;
        attempts += 1;
      }

      setNextDropOffset(nextOffset);
      if (latestJson) {
        setData((prev) => prev ? { ...prev, total: latestJson.total, hasMore: latestJson.hasMore && nextOffset < latestJson.total, offset: 0, limit: latestJson.limit } : latestJson);
      }

      if (!accumulated.length) return;

      setGrouped((prev) => {
        const currentIds = new Set(prev.map((drop) => drop.id));
        const nextGrouped = accumulated.filter((drop) => !currentIds.has(drop.id));
        return [...prev, ...nextGrouped].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
      });
      if (accumulatedMatchingCount > 0) {
        setVisibleDropCount((prev) => prev + Math.min(10, accumulatedMatchingCount));
      }
    } catch {
      setError(true);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const showNextDrops = () => {
    const alreadyLoadedMatching = finalFeed.length - baseVisibleCount;
    if (alreadyLoadedMatching > 0) {
      setVisibleDropCount((prev) => prev + Math.min(10, alreadyLoadedMatching));
      return;
    }
    fetchOlderDrops();
  };

  const activateNearMe = () => {
    if (nearMe) {
      setSortMode("nearby");
      setNearMeStatus("Sorting exact-store signals near you.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNearMeStatus("Location is not available in this browser. Try county filtering instead.");
      return;
    }
    setNearMeStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNearMe({ lat: position.coords.latitude, lng: position.coords.longitude });
        setSortMode("nearby");
        setNearMeStatus("Showing mappable store-level signals closest to you first.");
      },
      () => setNearMeStatus("Could not use location. Try a county filter instead."),
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const handleSignalReport = (drop: GroupedDrop, kind: SignalReportKind) => {
    addSignalReport({
      id: makeSightingId("report"),
      signalId: drop.id,
      bottleName: drop.displayName,
      storeName: drop.locations[0]?.label,
      storeAddress: drop.locations[0]?.address || drop.store_address,
      state: drop.state,
      kind,
      createdAt: new Date().toISOString(),
    }).catch(() => undefined);
  };

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
          .dropfeed-filter-row {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px !important;
            overflow: visible !important;
            padding-bottom: 12px !important;
            margin-left: 0 !important;
            width: 100%;
            scrollbar-width: none;
          }
          .dropfeed-filter-row::-webkit-scrollbar { display:none; }
          .dropfeed-filter-row button {
            width: 100% !important;
            min-width: 0 !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            text-align: center;
          }
          .dropfeed-card-meta {
            gap: 6px !important;
          }
          .dropfeed-card-meta span {
            font-size: 9px !important;
          }
          .dropfeed-detail-panel { padding: 4px 2px 14px 8px !important; }
        }
        .sighting-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(245,237,214,0.12);
          background: rgba(245,237,214,0.045);
          color: rgba(245,237,214,0.62);
          border-radius: 999px;
          padding: 5px 9px;
          font-family: var(--font-dm-sans);
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          text-decoration: none;
          cursor: pointer;
          transition: background 150ms, color 150ms, border-color 150ms;
        }
        .sighting-chip:hover,
        .sighting-chip.active {
          border-color: rgba(196,148,58,0.42);
          background: rgba(196,148,58,0.12);
          color: rgba(232,201,122,0.98);
        }
        .sighting-chip.caution,
        .sighting-chip.active.caution {
          border-color: rgba(255,180,120,0.32);
          background: rgba(255,120,80,0.1);
          color: rgba(255,206,184,0.96);
        }
        .drop-tier-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid currentColor;
          border-radius: 999px;
          padding: 4px 8px 3px;
          font-family: var(--font-jetbrains);
          font-size: 9px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .drop-tier-badge.tier-unicorn {
          color: #120d08;
          background: linear-gradient(135deg, #C4943A 0%, #E8C97A 52%, #C4943A 100%);
          border-color: rgba(232,201,122,0.8) !important;
        }
        .drop-tier-badge.tier-allocated {
          color: #FFD5A0;
          background: rgba(184,115,51,0.22);
          border-color: rgba(184,115,51,0.48) !important;
        }
        .drop-tier-badge.tier-limited {
          color: rgba(245,237,214,0.72);
          background: rgba(138,138,138,0.16);
          border-color: rgba(138,138,138,0.35) !important;
        }
        .dropfeed-refine-grid {
          display: grid;
          grid-template-columns: minmax(160px, 1.25fr) minmax(130px, 0.9fr) minmax(110px, 0.7fr) auto;
          gap: 10px;
          align-items: end;
        }
        .dropfeed-refine-field span {
          display: block;
          margin-bottom: 6px;
          font-family: var(--font-jetbrains);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(245,237,214,0.42);
        }
        .dropfeed-refine-field input,
        .dropfeed-refine-field select {
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(212,146,11,0.18);
          background: rgba(20,16,12,0.82);
          color: var(--color-cream);
          font-family: var(--font-dm-sans);
          font-size: 13px;
          font-weight: 600;
          padding: 11px 12px;
          outline: none;
        }
        .dropfeed-near-me {
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(196,148,58,0.28);
          background: rgba(196,148,58,0.08);
          color: rgba(245,237,214,0.76);
          font-family: var(--font-dm-sans);
          font-size: 13px;
          font-weight: 800;
          padding: 0 15px;
          cursor: pointer;
          white-space: nowrap;
        }
        .dropfeed-near-me.active,
        .dropfeed-near-me:hover {
          background: rgba(196,148,58,0.16);
          color: var(--color-cream);
          border-color: rgba(196,148,58,0.5);
        }
        .dropfeed-location-status {
          margin: -4px 0 14px;
          color: rgba(245,237,214,0.45);
          font-family: var(--font-dm-sans);
          font-size: 12px;
          line-height: 1.45;
        }
        @media (max-width: 767px) {
          .dropfeed-refine-grid { grid-template-columns: 1fr 1fr; }
          .dropfeed-refine-search { grid-column: 1 / -1; }
          .dropfeed-near-me { width: 100%; }
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
            "radial-gradient(ellipse 72% 56% - 50% 18%, rgba(196,148,58,0.16) 0%, rgba(196,148,58,0.07) 34%, rgba(196,148,58,0.025) 56%, transparent 74%), linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 24%, transparent 100%)",
        }}
      />

      <div className="dropfeed-shell" style={{ width: "100%", maxWidth: "680px", paddingLeft: "16px", paddingRight: "16px", position: "relative", zIndex: 1 }}>
        <div>
          {/* Header row */}
          <motion.div
            className="flex items-center justify-between gap-4"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
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
            </div>
          </motion.div>

          {/* Divider */}
          <div style={{ margin: "16px 0", borderBottom: "1px solid rgba(196, 148, 58, 0.2)" }} />

          <motion.div
            className="dropfeed-state-panel"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="dropfeed-state-panel-head">
              <div>
                <span>State coverage</span>
                <strong>{stateFilterSummary}</strong>
              </div>
              {hasSelectedStates && preferredStates.length > 0 ? (
                <button type="button" onClick={() => setSelectedStates([])}>Show all</button>
              ) : null}
            </div>
            <label style={{ display: "block", marginTop: "12px" }}>
              <span className="sr-only">Filter drop feed by state</span>
              <select
                value={stateDropdownValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "ALL") {
                    setSelectedStates([]);
                    return;
                  }
                  setSelectedStates([value]);
                }}
                aria-label="Filter drop feed by state"
                className="bourbon-select"
                style={{
                  width: "100%",
                  borderRadius: "14px",
                  border: "1px solid rgba(212,146,11,0.22)",
                  background: "rgba(20, 16, 12, 0.86)",
                  color: "var(--color-cream)",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 600,
                  padding: "12px 14px",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="ALL">All covered states</option>
                {stateDropdownValue === "MULTI" ? <option value="MULTI">Multiple selected</option> : null}
                {feedStateOptions.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name} ({state.code})
                  </option>
                ))}
              </select>
            </label>
          </motion.div>

          <motion.div
            className="dropfeed-refine-grid"
            style={{ paddingBottom: "14px" }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: 0.6, delay: 0.04, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <label className="dropfeed-refine-field dropfeed-refine-search">
              <span>Find bottle</span>
              <input
                value={bottleSearch}
                onChange={(event) => setBottleSearch(event.target.value)}
                placeholder="Search live drops…"
              />
            </label>
            <label className="dropfeed-refine-field">
              <span>County / area</span>
              <select value={countyFilter} onChange={(event) => setCountyFilter(event.target.value)}>
                <option value="ALL">All counties</option>
                {countyOptions.map((county) => (
                  <option key={county} value={county}>{county}</option>
                ))}
              </select>
            </label>
            <label className="dropfeed-refine-field">
              <span>Sort</span>
              <select value={sortMode} onChange={(event) => {
                const next = event.target.value as DropSortMode;
                if (next === "nearby" && !nearMe) {
                  activateNearMe();
                  return;
                }
                setSortMode(next);
              }}>
                <option value="newest">Newest</option>
                <option value="nearby">Nearby</option>
                <option value="rarity">Rarity</option>
                <option value="az">Bottle A–Z</option>
              </select>
            </label>
            <button type="button" className={`dropfeed-near-me ${sortMode === "nearby" ? "active" : ""}`} onClick={activateNearMe}>
              Near me
            </button>
          </motion.div>
          {nearMeStatus ? <div className="dropfeed-location-status">{nearMeStatus}</div> : null}

          {/* Filters row: Tier filter pills */}
          <motion.div
            className="dropfeed-filter-row flex items-center flex-wrap gap-2"
            style={{ paddingBottom: "16px" }}
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Tier filter pills */}
            {[
              { tier: "all", label: "All drops", activeBg: "rgba(245,237,214,0.13)", activeColor: "var(--color-cream)", inactiveBg: "rgba(245,237,214,0.035)", inactiveColor: "rgba(245,237,214,0.5)", border: "1px solid rgba(245,237,214,0.12)" },
              { tier: "unicorn", label: "Unicorn", activeBg: "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)", activeColor: "#0D0B07", inactiveBg: "rgba(196,148,58,0.08)", inactiveColor: "rgba(196,148,58,0.5)", border: "1px solid rgba(196,148,58,0.25)" },
              { tier: "allocated", label: "Allocated", activeBg: "rgba(184,115,51,0.3)", activeColor: "#D4943A", inactiveBg: "rgba(184,115,51,0.06)", inactiveColor: "rgba(184,115,51,0.45)", border: "1px solid rgba(184,115,51,0.2)" },
              { tier: "limited", label: "Limited", activeBg: "rgba(138,138,138,0.22)", activeColor: "#AAAAAA", inactiveBg: "rgba(138,138,138,0.05)", inactiveColor: "rgba(138,138,138,0.4)", border: "1px solid rgba(138,138,138,0.18)" },
            ].map((pill) => {
              const isAll = pill.tier === "all";
              const isActive = isAll ? activeTiers.size === 0 : activeTiers.has(pill.tier);
              return (
                <motion.button
                  key={pill.tier}
                  initial={false}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
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
          {data?.fallback && (
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
              Fresh scan was thin, so this feed is holding on the most recent valid drops instead of going blank.
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
                Live feed is temporarily unavailable, so this preview is showing sample activity instead of live drops.
              </div>
              <AnimatePresence mode="popLayout">
                {groupDrops(MOCK_DROPS).map((drop, index) => (
                  <FeedRow
                    key={drop.id}
                    drop={drop}
                    isNew={false}
                    index={index}
                    isFreeUser={isFreeUser}
                    reportKind={reportsBySignalId.get(drop.id)?.kind}
                    onReport={handleSignalReport}
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
              <div>
                {displayedGrouped.length === 0 ? (
                  <div
                    style={{
                      marginBottom: "18px",
                      padding: "18px",
                      borderRadius: "16px",
                      border: "1px solid rgba(212,146,11,0.16)",
                      background: "rgba(212,146,11,0.05)",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "14px",
                      color: "rgba(245,237,214,0.68)",
                      lineHeight: 1.6,
                    }}
                  >
                    No current drops match {selectedStateLabel ? `${selectedStateLabel}` : "these filters"}. Try Show all, another state, or a broader rarity filter.
                  </div>
                ) : null}
                <AnimatePresence mode="popLayout">
                  {displayedGrouped.map((drop, index) => (
                    <FeedRow
                      key={drop.id}
                      drop={drop}
                      isNew={newIds.has(drop.id)}
                      index={index}
                      isFreeUser={isFreeUser}
                      reportKind={reportsBySignalId.get(drop.id)?.kind}
                      onReport={handleSignalReport}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {canShowMore && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: "18px" }}>
                  <button
                    type="button"
                    onClick={showNextDrops}
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
                    {isLoadingMore ? "Loading older drops…" : "See more"}
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
                {hiddenCount > 0 ? `${hiddenCount}+ more drops tracked` : isSignedIn ? "Newest drops stay at the top as you expand the feed" : "Live feed updates automatically"}
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

