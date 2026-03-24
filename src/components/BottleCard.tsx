"use client";

import { motion } from "framer-motion";
import { fadeUpVariant } from "@/lib/animations";
import { Lock, ChevronRight } from "lucide-react";
import type { Bottle } from "@/data/bottles";

interface BottleCardProps {
  bottle: Bottle;
  onClick: () => void;
  isBlurred?: boolean;
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

function formatMsrp(msrp: number): string {
  return `$${msrp.toLocaleString()}`;
}

function getMultiplier(bottle: Bottle): number | null {
  if (!bottle.secondaryLow || !bottle.msrp || bottle.msrp <= 0) return null;
  const mult = Math.round(bottle.secondaryLow / bottle.msrp);
  return mult >= 2 ? mult : null;
}

function getFrequencyLabel(avg?: number): { label: string; color: string } {
  if (!avg) return { label: "No data", color: "var(--color-text-tertiary)" };
  if (avg < 0.5) return { label: "Very rare", color: "#E85D26" };
  if (avg < 1) return { label: "Rare", color: "var(--color-accent-amber)" };
  if (avg < 2) return { label: "Uncommon", color: "var(--color-accent-copper)" };
  if (avg < 4) return { label: "Regular", color: "var(--color-text-tertiary)" };
  return { label: "Frequent", color: "var(--color-text-tertiary)" };
}

export default function BottleCard({ bottle, onClick, isBlurred, isFreeUser }: BottleCardProps) {
  const tierColor = tierColors[bottle.tier];
  const multiplier = getMultiplier(bottle);

  const isUnicorn = bottle.tier === "unicorn";

  return (
    <motion.div
      variants={fadeUpVariant}
      onClick={onClick}
      className="relative cursor-pointer"
      style={{
        background: isUnicorn ? "rgba(40, 32, 22, 0.9)" : "var(--color-card-bg)",
        borderRadius: "10px",
        border: "1px solid var(--color-card-border)",
        borderTop: `3px solid ${tierColor}`,
        padding: "24px",
        transition: "all 300ms ease",
        filter: isBlurred ? "blur(6px)" : "none",
        pointerEvents: isBlurred ? "none" : "auto",
        userSelect: isBlurred ? "none" : "auto",
        boxShadow: isUnicorn ? "0 0 20px rgba(196, 148, 58, 0.08), 0 0 40px rgba(196, 148, 58, 0.04)" : "none",
      }}
      whileHover={{
        y: -3,
        transition: { duration: 0.25 },
      }}
      onHoverStart={(e) => {
        const el = e.target as HTMLElement;
        const card = el.closest("[data-bottle-card]") as HTMLElement;
        if (card) {
          card.style.borderColor = "var(--color-card-border-hover)";
          card.style.boxShadow = bottle.tier === "unicorn"
            ? "0 8px 32px rgba(196, 135, 10, 0.15)"
            : "0 8px 24px rgba(0, 0, 0, 0.3)";
        }
      }}
      onHoverEnd={(e) => {
        const el = e.target as HTMLElement;
        const card = el.closest("[data-bottle-card]") as HTMLElement;
        if (card) {
          card.style.borderColor = "var(--color-card-border)";
          card.style.boxShadow = "none";
        }
      }}
      data-bottle-card
    >
      {/* Tier Badge */}
      <div className="absolute top-4 right-4">
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{
            background: "rgba(13, 11, 7, 0.6)",
            backdropFilter: "blur(8px)",
            border: `1px solid ${tierColor}33`,
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

      {/* Bottle Name */}
      <h3
        style={{
          fontFamily: "var(--font-playfair)",
          fontSize: "19px",
          fontWeight: 700,
          color: "var(--color-cream)",
          lineHeight: 1.3,
          marginBottom: "4px",
          paddingRight: "80px",
        }}
      >
        {bottle.name}
      </h3>

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

      {/* Price Intelligence Block */}
      <div className="flex items-start gap-6" style={{ marginBottom: "16px" }}>
        {/* MSRP */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--color-text-tertiary)",
              marginBottom: "4px",
            }}
          >
            MSRP
          </p>
          <p
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "16px",
              fontWeight: 500,
              color: "var(--color-text-primary)",
            }}
          >
            {formatMsrp(bottle.msrp)}
          </p>
        </div>

        {/* Secondary */}
        <div className="relative">
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--color-accent-amber)",
              marginBottom: "4px",
            }}
          >
            SECONDARY
          </p>
          <div className="flex items-center gap-2">
            <p
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: "16px",
                fontWeight: 500,
                color: "var(--color-accent-amber)",
                filter: isFreeUser ? "blur(3px)" : "none",
                userSelect: isFreeUser ? "none" : "auto",
              }}
            >
              {bottle.secondary || "N/A"}
            </p>
            {isFreeUser && (
              <Lock
                size={12}
                style={{ color: "var(--color-text-tertiary)" }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Multiplier Badge */}
      {multiplier && (
        <div className="flex items-center gap-3" style={{ marginBottom: "16px" }}>
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full"
            style={{
              background: `${tierColor}18`,
              border: `1px solid ${tierColor}40`,
              fontFamily: "var(--font-jetbrains)",
              fontSize: "13px",
              fontWeight: 700,
              color: tierColor,
              filter: isFreeUser ? "blur(8px)" : "none",
              userSelect: isFreeUser ? "none" : "auto",
            }}
          >
            {multiplier}x
          </span>
          {isFreeUser && (
            <Lock size={12} style={{ color: "var(--color-text-tertiary)" }} />
          )}
          {!isFreeUser && (
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
              }}
            >
              above retail
            </span>
          )}
        </div>
      )}

      {/* Drop Frequency */}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: "16px" }}>
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
          }}
        >
          {bottle.avgDropsPerMonth
            ? `Avg: ${bottle.avgDropsPerMonth} drops/mo`
            : "No drop data"}
        </p>
        {bottle.avgDropsPerMonth ? (() => {
          const freq = getFrequencyLabel(bottle.avgDropsPerMonth);
          return (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full"
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                fontWeight: 600,
                color: freq.color,
                background: `${freq.color}15`,
                border: `1px solid ${freq.color}30`,
              }}
            >
              {freq.label}
            </span>
          );
        })() : null}
      </div>

      {/* Footer */}
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
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
              }}
            >
              {bottle.proof} proof
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
        <ChevronRight
          size={18}
          style={{ color: "var(--color-text-secondary)" }}
        />
      </div>
    </motion.div>
  );
}
