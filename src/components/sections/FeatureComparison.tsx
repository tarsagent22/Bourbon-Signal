"use client";

import { useState, useEffect } from "react";
import ScrollReveal from "../ScrollReveal";

interface FeatureRow {
  name: string;
  standard: boolean;
  bib: boolean;
}

interface FeatureCategory {
  label: string;
  features: FeatureRow[];
  isExclusive?: boolean;
}

const categories: FeatureCategory[] = [
  {
    label: "Alerts & Tracking",
    features: [
      { name: "Drop alerts (email + SMS)", standard: true, bib: true },
      { name: "Real-time alert speed", standard: true, bib: true },
      { name: "Unlimited watchlist", standard: true, bib: true },
      { name: "Warehouse shipment tracking", standard: true, bib: true },
    ],
  },
  {
    label: "Intelligence",
    features: [
      { name: "Bottle Library (MSRP + secondary)", standard: true, bib: true },
      { name: "Hunt Map with store data", standard: true, bib: true },
      { name: "Historical drop patterns", standard: true, bib: true },
      { name: "Community store intel", standard: true, bib: true },
    ],
  },
  {
    label: "Founding Member Exclusives",
    isExclusive: true,
    features: [
      { name: "Lifetime access (no monthly fees)", standard: false, bib: true },
      { name: "The Inner Circle (private Telegram)", standard: false, bib: true },
      { name: "Numbered Glencairn Topper (#001–100)", standard: false, bib: true },
      { name: "Permanent Founder badge", standard: false, bib: true },
      { name: "Exclusive sticker pack", standard: false, bib: true },
      { name: "2× entries in all drawings", standard: false, bib: true },
    ],
  },
];

function CheckMark({ active, amber }: { active: boolean; amber?: boolean }) {
  if (!active) {
    return (
      <span
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "16px",
          color: "rgba(160,110,100,0.45)",
          fontWeight: 500,
        }}
      >
        ✗
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: "16px",
        fontWeight: 600,
        color: amber ? "var(--color-amber-rich)" : "rgba(245,237,214,0.5)",
      }}
    >
      ✓
    </span>
  );
}

function Pill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-dm-sans)",
        fontSize: "11px",
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "100px",
        background: active
          ? "rgba(196,148,58,0.15)"
          : "rgba(255,255,255,0.04)",
        color: active ? "var(--color-amber-rich)" : "rgba(140,100,90,0.5)",
        border: active
          ? "1px solid rgba(196,148,58,0.25)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {active ? "✓" : "✗"} {label}
    </span>
  );
}

export default function FeatureComparison() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  let rowIndex = 0;

  return (
    <section
      style={{
        width: "100%",
        paddingTop: "40px",
        paddingBottom: "64px",
      }}
    >
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 48px)",
        }}
      >
        <ScrollReveal>
          <h3
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--color-cream)",
              textAlign: "center",
              marginBottom: "40px",
            }}
          >
            Compare Plans
          </h3>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Column headers — desktop only */}
            {!isMobile && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px 140px",
                  padding: "16px 24px",
                  background: "rgba(255,255,255,0.03)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span />
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "rgba(245,237,214,0.5)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    textAlign: "center",
                  }}
                >
                  Standard
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-amber-rich)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    textAlign: "center",
                  }}
                >
                  Bottled in Bond
                </span>
              </div>
            )}

            {categories.map((category) => (
              <div key={category.label}>
                {/* Category header */}
                <div
                  style={{
                    padding: isMobile ? "14px 20px" : "14px 24px",
                    borderBottom: "1px solid rgba(196,148,58,0.12)",
                    background: category.isExclusive
                      ? "rgba(196,148,58,0.04)"
                      : "transparent",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--color-amber-rich)",
                    }}
                  >
                    {category.label}
                  </span>
                </div>

                {/* Feature rows */}
                {category.features.map((feature) => {
                  const isEven = rowIndex % 2 === 0;
                  rowIndex++;
                  const warmBg = category.isExclusive
                    ? "rgba(196,148,58,0.03)"
                    : "transparent";

                  if (isMobile) {
                    return (
                      <div
                        key={feature.name}
                        style={{
                          padding: "12px 20px",
                          background: isEven
                            ? `rgba(255,255,255,0.02)`
                            : warmBg,
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                        }}
                      >
                        <p
                          style={{
                            fontFamily: "var(--font-dm-sans)",
                            fontSize: "13px",
                            color: "var(--color-text-secondary)",
                            marginBottom: "8px",
                          }}
                        >
                          {feature.name}
                        </p>
                        <div className="flex gap-2">
                          <Pill active={feature.standard} label="Standard" />
                          <Pill active={feature.bib} label="BiB" />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={feature.name}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 140px 140px",
                        padding: "12px 24px",
                        alignItems: "center",
                        background: isEven
                          ? "rgba(255,255,255,0.02)"
                          : warmBg,
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-dm-sans)",
                          fontSize: "13px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {feature.name}
                      </span>
                      <span style={{ textAlign: "center" }}>
                        <CheckMark active={feature.standard} />
                      </span>
                      <span style={{ textAlign: "center" }}>
                        <CheckMark active={feature.bib} amber />
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
