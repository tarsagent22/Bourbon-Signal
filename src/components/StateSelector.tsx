"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import {
  useStatePreferences,
  AVAILABLE_STATES,
} from "@/lib/statePreferences";

export default function StateSelector() {
  const { selectedStates, hasSelectedStates, toggleState, setSelectedStates } =
    useStatePreferences();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render on server or after user has already selected
  if (!mounted || hasSelectedStates) return null;

  const handleDone = () => {
    // If they haven't toggled anything, set empty — hasSelectedStates becomes true
    setSelectedStates(selectedStates.length > 0 ? selectedStates : []);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          width: "100%",
          background: "rgba(13, 11, 14, 0.95)",
          borderBottom: "1px solid rgba(196, 148, 58, 0.2)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          position: "relative",
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: 680,
            margin: "0 auto",
            padding: "20px clamp(16px, 4vw, 24px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
          }}
        >
          {/* Label */}
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--color-text-secondary)",
              margin: 0,
              textAlign: "center",
            }}
          >
            Which states are you hunting in?
          </p>

          {/* State pills row */}
          <div
            className="flex flex-wrap items-center justify-center"
            style={{ gap: "10px" }}
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
                    fontSize: "13px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    padding: "8px 18px",
                    borderRadius: "100px",
                    border: isComingSoon
                      ? "1px solid rgba(255,255,255,0.06)"
                      : isActive
                        ? "1px solid rgba(196, 148, 58, 0.6)"
                        : "1px solid rgba(255,255,255,0.12)",
                    background: isComingSoon
                      ? "rgba(255,255,255,0.03)"
                      : isActive
                        ? "rgba(196, 148, 58, 0.18)"
                        : "rgba(255,255,255,0.05)",
                    color: isComingSoon
                      ? "rgba(245, 237, 214, 0.25)"
                      : isActive
                        ? "var(--color-accent-amber)"
                        : "var(--color-text-secondary)",
                    cursor: isComingSoon ? "not-allowed" : "pointer",
                    transition: "all 200ms ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {state.code}
                  {isComingSoon && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 500,
                        opacity: 0.6,
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

          {/* Done button */}
          <button
            onClick={handleDone}
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              padding: "7px 20px",
              borderRadius: "6px",
              border: "1px solid rgba(196, 148, 58, 0.35)",
              background: "rgba(196, 148, 58, 0.1)",
              color: "var(--color-accent-amber)",
              cursor: "pointer",
              transition: "all 200ms ease",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Check size={14} />
            {selectedStates.length > 0 ? "Done" : "Show All States"}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
