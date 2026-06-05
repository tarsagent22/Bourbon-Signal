"use client";

import { useState } from "react";
import { MapPin, LocateFixed, X } from "lucide-react";
import { useLocationStore } from "@/lib/location";

interface SetLocationButtonProps {
  compact?: boolean;
}

function reverseGeocodeLabel(lat: number, lng: number): string {
  return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
}

export default function SetLocationButton({ compact = false }: SetLocationButtonProps) {
  const { userLocation, setUserLocation, clearUserLocation } = useLocationStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUseMyLocation = async () => {
    if (!navigator.geolocation) {
      setError("Geolocation isn't available on this device.");
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: reverseGeocodeLabel(position.coords.latitude, position.coords.longitude),
          source: "gps",
          updatedAt: Date.now(),
        });
        setLoading(false);
      },
      () => {
        setError("Couldn’t get your location. Check permissions and try again.");
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={handleUseMyLocation}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: compact ? 999 : 10,
            border: "1px solid rgba(196,148,58,0.28)",
            background: "rgba(196,148,58,0.08)",
            color: "var(--color-text-primary)",
            cursor: loading ? "wait" : "pointer",
            padding: compact ? "8px 12px" : "10px 14px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
          }}
        >
          <LocateFixed size={compact ? 14 : 16} />
      {loading ? "Finding you..." : userLocation ? "Update location" : "Choose location"}
        </button>

        {userLocation && (
          <>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: compact ? "7px 10px" : "9px 12px",
                borderRadius: compact ? 999 : 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "var(--color-text-secondary)",
                fontFamily: "var(--font-dm-sans)",
                fontSize: compact ? 12 : 13,
              }}
            >
              <MapPin size={compact ? 12 : 14} />
              Near {userLocation.label}
            </span>
            <button
              onClick={clearUserLocation}
              aria-label="Clear saved location"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: compact ? 28 : 34,
                height: compact ? 28 : 34,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent",
                color: "var(--color-text-tertiary)",
                cursor: "pointer",
              }}
            >
              <X size={compact ? 12 : 14} />
            </button>
          </>
        )}
      </div>
      {error && (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-dm-sans)",
            fontSize: 12,
            color: "#D97B68",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
