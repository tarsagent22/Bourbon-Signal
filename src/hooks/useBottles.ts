"use client";

import { useState, useEffect } from "react";
import type { Bottle } from "@/data/bottles";

interface EngineBottle {
  id: string;
  name: string;
  canonical_key?: string;
  state: string;
  tier: string;
  msrp: number;
  distillery: string;
  has_inventory: boolean;
  limited_availability: boolean;
  last_drop: string | null;
  drop_count_30d: number;
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
          id: b.id,
          name: b.name,
          canonical_key: b.canonical_key || undefined,
          distillery: b.distillery || "Unknown",
          tier: (b.tier as Bottle["tier"]) || "limited",
          msrp: b.msrp || 0,
          lastSeen: b.last_drop || undefined,
          avgDropsPerMonth: b.drop_count_30d || 0,
          state: b.state || undefined,
          has_inventory: b.has_inventory || false,
          last_drop: b.last_drop || null,
          drop_count_30d: b.drop_count_30d || 0,
          // These fields aren't in the engine yet — leave undefined
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
