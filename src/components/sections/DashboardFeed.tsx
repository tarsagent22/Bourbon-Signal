"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  type GroupedDrop,
  TIER_CONFIG,
  MULTIPLIER_COLORS,
  formatRelativeTime,
  getEventDescription,
  cleanCountyName,
} from "@/lib/drops";
import { BOTTLE_PRICING, type BottlePricing } from "@/data/bottles";

function lookupPricing(
  displayName: string,
  apiRetailPrice?: number
): { msrp?: number; secondary?: string; multiplier?: number } {
  const normalized = displayName.toLowerCase().trim();

  let match: BottlePricing | undefined;
  if (BOTTLE_PRICING[normalized]) {
    match = BOTTLE_PRICING[normalized];
  } else {
    for (const [key, value] of Object.entries(BOTTLE_PRICING)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        match = value;
        break;
      }
    }
  }

  const msrp =
    match?.msrp ||
    (apiRetailPrice && apiRetailPrice > 0 ? apiRetailPrice : undefined);
  const secondary = match?.secondary;
  let multiplier: number | undefined;

  if (match?.secondaryLow && msrp && msrp > 0) {
    const mult = Math.round(match.secondaryLow / msrp);
    if (mult >= 2) multiplier = mult;
  }

  return { msrp, secondary, multiplier };
}

const FILTER_TIERS = ["all", "unicorn", "allocated", "limited"] as const;

function TierBadge({ tier }: { tier: string }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.limited;
  return <span style={config.pillStyle}>{config.label}</span>;
}

interface FeedItemProps {
  drop: GroupedDrop;
}

