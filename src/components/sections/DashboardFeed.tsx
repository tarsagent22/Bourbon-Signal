"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  type GroupedDrop,
  type DropEvent,
  TIER_CONFIG,
  MULTIPLIER_COLORS,
  formatRelativeTime,
  getEventDescription,
  cleanCountyName,
  getDisplayName,
  lookupPricing,
} from "@/lib/drops";
import { INITIAL_WATCHLIST } from "@/components/sections/DashboardSidebar";
import BottleLink from "@/components/BottleLink";
import CountyLink from "@/components/CountyLink";

const FILTER_TIERS = ["all", "unicorn", "allocated", "limited"] as const;

const NC_COUNTIES = [
  "Wake",
  "Durham",
  "Mecklenburg",
  "Guilford",
  "New Hanover",
  "Buncombe",
] as const;

function TierBadge({ tier }: { tier: string }) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.limited;
  return <span style={config.pillStyle}>{config.label}</span>;
}

function isOnWatchlist(dropName: string): boolean {
  const normalized = dropName.toLowerCase();
  return INITIAL_WATCHLIST.some((w) => {
    const wName = w.name.toLowerCase();
    return normalized.includes(wName) || wName.includes(normalized);
  });
}

interface FeedItemProps {
  drop: GroupedDrop;
  onWatchlist: boolean;
}

function FeedItem({ drop, onWatchlist }: FeedItemProps) {
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
          background: onWatchlist
            ? hovered
              ? "rgba(196, 148, 58, 0.1)"
              : "rgba(196, 148, 58, 0.06)"
            : hovered
              ? "rgba(196, 148, 58, 0.04)"
              : "transparent",
          boxShadow: onWatchlist
            ? "inset 0 0 20px rgba(196, 148, 58, 0.04)"
            : "none",
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
          <div className="flex items-center gap-2">
            <span
              className="truncate"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(15px, 2vw, 15px)",
                fontWeight: 600,
                color: "var(--color-cream)",
                lineHeight: 1.3,
              }}
            >
              <BottleLink name={drop.displayName}>{drop.displayName}</BottleLink>
            </span>
            {onWatchlist && (
              <span
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--color-accent-amber)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                ⚡ ON YOUR WATCHLIST
              </span>
            )}
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
                  {detail.label === "Counties" ? (
                    <span>
                      {drop.counties.map((c, ci) => (
                        <span key={c}>
                          {ci > 0 && ", "}
                          <CountyLink county={c}>{c}</CountyLink>
                        </span>
                      ))}
                    </span>
                  ) : detail.label === "Store" ? (
                    <CountyLink county={detail.value}>{detail.value}</CountyLink>
                  ) : (
                    <span>{detail.value}</span>
                  )}
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
  allDrops: DropEvent[];
  feedFilter: string;
  onFilterChange: (filter: string) => void;
  selectedCounties: string[];
  onCountyToggle: (county: string) => void;
  total?: number;
}

