"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DropEvent } from "@/lib/drops";

interface UseDropsOptions {
  limit?: number;
  offset?: number;
  bottle?: string;
  store?: string;
  state?: string;
}

interface DropsResponse {
  drops: DropEvent[];
  total: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  lastUpdated?: string;
}

let cachedDefaultResponse: DropsResponse | null = null;

function buildQuery(options: UseDropsOptions) {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  if (options.bottle) params.set("bottle", options.bottle);
  if (options.store) params.set("store", options.store);
  if (options.state) params.set("state", options.state);
  const query = params.toString();
  return query ? `/api/drops?${query}` : "/api/drops";
}

export function useDrops(options: UseDropsOptions = {}) {
  const cacheable = !options.limit && !options.offset && !options.bottle && !options.store && !options.state;
  const [response, setResponse] = useState<DropsResponse | null>(cacheable ? cachedDefaultResponse : null);
  const [loading, setLoading] = useState(cacheable ? cachedDefaultResponse === null : true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrops = useCallback(async () => {
    const endpoint = buildQuery(options);
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error("Failed to load drops");
    const data = (await res.json()) as DropsResponse;
    if (cacheable) cachedDefaultResponse = data;
    setResponse(data);
    return data;
  }, [cacheable, options]);

  useEffect(() => {
    if (cacheable && cachedDefaultResponse !== null) {
      setResponse(cachedDefaultResponse);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDrops()
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch drops:", err);
        setError("Failed to load drops");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheable, fetchDrops]);

  const drops = useMemo(() => response?.drops ?? [], [response]);

  return {
    drops,
    loading,
    error,
    total: response?.total ?? drops.length,
    limit: response?.limit,
    offset: response?.offset,
    hasMore: response?.hasMore ?? false,
    lastUpdated: response?.lastUpdated,
    refresh: fetchDrops,
  };
}
