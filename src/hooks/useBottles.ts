"use client";

import { useState, useEffect } from "react";
import type { Bottle } from "@/data/bottles";

interface EngineBottle {
  id: string;
  name: string;
  canonical_id?: string;
  canonical_name?: string;
  canonical_key?: string;
  aliases?: string[];
  states?: string[];
  state_ids?: Record<string, string[]>;
  state_aliases?: Record<string, string[]>;
  search_aliases?: string[];
  state?: string;
  tier: string;
  msrp: number;
  distillery: string;
  has_inventory: boolean;
  limited_availability: boolean;
  last_drop: string | null;
  drop_count_30d: number;
  signal_volume_30d?: number;
  actionable_count_30d?: number;
  exact_store_hits_30d?: number;
  board_leads_30d?: number;
}

export function useBottles() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bottles")
      .then((res) => res.json())
      .then((data) => {
        const mapped: Bottle[] = (data.bottles || []).map((b: EngineBottle) => ({
          id: b.canonical_id || b.id,
          name: b.canonical_name || b.name,
          canonical_id: b.canonical_id || undefined,
          canonical_name: b.canonical_name || undefined,
          canonical_key: b.canonical_key || undefined,
          aliases: b.aliases || undefined,
          states: b.states || undefined,
          state_ids: b.state_ids || undefined,
          state_aliases: b.state_aliases || undefined,
          search_aliases: b.search_aliases || undefined,
          distillery: b.distillery || "Unknown",
          tier: (b.tier as Bottle["tier"]) || "limited",
          msrp: b.msrp || 0,
          lastSeen: b.last_drop || undefined,
          avgDropsPerMonth: b.drop_count_30d || 0,
          state: b.state || undefined,
          has_inventory: b.has_inventory || false,
          last_drop: b.last_drop || null,
          drop_count_30d: b.drop_count_30d || 0,
          signal_volume_30d: b.signal_volume_30d || 0,
          actionable_count_30d: b.actionable_count_30d || 0,
          exact_store_hits_30d: b.exact_store_hits_30d || 0,
          board_leads_30d: b.board_leads_30d || 0,
          secondary: undefined,
          proof: undefined,
          ageStatement: undefined,
          flavor: undefined,
        }));
        setBottles(mapped);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch bottles:", err);
        setError("Failed to load bottles");
        setLoading(false);
      });
  }, []);

  return { bottles, loading, error };
}
