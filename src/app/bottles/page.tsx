"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import BottleGrid from "@/components/sections/BottleGrid";
import { bottles } from "@/data/bottles";

export default function BottlesPage() {
  const tierCounts = {
    unicorn: bottles.filter((b) => b.tier === "unicorn").length,
    allocated: bottles.filter((b) => b.tier === "allocated").length,
    limited: bottles.filter((b) => b.tier === "limited").length,
  };
  const totalTiers = Object.values(tierCounts).filter((c) => c > 0).length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
      }}
    >
      <Navigation />

      {/* Page Header */}
      <section
        className="relative"
        style={{
          paddingTop: "120px",
          paddingBottom: "32px",
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
              BOTTLE INTELLIGENCE
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
              The Library
            </h1>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "16px",
                color: "var(--color-text-secondary)",
                maxWidth: "560px",
                margin: "0 auto 20px",
                lineHeight: 1.6,
              }}
            >
              MSRP, secondary market value, rarity, and drop frequency for
              every bottle we track.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <p
              style={{
                fontFamily: "var(--font-jetbrains)",
                fontSize: "13px",
                color: "var(--color-accent-amber)",
              }}
            >
              Tracking {bottles.length}+ bottles across {totalTiers} tiers
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Grid Section */}
      <BottleGrid />

      <Footer />
    </div>
  );
}
