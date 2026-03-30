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
        const raw: Store[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.stores)
          ? data.stores
          : [];
        cachedStores = raw;
        setStores(raw);
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