function FeedItem({ drop }: FeedItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tier = TIER_CONFIG[drop.rarity_tier] || TIER_CONFIG.limited;
  const description = getEventDescription(drop);
  const pricing = lookupPricing(drop.displayName, drop.retail_price);
  const hasPricing = pricing.msrp !== undefined;
  const multColors =
    MULTIPLIER_COLORS[drop.rarity_tier] || MULTIPLIER_COLORS.limited;

  const details: { label: string; value: string }[] = [];
  if (drop.counties.length > 0) {
    details.push({ label: "Counties", value: drop.counties.join(", ") });
  }
  if (drop.retail_price && drop.retail_price > 0) {
    details.push({
      label: "Retail Price",
      value: `$${Math.round(drop.retail_price)}`,
    });
  }
  if (drop.quantity_shipped && drop.quantity_shipped > 0) {
    details.push({
      label: "Quantity",
      value: `${drop.quantity_shipped} cases`,
    });
  }
  if (drop.store_address) {
    const loc = cleanCountyName(drop.store_address);
    if (loc) details.push({ label: "Store", value: loc });
  }

  const hasDetails = details.length > 0;

  return (
    <motion.div layout>
      <div
        className="flex items-center"
        style={{
          padding: "12px 16px",
          borderLeft: `3px solid ${tier.borderColor}`,
          cursor: hasDetails ? "pointer" : "default",
          background: hovered ? "rgba(196, 148, 58, 0.04)" : "transparent",
          transition: "background 200ms",
        }}
        onClick={() => hasDetails && setExpanded(!expanded)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Tier badge */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: "70px" }}
        >
          <TierBadge tier={drop.rarity_tier} />
        </div>

        {/* Name + description */}
        <div
          className="flex-1 min-w-0 flex flex-col justify-center"
          style={{ marginLeft: "8px" }}
        >
          <div
            className="truncate"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(15px, 2vw, 15px)",
              fontWeight: 600,
              color: "var(--color-cream)",
              lineHeight: 1.3,
            }}
          >
            {drop.displayName}
          </div>
          <div
            className="flex items-center gap-2"
            style={{ marginTop: "2px" }}
          >
            <span
              className="truncate"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "rgba(245,237,214,0.5)",
                lineHeight: 1.3,
              }}
            >
              {description}
            </span>
          </div>
        </div>

        {/* Right: pricing + timestamp */}
        <div
          className="hidden md:flex flex-col items-end justify-center shrink-0"
          style={{ marginLeft: "8px", minWidth: "120px" }}
        >
          {hasPricing ? (
            <>
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
              {pricing.secondary && (
                <div
                  className="flex items-center gap-1.5"
                  style={{ marginTop: "2px" }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pricing.secondary}
                  </span>
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
                      }}
                    >
                      {pricing.multiplier}x
                    </span>
                  )}
                </div>
              )}
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
            </>
          ) : (
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
        </div>

        {/* Mobile timestamp */}
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
                padding: "12px 16px 12px 97px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "rgba(245,237,214,0.5)",
              }}
            >
              {details.map((detail, i) => (
                <div
                  key={detail.label}
                  style={{
                    marginBottom: i < details.length - 1 ? "4px" : 0,
                  }}
                >
                  <span
                    style={{
                      color: "rgba(245,237,214,0.35)",
                      marginRight: "8px",
                    }}
                  >
                    {detail.label}:
                  </span>
                  <span>{detail.value}</span>
                </div>
              ))}
              {pricing.secondary && (
                <div
                  style={{
                    marginTop: "6px",
                    paddingTop: "6px",
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span
                    style={{
                      color: "rgba(245,237,214,0.35)",
                      marginRight: "8px",
                    }}
                  >
                    Secondary:
                  </span>
                  <span style={{ color: "var(--color-accent-amber)" }}>
                    {pricing.secondary}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface DashboardFeedProps {
  drops: GroupedDrop[];
}

export default function DashboardFeed({ drops }: DashboardFeedProps) {
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all"
      ? drops
      : drops.filter((d) => d.rarity_tier === filter);

  return (
    <div style={{ flex: "1 1 60%" }}>
      <style>{`
        @keyframes shimmer {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .filter-pills-scroll::-webkit-scrollbar { display: none; }
        .filter-pills-scroll { scrollbar-width: none; }
        @media (max-width: 767px) {
          .dashboard-feed-container { max-height: 400px !important; }
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-center gap-3"
        style={{ marginBottom: "16px" }}
      >
        <h2
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--color-cream)",
            margin: 0,
          }}
        >
          Live Feed
        </h2>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--color-success)",
            animation: "pulseDot 2s ease-in-out infinite",
            flexShrink: 0,
          }}
        />
      </div>

      {/* Filter pills */}
      <div
        className="flex items-center gap-2 filter-pills-scroll"
        style={{
          marginBottom: "16px",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {FILTER_TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => setFilter(tier)}
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "6px 14px",
              borderRadius: "20px",
              border:
                filter === tier
                  ? "1px solid var(--color-accent-amber)"
                  : "1px solid rgba(255,255,255,0.08)",
              background:
                filter === tier
                  ? "rgba(196,148,58,0.15)"
                  : "rgba(255,255,255,0.03)",
              color:
                filter === tier
                  ? "var(--color-accent-amber)"
                  : "var(--color-text-tertiary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 200ms ease",
              minHeight: "44px",
            }}
          >
            {tier === "all" ? "All" : tier.charAt(0).toUpperCase() + tier.slice(1)}
          </button>
        ))}
      </div>

      {/* Feed container */}
      <div
        className="drop-feed-scroll dashboard-feed-container"
        style={{
          maxHeight: "600px",
          overflowY: "auto",
          background: "rgba(0,0,0,0.15)",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <AnimatePresence mode="popLayout">
          {filtered.length > 0 ? (
            filtered.map((drop) => (
              <FeedItem key={drop.id} drop={drop} />
            ))
          ) : (
            <div
              style={{
                padding: "48px 20px",
                textAlign: "center",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                color: "var(--color-text-tertiary)",
              }}
            >
              No {filter} drops in recent feed
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
