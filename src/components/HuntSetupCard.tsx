"use client";

import { useMemo, useState } from "react";
import type { Bottle } from "@/data/bottles";
import type { Store } from "@/hooks/useStores";
import { useWatchlistStore } from "@/lib/watchlist";
import { useLocationStore, getDistanceMiles, formatDistanceMiles } from "@/lib/location";

interface HuntSetupCardProps {
  bottles: Bottle[];
  stores: Store[];
}

export default function HuntSetupCard({ bottles, stores }: HuntSetupCardProps) {
  const { userLocation } = useLocationStore();
  const { saveHuntTarget, huntTargets } = useWatchlistStore();
  const [bottleId, setBottleId] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  const sortedStores = useMemo(() => {
    return [...stores]
      .map((store) => ({
        ...store,
        distanceMiles: userLocation && store.lat != null && store.lng != null
          ? getDistanceMiles(userLocation, { lat: store.lat, lng: store.lng })
          : null,
      }))
      .sort((a, b) => {
        if (a.distanceMiles != null && b.distanceMiles != null) return a.distanceMiles - b.distanceMiles;
        if (a.distanceMiles != null) return -1;
        if (b.distanceMiles != null) return 1;
        return (a.city || "").localeCompare(b.city || "");
      })
      .slice(0, 12);
  }, [stores, userLocation]);

  const savedTarget = huntTargets.find((target) => target.bottleId === bottleId);

  const handleToggleStore = (storeId: string) => {
    setSelectedStoreIds((current) =>
      current.includes(storeId)
        ? current.filter((id) => id !== storeId)
        : [...current, storeId]
    );
  };

  const handleSave = () => {
    if (!bottleId || selectedStoreIds.length === 0) return;
    saveHuntTarget({ bottleId, storeIds: selectedStoreIds, createdAt: Date.now() });
  };

  return (
    <div style={{ borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", padding: 22 }}>
      <div style={{ marginBottom: 18 }}>
        <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Setup
        </p>
        <h3 style={{ margin: "8px 0 8px", fontFamily: "var(--font-playfair)", fontSize: 28, color: "var(--color-text-primary)" }}>
          Pick the bottle. Pick the stores. You’re set.
        </h3>
        <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: 14, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
          This is the workflow people expect. No buried preferences, no dead ends.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }} className="hunt-setup-grid">
        <div>
          <label style={{ display: "block", marginBottom: 8, fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            Bottle
          </label>
          <select
            value={bottleId}
            onChange={(e) => setBottleId(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(196,148,58,0.18)", background: "rgba(16,12,9,0.92)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14, marginBottom: 16 }}
          >
            <option value="">Choose a bottle</option>
            {bottles.slice().sort((a, b) => a.name.localeCompare(b.name)).map((bottle) => (
              <option key={bottle.id} value={bottle.id}>{bottle.name}{bottle.state ? ` · ${bottle.state}` : ""}</option>
            ))}
          </select>

          <label style={{ display: "block", marginBottom: 8, fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            Stores near you
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
            {sortedStores.map((store) => {
              const selected = selectedStoreIds.includes(store.id);
              return (
                <button
                  key={store.id}
                  onClick={() => handleToggleStore(store.id)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: selected ? "1px solid rgba(196,148,58,0.4)" : "1px solid rgba(255,255,255,0.05)",
                    background: selected ? "rgba(196,148,58,0.09)" : "rgba(255,255,255,0.02)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {store.name || `${store.state} store`}
                      </div>
                      <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                        {store.address || "Address unavailable"}
                      </div>
                    </div>
                    {store.distanceMiles != null && (
                      <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", whiteSpace: "nowrap" }}>
                        {formatDistanceMiles(store.distanceMiles)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ borderRadius: 16, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,8,6,0.45)", padding: 18, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)", marginBottom: 10 }}>
              Hunt summary
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 4 }}>
                Bottle
              </div>
              <div style={{ fontFamily: "var(--font-playfair)", fontSize: 22, color: "var(--color-text-primary)" }}>
                {bottleId ? bottles.find((bottle) => bottle.id === bottleId)?.name : "Choose a bottle"}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 6 }}>
                Tracking
              </div>
              <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                {selectedStoreIds.length > 0 ? `${selectedStoreIds.length} store${selectedStoreIds.length === 1 ? "" : "s"} selected` : "Pick one or more stores to finish the setup."}
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={handleSave}
              disabled={!bottleId || selectedStoreIds.length === 0}
              style={{
                width: "100%",
                marginTop: 18,
                padding: "13px 16px",
                borderRadius: 10,
                border: "none",
                cursor: !bottleId || selectedStoreIds.length === 0 ? "not-allowed" : "pointer",
                background: !bottleId || selectedStoreIds.length === 0
                  ? "rgba(255,255,255,0.08)"
                  : "linear-gradient(135deg, var(--color-accent-amber) 0%, var(--color-accent-gold) 100%)",
                color: !bottleId || selectedStoreIds.length === 0 ? "var(--color-text-tertiary)" : "#1A1510",
                fontFamily: "var(--font-dm-sans)",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Save this hunt
            </button>
            {savedTarget && (
              <p style={{ margin: "10px 0 0", fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-accent-amber)" }}>
                Saved. This bottle now has a store-specific setup.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
