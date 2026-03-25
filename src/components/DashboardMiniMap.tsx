"use client";

import { useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { stores } from "@/data/stores";
import dropsData from "@/data/drops.json";
import { cleanBrandName } from "@/lib/drops";

interface Drop {
  timestamp: string;
  event_type: string;
  brand_name: string;
  store_address?: string;
  board_name?: string;
  rarity_tier: string;
}

function normalizeAddr(addr: string): string {
  return addr.replace(/\.\s*/g, ". ").replace(/\s{2,}/g, " ").trim().toLowerCase();
}

function computeHotStores(allDrops: Drop[]) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Build drop map by normalized address
  const dropsByAddr: Record<string, { rarity_tier: string; timestamp: string }[]> = {};
  for (const drop of allDrops) {
    if (drop.event_type === "in_store" && drop.store_address) {
      const norm = normalizeAddr(drop.store_address);
      if (!dropsByAddr[norm]) dropsByAddr[norm] = [];
      dropsByAddr[norm].push({ rarity_tier: drop.rarity_tier, timestamp: drop.timestamp });
    }
  }

  // Also map shipments to stores
  const boardToStore: Record<string, typeof stores[0]> = {};
  for (const store of stores) {
    const countyLower = store.county.toLowerCase();
    const cityLower = store.city.toLowerCase();
    boardToStore[countyLower] = store;
    boardToStore[cityLower] = store;
    boardToStore[`${cityLower} abc board`] = store;
    boardToStore[`${countyLower} abc board`] = store;
  }

  for (const drop of allDrops) {
    if (drop.event_type === "new_shipment" && drop.board_name) {
      const matched = boardToStore[drop.board_name.toLowerCase()];
      if (matched) {
        const norm = normalizeAddr(matched.address);
        if (!dropsByAddr[norm]) dropsByAddr[norm] = [];
        dropsByAddr[norm].push({ rarity_tier: drop.rarity_tier, timestamp: drop.timestamp });
      }
    }
  }

  let activeCount = 0;
  const hotStores: { lat: number; lng: number; tier: string }[] = [];

  for (const store of stores) {
    const norm = normalizeAddr(store.address);
    const storeDrops = dropsByAddr[norm] || [];
    const recentDrops = storeDrops.filter((d) => new Date(d.timestamp) >= sevenDaysAgo);
    if (recentDrops.length > 0) {
      activeCount++;
      const tierOrder = ["unicorn", "allocated", "limited"];
      const highestTier = tierOrder.find((t) =>
        recentDrops.some((d) => d.rarity_tier === t)
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
  const { hotStores, activeCount } = useMemo(
    () => computeHotStores(dropsData.drops as Drop[]),
    []
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
          center={[35.55, -79.85]}
          zoom={7}
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

      {/* Footer */}
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
          href="/map"
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
          View Hunt Map &rarr;
        </a>
      </div>
    </div>
  );
}
