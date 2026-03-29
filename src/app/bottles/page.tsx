"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import BottleGrid from "@/components/sections/BottleGrid";
import StateSelector from "@/components/StateSelector";
import { useBottles } from "@/hooks/useBottles";
import { useWatchlistStore } from "@/lib/watchlist";
import { useAuth } from "@/lib/auth";
import type { Bottle } from "@/data/bottles";
import { BOTTLE_PRICING } from "@/data/bottles";
import { getAvailabilityInfo } from "@/lib/availability";

function WatchlistCard({
  bottle,
  onRemove,
}: {
  bottle: Bottle;
  onRemove: () => void;
}) {
  const availability = getAvailabilityInfo(bottle);
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
  const tierColor = tierColors[bottle.tier] || "#8A8A8A";

  return (
    <div
      style={{
        minWidth: "280px",
        maxWidth: "320px",
        background: "var(--color-card-bg)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderTop: `2px solid ${tierColor}`,
        borderRadius: "10px",
        padding: "16px",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "transparent",
          color: "var(--color-text-tertiary)",
          fontSize: "12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms ease",
          padding: 0,
        }}
        title="Remove from hunt"
      >
        ×
      </button>

      {/* Bottle name */}
      <h4
        style={{
          fontFamily: "var(--font-playfair)",
          fontSize: "14px",
          fontWeight: 700,
          color: "var(--color-cream)",
          lineHeight: 1.3,
          marginBottom: "6px",
          paddingRight: "28px",
        }}
      >
        {bottle.name}
      </h4>

      {/* Tier badge */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: "rgba(13, 11, 7, 0.6)",
          border: `1px solid ${tierColor}33`,
          borderRadius: "20px",
          padding: "2px 7px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "9px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: tierColor,
          marginBottom: "10px",
        }}
      >
        <span
          style={{
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background: tierColor,
          }}
        />
        {tierLabels[bottle.tier]}
      </span>

      {/* Availability status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "12px",
          color: availability.isAvailable
            ? "var(--color-success)"
            : "var(--color-text-tertiary)",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: availability.isAvailable
              ? "var(--color-success)"
              : "var(--color-text-tertiary)",
            flexShrink: 0,
          }}
        />
        {availability.label}
      </div>
    </div>
  );
}

export default function BottlesPage() {
  const { bottles, loading } = useBottles();
  const { isSignedIn } = useAuth();
  const { watchedBottles, removeBottle } = useWatchlistStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const watchedBottlesList = useMemo(() => {
    if (!mounted) return [];
    return bottles.filter((b) => watchedBottles.includes(b.id));
  }, [bottles, watchedBottles, mounted]);

  const showWatchlistSection = mounted && (isSignedIn || watchedBottles.length > 0);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
      }}
    >
      <Navigation />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Page Header */}
        <section
          className="relative"
          style={{
            paddingTop: "120px",
            paddingBottom: "24px",
            textAlign: "center",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow behind title */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 600px 300px at 50% 40%, rgba(196, 148, 58, 0.06) 0%, transparent 70%)",
            }}
          />

          <div
            style={{
              maxWidth: 800,
              margin: "0 auto",
              padding: "0 clamp(20px, 5vw, 40px)",
              position: "relative",
            }}
          >
            <ScrollReveal>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  color: "var(--color-accent-amber)",
                  textTransform: "uppercase",
                  marginBottom: "16px",
                }}
              >
                BOTTLE TRACKER
              </p>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <h1
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(32px, 5vw, 48px)",
                  fontWeight: 700,
                  color: "var(--color-cream)",
                  lineHeight: 1.1,
                  marginBottom: "16px",
                }}
              >
                The Hunt
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "16px",
                  color: "var(--color-text-secondary)",
                  maxWidth: "480px",
                  margin: "0 auto",
                  lineHeight: 1.6,
                }}
              >
                Track the bottles you&apos;re after. Get alerted when they drop.
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* Section A: Your Hunt (Watchlist) */}
        {showWatchlistSection && (
          <section
            style={{
              padding: "0 0 24px",
            }}
          >
            <div
              style={{
                maxWidth: 1200,
                margin: "0 auto",
                padding: "0 clamp(20px, 5vw, 48px)",
              }}
            >
              <ScrollReveal delay={300}>
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
                    }}
                  >
                    Your Hunt
                  </h2>
                  {watchedBottlesList.length > 0 && (
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "var(--color-accent-amber)",
                        background: "rgba(196, 148, 58, 0.12)",
                        border: "1px solid rgba(196, 148, 58, 0.25)",
                        borderRadius: "12px",
                        padding: "2px 10px",
                      }}
                    >
                      {watchedBottlesList.length}
                    </span>
                  )}
                </div>

                {watchedBottlesList.length === 0 ? (
                  <div
                    style={{
                      padding: "32px 24px",
                      background: "var(--color-card-bg)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "10px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "var(--font-dm-sans)",
                        fontSize: "14px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      Add bottles below to start tracking your hunt
                    </p>
                  </div>
                ) : (
                  <div
                    className="flex gap-4"
                    style={{
                      overflowX: "auto",
                      paddingBottom: "8px",
                      scrollSnapType: "x mandatory",
                    }}
                  >
                    {watchedBottlesList.map((bottle) => (
                      <WatchlistCard
                        key={bottle.id}
                        bottle={bottle}
                        onRemove={() => removeBottle(bottle.id)}
                      />
                    ))}
                  </div>
                )}
              </ScrollReveal>
            </div>
          </section>
        )}

        {/* State filter row */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 clamp(20px, 5vw, 48px)",
            marginBottom: "8px",
          }}
        >
          <StateSelector />
        </div>

        {/* Section B: Discover Bottles */}
        <BottleGrid bottles={bottles} loading={loading} />
      </motion.div>

      <Footer />
    </div>
  );
}
