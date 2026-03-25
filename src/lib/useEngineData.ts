"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const REFETCH_INTERVAL = 60_000; // 60 seconds

interface EngineBottle {
  id: string;
  name: string;
  state: string;
  tier: string;
  msrp: number;
  distillery: string;
  has_inventory: boolean;
  limited_availability: boolean;
  last_drop: string | null;
  drop_count_30d: number;
}

interface BottlesResponse {
  bottles: EngineBottle[];
  total: number;
  states: string[];
}

interface EngineStore {
  id: string;
  state: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  district: string;
  bottle_count: number;
}

interface StoresResponse {
  stores: EngineStore[];
  total: number;
  states: string[];
}

interface StatsResponse {
  total_bottles: number;
  total_stores: number;
  states_covered: number;
  drops_today: number;
  drops_this_week: number;
  unicorn_count: number;
  allocated_count: number;
  by_state: Record<string, unknown>;
}

function useFetch<T>(url: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, REFETCH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  return { data, loading, error };
}

export function useBottles() {
  const { data, loading, error } = useFetch<BottlesResponse>("/api/bottles", {
    bottles: [],
    total: 0,
    states: [],
  });
  return { bottles: data.bottles, total: data.total, states: data.states, loading, error };
}

export function useStores() {
  const { data, loading, error } = useFetch<StoresResponse>("/api/stores", {
    stores: [],
    total: 0,
    states: [],
  });
  return { stores: data.stores, total: data.total, states: data.states, loading, error };
}

export function useStats() {
  const { data, loading, error } = useFetch<StatsResponse>("/api/stats", {
    total_bottles: 0,
    total_stores: 0,
    states_covered: 0,
    drops_today: 0,
    drops_this_week: 0,
    unicorn_count: 0,
    allocated_count: 0,
    by_state: {},
  });
  return { stats: data, loading, error };
}

export type { EngineBottle, EngineStore, StatsResponse };
