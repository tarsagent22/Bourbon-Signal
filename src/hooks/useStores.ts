"use client";

import { useState, useEffect } from "react";
import { normalizeMapStore, type MapStoreRecord } from "@/lib/store-map";
import { combineStoreDirectoryRows } from "@/lib/store-directory";

export interface Store extends MapStoreRecord {
  hours?: string;
}

// In-memory cache
let cachedStores: Store[] | null = null;
let storesPromise: Promise<Store[]> | null = null;

function loadStores() {
  if (cachedStores !== null) return Promise.resolve(cachedStores);
  if (storesPromise) return storesPromise;
  storesPromise = fetch("/api/locations", { credentials: "same-origin" })
    .then((res) => {
      if (!res.ok) throw new Error(`Store directory request failed (${res.status})`);
      return res.json();
    })
    .then((data) => {
      // Engine returns { locations: [...] }, { stores: [...] }, or raw array
      const raw: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : combineStoreDirectoryRows([
            ...(Array.isArray(data?.locations) ? data.locations : []),
            ...(Array.isArray(data?.stores) ? data.stores : []),
          ]);
      const normalized = raw.map((store) => normalizeMapStore(store));
      if (!normalized.length) throw new Error("Store directory returned no locations");
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
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (cachedStores !== null) {
      setStores(cachedStores);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadStores()
      .then((normalized) => {
        if (cancelled) return;
        setStores(normalized);
      })
      .catch((cause) => {
        if (cancelled) return;
        setStores([]);
        setError(cause instanceof Error ? cause.message : "Store directory unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  const reload = () => {
    cachedStores = null;
    storesPromise = null;
    setReloadKey((value) => value + 1);
  };

  return { stores, loading, error, reload };
}
