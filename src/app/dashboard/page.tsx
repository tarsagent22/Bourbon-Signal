"use client";

import { useState, useEffect, useMemo } from "react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import DashboardStats from "@/components/sections/DashboardStats";
import DashboardFeed from "@/components/sections/DashboardFeed";
import DashboardSidebar from "@/components/sections/DashboardSidebar";
import ActivityTimeline from "@/components/sections/ActivityTimeline";
import ScrollReveal from "@/components/ScrollReveal";
import { groupDrops, type DropEvent } from "@/lib/drops";
import dropsData from "@/data/drops.json";

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const drops = (dropsData as { drops: DropEvent[] }).drops;
  const grouped = useMemo(() => groupDrops(drops, 20), [drops]);

  if (!mounted) return null;

  return (
    <>
      <Navigation />
      <main
        style={{
          minHeight: "100vh",
          background: "var(--color-bg-primary)",
          paddingTop: "clamp(120px, 15vw, 160px)",
          paddingBottom: "80px",
        }}
      >
        {/* Section 1: Greeting + Stats */}
        <ScrollReveal delay={0}>
          <DashboardStats drops={drops} />
        </ScrollReveal>

        {/* Section 2 + 3: Feed + Sidebar two-column layout */}
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 clamp(16px, 5vw, 48px)",
            marginTop: "clamp(32px, 5vw, 56px)",
          }}
        >
          <ScrollReveal delay={100}>
            <div
              className="flex flex-col lg:flex-row"
              style={{ gap: "clamp(20px, 3vw, 32px)" }}
            >
              <DashboardFeed drops={grouped} />
              <DashboardSidebar drops={drops} />
            </div>
          </ScrollReveal>
        </div>

        {/* Section 4: Activity Timeline */}
        <div style={{ marginTop: "clamp(40px, 6vw, 64px)" }}>
          <ScrollReveal delay={200}>
            <ActivityTimeline />
          </ScrollReveal>
        </div>
      </main>
      <Footer />
    </>
  );
}
