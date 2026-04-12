"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPin, Search } from "lucide-react";
import type { Store } from "@/hooks/useStores";
import type { Bottle } from "@/data/bottles";
import { useLocationStore, getDistanceMiles, formatDistanceMiles } from "@/lib/location";
import { cleanBrandName } from "@/lib/drops";

interface HuntMapProps {
  stores: Store[];
  bottles: Bottle[];
  initialBottleId?: string | null;
}

interface StoreWithDistance extends Store {
  distanceMiles: number | null;
}

function normalizeName(value: string): string {
  return cleanBrandName(value).toLowerCase().trim();
}

function getBottleLabel(bottle: Bottle): string {
  return bottle.state ? `${bottle.name} · ${bottle.state}` : bottle.name;
}

function FlyToLocation({ center }: { center: LatLngExpression }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 10, { duration: 1.2 });
  }, [center, map]);
  return null;
}

export default function HuntMap({ stores, bottles, initialBottleId }: HuntMapProps) {
  const { userLocation } = useLocationStore();
  const [selectedBottleId, setSelectedBottleId] = useState<string>(initialBottleId || "all");
  const [storeQuery, setStoreQuery] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const bottleOptions = useMemo(() => {
    const seen = new Set<string>();
    return bottles
      .filter((bottle) => {
        const key = `${normalizeName(bottle.name)}|${bottle.state || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bottles]);

  const selectedBottle = useMemo(
    () => bottleOptions.find((bottle) => bottle.id === selectedBottleId) || null,
    [bottleOptions, selectedBottleId]
  );

  const filteredStores = useMemo<StoreWithDistance[]>(() => {
    const query = storeQuery.trim().toLowerCase();
    return stores
      .filter((store) => {
        if (!query) return true;
        const haystack = `${store.name || ""} ${store.city} ${store.county || ""} ${store.address || ""}`.toLowerCase();
        return haystack.includes(query);
      })
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
      });
  }, [stores, storeQuery, userLocation]);

  const selectedStore = filteredStores.find((store) => store.id === selectedStoreId) || filteredStores[0] || null;

  const mapCenter: LatLngExpression = selectedStore?.lat && selectedStore?.lng
    ? [selectedStore.lat, selectedStore.lng]
    : userLocation
      ? [userLocation.lat, userLocation.lng]
      : [37.8, -78.5];

  useEffect(() => {
    if (!selectedStoreId && filteredStores.length > 0) {
      setSelectedStoreId(filteredStores[0].id);
    }
  }, [filteredStores, selectedStoreId]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
        gap: 20,
        minHeight: "calc(100vh - 180px)",
      }}
      className="hunt-map-grid"
    >
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20,
          background: "rgba(255,255,255,0.03)",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 0,
        }}
      >
        <div>
          <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Setup
          </p>
          <h2 style={{ margin: "8px 0 6px", fontFamily: "var(--font-playfair)", fontSize: 28, color: "var(--color-text-primary)" }}>
            Bottles and stores near you
          </h2>
          <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            Pick a bottle, narrow to nearby stores, and jump straight into the map.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>Bottle</label>
          <select
            value={selectedBottleId}
            onChange={(e) => setSelectedBottleId(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(196,148,58,0.18)",
              background: "rgba(16,12,9,0.9)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-dm-sans)",
              fontSize: 14,
            }}
          >
            <option value="all">All bottles</option>
            {bottleOptions.map((bottle) => (
              <option key={bottle.id} value={bottle.id}>{getBottleLabel(bottle)}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>Store search</label>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--color-text-tertiary)" }} />
            <input
              value={storeQuery}
              onChange={(e) => setStoreQuery(e.target.value)}
              placeholder="Search city, county, or address"
              style={{
                width: "100%",
                padding: "12px 14px 12px 38px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(16,12,9,0.9)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-dm-sans)",
                fontSize: 14,
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {userLocation && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-accent-amber)", background: "rgba(196,148,58,0.1)", border: "1px solid rgba(196,148,58,0.22)", borderRadius: 999, padding: "6px 10px" }}>
              <Crosshair size={12} />
              Sorting by distance from {userLocation.label}
            </span>
          )}
          {selectedBottle && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: "6px 10px" }}>
              <MapPin size={12} />
              {selectedBottle.name}
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingRight: 4 }}>
          {filteredStores.slice(0, 50).map((store) => {
            const isActive = store.id === selectedStore?.id;
            return (
              <button
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: isActive ? "1px solid rgba(196,148,58,0.45)" : "1px solid rgba(255,255,255,0.05)",
                  background: isActive ? "rgba(196,148,58,0.09)" : "rgba(255,255,255,0.02)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 4 }}>
                      {store.name || `${store.city || store.state} store`}
                    </div>
                    <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                      {store.address || "Address unavailable"}
                    </div>
                    <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 4 }}>
                      {[store.city, store.state].filter(Boolean).join(", ")}
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

      <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", minHeight: 540 }}>
        <MapContainer center={mapCenter} zoom={7} scrollWheelZoom style={{ width: "100%", height: "100%", minHeight: 540, background: "#0D0B07" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <FlyToLocation center={mapCenter} />
          {filteredStores.filter((store) => store.lat != null && store.lng != null).slice(0, 200).map((store) => (
            <CircleMarker
              key={store.id}
              center={[store.lat!, store.lng!]}
              radius={store.id === selectedStore?.id ? 9 : 6}
              pathOptions={{
                fillColor: store.id === selectedStore?.id ? "#D4920B" : "#B87333",
                fillOpacity: store.id === selectedStore?.id ? 0.9 : 0.65,
                color: "rgba(255,255,255,0.18)",
                weight: 1,
              }}
              eventHandlers={{ click: () => setSelectedStoreId(store.id) }}
            >
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{store.name || `${store.city || store.state} store`}</div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>{store.address || "Address unavailable"}</div>
                  <div style={{ fontSize: 12, color: "#555" }}>{[store.city, store.state].filter(Boolean).join(", ")}</div>
                  {userLocation && store.distanceMiles != null && (
                    <div style={{ fontSize: 12, marginTop: 8 }}>{formatDistanceMiles(store.distanceMiles)} away</div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
