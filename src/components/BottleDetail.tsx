"use client";

import { motion } from "framer-motion";
import { X, Eye, EyeOff, Lock, MapPin } from "lucide-react";
import Link from "next/link";
import type { Bottle } from "@/data/bottles";
import { dropHistory, BOTTLE_PRICING } from "@/data/bottles";
import type { DropHistoryEntry } from "@/data/bottles";
import { useState } from "react";
import { useWatchlistStore } from "@/lib/watchlist";
import { useToastStore } from "@/lib/toast";
import CountyLink from "@/components/CountyLink";

interface BottleDetailProps {
  bottle: Bottle;
  onClose: () => void;
  isFreeUser?: boolean;
}

const tierColors: Record<string, string> = {
  unicorn: "#C4943A",
  allocated: "#B87333",
  limited: "#8A8A8A",
};

const tierLabels: Record<string, string> = {
  unicorn: "UNICORN",
  allocated: "ALLOCATED",
  limited: "LIMITED",
};

function getMultiplier(bottle: Bottle): number | null {
  if (!bottle.secondaryLow || !bottle.msrp || bottle.msrp <= 0) return null;
  const mult = Math.round(bottle.secondaryLow / bottle.msrp);
  return mult >= 2 ? mult : null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BottleDetail({
  bottle,
  onClose,
  isFreeUser,
}: BottleDetailProps) {
  const { addBottle, removeBottle, isWatching } = useWatchlistStore();
  const addToast = useToastStore((s) => s.addToast);
  const watching = isWatching(bottle.id);
  const tierColor = tierColors[bottle.tier];

  // Cross-reference secondary pricing from static lookup if not in engine data
  const pricingKey = bottle.name.toLowerCase();
  const pricingData = BOTTLE_PRICING[pricingKey];
  const resolvedSecondary = bottle.secondary || pricingData?.secondary || null;
  const resolvedSecondaryLow = bottle.secondaryLow || pricingData?.secondaryLow;
  const resolvedBottle = {
    ...bottle,
    secondary: resolvedSecondary || undefined,
    secondaryLow: resolvedSecondaryLow,
  };

  const multiplier = getMultiplier(resolvedBottle);
  const history: DropHistoryEntry[] = dropHistory[bottle.id] || [];
  const mostRecentDrop = history.length > 0 ? history[0] : null;

  const isUnicorn = bottle.tier === "unicorn";
  const isAllocated = bottle.tier === "allocated";
  const multiplierBg = isUnicorn
    ? "#C4943A"
    : isAllocated
      ? "#B87333"
      : "#8A8A8A";

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[70]"
        style={{ background: "rgba(0, 0, 0, 0.5)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        className="fixed top-0 right-0 z-[80] h-full overflow-y-auto"
        style={{
          width: "min(480px, 100vw)",
          background: "var(--color-bg-secondary)",
          borderLeft: "1px solid var(--color-card-border)",
          boxShadow: "-8px 0 40px rgba(0, 0, 0, 0.5)",
        }}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div style={{ padding: "32px" }}>
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 cursor-pointer"
            style={{
              color: "var(--color-text-tertiary)",
              background: "none",
              border: "none",
              padding: "4px",
            }}
          >
            <X size={20} />
          </button>

          {/* Header */}
          <div style={{ marginBottom: "32px" }}>
            {/* Tier Badge */}
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                background: "rgba(13, 11, 7, 0.6)",
                backdropFilter: "blur(12px)",
                border: `1px solid ${
                  bottle.tier === "unicorn"
                    ? "rgba(196,148,58,0.3)"
                    : bottle.tier === "allocated"
                      ? "rgba(184,115,51,0.3)"
                      : "rgba(138,138,138,0.25)"
                }`,
                borderRadius: "20px",
                padding: "4px 10px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: tierColor,
                marginBottom: "16px",
                display: "inline-flex",
              }}
            >
              <span
                style={{
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: tierColor,
                }}
              />
              {tierLabels[bottle.tier]}
            </span>

            {/* Bottle Name */}
            <h2
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "32px",
                fontWeight: 700,
                color: "var(--color-cream)",
                lineHeight: 1.2,
                marginBottom: "8px",
              }}
            >
              {bottle.name}
            </h2>

            {/* Distillery */}
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                color: "var(--color-text-tertiary)",
              }}
            >
              {bottle.distillery}
            </p>

            {/* Proof & Age */}
            <div className="flex items-center gap-4" style={{ marginTop: "12px" }}>
              {bottle.proof && (
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {bottle.proof}°
                </span>
              )}
              {bottle.ageStatement && (
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {bottle.ageStatement}
                </span>
              )}
            </div>
          </div>

          {/* Price Intelligence Block — dark inset */}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.25)",
              borderRadius: "8px",
              padding: "20px",
              marginBottom: "28px",
            }}
          >
            <div className="flex items-start justify-between" style={{ marginBottom: "16px" }}>
              {/* MSRP */}
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "9px",
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                    marginBottom: "6px",
                  }}
                >
                  MSRP
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "24px",
                    fontWeight: 600,
                    color: "var(--color-cream)",
                  }}
                >
                  ${bottle.msrp.toLocaleString()}
                </p>
              </div>

              {/* vs — only show when secondary data exists */}
              {resolvedSecondary && (
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontStyle: "italic",
                    color: "var(--color-text-tertiary)",
                    opacity: 0.6,
                    alignSelf: "flex-end",
                    marginBottom: "6px",
                  }}
                >
                  vs
                </span>
              )}

              {/* Secondary */}
              {resolvedSecondary && (
                <div className="text-right">
                  <p
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "9px",
                      fontWeight: 600,
                      letterSpacing: "0.12em",
                      color: "var(--color-amber-rich)",
                      textTransform: "uppercase",
                      marginBottom: "6px",
                    }}
                  >
                    SECONDARY
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "24px",
                      fontWeight: 600,
                      color: "var(--color-amber-rich)",
                      filter: isFreeUser ? "blur(3px)" : "none",
                      userSelect: isFreeUser ? "none" : "auto",
                    }}
                  >
                    {resolvedSecondary}
                  </p>
                </div>
              )}
            </div>

            {/* Multiplier */}
            {multiplier && (
              <div className="flex items-center gap-3" style={{ marginBottom: "12px" }}>
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#1A1510",
                    background: multiplierBg,
                    borderRadius: "20px",
                    padding: "6px 16px",
                    lineHeight: 1,
                    filter: isFreeUser ? "blur(3px)" : "none",
                    userSelect: isFreeUser ? "none" : "auto",
                  }}
                >
                  {multiplier}x
                </span>
                {isFreeUser ? (
                  <Lock
                    size={14}
                    style={{ color: "var(--color-text-tertiary)" }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "13px",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    above retail
                  </span>
                )}
              </div>
            )}

            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
                fontStyle: "italic",
              }}
            >
              Based on recent auction and secondary market data
            </p>
          </div>

          {/* Tasting Profile */}
          {bottle.flavor && bottle.flavor.length > 0 && (
            <div style={{ marginBottom: "28px" }}>
              <h4
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  color: "var(--color-text-tertiary)",
                  marginBottom: "12px",
                  textTransform: "uppercase",
                }}
              >
                Tasting Profile
              </h4>
              <div className="flex flex-wrap gap-2">
                {bottle.flavor.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "12px",
                      color: "var(--color-amber-rich)",
                      border: "1px solid rgba(196, 148, 58, 0.25)",
                      background: "rgba(196, 148, 58, 0.06)",
                      borderRadius: "20px",
                      padding: "4px 12px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* View on Map */}
          {mostRecentDrop && (
            <Link
              href={`/map?lat=35.78&lng=-78.64&zoom=12`}
              className="w-full flex items-center justify-center gap-2"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "8px",
                padding: "10px 16px",
                textDecoration: "none",
                marginBottom: "20px",
                transition: "all 200ms ease",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-amber-rich)";
                e.currentTarget.style.color = "var(--color-accent-amber)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              <MapPin size={14} />
              View on Map — {mostRecentDrop.location}
            </Link>
          )}

          {/* Drop History Timeline */}
          <div style={{ marginBottom: "28px" }}>
            <h4
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: "var(--color-text-tertiary)",
                marginBottom: "16px",
                textTransform: "uppercase",
              }}
            >
              Drop History
            </h4>

            {isFreeUser ? (
              <div
                className="text-center"
                style={{
                  background: "var(--color-card-bg)",
                  border: "1px solid var(--color-card-border)",
                  borderRadius: "8px",
                  padding: "24px",
                }}
              >
                <Lock
                  size={24}
                  style={{
                    color: "var(--color-text-tertiary)",
                    margin: "0 auto 12px",
                  }}
                />
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "16px",
                  }}
                >
                  Drop history is a members-only feature
                </p>
                <a
                  href="/#pricing"
                  className="inline-block"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#1A1510",
                    background:
                      "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    textDecoration: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                  }}
                >
                  Unlock with Standard Proof
                </a>
              </div>
            ) : history.length > 0 ? (
              <div className="relative" style={{ paddingLeft: "20px" }}>
                {/* Vertical amber line */}
                <div
                  className="absolute top-1 bottom-1"
                  style={{
                    left: "5px",
                    width: "2px",
                    background: "rgba(196, 148, 58, 0.2)",
                    borderRadius: "1px",
                  }}
                />

                {history.map((entry, i) => (
                  <div
                    key={i}
                    className="relative"
                    style={{
                      paddingBottom: i < history.length - 1 ? "20px" : "0",
                    }}
                  >
                    {/* Dot */}
                    <div
                      className="absolute"
                      style={{
                        left: "-19px",
                        top: "4px",
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        background:
                          i === 0
                            ? "var(--color-amber-rich)"
                            : "rgba(196, 148, 58, 0.3)",
                        border:
                          i === 0
                            ? "2px solid rgba(196, 148, 58, 0.4)"
                            : "none",
                      }}
                    />
                    <p
                      style={{
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: "12px",
                        color: "var(--color-text-secondary)",
                        marginBottom: "2px",
                      }}
                    >
                      {formatDate(entry.date)}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "12px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      <CountyLink county={entry.location}>{entry.location}</CountyLink>
                      {entry.quantity
                        ? ` \u00B7 ${entry.quantity} bottles`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                No drop history recorded yet.
              </p>
            )}
          </div>

          {/* Watchlist Button */}
          <button
            onClick={() => {
              if (!isFreeUser) {
                if (watching) {
                  removeBottle(bottle.id);
                  addToast(`Removed ${bottle.name} from watchlist`, "bookmark-x");
                } else {
                  addBottle(bottle.id);
                  addToast(`Added ${bottle.name} to watchlist`, "bookmark");
                }
              }
            }}
            className="w-full flex items-center justify-center gap-2 cursor-pointer"
            title={isFreeUser ? "Sign up to watch this bottle" : undefined}
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              fontWeight: 600,
              background: watching
                ? "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)"
                : "transparent",
              color: watching ? "#1A1510" : "var(--color-amber-rich)",
              border: watching
                ? "1px solid transparent"
                : "1px solid var(--color-amber-rich)",
              borderRadius: "8px",
              padding: "12px",
              opacity: isFreeUser ? 0.5 : 1,
              transition: "all 300ms ease",
            }}
          >
            {watching ? <EyeOff size={16} /> : <Eye size={16} />}
            {watching ? "Watching" : "Add to Watchlist"}
          </button>
        </div>
      </motion.div>
    </>
  );
}
