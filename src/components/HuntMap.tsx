"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, X } from "lucide-react";
import type { Store } from "@/hooks/useStores";
import type { Bottle } from "@/data/bottles";
import type { DropEvent } from "@/lib/drops";
import { cleanBrandName, formatRelativeTime } from "@/lib/drops";
import { ZIP_CENTROIDS } from "@/data/zip-centroids";

interface HuntMapProps {
  stores: Store[];
  bottles: Bottle[];
  drops: DropEvent[];
}

type Mode = "bottle" | "store";

interface BottleOption {
  id: string;
  label: string;
  canonicalName: string;
}

interface DropMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  quantity: number | null;
  timestamp: string;
  storeName?: string;
  boardName?: string;
}

function normalizeName(value: string) {
  return cleanBrandName(value).toLowerCase().trim();
}

function resolveArea(query: string): { center: LatLngExpression; label: string } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (/^\d{5}$/.test(trimmed)) {
    const centroid = ZIP_CENTROIDS[trimmed];
    if (!centroid) return null;
    return {
      center: [centroid.lat, centroid.lng],
      label: `${centroid.city}, ${centroid.state} ${centroid.zip}`,
    };
  }

  const match = Object.values(ZIP_CENTROIDS).find((entry) =>
    `${entry.city}, ${entry.state}`.toLowerCase() === trimmed.toLowerCase() ||
    entry.city.toLowerCase() === trimmed.toLowerCase()
  );

  if (!match) return null;

  return {
    center: [match.lat, match.lng],
    label: `${match.city}, ${match.state}`,
  };
}

function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function FlyToView({ center, zoom }: { center: LatLngExpression; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.1 });
  }, [center, zoom, map]);
  return null;
}

