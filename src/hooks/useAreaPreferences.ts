"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import type { AreaPreferences } from "@/app/api/user/preferences/route";

const EMPTY_PREFS: AreaPreferences = {
  states: [],
  ncBoards: [],
  vaCities: [],
  paCounties: [],
};

// In-memory cache so we don't re-fetch on every render
let cachedPrefs: AreaPreferences | null = null;

export function useAreaPreferences() {
  const { isSignedIn } = useUser();
  const [prefs, setPrefs] = useState<AreaPreferences>(cachedPrefs ?? EMPTY_PREFS);
  const [loading, setLoading] = useState(false);

  const fetchPrefs = useCallback(async () => {
    if (!isSignedIn) {
      setPrefs(EMPTY_PREFS);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/preferences");
      if (res.ok) {
        const data: AreaPreferences = await res.json();
        cachedPrefs = data;
        setPrefs(data);
      }
    } catch {
      // silently fall back to empty prefs
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    // If we already have a cached value, use it immediately (no loading flash)
    if (cachedPrefs !== null) {
      setPrefs(cachedPrefs);
      return;
    }
    fetchPrefs();
  }, [fetchPrefs]);

  const savePreferences = useCallback(async (newPrefs: AreaPreferences) => {
    setPrefs(newPrefs);
    cachedPrefs = newPrefs;
    const res = await fetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPrefs),
    });
    if (!res.ok) throw new Error("Failed to save preferences");
  }, []);

  return { prefs, loading, savePreferences };
}
