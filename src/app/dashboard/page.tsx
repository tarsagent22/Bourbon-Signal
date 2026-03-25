"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Bell, MapPin, Diamond } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import DashboardStats from "@/components/sections/DashboardStats";
import DashboardFeed from "@/components/sections/DashboardFeed";
import DashboardSidebar from "@/components/sections/DashboardSidebar";
import ActivityTimeline from "@/components/sections/ActivityTimeline";
import ScrollReveal from "@/components/ScrollReveal";
import DataFreshness from "@/components/DataFreshness";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";
import { groupDrops, type DropEvent } from "@/lib/drops";
import { useAuth } from "@/lib/auth";

const DashboardMiniMap = dynamic(() => import("@/components/DashboardMiniMap"), {
  ssr: false,
});

interface QuickAction {
  label: string;
  icon: typeof Bell;
  action: () => void;
}

export default function DashboardPage() {
  const { isSignedIn, signIn } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [feedFilter, setFeedFilter] = useState("all");
  const [selectedCounties, setSelectedCounties] = useState<string[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  // Live data from engine API
  const [drops, setDrops] = useState<DropEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);

    const fetchDrops = async () => {
      try {
        const res = await fetch("/api/drops");
        if (!res.ok) throw new Error("fetch failed");
        const json: { drops: DropEvent[]; total: number; lastUpdated: string } = await res.json();
        setDrops(json.drops);
        setTotal(json.total);
        setLastUpdated(json.lastUpdated);
      } catch {
        // Keep existing data on error
      } finally {
        setLoading(false);
      }
    };

    fetchDrops();
    const interval = setInterval(fetchDrops, 30000);
    return () => clearInterval(interval);
  }, []);

  const grouped = useMemo(() => groupDrops(drops, 50), [drops]);

  const scrollToFeed = useCallback(() => {
    feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleCountyToggle = useCallback((county: string) => {
    setSelectedCounties((prev) =>
      prev.includes(county)
        ? prev.filter((c) => c !== county)
        : [...prev, county]
    );
  }, []);

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        label: "What dropped today?",
        icon: Bell,
        action: () => {
          setFeedFilter("all");
          setSelectedCounties([]);
          scrollToFeed();
        },
      },
      {
        label: "Check my counties",
        icon: MapPin,
        action: () => {
          setFeedFilter("all");
          setSelectedCounties(["Wake", "Durham"]);
          scrollToFeed();
        },
      },
      {
        label: "Nearest unicorn",
        icon: Diamond,
        action: () => {
          setFeedFilter("unicorn");
          setSelectedCounties([]);
          scrollToFeed();
        },
      },
    ],
    [scrollToFeed]
  );

  if (!mounted) return null;

  if (!isSignedIn) {
    return (
      <>
        <Navigation />
        <div
          style={{
            minHeight: "100vh",
            background: "var(--color-bg-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 clamp(20px, 5vw, 40px)",
          }}
        >
          <div style={{ maxWidth: 440 }}>
            <h1
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(28px, 5vw, 40px)",
                fontWeight: 700,
                color: "var(--color-cream)",
                marginBottom: "12px",
              }}
            >
              Members Only
            </h1>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "16px",
                color: "var(--color-text-tertiary)",
                marginBottom: "32px",
                lineHeight: 1.6,
              }}
            >
              Sign in to access your dashboard
            </p>
            <button
              onClick={signIn}
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "14px",
                fontWeight: 600,
                color: "#0D0B0E",
                padding: "12px 32px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                border: "none",
                cursor: "pointer",
                transition: "opacity 300ms ease",
              }}
            >
              Sign In
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navigation />
      <motion.main
        style={{
          minHeight: "100vh",
          background: "var(--color-bg-primary)",
          paddingTop: "120px",
          paddingBottom: "80px",
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Section 1: Greeting + Stats */}
        <div style={{ opacity: loading ? 0.4 : 1, transition: "opacity 0.3s ease" }}>
        <ScrollReveal delay={0}>
          <DashboardStats drops={drops} />
        </ScrollReveal>

        {/* Data Freshness */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 clamp(20px, 5vw, 48px)",
            marginTop: "12px",
          }}
        >
          {lastUpdated && <DataFreshness lastUpdated={lastUpdated} />}
        </div>

        {/* Quick Actions Row */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 clamp(20px, 5vw, 48px)",
            marginTop: "clamp(24px, 4vw, 36px)",
          }}
        >
          <ScrollReveal delay={50}>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-3"
              style={{ gap: "clamp(12px, 2vw, 16px)" }}
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              {quickActions.map((action) => (
                <QuickActionCard key={action.label} action={action} />
              ))}
            </motion.div>
          </ScrollReveal>
        </div>

        {/* Section 2 + 3: Feed + Sidebar two-column layout */}
        <div
          ref={feedRef}
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 clamp(20px, 5vw, 48px)",
            marginTop: "clamp(32px, 5vw, 56px)",
          }}
        >
          <ScrollReveal delay={100}>
            <div
              className="flex flex-col lg:flex-row"
              style={{ gap: "clamp(20px, 3vw, 32px)" }}
            >
              <DashboardFeed
                drops={grouped}
                allDrops={drops}
                feedFilter={feedFilter}
                onFilterChange={setFeedFilter}
                selectedCounties={selectedCounties}
                onCountyToggle={handleCountyToggle}
                total={total}
              />
              <DashboardSidebar drops={drops} miniMap={<DashboardMiniMap />} />
            </div>
          </ScrollReveal>
        </div>

        {/* Section 4: Activity Timeline */}
        <div style={{ marginTop: "clamp(40px, 6vw, 64px)" }}>
          <ScrollReveal delay={200}>
            <ActivityTimeline />
          </ScrollReveal>
        </div>
        </div>
      </motion.main>
      <Footer />
    </>
  );
}

function QuickActionCard({ action }: { action: QuickAction }) {
  const [hovered, setHovered] = useState(false);
  const Icon = action.icon;

  return (
    <motion.button
      variants={fadeUpVariant}
      onClick={action.action}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.98 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "16px 20px",
        borderRadius: "12px",
        background: "rgba(0,0,0,0.2)",
        border: hovered
          ? "1px solid rgba(196,148,58,0.3)"
          : "1px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
        transition: "all 250ms ease",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 8px 24px rgba(196,148,58,0.08)"
          : "0 0 0 rgba(0,0,0,0)",
        width: "100%",
        minHeight: "56px",
        textAlign: "left",
      }}
    >
      <Icon
        size={18}
        style={{
          color: "var(--color-accent-amber)",
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "14px",
          fontWeight: 700,
          color: "var(--color-text-primary)",
        }}
      >
        {action.label}
      </span>
    </motion.button>
  );
}
