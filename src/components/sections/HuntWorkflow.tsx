"use client";

import { MapPin, BellRing, Crosshair, Route } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";

const steps = [
  {
    eyebrow: "01",
    title: "Set your hunt area",
    body: "Drop in your location or ZIP, then narrow the field to the bottles and stores that are actually worth the drive.",
    icon: MapPin,
  },
  {
    eyebrow: "02",
    title: "See live signal, not noise",
    body: "The feed shows real state activity across NC, VA, and PA, while the hunt map helps you focus on stores with recent movement.",
    icon: Crosshair,
  },
  {
    eyebrow: "03",
    title: "Build a real store board",
    body: "Track the bottles you care about, compare stores by distance and signal strength, and stop guessing where to start.",
    icon: Route,
  },
  {
    eyebrow: "04",
    title: "Get notified the moment it matters",
    body: "Member alerts are the final layer, bottle-specific, store-aware notifications designed to turn signal into action fast.",
    icon: BellRing,
  },
];

export default function HuntWorkflow() {
  return (
    <section
      style={{
        background: "linear-gradient(180deg, var(--color-bg-primary) 0%, #120F0C 100%)",
        paddingTop: "72px",
        paddingBottom: "72px",
        width: "100%",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          padding: "0 clamp(20px, 5vw, 48px)",
        }}
      >
        <ScrollReveal>
          <div style={{ textAlign: "center", marginBottom: 42 }}>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-jetbrains)",
                fontSize: 11,
                color: "var(--color-accent-amber)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              The member workflow
            </p>
            <h2
              style={{
                margin: "12px auto 12px",
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(32px, 6vw, 48px)",
                lineHeight: 1.02,
                color: "var(--color-text-primary)",
                maxWidth: 760,
              }}
            >
              This should feel like planning a hunt, not reading a bourbon blog.
            </h2>
            <p
              style={{
                margin: "0 auto",
                maxWidth: 680,
                fontFamily: "var(--font-dm-sans)",
                fontSize: 16,
                lineHeight: 1.7,
                color: "var(--color-text-secondary)",
              }}
            >
              Bourbon Signal works best when it helps you make faster decisions, where to look, what to ignore, and when to move before shelves get wiped.
            </p>
          </div>
        </ScrollReveal>

        <div className="hunt-workflow-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18, alignItems: "stretch" }}>
          <div style={{ borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.02) 100%)", overflow: "hidden" }}>
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.eyebrow}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "92px 1fr",
                    gap: 0,
                    padding: "22px 22px 22px 0",
                    borderBottom: index < steps.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em" }}>{step.eyebrow}</span>
                    <div style={{ width: 42, height: 42, borderRadius: 14, border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-accent-amber)" }}>
                      <Icon size={18} />
                    </div>
                  </div>
                  <div style={{ paddingTop: 2 }}>
                    <div style={{ fontFamily: "var(--font-playfair)", fontSize: 26, color: "var(--color-text-primary)", marginBottom: 8 }}>
                      {step.title}
                    </div>
                    <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                      {step.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: 22 }}>
              <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                Why this flow matters
              </div>
              <div style={{ fontFamily: "var(--font-playfair)", fontSize: 28, lineHeight: 1.08, color: "var(--color-text-primary)", marginBottom: 12 }}>
                Good hunters do not need more content. They need better timing.
              </div>
              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                The product should make a member feel more prepared before they leave the house. The feed proves the data exists. The map and hunt setup turn that data into a plan. Notifications finish the loop.
              </div>
            </div>

            <div style={{ borderRadius: 24, border: "1px solid rgba(196,148,58,0.14)", background: "rgba(196,148,58,0.06)", padding: 22 }}>
              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-amber)", marginBottom: 10 }}>
                Positioning note
              </div>
              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 14, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
                Until alerts are fully live, the homepage should promise a faster hunt workflow first, then frame notifications as the next speed layer, not the only value prop.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
