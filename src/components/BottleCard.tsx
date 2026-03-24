"use client";

import { motion } from "framer-motion";
import { fadeUpVariant } from "@/lib/animations";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Bottle } from "@/data/bottles";

interface BottleCardProps {
  bottle: Bottle;
  onClick: () => void;
  isBlurred?: boolean;
  blurAmount?: number;
  isFreeUser?: boolean;
  isHighlighted?: boolean;
}

const tierBorderColors: Record<string, string> = {
  unicorn: "var(--color-amber-rich)",
  allocated: "var(--color-copper)",
  limited: "var(--color-silver-muted)",
};

const tierLabels: Record<string, string> = {
  unicorn: "UNICORN",
  allocated: "ALLOCATED",
  limited: "LIMITED",
};

function formatMsrp(msrp: number): string {
  return `$${msrp.toLocaleString()}`;
}

function getMultiplier(bottle: Bottle): number | null {
  if (!bottle.secondaryLow || !bottle.msrp || bottle.msrp <= 0) return null;
  const mult = Math.round(bottle.secondaryLow / bottle.msrp);
  return mult >= 2 ? mult : null;
}

function getRarityInfo(avg?: number): { label: string; color: string } | null {
  if (!avg) return null;
  if (avg < 0.5) return { label: "Very rare", color: "var(--color-amber-rich)" };
  if (avg < 1) return { label: "Rare", color: "var(--color-copper)" };
  if (avg < 2) return { label: "Uncommon", color: "var(--color-silver-muted)" };
  if (avg < 4) return { label: "Common", color: "var(--color-text-tertiary)" };
  return { label: "Common", color: "var(--color-text-tertiary)" };
}

