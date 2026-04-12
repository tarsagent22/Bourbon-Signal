"use client";

import { useState, useEffect } from "react";

export interface Store {
  id: string;
  name?: string;
  state: string;
  city: string;
  county?: string;
  address?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  hours?: string;
  district?: string;
  bottle_count?: number;
}

function titleCase(value?: string): string {
  if (!value) return "";
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeStore(raw: Record<string, unknown>): Store {
  const state = typeof raw.state === "string" ? raw.state : "";
  const city = titleCase(typeof raw.city === "string" ? raw.city : "");
  const district = typeof raw.district === "string" ? raw.district : undefined;
  const address = typeof raw.address === "string" ? raw.address.trim() : undefined;
  const fallbackName = [state, city].filter(Boolean).join(" ").trim();

  return {
    id: String(raw.id ?? ""),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : fallbackName || undefined,
    state,
    city: city || state,
    county: typeof raw.county === "string" ? raw.county : district,
    address,
    zip: typeof raw.zip === "string" ? raw.zip : undefined,
    lat: typeof raw.lat === "number" ? raw.lat : undefined,
    lng: typeof raw.lng === "number" ? raw.lng : undefined,
    hours: typeof raw.hours === "string" ? raw.hours : undefined,
    district,
    bottle_count: typeof raw.bottle_count === "number" ? raw.bottle_count : undefined,
  };
}

// In-memory cache
let cachedStores: Store[] | null = null;

export function useStores() {
  const [stores, setStores] = useState<Store[]>(cachedStores ?? []);
  const [loading, setLoading] = useState(cachedStores === null);

  useEffect(() => {
    if (cachedStores !== null) {
      setStores(cachedStores);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch("/api/stores")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        // Engine returns { stores: [...] } or raw array
        const raw: Record<string, unknown>[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.stores)
          ? data.stores
          : [];
        const normalized = raw.map((store) => normalizeStore(store));
        cachedStores = normalized;
        setStores(normalized);
      })
      .catch(() => {
        if (!cancelled) setStores([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { stores, loading };
}