export default function DashboardFeed({
  drops,
  allDrops,
  feedFilter,
  onFilterChange,
  selectedCounties,
  onCountyToggle,
  total,
}: DashboardFeedProps) {
  // Drop velocity computation
  const velocity = useMemo(() => {
    if (allDrops.length === 0) return { thisWeek: 0, avg: 0, level: "normal" as const };
    const latest = Math.max(
      ...allDrops.map((d) => new Date(d.timestamp).getTime())
    );
    const oneWeekAgo = latest - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = latest - 14 * 24 * 60 * 60 * 1000;

    const thisWeek = allDrops.filter(
      (d) => new Date(d.timestamp).getTime() > oneWeekAgo
    ).length;
    const lastWeek = allDrops.filter((d) => {
      const t = new Date(d.timestamp).getTime();
      return t > twoWeeksAgo && t <= oneWeekAgo;
    }).length;

    const avg = Math.round((thisWeek + lastWeek) / 2);
    const level: "high" | "normal" | "low" =
      thisWeek > avg * 1.3 ? "high" : thisWeek < avg * 0.7 ? "low" : "normal";

    return { thisWeek, avg, level };
  }, [allDrops]);

  const velocityColor =
    velocity.level === "high"
      ? "var(--color-success)"
      : velocity.level === "low"
        ? "var(--color-alert)"
        : "var(--color-text-tertiary)";

  const VelocityIcon =
    velocity.level === "high"
      ? TrendingUp
      : velocity.level === "low"
        ? TrendingDown
        : Minus;

  // Filter drops by tier
  const tierFiltered =
    feedFilter === "all"
      ? drops
      : drops.filter((d) => d.rarity_tier === feedFilter);

  // Filter drops by county
  const filtered = useMemo(() => {
    if (selectedCounties.length === 0) return tierFiltered;
    return tierFiltered.filter((d) => {
      const dropCounties = d.counties.map((c) => c.toLowerCase());
      const boardName = cleanCountyName(d.board_name || "").toLowerCase();
      return selectedCounties.some(
        (sc) =>
          dropCounties.some((dc) => dc.includes(sc.toLowerCase())) ||
          boardName.includes(sc.toLowerCase())
      );
    });
  }, [tierFiltered, selectedCounties]);

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

      {/* Header + Velocity */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
        style={{ marginBottom: "16px", gap: "10px" }}
      >
        <div className="flex items-center gap-3">
          <h2
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "24px",
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

        {/* Drop Velocity Indicator */}
        <div
          className="flex items-center gap-2"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
          }}
        >
          <VelocityIcon size={14} style={{ color: velocityColor }} />
          <span>
            Drop activity is{" "}
            <span
              style={{
                fontWeight: 600,
                color: velocityColor,
                textTransform: "uppercase",
                fontSize: "11px",
                letterSpacing: "0.03em",
              }}
            >
              {velocity.level}
            </span>{" "}
            this week (
            <span style={{ fontFamily: "var(--font-jetbrains)", fontWeight: 600 }}>
              {velocity.thisWeek}
            </span>{" "}
            vs{" "}
            <span style={{ fontFamily: "var(--font-jetbrains)" }}>
              {velocity.avg}
            </span>{" "}
            avg)
          </span>
        </div>
      </div>

      {/* Filter pills */}
      <div
        className="flex items-center gap-2 filter-pills-scroll"
        style={{
          marginBottom: "12px",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {FILTER_TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => onFilterChange(tier)}
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "6px 14px",
              borderRadius: "20px",
              border:
                feedFilter === tier
                  ? "1px solid var(--color-accent-amber)"
                  : "1px solid rgba(255,255,255,0.08)",
              background:
                feedFilter === tier
                  ? "rgba(196,148,58,0.15)"
                  : "rgba(255,255,255,0.03)",
              color:
                feedFilter === tier
                  ? "var(--color-accent-amber)"
                  : "var(--color-text-tertiary)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 200ms ease",
              minHeight: "44px",
            }}
          >
            {tier === "all"
              ? "All"
              : tier.charAt(0).toUpperCase() + tier.slice(1)}
          </button>
        ))}
      </div>

      {/* County pills — My Counties */}
      <div
        className="flex items-center gap-2 filter-pills-scroll"
        style={{
          marginBottom: "16px",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          My Counties
        </span>
        {NC_COUNTIES.map((county) => {
          const isSelected = selectedCounties.includes(county);
          return (
            <button
              key={county}
              onClick={() => onCountyToggle(county)}
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontWeight: 500,
                padding: "5px 12px",
                borderRadius: "16px",
                border: isSelected
                  ? "1px solid var(--color-accent-amber)"
                  : "1px solid rgba(255,255,255,0.06)",
                background: isSelected
                  ? "rgba(196,148,58,0.2)"
                  : "rgba(255,255,255,0.03)",
                color: isSelected
                  ? "var(--color-accent-amber)"
                  : "var(--color-text-tertiary)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 200ms ease",
                minHeight: "32px",
              }}
            >
              {county}
            </button>
          );
        })}
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
              <FeedItem
                key={drop.id}
                drop={drop}
                onWatchlist={isOnWatchlist(drop.displayName)}
              />
            ))
          ) : (
            <div
              style={{
                padding: "60px 20px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "18px",
                  color: "var(--color-cream)",
                  marginBottom: "8px",
                }}
              >
                No drops detected recently
              </p>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "var(--color-text-tertiary)",
                  marginBottom: "20px",
                }}
              >
                {selectedCounties.length > 0
                  ? `No ${feedFilter === "all" ? "" : feedFilter + " "}drops in ${selectedCounties.join(", ")}`
                  : "Check back soon or widen your filters"}
              </p>
              <a
                href="/map"
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--color-accent-amber)",
                  background: "transparent",
                  border: "1px solid rgba(196,148,58,0.3)",
                  borderRadius: "8px",
                  padding: "10px 20px",
                  textDecoration: "none",
                  display: "inline-block",
                  transition: "all 200ms ease",
                }}
              >
                Check the Hunt Map
              </a>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Feed footer */}
      {total && total > 0 && (
        <div
          style={{
            textAlign: "center",
            marginTop: "16px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: "var(--color-text-tertiary)",
          }}
        >
          Showing {filtered.length} most recent of {total.toLocaleString()} tracked drops
        </div>
      )}
    </div>
  );
}
