"use client";

import { CheckCircle2, MapPinned, BellRing, Target } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";

const bullets = [
  "Focus on stores with actual recent movement instead of driving blind",
  "See distance and signal together, so your first stop is smarter",
  "Build bottle-plus-store hunts now, then layer in member alerts on top",
];

export default function MapShowcase() {
  return (
    <section
      style={{
        backgroundColor: "#15110D",
        paddingTop: "72px",
        paddingBottom: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 48px)",
        }}
      >
        <div className="map-showcase-grid" style={{ display: "grid", gridTemplateColumns: "0.92fr 1.08fr", gap: 24, alignItems: "center" }}>
          <div>
            <ScrollReveal>
              <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Hunt map
              </p>
              <h2 style={{ margin: "12px 0 14px", fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 6vw, 48px)", lineHeight: 1.02, color: "var(--color-text-primary)" }}>
                The map is where the product starts feeling unfair.
              </h2>
              <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.75, color: "var(--color-text-secondary)", maxWidth: 540 }}>
                Public drop data is interesting. A map that ranks nearby stores by signal, distance, and bottle fit is useful. That shift, from passive feed to active hunt board, is the real differentiator.
              </p>
            </ScrollReveal>

            <div style={{ display: "grid", gap: 12, marginTop: 26 }}>
              {bullets.map((bullet) => (
                <div key={bullet} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <CheckCircle2 size={18} style={{ color: "var(--color-accent-amber)", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, lineHeight: 1.65, color: "var(--color-text-secondary)" }}>{bullet}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
              {[
                { icon: <MapPinned size={14} />, label: "Live store positions" },
                { icon: <Target size={14} />, label: "Bottle-specific hunts" },
                { icon: <BellRing size={14} />, label: "Alerts layer on next" },
              ].map((item) => (
                <div key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)", fontSize: 13 }}>
                  <span style={{ color: "var(--color-accent-amber)" }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <ScrollReveal delay={100}>
            <div style={{ borderRadius: 28, border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)", padding: 18, boxShadow: "0 30px 80px rgba(0,0,0,0.28)" }}>
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", position: "relative", minHeight: 320 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/map-preview.png"
                    alt="CaskSignal hunt map preview"
                    style={{ width: "100%", height: 320, objectFit: "cover", filter: "brightness(0.72) contrast(1.02) saturate(0.9)" }}
                  />
                  <div style={{ position: "absolute", top: 14, left: 14, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,7,6,0.72)", backdropFilter: "blur(10px)", fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-primary)" }}>
                    E.H. Taylor · 4 nearby stores with signal
                  </div>
                  <div style={{ position: "absolute", right: 14, bottom: 14, width: "min(280px, calc(100% - 28px))", borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(10,9,8,0.82)", backdropFilter: "blur(12px)", overflow: "hidden" }}>
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: "var(--font-jetbrains)", fontSize: 10, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Selected store
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ fontFamily: "var(--font-playfair)", fontSize: 22, color: "var(--color-text-primary)", marginBottom: 6 }}>ABC #247</div>
                      <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.55, marginBottom: 12 }}>
                        Raleigh, NC · 14 mi away
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {[
                          "E.H. Taylor · 8m ago",
                          "Blanton's · 31m ago",
                          "Weller Antique 107 · 1h ago",
                        ].map((item) => (
                          <div key={item} style={{ padding: "9px 10px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-primary)" }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                  {[
                    { value: "Nearby", label: "Distance-ranked stores" },
                    { value: "Specific", label: "Bottle + store targeting" },
                    { value: "Faster", label: "Better first stop" },
                  ].map((card) => (
                    <div key={card.label} style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.025)", padding: "14px 14px 12px" }}>
                      <div style={{ fontFamily: "var(--font-playfair)", fontSize: 22, color: "var(--color-text-primary)", marginBottom: 4 }}>{card.value}</div>
                      <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, lineHeight: 1.5, color: "var(--color-text-tertiary)" }}>{card.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
