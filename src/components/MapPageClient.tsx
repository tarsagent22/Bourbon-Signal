"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import SetLocationButton from "@/components/SetLocationButton";
import { useStores } from "@/hooks/useStores";
import { useBottles } from "@/hooks/useBottles";

const HuntMap = dynamic(() => import("@/components/HuntMap"), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: 420, borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, color: "var(--color-text-tertiary)" }}>
        Loading live store map...
      </p>
    </div>
  ),
});

export default function MapPageClient() {
  const { stores, loading: storesLoading } = useStores();
  const { bottles, loading: bottlesLoading } = useBottles();

  const ready = useMemo(() => !storesLoading && !bottlesLoading, [storesLoading, bottlesLoading]);

  return (
    <section style={{ maxWidth: 1400, margin: "0 auto", padding: "0 clamp(20px, 4vw, 40px) 64px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 28 }}>
        <div style={{ maxWidth: 720 }}>
          <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Live hunt map
          </p>
          <h1 style={{ margin: "10px 0 12px", fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 6vw, 56px)", lineHeight: 1.02, color: "var(--color-cream)" }}>
            See bottles and stores near you, right out of the gate.
          </h1>
          <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
            Set your location, sort nearby stores by distance, and jump straight into the hunt for the bottle you care about.
          </p>
        </div>
        <SetLocationButton />
      </div>

      {ready ? (
        <HuntMap stores={stores} bottles={bottles} />
      ) : (
        <div style={{ minHeight: 420, borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, color: "var(--color-text-tertiary)" }}>
            Loading live store map...
          </p>
        </div>
      )}
    </section>
  );
}
