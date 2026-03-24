"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { Crown } from "lucide-react";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";
import { type DropEvent, getDisplayName } from "@/lib/drops";
import { INITIAL_WATCHLIST } from "@/components/sections/DashboardSidebar";

interface DashboardStatsProps {
  drops: DropEvent[];
}

function useCountUp(target: number, duration: number = 2000, inView: boolean) {
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!inView || hasAnimated.current) return;
    hasAnimated.current = true;

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(target * eased));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [inView, target, duration]);

  return count;
}

function DashboardStatCard({
  value,
  label,
  hasActivity,
}: {
  value: number;
  label: string;
  hasActivity?: boolean;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const count = useCountUp(value, 2000, isInView);
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      ref={ref}
      variants={fadeUpVariant}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "rgba(0,0,0,0.2)",
        borderRadius: "12px",
        padding: "20px",
        borderLeft: "3px solid var(--color-accent-amber)",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 8px 24px rgba(196,148,58,0.08)"
          : "0 0 0 rgba(0,0,0,0)",
        transition: "transform 0.25s ease, box-shadow 0.25s ease",
        cursor: "default",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: "clamp(22px, 3vw, 28px)",
            fontWeight: 700,
            color: "var(--color-accent-amber)",
            lineHeight: 1,
          }}
        >
          {count}
        </span>
        {hasActivity && value > 0 && (
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--color-accent-amber)",
              animation: "pulseDot 2s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "12px",
          color: "var(--color-text-tertiary)",
          marginTop: "8px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
    </motion.div>
  );
}

export default function DashboardStats({ drops }: DashboardStatsProps) {
  const referenceTime = useMemo(() => {
    if (drops.length === 0) return Date.now();
    const latest = Math.max(...drops.map((d) => new Date(d.timestamp).getTime()));
    return latest;
  }, [drops]);

  const stats = useMemo(() => {
    const oneDayAgo = referenceTime - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = referenceTime - 7 * 24 * 60 * 60 * 1000;

    const dropsToday = drops.filter(
      (d) => new Date(d.timestamp).getTime() > oneDayAgo
    ).length;

    const recentDrops = drops.filter(
      (d) => new Date(d.timestamp).getTime() > sevenDaysAgo
    );

    const activeCounties = new Set(
      recentDrops.map((d) => d.board_name).filter(Boolean)
    ).size;

    const unicornAlerts = recentDrops.filter(
      (d) => d.rarity_tier === "unicorn"
    ).length;

    return { dropsToday, activeCounties, unicornAlerts };
  }, [drops, referenceTime]);

  // Personal hit rate: watchlist bottles that dropped this week
  const watchlistHits = useMemo(() => {
    const sevenDaysAgo = referenceTime - 7 * 24 * 60 * 60 * 1000;
    const recentDrops = drops.filter(
      (d) => new Date(d.timestamp).getTime() > sevenDaysAgo
    );
    const watchlistNames = INITIAL_WATCHLIST.map((w) => w.name.toLowerCase());
    const matchedNames = new Set<string>();
    for (const drop of recentDrops) {
      const name = getDisplayName(drop).toLowerCase();
      for (const wName of watchlistNames) {
        if (name.includes(wName) || wName.includes(name)) {
          matchedNames.add(wName);
        }
      }
    }
    return matchedNames.size;
  }, [drops, referenceTime]);

  const currentDate = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, []);

  const currentTime = useMemo(() => {
    const d = new Date();
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  return (
    <section style={{ width: "100%" }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 clamp(16px, 5vw, 48px)",
        }}
      >
        {/* Greeting row */}
        <div
          className="flex flex-col md:flex-row md:items-center md:justify-between"
          style={{ marginBottom: "20px", gap: "16px" }}
        >
          {/* Left: Welcome */}
          <div>
            <h1
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(24px, 4vw, 32px)",
                fontWeight: 700,
                color: "var(--color-cream)",
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              Welcome back
            </h1>
            <div
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
                marginTop: "6px",
              }}
            >
              {currentDate} ·{" "}
              <span style={{ fontFamily: "var(--font-jetbrains)" }}>
                {currentTime}
              </span>
            </div>
          </div>

          {/* Right: Founding member + tier badges */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Founding Member Badge */}
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--color-accent-gold)",
                padding: "5px 12px",
                borderRadius: "20px",
                border: "1px solid rgba(232,176,75,0.25)",
                background: "rgba(232,176,75,0.08)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                whiteSpace: "nowrap",
              }}
            >
              Founding Member{" "}
              <span
                style={{
                  fontFamily: "var(--font-jetbrains)",
                  fontWeight: 700,
                  fontSize: "12px",
                  color: "var(--color-accent-gold)",
                }}
              >
                #007
              </span>
            </span>
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "var(--color-text-tertiary)",
                padding: "6px 12px",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              Member since Mar 2026
            </span>
            <span
              style={{
                background:
                  "linear-gradient(135deg, #C4943A 0%, #E8C97A 50%, #C4943A 100%)",
                backgroundSize: "200% 200%",
                animation: "shimmer 2s ease infinite",
                color: "#0D0B07",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                padding: "5px 14px",
                borderRadius: "14px",
                whiteSpace: "nowrap",
              }}
            >
              BOTTLED IN BOND
            </span>
          </div>
        </div>

        {/* Personal hit rate line */}
        <div
          style={{
            marginBottom: "24px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "13px",
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          Your watchlist had{" "}
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontWeight: 700,
              fontSize: "14px",
              color: watchlistHits > 0 ? "var(--color-accent-amber)" : "var(--color-text-tertiary)",
            }}
          >
            {watchlistHits}
          </span>{" "}
          {watchlistHits === 1 ? "drop" : "drops"} this week
        </div>

        {/* Inner Circle — exclusive briefing */}
        <div
          style={{
            marginBottom: "28px",
            padding: "20px 24px",
            borderRadius: "12px",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(232,176,75,0.15)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Faint scan-line overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(232,176,75,0.02) 3px, rgba(232,176,75,0.02) 4px)",
              pointerEvents: "none",
            }}
          />
          <div
            className="flex items-center gap-2"
            style={{ marginBottom: "10px", position: "relative" }}
          >
            <Crown size={14} style={{ color: "var(--color-accent-gold)" }} />
            <span
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--color-accent-gold)",
              }}
            >
              Inner Circle
            </span>
          </div>
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              fontStyle: "italic",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              margin: 0,
              position: "relative",
            }}
          >
            Founder intel: Buffalo Trace allocation patterns suggest increased Wake County activity this week. Blanton&apos;s and E.H. Taylor shipments tracking above seasonal average.
          </p>
        </div>

        {/* Stats grid — with command center grid overlay */}
        <div style={{ position: "relative" }}>
          {/* Command center grid pattern */}
          <div
            style={{
              position: "absolute",
              inset: "-16px -12px",
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(196,148,58,0.03) 0px, rgba(196,148,58,0.03) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(196,148,58,0.03) 0px, rgba(196,148,58,0.03) 1px, transparent 1px, transparent 40px)",
              pointerEvents: "none",
              borderRadius: "16px",
            }}
          />
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4"
            style={{ gap: "clamp(12px, 2vw, 20px)", position: "relative" }}
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
          >
            <DashboardStatCard
              value={stats.dropsToday}
              label="Drops Today"
              hasActivity
            />
            <DashboardStatCard value={8} label="Bottles Tracked" />
            <DashboardStatCard
              value={stats.activeCounties}
              label="Active Counties"
            />
            <DashboardStatCard
              value={stats.unicornAlerts}
              label="Unicorn Alerts"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
