"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";
import type { DropEvent } from "@/lib/drops";

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
  // Use the most recent drop timestamp as "now" so stats are always meaningful
  // even when demo data is stale relative to wall clock
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
      recentDrops
        .map((d) => d.board_name)
        .filter(Boolean)
    ).size;

    const unicornAlerts = recentDrops.filter(
      (d) => d.rarity_tier === "unicorn"
    ).length;

    return { dropsToday, activeCounties, unicornAlerts };
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
          style={{ marginBottom: "32px", gap: "16px" }}
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

          {/* Right: Member badge + tier */}
          <div className="flex items-center gap-3">
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

        {/* Stats grid */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: "clamp(12px, 2vw, 20px)" }}
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
    </section>
  );
}
