"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useStores } from "@/hooks/useStores";
import { useBottles } from "@/hooks/useBottles";
import { useDrops } from "@/hooks/useDrops";

const Map = dynamic(() => import("@/components/HuntMap"), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: "calc(100vh - 140px)", borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, color: "var(--color-text-tertiary)" }}>
        Loading live store map...
      </p>
    </div>
  ),
});

export default function MapPageClient() {
  const { stores, loading: storesLoading } = useStores();
  const { bottles, loading: bottlesLoading } = useBottles();
  const { drops, loading: dropsLoading } = useDrops();

  const ready = useMemo(() => !storesLoading && !bottlesLoading && !dropsLoading, [storesLoading, bottlesLoading, dropsLoading]);

  return (
    <section style={{ maxWidth: 1600, margin: "0 auto", padding: "0 clamp(12px, 2vw, 24px) 24px" }}>
      {ready ? (
        <Map stores={stores} bottles={bottles} drops={drops} />
      ) : (
        <div style={{ minHeight: "calc(100vh - 140px)", borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, color: "var(--color-text-tertiary)" }}>
            Loading live store map...
          </p>
        </div>
      )}
    </section>
  );
}
