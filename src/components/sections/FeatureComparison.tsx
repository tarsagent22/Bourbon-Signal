"use client";

import { useState, useEffect } from "react";
import ScrollReveal from "../ScrollReveal";

interface FeatureRow {
  name: string;
  free: boolean;
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
      { name: "Drop feed (delayed)", free: true, standard: false, bib: false },
      { name: "Free weekly digest", free: true, standard: true, bib: true },
      { name: "Drop alerts (email + SMS)", free: false, standard: true, bib: true },
      { name: "Real-time alert speed", free: false, standard: true, bib: true },
      { name: "Unlimited watchlist", free: false, standard: true, bib: true },
      { name: "Warehouse shipment tracking", free: false, standard: true, bib: true },
    ],
  },
  {
    label: "Intelligence",
    features: [
      { name: "Bottle Library (MSRP + secondary)", free: false, standard: true, bib: true },
      { name: "Hunt Map with store data", free: false, standard: true, bib: true },
      { name: "Historical drop patterns", free: false, standard: true, bib: true },
      { name: "Community store intel", free: false, standard: true, bib: true },
    ],
  },
  {
    label: "Founding Member Exclusives",
    isExclusive: true,
    features: [
      { name: "Lifetime access (no monthly fees)", free: false, standard: false, bib: true },
      { name: "The Inner Circle (private Telegram)", free: false, standard: false, bib: true },
      { name: "Numbered Glencairn Topper (#001–100)", free: false, standard: false, bib: true },
      { name: "Permanent Founder badge", free: false, standard: false, bib: true },
      { name: "Exclusive sticker pack", free: false, standard: false, bib: true },
      { name: "2× entries in all drawings", free: false, standard: false, bib: true },
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

function FreePill({ active }: { active: boolean }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-dm-sans)",
        fontSize: "11px",
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "100px",
        background: active
          ? "rgba(245,237,214,0.08)"
          : "rgba(255,255,255,0.04)",
        color: active ? "rgba(245,237,214,0.6)" : "rgba(140,100,90,0.5)",
        border: active
          ? "1px solid rgba(245,237,214,0.15)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {active ? "✓" : "✗"} Free
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
                  gridTemplateColumns: "1fr 120px 120px 140px",
                  padding: "16px 24px",
                  background: "rgba(255,255,255,0.03)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span />
                {/* Free column header */}
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "rgba(245,237,214,0.35)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Free
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      color: "rgba(245,237,214,0.25)",
                      marginTop: "2px",
                    }}
                  >
                    $0
                  </div>
                </div>
                {/* Standard column header */}
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "rgba(245,237,214,0.5)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Standard
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      color: "rgba(245,237,214,0.35)",
                      marginTop: "2px",
                    }}
                  >
                    $10/mo
                  </div>
                </div>
                {/* Bottled in Bond column header */}
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--color-amber-rich)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Bottled in Bond
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-jetbrains)",
                      fontSize: "11px",
                      color: "rgba(196,148,58,0.6)",
                      marginTop: "2px",
                    }}
                  >
                    $69 lifetime
                  </div>
                </div>
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
                        <div className="flex gap-2 flex-wrap">
                          <FreePill active={feature.free} />
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
                        gridTemplateColumns: "1fr 120px 120px 140px",
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
                        <CheckMark active={feature.free} />
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
