"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPin, Search, X, SlidersHorizontal, Sparkles } from "lucide-react";
import type { Store } from "@/hooks/useStores";
import type { Bottle } from "@/data/bottles";
import type { DropEvent } from "@/lib/drops";
import { useLocationStore, getDistanceMiles, formatDistanceMiles } from "@/lib/location";
import { ZIP_CENTROIDS } from "@/data/zip-centroids";
import { cleanBrandName, formatRelativeTime } from "@/lib/drops";

interface HuntMapProps {
  stores: Store[];
  bottles: Bottle[];
  drops: DropEvent[];
}

interface StoreWithDistance extends Store {
  distanceMiles: number | null;
  recentDrops: DropEvent[];
  matchingDrops: DropEvent[];
}

function normalizeName(value: string): string {
  return cleanBrandName(value).toLowerCase().trim();
}

function zipToCenter(zip: string): { center: LatLngExpression; label: string } | null {
  const trimmed = zip.trim();
  if (!/^\d{5}$/.test(trimmed)) return null;
  const centroid = ZIP_CENTROIDS[trimmed];
  if (!centroid) return null;
  return {
    center: [centroid.lat, centroid.lng],
    label: `${centroid.zip} · ${centroid.city}, ${centroid.state}`,
  };
}

function getBottleLabel(bottle: Bottle): string {
  return bottle.state ? `${bottle.name} · ${bottle.state}` : bottle.name;
}

function storeMatchesArea(store: Store, areaCenter: LatLngExpression | null, radiusMiles: number): boolean {
  if (!areaCenter || store.lat == null || store.lng == null) return true;
  const [lat, lng] = areaCenter as [number, number];
  return getDistanceMiles({ lat, lng }, { lat: store.lat, lng: store.lng }) <= radiusMiles;
}

function storeKey(store: Store): string[] {
  return [store.id, store.address || "", `${store.city}|${store.state}`];
}

function dropMatchesStore(drop: DropEvent, store: Store): boolean {
  const dropId = drop.store_id ? String(drop.store_id) : "";
  if (dropId && dropId === store.id) return true;
  if (drop.store_address && store.address && drop.store_address.trim().toLowerCase() === store.address.trim().toLowerCase()) return true;
  if (drop.store_city && store.city && drop.store_city.trim().toLowerCase() === store.city.trim().toLowerCase() && (drop.state || "") === store.state) return true;
  return false;
}

function FlyToLocation({ center }: { center: LatLngExpression }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 10, { duration: 1.1 });
  }, [center, map]);
  return null;
}

