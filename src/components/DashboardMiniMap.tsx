"use client";

import { useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { useStores } from "@/hooks/useStores";
import { useDrops } from "@/hooks/useDrops";

interface Drop {
  timestamp: string;
  event_type: string;
  brand_name: string;
  store_address?: string;
  board_name?: string;
  store_name?: string;
  store_city?: string;
  state?: string;
  rarity_tier: string;
}

function normalizeAddr(addr?: string): string {
  return (addr || "").replace(/\.\s*/g, ". ").replace(/\s{2,}/g, " ").trim().toLowerCase();
}

function computeHotStores(allDrops: Drop[], stores: ReturnType<typeof useStores>["stores"]) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const dropsByLookup: Record<string, { rarity_tier: string; timestamp: string }[]> = {};
  for (const drop of allDrops) {
    if (new Date(drop.timestamp) < thirtyDaysAgo) continue;
    const keys = [
      normalizeAddr(drop.store_address),
      normalizeAddr(drop.store_name),
      normalizeAddr(drop.board_name),
      normalizeAddr([drop.store_city, drop.state].filter(Boolean).join(" ")),
    ].filter(Boolean);

    for (const key of keys) {
      dropsByLookup[key] ??= [];
      dropsByLookup[key].push({ rarity_tier: drop.rarity_tier, timestamp: drop.timestamp });
    }
  }

  let activeCount = 0;
  const hotStores: { lat: number; lng: number; tier: string }[] = [];

  for (const store of stores) {
    if (!store.isMappable || store.lat == null || store.lng == null) continue;
    const keys = [
      normalizeAddr(store.address),
      normalizeAddr(store.name),
      normalizeAddr(store.displayLabel),
      normalizeAddr([store.city, store.state].filter(Boolean).join(" ")),
    ].filter(Boolean);
    const storeDrops = keys.flatMap((key) => dropsByLookup[key] || []);
    if (storeDrops.length > 0) {
      activeCount++;
      const tierOrder = ["unicorn", "allocated", "limited"];
      const highestTier = tierOrder.find((t) =>
        storeDrops.some((d) => d.rarity_tier === t)
      ) || "limited";
      hotStores.push({ lat: store.lat, lng: store.lng, tier: highestTier });
    }
  }

  return { hotStores, activeCount };
}

const tierFillMap: Record<string, string> = {
  unicorn: "#C4943A",
  allocated: "#B87333",
  limited: "#6B6560",
};

export default function DashboardMiniMap() {
  const { stores } = useStores();
  const { drops } = useDrops({ limit: 1000 });
  const { hotStores, activeCount } = useMemo(
    () => computeHotStores(drops as Drop[], stores),
    [drops, stores]
  );

  return (
    <div
      style={{
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "200px",
          pointerEvents: "none",
        }}
      >
        <MapContainer
          center={[39.5, -84.5]}
          zoom={5}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
          doubleClickZoom={false}
          touchZoom={false}
          keyboard={false}
          attributionControl={false}
          style={{ width: "100%", height: "100%", background: "#0D0B07" }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {hotStores.map((store, i) => (
            <CircleMarker
              key={i}
              center={[store.lat, store.lng]}
              radius={5}
              pathOptions={{
                fillColor: tierFillMap[store.tier] || "#6B6560",
                fillOpacity: 0.7,
                color: "transparent",
                weight: 0,
              }}
            />
          ))}
        </MapContainer>
      </div>

      <div
        className="flex items-center justify-between"
        style={{
          padding: "12px 16px",
          background: "rgba(0,0,0,0.15)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains)",
            fontSize: "11px",
            color: "var(--color-text-tertiary)",
          }}
        >
          <span style={{ color: "var(--color-accent-amber)" }}>{activeCount}</span>{" "}
          stores active
        </span>
        <a
          href="/#drops"
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--color-accent-amber)",
            textDecoration: "none",
            transition: "opacity 200ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          View Feed &rarr;
        </a>
      </div>
    </div>
  );
}
