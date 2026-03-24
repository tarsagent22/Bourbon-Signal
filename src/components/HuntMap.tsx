"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { Map as LeafletMap, CircleMarker as LCircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";

import { stores } from "@/data/stores";
import type { Store } from "@/data/stores";
import dropsData from "@/data/drops.json";
import StorePopup from "@/components/StorePopup";
import MapOverlayLeft from "@/components/MapOverlayLeft";
import MapOverlayRight from "@/components/MapOverlayRight";

// Types
interface Drop {
  timestamp: string;
  event_type: string;
  brand_name: string;
  store_address?: string;
  board_name?: string;
  rarity_tier: string;
  quantity?: number;
}

interface StoreWithStatus extends Store {
  status: "hot" | "warm" | "cold";
  drops: { brand_name: string; rarity_tier: string; timestamp: string }[];
  tiers: Set<string>;
}

interface RecentDrop {
  brand_name: string;
  rarity_tier: string;
  timestamp: string;
  store_address: string;
  county: string;
  storeId: string;
}

// Compute store activity status by cross-referencing with drops
function computeStoreData(allDrops: Drop[]): {
  storesWithStatus: StoreWithStatus[];
  recentDrops: RecentDrop[];
  activeToday: number;
  dropsThisWeek: number;
} {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // In-store drops indexed by address (normalize by removing extra spaces)
  const dropsByAddress: Record<
    string,
    { brand_name: string; rarity_tier: string; timestamp: string }[]
  > = {};
  const allRecentDrops: RecentDrop[] = [];

  for (const drop of allDrops) {
    if (drop.event_type === "in_store" && drop.store_address) {
      const addr = drop.store_address.trim();
      if (!dropsByAddress[addr]) dropsByAddress[addr] = [];
      dropsByAddress[addr].push({
        brand_name: drop.brand_name,
        rarity_tier: drop.rarity_tier,
        timestamp: drop.timestamp,
      });
    }
  }

  // Also create "virtual" drops for shipment events — map board_name to a store
  const boardToStore: Record<string, Store> = {};
  for (const store of stores) {
    const countyLower = store.county.toLowerCase();
    const cityLower = store.city.toLowerCase();
    boardToStore[countyLower] = store;
    boardToStore[cityLower] = store;
    // Also map common board name patterns
    boardToStore[`${cityLower} abc board`] = store;
    boardToStore[`${countyLower} abc board`] = store;
  }

  for (const drop of allDrops) {
    if (drop.event_type === "new_shipment" && drop.board_name) {
      const boardLower = drop.board_name.toLowerCase();
      const matchedStore = boardToStore[boardLower];
      if (matchedStore) {
        const addr = matchedStore.address;
        if (!dropsByAddress[addr]) dropsByAddress[addr] = [];
        dropsByAddress[addr].push({
          brand_name: drop.brand_name,
          rarity_tier: drop.rarity_tier,
          timestamp: drop.timestamp,
        });
      }
    }
  }

  let activeToday = 0;
  let dropsThisWeek = 0;

  const storesWithStatus: StoreWithStatus[] = stores.map((store) => {
    const storeDrops = dropsByAddress[store.address] || [];
    // Sort by most recent first
    storeDrops.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const tiers = new Set(storeDrops.map((d) => d.rarity_tier));

    const hasRecent24h = storeDrops.some(
      (d) => new Date(d.timestamp) >= oneDayAgo
    );
    const hasRecent7d = storeDrops.some(
      (d) => new Date(d.timestamp) >= sevenDaysAgo
    );

    let status: "hot" | "warm" | "cold" = "cold";
    if (hasRecent24h) {
      status = "hot";
      activeToday++;
    } else if (hasRecent7d) {
      status = "warm";
    }

    // Count drops this week for this store
    const weekDropCount = storeDrops.filter(
      (d) => new Date(d.timestamp) >= sevenDaysAgo
    ).length;
    dropsThisWeek += weekDropCount;

    // Add to recent drops feed
    for (const d of storeDrops.slice(0, 3)) {
      allRecentDrops.push({
        ...d,
        store_address: store.address,
        county: store.county,
        storeId: store.id,
      });
    }

    return {
      ...store,
      status,
      drops: storeDrops,
      tiers,
    };
  });

  // Sort recent drops by timestamp, take last 10
  allRecentDrops.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const recentDrops = allRecentDrops.slice(0, 10);

  return { storesWithStatus, recentDrops, activeToday, dropsThisWeek };
}

// Component to handle flyTo imperatively
function FlyToHandler({
  flyToTarget,
}: {
  flyToTarget: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (flyToTarget) {
      map.flyTo([flyToTarget.lat, flyToTarget.lng], 14, { duration: 1.5 });
    }
  }, [flyToTarget, map]);
  return null;
}

export default function HuntMap() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRefs = useRef<Record<string, LCircleMarker>>({});

  const { storesWithStatus, recentDrops, activeToday, dropsThisWeek } =
    useMemo(() => computeStoreData(dropsData.drops as Drop[]), []);

  // Filter stores by tier
  const filteredStores = useMemo(() => {
    if (activeFilter === "All") return storesWithStatus;
    const tierKey = activeFilter.toLowerCase();
    return storesWithStatus.filter((s) => s.tiers.has(tierKey));
  }, [activeFilter, storesWithStatus]);

  const handleDropClick = useCallback(
    (storeId: string) => {
      const store = storesWithStatus.find((s) => s.id === storeId);
      if (store) {
        setFlyToTarget({ lat: store.lat, lng: store.lng });
        // Open popup after flyTo completes
        setTimeout(() => {
          const marker = markerRefs.current[storeId];
          if (marker) {
            marker.openPopup();
          }
        }, 1600);
      }
    },
    [storesWithStatus]
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        background: "var(--color-bg-primary)",
      }}
    >
      <MapContainer
        center={[35.55, -79.85]}
        zoom={7}
        minZoom={6}
        maxZoom={18}
        scrollWheelZoom={true}
        zoomControl={false}
        style={{ width: "100%", height: "100%", background: "#0D0B07" }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ZoomControl position="bottomright" />
        <FlyToHandler flyToTarget={flyToTarget} />

        {filteredStores.map((store) => {
          const isHot = store.status === "hot";
          const isWarm = store.status === "warm";

          return (
            <CircleMarker
              key={store.id}
              center={[store.lat, store.lng]}
              radius={isHot ? 10 : isWarm ? 7 : 5}
              pathOptions={{
                fillColor: isHot || isWarm ? "#C4943A" : "#6B6560",
                fillOpacity: isHot ? 0.9 : isWarm ? 0.5 : 0.3,
                color: isHot ? "#C4943A" : isWarm ? "#C4943A" : "transparent",
                weight: isHot ? 2 : isWarm ? 1 : 0,
                className: isHot ? "marker-pulse" : undefined,
              }}
              ref={(ref) => {
                if (ref) {
                  markerRefs.current[store.id] = ref;
                }
              }}
            >
              <Popup>
                <StorePopup
                  store={store}
                  drops={store.drops}
                  status={store.status}
                />
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Overlay panels */}
      <MapOverlayLeft
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        activeToday={activeToday}
        dropsThisWeek={dropsThisWeek}
        isOpen={leftPanelOpen}
        onToggle={() => setLeftPanelOpen(!leftPanelOpen)}
      />
      <MapOverlayRight
        recentDrops={recentDrops}
        isOpen={rightPanelOpen}
        onToggle={() => setRightPanelOpen(!rightPanelOpen)}
        onDropClick={handleDropClick}
      />
    </div>
  );
}
