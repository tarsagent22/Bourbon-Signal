"use client";

import { useState, useEffect } from "react";

const REFETCH_INTERVAL = 5 * 60_000; // 5 minutes

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
  stateCount?: number;
  signalCount?: number;
  historicalSignalCount?: number;
  engineGeneratedAt?: string;
  generatedAt?: string;
  lastUpdated?: string;
  dropCount?: number;
  locationCount?: number;
  refreshHealth?: {
    degradedStateCount?: number;
    staleStateCount?: number;
    failedStateCount?: number;
  };
  stateCoverage?: {
    counts?: Record<string, number>;
    states?: Array<{
      state: string;
      label?: string;
      tier?: string;
      status?: string;
      signalCount?: number;
      targetLocationPrecision?: string;
      bestLocationPrecision?: string;
      strategy?: string;
      coverageTier?: string;
    }>;
  };
  southeastReadiness?: {
    generatedAt?: string;
    focusStates?: string[];
    counts?: Record<string, number>;
    stateNotes?: Record<string, {
      label?: string;
      status?: string;
      coverageTier?: string;
      signalCount?: number;
      bestLocationPrecision?: string;
      testerValue?: string;
    }>;
    bestCurrentSignals?: Record<string, Array<{
      id?: string;
      state?: string;
      type?: string;
      source?: string;
      sourceUrl?: string;
      bottle?: string | null;
      rawName?: string | null;
      locationPrecision?: string;
      locationName?: string;
      quantity?: number;
      confidence?: number;
      canAlertAsInventory?: boolean;
      canAlertAsWatch?: boolean;
      summary?: string;
    }>>;
  };
}

function useFetch<T>(url: string, fallback: T, interval = REFETCH_INTERVAL) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active: AbortController | undefined;
    let disposed = false;
    async function refresh() {
      if (active || document.hidden) return;
      const controller = new AbortController();
      active = controller;
      const timeout = window.setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!disposed) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "Fetch failed");
      } finally {
        window.clearTimeout(timeout);
        active = undefined;
        if (!disposed) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, interval);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      active?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [url, interval]);

  return { data, loading, error };
}

type TickerStats = Pick<StatsResponse, "historicalSignalCount" | "signalCount" | "engineGeneratedAt" | "generatedAt"> & { storeCount?: number };

export function useTickerStats() {
  const { data: stats } = useFetch<TickerStats | null>("/api/stats/ticker", null, 60_000);
  const { data } = useFetch<{ totalMembers: number } | null>("/api/member-count", null, 60_000);
  return { stats, memberCount: data?.totalMembers };
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
