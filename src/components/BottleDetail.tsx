"use client";

import { motion } from "framer-motion";
import { X, Lock, Eye, EyeOff } from "lucide-react";
import type { Bottle } from "@/data/bottles";
import { dropHistory } from "@/data/bottles";
import type { DropHistoryEntry } from "@/data/bottles";
import { useState } from "react";

interface BottleDetailProps {
  bottle: Bottle;
  onClose: () => void;
  isFreeUser?: boolean;
}

const tierColors: Record<string, string> = {
  unicorn: "var(--color-accent-amber)",
  allocated: "var(--color-copper)",
  limited: "var(--color-silver-muted)",
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

export default function BottleDetail({ bottle, onClose, isFreeUser }: BottleDetailProps) {
  const [watching, setWatching] = useState(false);
  const tierColor = tierColors[bottle.tier];
  const multiplier = getMultiplier(bottle);
  const history: DropHistoryEntry[] = dropHistory[bottle.id] || [];

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
          width: "min(480px, 90vw)",
          background: "var(--color-bg-secondary)",
          borderLeft: "1px solid var(--color-card-border)",
          boxShadow: "-8px 0 40px rgba(0, 0, 0, 0.5)",
        }}
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="p-8">
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(13, 11, 7, 0.6)",
                backdropFilter: "blur(8px)",
                border: `1px solid ${tierColor}33`,
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: tierColor,
                marginBottom: "16px",
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
            <div className="flex items-center gap-4 mt-3">
              {bottle.proof && (
                <span
                  style={{
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {bottle.proof} proof
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

          {/* Price Intelligence Card */}
          <div
            className="rounded-lg p-5"
            style={{
              background: "var(--color-card-bg)",
              border: "1px solid var(--color-card-border)",
              marginBottom: "28px",
            }}
          >
            <div className="flex items-start justify-between" style={{ marginBottom: "16px" }}>
              {/* MSRP */}
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: "var(--color-text-tertiary)",
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
                    color: "var(--color-text-primary)",
                  }}
                >
                  ${bottle.msrp.toLocaleString()}
                </p>
              </div>

              {/* Secondary */}
              <div className="text-right">
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: "var(--color-accent-amber)",
                    marginBottom: "6px",
                  }}
                >
                  SECONDARY
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <p
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "24px",
                      fontWeight: 600,
                      color: "var(--color-accent-amber)",
                      filter: isFreeUser ? "blur(10px)" : "none",
                      userSelect: isFreeUser ? "none" : "auto",
                    }}
                  >
                    {bottle.secondary || "N/A"}
                  </p>
                  {isFreeUser && (
                    <Lock size={14} style={{ color: "var(--color-text-tertiary)" }} />
                  )}
                </div>
              </div>
            </div>

            {/* Multiplier */}
            {multiplier && (
              <div className="flex items-center gap-3" style={{ marginBottom: "12px" }}>
                <span
                  className="inline-flex items-center px-3 py-1.5 rounded-full"
                  style={{
                    background: `${tierColor}18`,
                    border: `1px solid ${tierColor}40`,
                    fontFamily: "var(--font-jetbrains)",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: tierColor,
                    filter: isFreeUser ? "blur(10px)" : "none",
                    userSelect: isFreeUser ? "none" : "auto",
                  }}
                >
                  {multiplier}x
                </span>
                {isFreeUser ? (
                  <Lock size={14} style={{ color: "var(--color-text-tertiary)" }} />
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
                    className="px-3 py-1.5 rounded-full"
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "12px",
                      color: "var(--color-accent-amber)",
                      border: "1px solid rgba(196, 135, 10, 0.25)",
                      background: "rgba(196, 135, 10, 0.06)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
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
                className="rounded-lg p-6 text-center"
                style={{
                  background: "var(--color-card-bg)",
                  border: "1px solid var(--color-card-border)",
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
                  className="inline-block px-5 py-2.5 rounded-md"
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#0D0B0E",
                    background:
                      "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                    textDecoration: "none",
                  }}
                >
                  Unlock with Standard Proof
                </a>
              </div>
            ) : history.length > 0 ? (
              <div className="relative" style={{ paddingLeft: "20px" }}>
                {/* Vertical line */}
                <div
                  className="absolute top-1 bottom-1"
                  style={{
                    left: "5px",
                    width: "2px",
                    background: "rgba(196, 135, 10, 0.2)",
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
                        background: i === 0 ? "var(--color-accent-amber)" : "rgba(196, 135, 10, 0.3)",
                        border: i === 0 ? "2px solid rgba(196, 135, 10, 0.4)" : "none",
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
                      {entry.location}
                      {entry.quantity ? ` \u00B7 ${entry.quantity} bottles` : ""}
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
              if (!isFreeUser) setWatching(!watching);
            }}
            className="w-full py-3 rounded-lg cursor-pointer flex items-center justify-center gap-2"
            title={isFreeUser ? "Sign up to watch this bottle" : undefined}
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              fontWeight: 600,
              background: watching
                ? "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)"
                : "transparent",
              color: watching ? "#0D0B0E" : "var(--color-accent-amber)",
              border: watching
                ? "1px solid transparent"
                : "1px solid var(--color-accent-amber)",
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