export default function BottleCard({
  bottle,
  onClick,
  isBlurred,
  blurAmount,
  isFreeUser,
  isHighlighted,
}: BottleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const tierColor = tierBorderColors[bottle.tier];
  const multiplier = getMultiplier(bottle);
  const rarity = getRarityInfo(bottle.avgDropsPerMonth);
  const isUnicorn = bottle.tier === "unicorn";
  const isAllocated = bottle.tier === "allocated";
  const isLimited = bottle.tier === "limited";

  // Tier-specific backgrounds
  const cardBg = isUnicorn
    ? "rgba(196, 148, 58, 0.03)"
    : "var(--color-card-bg)";

  // Tier-specific hover shadow
  const hoverShadow = isUnicorn
    ? "0 0 40px rgba(196, 148, 58, 0.08), 0 12px 40px rgba(0, 0, 0, 0.3)"
    : isAllocated
      ? "0 12px 40px rgba(0, 0, 0, 0.3)"
      : "0 8px 24px rgba(0, 0, 0, 0.2)";

  // Multiplier badge colors
  const multiplierBg = isUnicorn
    ? "var(--color-amber-rich)"
    : isAllocated
      ? "var(--color-copper)"
      : "var(--color-silver-muted)";

  const multiplierText = isUnicorn || isAllocated ? "#1A1510" : "#1A1510";

  return (
    <motion.div
      id={`bottle-${bottle.id}`}
      variants={fadeUpVariant}
      onClick={onClick}
      className="relative cursor-pointer"
      style={{
        background: cardBg,
        borderRadius: "12px",
        border: isHighlighted
          ? `2px solid var(--color-amber-rich)`
          : `1px solid var(--color-card-border)`,
        borderTop: `3px solid ${tierColor}`,
        padding: "26px",
        filter: isBlurred ? `blur(${blurAmount || 6}px)` : "none",
        pointerEvents: isBlurred ? "none" : "auto",
        userSelect: isBlurred ? "none" : "auto",
        opacity: isLimited ? 0.85 : 1,
        animation: isHighlighted ? "highlightPulse 2s ease" : undefined,
      }}
      whileHover={{
        y: -4,
        boxShadow: hoverShadow,
        borderColor: "var(--color-card-border-hover)",
        transition: { type: "spring", stiffness: 300, damping: 20 },
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* Header: Name + Tier Badge */}
      <div className="flex items-start justify-between" style={{ marginBottom: "6px" }}>
        <h3
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "19px",
            fontWeight: 700,
            color: "var(--color-cream)",
            lineHeight: 1.3,
            flex: 1,
            paddingRight: "12px",
          }}
        >
          {bottle.name}
        </h3>

        {/* Tier Badge */}
        <span
          className="flex items-center gap-1.5 shrink-0"
          style={{
            background: "rgba(13, 11, 7, 0.6)",
            backdropFilter: "blur(8px)",
            border: `1px solid ${tierColor}33`,
            borderRadius: "20px",
            padding: "4px 10px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: tierColor,
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
      </div>

      {/* Distillery */}
      <p
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "12px",
          color: "var(--color-text-tertiary)",
          marginBottom: "20px",
        }}
      >
        {bottle.distillery}
      </p>

      {/* Price Intelligence Block — dark inset */}
      <div
        style={{
          background: "rgba(0, 0, 0, 0.25)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <div className="flex items-center justify-between">
          {/* MSRP + vs + Secondary */}
          <div className="flex items-center gap-3">
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
                  marginBottom: "4px",
                }}
              >
                MSRP
              </p>
              <p
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "20px",
                  fontWeight: 600,
                  color: "var(--color-cream)",
                }}
              >
                {formatMsrp(bottle.msrp)}
              </p>
            </div>

            {/* vs */}
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontStyle: "italic",
                color: "var(--color-text-tertiary)",
                opacity: 0.6,
                alignSelf: "flex-end",
                marginBottom: "4px",
              }}
            >
              vs
            </span>

            {/* Secondary */}
            <div>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "9px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  color: "var(--color-amber-rich)",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                SECONDARY
              </p>
              <p
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--color-amber-rich)",
                  filter: isFreeUser ? "blur(3px)" : "none",
                  userSelect: isFreeUser ? "none" : "auto",
                }}
              >
                {bottle.secondary || "N/A"}
              </p>
            </div>
          </div>

          {/* MULTIPLIER BADGE — right-aligned, the star of the show */}
          {multiplier && (
            <span
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: "18px",
                fontWeight: 700,
                color: multiplierText,
                background: multiplierBg,
                borderRadius: "20px",
                padding: "6px 14px",
                lineHeight: 1,
                filter: isFreeUser ? "blur(3px)" : "none",
                userSelect: isFreeUser ? "none" : "auto",
                whiteSpace: "nowrap",
              }}
            >
              {multiplier}x
            </span>
          )}
        </div>
      </div>

      {/* Rarity + Drop Frequency */}
      <div className="flex items-center gap-3" style={{ marginBottom: "16px" }}>
        {rarity && (
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "11px",
              fontWeight: 600,
              color: rarity.color,
              border: `1px solid ${rarity.color}`,
              borderRadius: "10px",
              padding: "2px 8px",
              background: "rgba(0, 0, 0, 0.3)",
            }}
          >
            {rarity.label}
          </span>
        )}
        <span
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
          }}
        >
          {bottle.avgDropsPerMonth
            ? `${bottle.avgDropsPerMonth} drops/mo`
            : "No drop data"}
        </span>
      </div>

      {/* Footer: Proof, Age, Arrow */}
      <div
        className="flex items-center justify-between pt-3"
        style={{
          borderTop: "1px solid rgba(212, 146, 11, 0.08)",
        }}
      >
        <div className="flex items-center gap-4">
          {bottle.proof && (
            <span
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
              }}
            >
              {bottle.proof}°
            </span>
          )}
          {bottle.ageStatement && (
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
              }}
            >
              {bottle.ageStatement}
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: isHovered ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <ChevronRight
            size={18}
            style={{ color: "var(--color-text-secondary)" }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
