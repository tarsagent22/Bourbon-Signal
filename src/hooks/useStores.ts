"use client";

import { useState, useEffect } from "react";
import { normalizeMapStore, type MapStoreRecord } from "@/lib/store-map";

export interface Store extends MapStoreRecord {
  hours?: string;
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
        const normalized = raw.map((store) => normalizeMapStore(store));
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
