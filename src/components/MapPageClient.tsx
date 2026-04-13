"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Compass, MapPinned, Route } from "lucide-react";
import SetLocationButton from "@/components/SetLocationButton";
import { useStores } from "@/hooks/useStores";
import { useBottles } from "@/hooks/useBottles";
import { useDrops } from "@/hooks/useDrops";

const Map = dynamic(() => import("@/components/HuntMap"), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: 420, borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, color: "var(--color-text-tertiary)" }}>
        Loading live store map...
      </p>
    </div>
  ),
});

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ width: 30, height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(196,148,58,0.12)", color: "var(--color-accent-amber)", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
        <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{value}</div>
      </div>
    </div>
  );
}

export default function MapPageClient() {
  const { stores, loading: storesLoading } = useStores();
  const { bottles, loading: bottlesLoading } = useBottles();
  const { drops, loading: dropsLoading } = useDrops();

  const ready = useMemo(() => !storesLoading && !bottlesLoading && !dropsLoading, [storesLoading, bottlesLoading, dropsLoading]);
  const mappableStoreCount = useMemo(() => stores.filter((store) => store.isMappable).length, [stores]);
  const liveDropCount = useMemo(() => drops.length, [drops]);

  return (
    <section style={{ maxWidth: 1440, margin: "0 auto", padding: "0 clamp(20px, 4vw, 40px) 64px" }}>
      <div style={{ marginBottom: 28, padding: "clamp(22px, 3vw, 30px)", borderRadius: 28, border: "1px solid rgba(255,255,255,0.06)", background: "radial-gradient(circle at top left, rgba(196,148,58,0.12), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 100%)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 22 }}>
          <div style={{ maxWidth: 760 }}>
            <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Hunt map
            </p>
            <h1 style={{ margin: "10px 0 12px", fontFamily: "var(--font-playfair)", fontSize: "clamp(34px, 6vw, 58px)", lineHeight: 0.98, color: "var(--color-cream)" }}>
              Find the right bottle, at the right store, without digging through noise.
            </h1>
            <p style={{ margin: 0, maxWidth: 660, fontFamily: "var(--font-dm-sans)", fontSize: 16, lineHeight: 1.7, color: "var(--color-text-secondary)" }}>
              Start with your location, tighten the field with the bottles that matter, then work an actual hunt list instead of staring at a dead map.
            </p>
          </div>
          <SetLocationButton />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <StatPill icon={<MapPinned size={16} />} label="Mapped stores" value={ready ? `${mappableStoreCount}` : "Loading"} />
          <StatPill icon={<Compass size={16} />} label="Bottle library" value={ready ? `${bottles.length}` : "Loading"} />
          <StatPill icon={<Route size={16} />} label="Recent drop records" value={ready ? `${liveDropCount}` : "Loading"} />
        </div>
      </div>

      {ready ? (
        <Map stores={stores} bottles={bottles} drops={drops} />
      ) : (
        <div style={{ minHeight: 420, borderRadius: 24, border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: 15, color: "var(--color-text-tertiary)" }}>
            Loading live store map...
          </p>
        </div>
      )}
    </section>
  );
}
