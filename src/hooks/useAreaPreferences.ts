"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import type { UserAlertPreferences } from "@/app/api/user/preferences/route";
import { getDefaultNotificationPreferences } from "@/lib/notification-preferences";

const EMPTY_PREFS: UserAlertPreferences = {
  areaPreferences: {
    states: [],
    ncBoards: [],
    vaCities: [],
    paCounties: [],
    paStores: [],
  },
  notificationPreferences: getDefaultNotificationPreferences(),
  alertMode: "specific_bottles",
};

let cachedPrefs: UserAlertPreferences | null = null;

export function useAreaPreferences() {
  const { isSignedIn } = useUser();
  const [prefs, setPrefs] = useState<UserAlertPreferences>(cachedPrefs ?? EMPTY_PREFS);
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
        const data: UserAlertPreferences = await res.json();
        cachedPrefs = data;
        setPrefs(data);
      }
    } catch {
      setPrefs(EMPTY_PREFS);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (cachedPrefs !== null) {
      setPrefs(cachedPrefs);
      return;
    }
    fetchPrefs();
  }, [fetchPrefs]);

  const savePreferences = useCallback(async (newPrefs: UserAlertPreferences) => {
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
