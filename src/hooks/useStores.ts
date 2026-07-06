"use client";

import { useState, useEffect } from "react";
import { normalizeMapStore, type MapStoreRecord } from "@/lib/store-map";

export interface Store extends MapStoreRecord {
  hours?: string;
}

// In-memory cache
let cachedStores: Store[] | null = null;
let storesPromise: Promise<Store[]> | null = null;

function loadStores() {
  if (cachedStores !== null) return Promise.resolve(cachedStores);
  if (storesPromise) return storesPromise;
  storesPromise = fetch("/api/locations")
    .then((res) => res.json())
    .then((data) => {
      // Engine returns { locations: [...] }, { stores: [...] }, or raw array
      const raw: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.locations)
        ? data.locations
        : Array.isArray(data?.stores)
        ? data.stores
        : [];
      const normalized = raw.map((store) => normalizeMapStore(store));
      cachedStores = normalized;
      return normalized;
    })
    .finally(() => {
      storesPromise = null;
    });
  return storesPromise;
}

export function useStores(enabled: boolean = true) {
  const [stores, setStores] = useState<Store[]>(cachedStores ?? []);
  const [loading, setLoading] = useState(enabled && cachedStores === null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (cachedStores !== null) {
      setStores(cachedStores);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    loadStores()
      .then((normalized) => {
        if (cancelled) return;
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
  }, [enabled]);

  return { stores, loading };
}
