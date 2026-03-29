"use client";

import { motion } from "framer-motion";
import { fadeUpVariant } from "@/lib/animations";
import { useState } from "react";
import type { Bottle } from "@/data/bottles";
import { BOTTLE_PRICING } from "@/data/bottles";
import { formatRelativeTime } from "@/lib/drops";
import { useWatchlistStore } from "@/lib/watchlist";
import { useToastStore } from "@/lib/toast";
import DropHistoryModal from "@/components/DropHistoryModal";

interface BottleCardProps {
  bottle: Bottle;
  onClick: () => void;
  isBlurred?: boolean;
  blurAmount?: number;
  isFreeUser?: boolean;
  isHighlighted?: boolean;
  lastSeenTimestamp?: string;
  lastSeenLocation?: string;
}

const tierBorderColors: Record<string, string> = {
  unicorn: "#C4943A",
  allocated: "#B87333",
  limited: "#8A8A8A",
};

const tierLabels: Record<string, string> = {
  unicorn: "UNICORN",
  allocated: "ALLOCATED",
  limited: "LIMITED",
};

function formatMsrp(msrp: number): string {
  return `$${msrp.toLocaleString()}`;
}

export default function BottleCard({
  bottle,
  onClick,
  isBlurred,
  blurAmount,
  isFreeUser,
  isHighlighted,
  lastSeenTimestamp,
  lastSeenLocation,
}: BottleCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showSignupHint, setShowSignupHint] = useState(false);
  const [dropHistoryOpen, setDropHistoryOpen] = useState(false);
  const { addBottle, removeBottle, isWatching } = useWatchlistStore();
  const addToast = useToastStore((s) => s.addToast);
  const watching = isWatching(bottle.id);

  const tierColor = tierBorderColors[bottle.tier];
  const isUnicorn = bottle.tier === "unicorn";
  const isLimited = bottle.tier === "limited";

  // Cross-reference secondary pricing from BOTTLE_PRICING lookup
  const pricingKey = bottle.name.toLowerCase();
  const pricingData = BOTTLE_PRICING[pricingKey];
  // Prefer live bottle data if it has secondary, otherwise fall back to lookup
  const secondaryString = bottle.secondary || pricingData?.secondary || null;

  // Tier-specific backgrounds
  const cardBg = isUnicorn
    ? "rgba(196,148,58,0.03)"
    : "var(--color-card-bg)";

  // Tier-specific hover shadow
  const hoverShadow = isUnicorn
    ? "0 0 24px rgba(196, 148, 58, 0.06), 0 8px 24px rgba(0, 0, 0, 0.25)"
    : "0 4px 16px rgba(0, 0, 0, 0.2)";

  function handleWatchClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isFreeUser) {
      setShowSignupHint(true);
      setTimeout(() => setShowSignupHint(false), 2000);
      return;
    }
    if (watching) {
      removeBottle(bottle.id);
      addToast(`Removed ${bottle.name} from watchlist`, "bookmark-x");
    } else {
      addBottle(bottle.id);
      addToast(`Added ${bottle.name} to watchlist`, "bookmark");
    }
  }

  return (
    <motion.div
      id={`bottle-${bottle.id}`}
      variants={fadeUpVariant}
      onClick={onClick}
      className="relative cursor-pointer"
      style={{
        background: cardBg,
        borderRadius: "10px",
        border: isHighlighted
          ? `2px solid var(--color-amber-rich)`
          : `1px solid rgba(255,255,255,0.06)`,
        borderTop: `2px solid ${tierColor}`,
        padding: "14px",
        filter: isBlurred ? `blur(${blurAmount || 6}px)` : "none",
        pointerEvents: isBlurred ? "none" : "auto",
        userSelect: isBlurred ? "none" : "auto",
        opacity: isLimited ? 0.85 : 1,
        animation: isHighlighted ? "highlightPulse 2s ease" : undefined,
        boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }}
      whileHover={{
        y: -2,
        boxShadow: hoverShadow,
        borderColor: "rgba(255,255,255,0.1)",
        transition: { type: "spring", stiffness: 300, damping: 20 },
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      {/* + Watchlist button — top right */}
      <button
        onClick={handleWatchClick}
        title={isFreeUser ? "Sign up to use watchlist" : watching ? "Remove from watchlist" : "Add to watchlist"}
        className="absolute cursor-pointer"
        style={{
          top: "8px",
          right: "8px",
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          border: watching
            ? "1px solid rgba(196,148,58,0.7)"
            : "1px solid rgba(196,148,58,0.4)",
          background: watching
            ? "rgba(196,148,58,0.2)"
            : "transparent",
          color: "var(--color-accent-amber)",
          fontSize: "14px",
          fontWeight: 700,
          lineHeight: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          textAlign: "center" as const,
          transition: "all 150ms ease",
          zIndex: 2,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(196,148,58,0.18)";
          e.currentTarget.style.borderColor = "rgba(196,148,58,0.8)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = watching ? "rgba(196,148,58,0.2)" : "transparent";
          e.currentTarget.style.borderColor = watching ? "rgba(196,148,58,0.7)" : "rgba(196,148,58,0.4)";
        }}
      >
        {watching ? "✓" : "+"}
      </button>

      {/* Signup hint tooltip */}
      {showSignupHint && (
        <div
          className="absolute"
          style={{
            top: "36px",
            right: "4px",
            background: "var(--color-bg-secondary)",
            border: "1px solid rgba(196,148,58,0.3)",
            borderRadius: "6px",
            padding: "6px 10px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "var(--color-text-secondary)",
            whiteSpace: "nowrap",
            zIndex: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          Sign up to use watchlist
        </div>
      )}

      {/* Row 1: Name + Tier Badge */}
      <div
        className="flex items-center"
        style={{ marginBottom: "6px", paddingRight: "32px" }}
      >
        <h3
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "13px",
            fontWeight: 700,
            color: "var(--color-cream)",
            lineHeight: 1.3,
            flex: 1,
            paddingRight: "8px",
          }}
        >
          {bottle.name}
        </h3>

        {/* Tier Badge */}
        <span
          className="flex items-center gap-1 shrink-0"
          style={{
            background: "rgba(13, 11, 7, 0.6)",
            border: `1px solid ${
              bottle.tier === "unicorn"
                ? "rgba(196,148,58,0.25)"
                : bottle.tier === "allocated"
                  ? "rgba(184,115,51,0.25)"
                  : "rgba(138,138,138,0.2)"
            }`,
            borderRadius: "20px",
            padding: "2px 7px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "9px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: tierColor,
          }}
        >
          <span
            style={{
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              background: tierColor,
              flexShrink: 0,
            }}
          />
          {tierLabels[bottle.tier]}
        </span>
      </div>

      {/* Row 2: Distillery — hide if unknown/missing */}
      {bottle.distillery && bottle.distillery !== "Unknown" && (
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
            marginBottom: "10px",
            lineHeight: 1.2,
          }}
        >
          {bottle.distillery}
        </p>
      )}

      {/* Row 3: Prices — hide MSRP if $0 or missing */}
      <div className="flex items-baseline justify-between" style={{ marginBottom: "8px" }}>
        {bottle.msrp && bottle.msrp > 0 ? (
          <div>
            <span
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--color-cream)",
              }}
            >
              {formatMsrp(bottle.msrp)}
            </span>
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                color: "var(--color-text-tertiary)",
                marginLeft: "4px",
              }}
            >
              MSRP
            </span>
          </div>
        ) : (
          <div />
        )}

        {secondaryString && (
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              color: "var(--color-text-tertiary)",
              filter: isFreeUser ? "blur(3px)" : "none",
              userSelect: isFreeUser ? "none" : "auto",
            }}
          >
            {secondaryString}
          </span>
        )}
      </div>

      {/* Row 4: Last seen (if available) */}
      {lastSeenTimestamp && (
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "rgba(196,148,58,0.55)",
            marginBottom: "6px",
          }}
        >
          Last seen: {formatRelativeTime(lastSeenTimestamp)}
          {lastSeenLocation ? ` · ${lastSeenLocation}` : ""}
        </p>
      )}

      {/* Row 5: Footer — proof, age */}
      <div
        className="flex items-center gap-3 pt-2"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {bottle.proof && (
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "10px",
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
              fontSize: "10px",
              color: "var(--color-text-tertiary)",
            }}
          >
            {bottle.ageStatement}
          </span>
        )}
        {/* View drops button — replaces raw avgDropsPerMonth count */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDropHistoryOpen(true);
          }}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            color: "var(--color-accent-amber)",
            textDecoration: "none",
            transition: "opacity 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = "underline";
            e.currentTarget.style.opacity = "0.8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = "none";
            e.currentTarget.style.opacity = "1";
          }}
        >
          View drops
        </button>
      </div>

      {/* Drop history modal */}
      {dropHistoryOpen && (
        <DropHistoryModal
          bottle={bottle}
          isOpen={dropHistoryOpen}
          onClose={() => setDropHistoryOpen(false)}
        />
      )}
    </motion.div>
  );
}
