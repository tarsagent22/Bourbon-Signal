"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
  source: "gps" | "manual";
  updatedAt: number;
}

interface LocationState {
  userLocation: UserLocation | null;
  setUserLocation: (location: UserLocation) => void;
  clearUserLocation: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      userLocation: null,
      setUserLocation: (location) => set({ userLocation: location }),
      clearUserLocation: () => set({ userLocation: null }),
    }),
    {
      name: "casksignal-location",
    }
  )
);

export interface Coordinates {
  lat: number;
  lng: number;
}

export function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function getDistanceMiles(a: Coordinates, b: Coordinates): number {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return earthRadiusMiles * c;
}

export function formatDistanceMiles(distance: number | null | undefined): string {
  if (distance == null || Number.isNaN(distance)) return "";
  if (distance < 10) return `${distance.toFixed(1)} mi`;
  return `${Math.round(distance)} mi`;
}
