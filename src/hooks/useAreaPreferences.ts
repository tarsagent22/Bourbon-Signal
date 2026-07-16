"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import type { UserAlertPreferences } from "@/app/api/user/preferences/route";
import {
  clearCachedAreaPreferences,
  getCachedAreaPreferences,
  invalidateAreaPreferencesCacheForUser,
  setCachedAreaPreferences,
} from "@/lib/area-preferences-cache";
import { getDefaultNotificationPreferences } from "@/lib/notification-preferences";
import { isQaPreviewMode, QA_PREVIEW_PREFERENCES } from "@/lib/preview-qa";

const EMPTY_PREFS: UserAlertPreferences = {
  areaPreferences: {
    states: [],
    ncBoards: [],
    vaCities: [],
    ohCities: [],
    iaCities: [],
    idCities: [],
    scAreas: [],
    caAreas: [],
    nvAreas: [],
    paCounties: [],
    paStores: [],
  },
  notificationPreferences: getDefaultNotificationPreferences(),
  alertMode: "anything_notable",
  bottleAlertPreferences: {
    bottleNames: [],
    bottleKeys: [],
  },
  collectionPreferences: {
    bottles: [],
  },
  radarPreferences: {
    followedReleases: [],
  },
};

export function useAreaPreferences() {
  const { isLoaded, isSignedIn, user } = useUser();
  const qaPreview = isQaPreviewMode();
  const userId = isLoaded && isSignedIn ? user.id : null;
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const [prefs, setPrefs] = useState<UserAlertPreferences>(() => (
    qaPreview ? QA_PREVIEW_PREFERENCES : getCachedAreaPreferences(userId) ?? EMPTY_PREFS
  ));
  const [loading, setLoading] = useState(false);

  const fetchPrefs = useCallback(async () => {
    if (qaPreview) {
      setPrefs(QA_PREVIEW_PREFERENCES);
      return;
    }
    const requestedUserId = userId;
    if (!requestedUserId) {
      setPrefs(EMPTY_PREFS);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/preferences");
      if (res.ok) {
        const data: UserAlertPreferences = await res.json();
        if (activeUserIdRef.current === requestedUserId) {
          setCachedAreaPreferences(requestedUserId, data);
          setPrefs(data);
        }
      }
    } catch {
      if (activeUserIdRef.current === requestedUserId) setPrefs(EMPTY_PREFS);
    } finally {
      if (activeUserIdRef.current === requestedUserId) setLoading(false);
    }
  }, [qaPreview, userId]);

  useEffect(() => {
    if (qaPreview) {
      clearCachedAreaPreferences();
      setPrefs(QA_PREVIEW_PREFERENCES);
      return;
    }

    invalidateAreaPreferencesCacheForUser(userId);
    if (!userId) {
      setPrefs(EMPTY_PREFS);
      setLoading(false);
      return;
    }

    const cached = getCachedAreaPreferences(userId);
    if (cached) {
      setPrefs(cached);
      return;
    }

    setPrefs(EMPTY_PREFS);
    void fetchPrefs();
  }, [fetchPrefs, qaPreview, userId]);

  const savePreferences = useCallback(async (newPrefs: Partial<UserAlertPreferences>) => {
    const requestedUserId = userId;
    const merged = { ...(getCachedAreaPreferences(requestedUserId) || prefs || EMPTY_PREFS), ...newPrefs };
    setPrefs((current) => ({ ...current, ...newPrefs }));
    if (requestedUserId) setCachedAreaPreferences(requestedUserId, merged);
    if (qaPreview) return;

    const res = await fetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPrefs),
    });
    if (!res.ok) {
      if (requestedUserId) clearCachedAreaPreferences(requestedUserId);
      if (activeUserIdRef.current === requestedUserId) await fetchPrefs();
      throw new Error("Failed to save preferences");
    }
    const saved = await res.json().catch(() => null) as UserAlertPreferences | null;
    if (activeUserIdRef.current !== requestedUserId) return;
    if (saved && requestedUserId) {
      setCachedAreaPreferences(requestedUserId, saved);
      setPrefs(saved);
    } else {
      setPrefs(merged);
    }
  }, [fetchPrefs, prefs, qaPreview, userId]);

  return { prefs, loading, savePreferences };
}