export default function HuntMap({ stores, bottles, drops }: HuntMapProps) {
  const [mode, setMode] = useState<Mode>("bottle");
  const [bottleSearch, setBottleSearch] = useState("");
  const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedState, setSelectedState] = useState("IN");
  const [daysBack, setDaysBack] = useState(7);
  const [areaCenter, setAreaCenter] = useState<LatLngExpression>([35.5, -79.0]);
  const [mapZoom, setMapZoom] = useState(6);
  const [areaLabel, setAreaLabel] = useState("East Coast");
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [showOlderStoreData, setShowOlderStoreData] = useState(false);

  const bottleOptions = useMemo<BottleOption[]>(() => {
    const seen = new Set<string>();
    return bottles
      .map((bottle) => ({
        id: bottle.id,
        label: bottle.name,
        canonicalName: normalizeName(bottle.name),
      }))
      .filter((option) => {
        if (!option.canonicalName || seen.has(option.canonicalName)) return false;
        seen.add(option.canonicalName);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [bottles]);

  const bottleSuggestions = useMemo(() => {
    const query = bottleSearch.trim().toLowerCase();
    return bottleOptions
      .filter((option) => !selectedBottleIds.includes(option.id))
      .filter((option) => !query || option.label.toLowerCase().includes(query))
      .slice(0, 10);
  }, [bottleOptions, bottleSearch, selectedBottleIds]);

  const selectedBottleNames = useMemo(
    () => new Set(selectedBottleIds.map((id) => bottleOptions.find((option) => option.id === id)?.canonicalName).filter(Boolean)),
    [selectedBottleIds, bottleOptions]
  );

  const areaPoint = useMemo(() => ({ lat: (areaCenter as [number, number])[0], lng: (areaCenter as [number, number])[1] }), [areaCenter]);

  const handleApplyArea = () => {
    const resolved = resolveArea(locationQuery);
    if (!resolved) return;
    setAreaCenter(resolved.center);
    setAreaLabel(resolved.label);
    setMapZoom(mode === "bottle" ? 10 : 11);
  };

  const filteredDrops = useMemo(() => {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    return drops.filter((drop) => {
      const time = new Date(drop.timestamp).getTime();
      if (time < cutoff) return false;
      if (mode === "bottle" && selectedBottleNames.size > 0) {
        return selectedBottleNames.has(normalizeName(drop.brand_name));
      }
      return true;
    });
  }, [drops, daysBack, mode, selectedBottleNames]);

  const bottleMarkers = useMemo<DropMarker[]>(() => {
    if (mode !== "bottle") return [];
    return filteredDrops
      .map((drop, index) => {
        const lat = typeof (drop as any).lat === "number" ? (drop as any).lat : null;
        const lng = typeof (drop as any).lng === "number" ? (drop as any).lng : null;
        if (lat == null || lng == null) return null;
        if (distanceMiles(areaPoint, { lat, lng }) > 60) return null;
        return {
          id: `${drop.brand_name}-${drop.timestamp}-${index}`,
          lat,
          lng,
          label: cleanBrandName(drop.brand_name),
          quantity: drop.quantity_shipped ?? drop.quantity_in_stock ?? drop.quantity ?? null,
          timestamp: drop.timestamp,
          storeName: drop.store_name,
          boardName: drop.board_name,
        };
      })
      .filter(Boolean) as DropMarker[];
  }, [filteredDrops, mode, areaPoint]);

  const visibleStores = useMemo(() => {
    if (mode !== "store") return [];
    return stores
      .filter((store) => store.state === selectedState)
      .filter((store) => store.lat != null && store.lng != null)
      .filter((store) => distanceMiles(areaPoint, { lat: store.lat!, lng: store.lng! }) <= 60)
      .sort((a, b) => (a.name || a.displayLabel).localeCompare(b.name || b.displayLabel));
  }, [stores, mode, selectedState, areaPoint]);

  useEffect(() => {
    if (mode === "store" && visibleStores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(visibleStores[0].id);
    }
  }, [mode, visibleStores, selectedStoreId]);

  const selectedStore = visibleStores.find((store) => store.id === selectedStoreId) ?? null;

  const recentStoreDrops = useMemo(() => {
    if (!selectedStore) return [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return drops
      .filter((drop) => {
        const time = new Date(drop.timestamp).getTime();
        if (time < cutoff) return false;
        if (drop.store_id && String(drop.store_id) === selectedStore.id) return true;
        if (drop.store_address && selectedStore.address && drop.store_address.toLowerCase() === selectedStore.address.toLowerCase()) return true;
        return false;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [drops, selectedStore]);

  const olderStoreDrops = useMemo(() => {
    if (!selectedStore || !showOlderStoreData) return [];
    const newerCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const olderCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return drops
      .filter((drop) => {
        const time = new Date(drop.timestamp).getTime();
        if (time >= newerCutoff || time < olderCutoff) return false;
        if (drop.store_id && String(drop.store_id) === selectedStore.id) return true;
        if (drop.store_address && selectedStore.address && drop.store_address.toLowerCase() === selectedStore.address.toLowerCase()) return true;
        return false;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [drops, selectedStore, showOlderStoreData]);

  return (
    <div style={{ position: "relative", borderRadius: 24, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", background: "#0D0B07", minHeight: "calc(100vh - 140px)" }}>
      <div style={{ position: "absolute", top: 16, left: 16, right: 16, zIndex: 500, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div style={{ borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(9,8,7,0.82)", backdropFilter: "blur(12px)", padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setMode("bottle")} style={{ flex: 1, borderRadius: 999, border: mode === "bottle" ? "1px solid rgba(196,148,58,0.35)" : "1px solid rgba(255,255,255,0.08)", background: mode === "bottle" ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.03)", color: mode === "bottle" ? "var(--color-accent-amber)" : "var(--color-text-secondary)", padding: "10px 12px", fontFamily: "var(--font-dm-sans)", fontWeight: 700, cursor: "pointer" }}>Search by bottle</button>
            <button onClick={() => setMode("store")} style={{ flex: 1, borderRadius: 999, border: mode === "store" ? "1px solid rgba(196,148,58,0.35)" : "1px solid rgba(255,255,255,0.08)", background: mode === "store" ? "rgba(196,148,58,0.12)" : "rgba(255,255,255,0.03)", color: mode === "store" ? "var(--color-accent-amber)" : "var(--color-text-secondary)", padding: "10px 12px", fontFamily: "var(--font-dm-sans)", fontWeight: 700, cursor: "pointer" }}>Search by store/board</button>
          </div>

          {mode === "bottle" ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--color-text-tertiary)" }} />
                <input value={bottleSearch} onChange={(e) => setBottleSearch(e.target.value)} placeholder="Search bottle" style={{ width: "100%", padding: "12px 14px 12px 38px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(16,12,9,0.92)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14 }} />
                {bottleSearch.trim() && bottleSuggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 510, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(12,10,8,0.98)" }}>
                    {bottleSuggestions.map((option) => (
                      <button key={option.id} onClick={() => { setSelectedBottleIds((current) => [...current, option.id]); setBottleSearch(""); }} style={{ width: "100%", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "transparent", color: "var(--color-text-primary)", textAlign: "left", padding: "12px 14px", cursor: "pointer", fontFamily: "var(--font-dm-sans)", fontSize: 13 }}>{option.label}</button>
                    ))}
                  </div>
                )}
              </div>
              {selectedBottleIds.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedBottleIds.map((id) => {
                    const option = bottleOptions.find((entry) => entry.id === id);
                    if (!option) return null;
                    return <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "6px 10px", background: "rgba(196,148,58,0.10)", border: "1px solid rgba(196,148,58,0.22)", color: "var(--color-accent-amber)", fontFamily: "var(--font-dm-sans)", fontSize: 12 }}>{option.label}<button onClick={() => setSelectedBottleIds((current) => current.filter((entry) => entry !== id))} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", padding: 0 }}><X size={12} /></button></span>;
                  })}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                <input value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="ZIP code or city" style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(16,12,9,0.92)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14 }} />
                <select value={String(daysBack)} onChange={(e) => setDaysBack(Number(e.target.value))} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(16,12,9,0.92)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14 }}>
                  {[1, 3, 7, 14].map((days) => <option key={days} value={days}>{`Last ${days} day${days === 1 ? "" : "s"}`}</option>)}
                </select>
                <button onClick={handleApplyArea} style={{ borderRadius: 12, border: "1px solid rgba(196,148,58,0.24)", background: "rgba(196,148,58,0.10)", color: "var(--color-accent-amber)", padding: "12px 14px", fontFamily: "var(--font-dm-sans)", fontWeight: 700, cursor: "pointer" }}>Go</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 8 }}>
                <select value={selectedState} onChange={(e) => setSelectedState(e.target.value)} style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(16,12,9,0.92)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14 }}>
                  <option value="IN">Indiana</option>
                  <option value="NC">North Carolina</option>
                  <option value="VA">Virginia</option>
                  <option value="PA">Pennsylvania</option>
                </select>
                <input value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="ZIP code or city" style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(16,12,9,0.92)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14 }} />
                <button onClick={handleApplyArea} style={{ borderRadius: 12, border: "1px solid rgba(196,148,58,0.24)", background: "rgba(196,148,58,0.10)", color: "var(--color-accent-amber)", padding: "12px 14px", fontFamily: "var(--font-dm-sans)", fontWeight: 700, cursor: "pointer" }}>Go</button>
              </div>
              {selectedStore && (
                <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: 14 }}>
                  <div style={{ fontFamily: "var(--font-playfair)", fontSize: 22, color: "var(--color-cream)", marginBottom: 6 }}>{selectedStore.name || selectedStore.displayLabel}</div>
                  <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{selectedStore.address || selectedStore.displayLabel}</div>
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    {recentStoreDrops.length > 0 ? recentStoreDrops.slice(0, 8).map((drop, index) => (
                      <div key={`${selectedStore.id}-${index}-${drop.timestamp}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-primary)" }}>{cleanBrandName(drop.brand_name)}</span>
                        <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)" }}>{formatRelativeTime(drop.timestamp)}</span>
                      </div>
                    )) : (
                      <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.6 }}>
                        No drops within last 7 days, <button onClick={() => setShowOlderStoreData(true)} style={{ background: "transparent", border: "none", color: "var(--color-accent-amber)", padding: 0, cursor: "pointer", font: "inherit" }}>click here to show older data</button>
                      </div>
                    )}
                    {showOlderStoreData && olderStoreDrops.map((drop, index) => (
                      <div key={`${selectedStore.id}-older-${index}-${drop.timestamp}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-primary)" }}>{cleanBrandName(drop.brand_name)}</span>
                        <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)" }}>{formatRelativeTime(drop.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <MapContainer center={areaCenter} zoom={mapZoom} scrollWheelZoom style={{ width: "100%", height: "calc(100vh - 140px)", minHeight: 620, background: "#0D0B07" }}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <FlyToView center={areaCenter} zoom={mapZoom} />

        {mode === "bottle" && bottleMarkers.map((marker) => {
          const radius = marker.quantity ? Math.max(8, Math.min(20, 6 + Math.sqrt(marker.quantity))) : 10;
          return (
            <CircleMarker
              key={marker.id}
              center={[marker.lat, marker.lng]}
              radius={radius}
              pathOptions={{
                fillColor: "#D4920B",
                fillOpacity: 0.78,
                color: "rgba(255,255,255,0.26)",
                weight: 1.5,
              }}
            />
          );
        })}

        {mode === "store" && visibleStores.map((store) => (
          <CircleMarker
            key={store.id}
            center={[store.lat!, store.lng!]}
            radius={selectedStoreId === store.id ? 11 : 8}
            pathOptions={{
              fillColor: "#D4920B",
              fillOpacity: selectedStoreId === store.id ? 0.92 : 0.72,
              color: "rgba(255,255,255,0.24)",
              weight: selectedStoreId === store.id ? 2 : 1,
            }}
            eventHandlers={{ click: () => { setSelectedStoreId(store.id); setShowOlderStoreData(false); } }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