export default function HuntMap({ stores, bottles, drops }: HuntMapProps) {
  const { userLocation } = useLocationStore();
  const [zipQuery, setZipQuery] = useState("");
  const [areaCenter, setAreaCenter] = useState<LatLngExpression | null>(null);
  const [areaLabel, setAreaLabel] = useState<string>("");
  const [bottleSearch, setBottleSearch] = useState("");
  const [selectedBottleIds, setSelectedBottleIds] = useState<string[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [expandedStores, setExpandedStores] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (userLocation) {
      setAreaCenter([userLocation.lat, userLocation.lng]);
      setAreaLabel(userLocation.label);
    }
  }, [userLocation]);

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

  const visibleBottleOptions = useMemo(() => {
    const q = bottleSearch.trim().toLowerCase();
    return bottleOptions
      .filter((bottle) => !selectedBottleIds.includes(bottle.id))
      .filter((bottle) => !q || getBottleLabel(bottle).toLowerCase().includes(q))
      .slice(0, 12);
  }, [bottleOptions, bottleSearch, selectedBottleIds]);

  const selectedBottleNames = useMemo(
    () => new Set(selectedBottleIds.map((id) => bottleOptions.find((bottle) => bottle.id === id)).filter(Boolean).map((bottle) => normalizeName((bottle as Bottle).name))),
    [selectedBottleIds, bottleOptions]
  );

  const storesWithDrops = useMemo<StoreWithDistance[]>(() => {
    const filtered = stores
      .filter((store) => store.isMappable)
      .filter((store) => storeMatchesArea(store, areaCenter, 60))
      .map((store) => {
        const recentDrops = drops
          .filter((drop) => dropMatchesStore(drop, store))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const matchingDrops = selectedBottleNames.size > 0
          ? recentDrops.filter((drop) => selectedBottleNames.has(normalizeName(drop.brand_name)))
          : recentDrops;

        return {
          ...store,
          distanceMiles: areaCenter && store.lat != null && store.lng != null
            ? getDistanceMiles({ lat: (areaCenter as [number, number])[0], lng: (areaCenter as [number, number])[1] }, { lat: store.lat, lng: store.lng })
            : userLocation && store.lat != null && store.lng != null
              ? getDistanceMiles(userLocation, { lat: store.lat, lng: store.lng })
              : null,
          recentDrops,
          matchingDrops,
        };
      })
      .sort((a, b) => {
        const aSignal = a.matchingDrops.length > 0 ? 1 : 0;
        const bSignal = b.matchingDrops.length > 0 ? 1 : 0;
        if (aSignal !== bSignal) return bSignal - aSignal;
        if (a.distanceMiles != null && b.distanceMiles != null) return a.distanceMiles - b.distanceMiles;
        if (a.distanceMiles != null) return -1;
        if (b.distanceMiles != null) return 1;
        return (a.city || "").localeCompare(b.city || "");
      });

    return filtered;
  }, [stores, drops, areaCenter, userLocation, selectedBottleNames]);

  useEffect(() => {
    if (!selectedStoreId && storesWithDrops.length > 0) setSelectedStoreId(storesWithDrops[0].id);
  }, [storesWithDrops, selectedStoreId]);

  const selectedStore = storesWithDrops.find((store) => store.id === selectedStoreId) || storesWithDrops[0] || null;
  const storesWithSignal = storesWithDrops.filter((store) => store.matchingDrops.length > 0).length;
  const mapCenter: LatLngExpression = selectedStore?.lat && selectedStore?.lng
    ? [selectedStore.lat, selectedStore.lng]
    : areaCenter || [37.8, -78.5];

  const handleZipApply = () => {
    const nextCenter = zipToCenter(zipQuery);
    if (nextCenter) {
      setAreaCenter(nextCenter.center);
      setAreaLabel(nextCenter.label);
    }
  };

  const handleAddBottle = (bottleId: string) => {
    if (selectedBottleIds.includes(bottleId) || selectedBottleIds.length >= 5) return;
    setSelectedBottleIds((current) => [...current, bottleId]);
    setBottleSearch("");
  };

  const toggleExpanded = (storeId: string) => {
    setExpandedStores((current) => ({ ...current, [storeId]: !current[storeId] }));
  };

  return (
    <div className="hunt-map-grid" style={{ display: "grid", gap: 20, minHeight: "calc(100vh - 180px)", alignItems: "stretch" }}>
      <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 24, background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.02) 100%)", padding: 20, display: "flex", flexDirection: "column", gap: 18, minHeight: 0, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
        <div>
          <p style={{ margin: 0, fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Setup
          </p>
          <h2 style={{ margin: "8px 0 6px", fontFamily: "var(--font-playfair)", fontSize: 30, color: "var(--color-text-primary)" }}>
            Build your hunt
          </h2>
          <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.65 }}>
            Pick an area, filter for the bottles you actually chase, and work a short list of stores with real signal.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "12px 12px 10px" }}>
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>In range</div>
            <div style={{ fontFamily: "var(--font-playfair)", fontSize: 26, color: "var(--color-text-primary)", lineHeight: 1 }}>{storesWithDrops.length}</div>
          </div>
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "12px 12px 10px" }}>
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>With signal</div>
            <div style={{ fontFamily: "var(--font-playfair)", fontSize: 26, color: "var(--color-text-primary)", lineHeight: 1 }}>{storesWithSignal}</div>
          </div>
          <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", padding: "12px 12px 10px" }}>
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>Bottle filters</div>
            <div style={{ fontFamily: "var(--font-playfair)", fontSize: 26, color: "var(--color-text-primary)", lineHeight: 1 }}>{selectedBottleIds.length}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <input
            value={zipQuery}
            onChange={(e) => setZipQuery(e.target.value)}
            placeholder="Enter ZIP code"
            inputMode="numeric"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(16,12,9,0.9)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14 }}
          />
          <button
            onClick={handleZipApply}
            style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(196,148,58,0.22)", background: "rgba(196,148,58,0.08)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Use ZIP
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {areaLabel && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-accent-amber)", background: "rgba(196,148,58,0.1)", border: "1px solid rgba(196,148,58,0.22)", borderRadius: 999, padding: "6px 10px" }}>
              <Crosshair size={12} />
              Area: {areaLabel}
            </span>
          )}
          <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            Showing precise store locations within about 60 miles
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(196,148,58,0.14)", background: "rgba(196,148,58,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={15} style={{ color: "var(--color-accent-amber)", flexShrink: 0 }} />
            <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              {selectedBottleIds.length > 0 ? "Stores with matching drops float to the top." : "Add bottles to turn this from a generic store list into a real hunt board."}
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-accent-amber)", whiteSpace: "nowrap" }}>
            {selectedBottleIds.length > 0 ? `${storesWithSignal} matches` : "Optional filter"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>Bottles</label>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--color-text-tertiary)" }} />
            <input
              value={bottleSearch}
              onChange={(e) => setBottleSearch(e.target.value)}
              placeholder="Search bottles"
              style={{ width: "100%", padding: "12px 14px 12px 38px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(16,12,9,0.9)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 14 }}
            />
            {bottleSearch.trim() && visibleBottleOptions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 30, background: "rgba(20,16,12,0.98)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }}>
                {visibleBottleOptions.map((bottle) => (
                  <button
                    key={bottle.id}
                    onClick={() => handleAddBottle(bottle.id)}
                    style={{ width: "100%", textAlign: "left", padding: "12px 14px", border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", background: "transparent", color: "var(--color-text-primary)", cursor: "pointer", fontFamily: "var(--font-dm-sans)", fontSize: 13 }}
                  >
                    {getBottleLabel(bottle)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedBottleIds.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {selectedBottleIds.map((id) => {
                const bottle = bottleOptions.find((entry) => entry.id === id);
                if (!bottle) return null;
                return (
                  <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(196,148,58,0.1)", border: "1px solid rgba(196,148,58,0.22)", color: "var(--color-accent-amber)", borderRadius: 999, padding: "6px 10px", fontFamily: "var(--font-dm-sans)", fontSize: 12 }}>
                    {bottle.name}
                    <button onClick={() => setSelectedBottleIds((current) => current.filter((entry) => entry !== id))} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", display: "inline-flex", padding: 0 }}>
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Store board
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-secondary)" }}>
            <SlidersHorizontal size={13} />
            Ranked by signal, then distance
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingRight: 4 }}>
          {storesWithDrops.slice(0, 40).map((store) => {
            const isActive = store.id === selectedStore?.id;
            const visibleDrops = (expandedStores[store.id] ? store.matchingDrops : store.matchingDrops.slice(0, 5));
            return (
              <button
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                style={{ textAlign: "left", padding: "15px 15px 14px", borderRadius: 16, border: isActive ? "1px solid rgba(196,148,58,0.45)" : "1px solid rgba(255,255,255,0.05)", background: isActive ? "linear-gradient(180deg, rgba(196,148,58,0.12) 0%, rgba(196,148,58,0.07) 100%)" : "rgba(255,255,255,0.02)", cursor: "pointer", boxShadow: isActive ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "none" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 10 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {store.name || `${store.city || store.state} store`}
                      </span>
                      {store.matchingDrops.length > 0 && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 999, background: "rgba(196,148,58,0.12)", border: "1px solid rgba(196,148,58,0.22)", color: "var(--color-accent-amber)", fontFamily: "var(--font-jetbrains)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                          <Sparkles size={10} />
                          {store.matchingDrops.length} signal
                        </span>
                      )}
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

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {visibleDrops.length > 0 ? visibleDrops.map((drop, index) => (
                    <div key={`${store.id}-${index}-${drop.timestamp}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.4 }}>
                        {cleanBrandName(drop.brand_name)}
                      </span>
                      <span style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11, color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                        {formatRelativeTime(drop.timestamp)}
                      </span>
                    </div>
                  )) : (
                    <div style={{ fontFamily: "var(--font-dm-sans)", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                      No recent matching drops.
                    </div>
                  )}
                </div>

                {store.matchingDrops.length > 5 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(store.id);
                    }}
                    style={{ marginTop: 10, background: "transparent", border: "none", color: "var(--color-accent-amber)", cursor: "pointer", fontFamily: "var(--font-dm-sans)", fontSize: 12, padding: 0 }}
                  >
                    {expandedStores[store.id] ? "Show less" : `Show more (${store.matchingDrops.length - 5})`}
                  </button>
                )}
              </button>
            );
          })}
          {storesWithDrops.length === 0 && (
            <div style={{ padding: "14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)", fontFamily: "var(--font-dm-sans)", fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.6 }}>
              No precise store locations found for this area yet. We should not fake board-level dots here.
            </div>
          )}
        </div>
      </div>

      <div style={{ position: "relative", borderRadius: 24, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", minHeight: 540, background: "#0D0B07", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)" }}>
        <div style={{ position: "absolute", top: 16, left: 16, right: 16, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, pointerEvents: "none" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(9,8,7,0.72)", backdropFilter: "blur(10px)", color: "var(--color-text-primary)", fontFamily: "var(--font-dm-sans)", fontSize: 13, pointerEvents: "auto" }}>
            <MapPin size={14} style={{ color: "var(--color-accent-amber)" }} />
            {selectedStore ? (selectedStore.name || `${selectedStore.city || selectedStore.state} store`) : "Select a store"}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(9,8,7,0.72)", backdropFilter: "blur(10px)", color: "var(--color-text-secondary)", fontFamily: "var(--font-dm-sans)", fontSize: 12, pointerEvents: "auto" }}>
            {selectedStore?.distanceMiles != null ? `${formatDistanceMiles(selectedStore.distanceMiles)} away` : "Live store positions"}
          </div>
        </div>
        <MapContainer center={mapCenter} zoom={7} scrollWheelZoom style={{ width: "100%", height: "100%", minHeight: 540, background: "#0D0B07" }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <FlyToLocation center={mapCenter} />
          {storesWithDrops.filter((store) => store.lat != null && store.lng != null).slice(0, 200).map((store) => {
            const isSelected = store.id === selectedStore?.id;
            const hasSignal = store.matchingDrops.length > 0;
            return (
              <CircleMarker
                key={store.id}
                center={[store.lat!, store.lng!]}
                radius={isSelected ? 10 : hasSignal ? 8 : 6}
                pathOptions={{
                  fillColor: isSelected ? "#D4920B" : hasSignal ? "#EFC050" : "#6B6258",
                  fillOpacity: isSelected ? 0.95 : hasSignal ? 0.85 : 0.55,
                  color: hasSignal ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.12)",
                  weight: 1,
                }}
                eventHandlers={{ click: () => setSelectedStoreId(store.id) }}
              >
                <Popup>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{store.name || `${store.city || store.state} store`}</div>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>{store.address || "Address unavailable"}</div>
                    <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>{[store.city, store.state].filter(Boolean).join(", ")}</div>
                    {(store.matchingDrops.slice(0, 5)).map((drop, index) => (
                      <div key={`${store.id}-popup-${index}-${drop.timestamp}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 12 }}>{cleanBrandName(drop.brand_name)}</span>
                        <span style={{ fontSize: 11, color: "#777" }}>{formatRelativeTime(drop.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
