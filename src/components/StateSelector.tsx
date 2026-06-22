"use client";

import { useState, useEffect } from "react";
import { useStatePreferences, AVAILABLE_STATES } from "@/lib/statePreferences";
import { publicStateCode } from "@/lib/location-normalization";

export default function StateSelector() {
  const { selectedStates, toggleState } = useStatePreferences();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server to avoid hydration mismatch
  if (!mounted) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px",
        padding: "8px 0",
      }}
    >
      {/* Label */}
      <span
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "var(--color-text-tertiary)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        Filter by state:
      </span>

      {/* State pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {AVAILABLE_STATES.map((state) => {
          const isActive = selectedStates.includes(state.code);
          const isComingSoon = "comingSoon" in state && state.comingSoon;

          return (
            <button
              key={state.code}
              onClick={() => {
                if (!isComingSoon) toggleState(state.code);
              }}
              disabled={!!isComingSoon}
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                padding: "4px 12px",
                borderRadius: "100px",
                border: isComingSoon
                  ? "1px solid rgba(255,255,255,0.06)"
                  : isActive
                    ? "1px solid rgba(196, 148, 58, 0.5)"
                    : "1px solid rgba(255,255,255,0.12)",
                background: isComingSoon
                  ? "rgba(255,255,255,0.02)"
                  : isActive
                    ? "rgba(196, 148, 58, 0.2)"
                    : "transparent",
                color: isComingSoon
                  ? "rgba(245, 237, 214, 0.2)"
                  : isActive
                    ? "var(--color-accent-amber)"
                    : "var(--color-text-tertiary)",
                cursor: isComingSoon ? "not-allowed" : "pointer",
                transition: "all 150ms ease",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}
            >
              {publicStateCode(state.code)}
              {isComingSoon && (
                <span
                  style={{
                    fontSize: "9px",
                    fontWeight: 500,
                    opacity: 0.5,
                    letterSpacing: "0.02em",
                  }}
                >
                  soon
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
