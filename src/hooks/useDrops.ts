"use client";

import { useEffect, useState } from "react";
import type { DropEvent } from "@/lib/drops";

let cachedDrops: DropEvent[] | null = null;

export function useDrops() {
  const [drops, setDrops] = useState<DropEvent[]>(cachedDrops ?? []);
  const [loading, setLoading] = useState(cachedDrops === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedDrops !== null) {
      setDrops(cachedDrops);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch("/api/drops")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const raw = Array.isArray(data) ? data : Array.isArray(data?.drops) ? data.drops : [];
        cachedDrops = raw;
        setDrops(raw);
      })
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
  }, []);

  return { drops, loading, error };
}
