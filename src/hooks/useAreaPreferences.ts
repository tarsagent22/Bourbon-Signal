"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import type { UserAlertPreferencePatch, UserAlertPreferences } from "@/app/api/user/preferences/route";
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
    gaAreas: [],
    tnAreas: [],
    vaCities: [],
    ohCities: [],
    iaCities: [],
    idCities: [],
    scAreas: [],
    caAreas: [],
    nvAreas: [],
    nyAreas: [],
    coAreas: [],
    paCounties: [],
    paStores: [],
  },
  notificationPreferences: getDefaultNotificationPreferences(),
  alertMode: "anything_notable",
  bottleAlertPreferences: { bottleNames: [], bottleKeys: [] },
  collectionPreferences: { bottles: [] },
  radarPreferences: { followedReleases: [] },
};

type PreferenceResolution = "preview" | "signed-in" | "signed-out" | null;

function mergePreferencePatch(base: UserAlertPreferences, patch: UserAlertPreferencePatch): UserAlertPreferences {
  const notificationPatch = patch.notificationPreferences;
  const weeklyAction = notificationPatch?.weeklyIntelligence?.action;
  const notificationPreferences = notificationPatch
    ? {
        ...base.notificationPreferences,
        ...(notificationPatch.onSite ? { onSite: { ...base.notificationPreferences.onSite, ...notificationPatch.onSite } } : {}),
        ...(notificationPatch.email ? { email: { ...base.notificationPreferences.email, ...notificationPatch.email } } : {}),
        ...(notificationPatch.sms ? { sms: { ...base.notificationPreferences.sms, ...notificationPatch.sms } } : {}),
        ...(notificationPatch.sightings ? { sightings: { ...base.notificationPreferences.sightings, ...notificationPatch.sightings } } : {}),
        weeklyIntelligence: weeklyAction
          ? { ...base.notificationPreferences.weeklyIntelligence, emailEnabled: weeklyAction === "subscribe" }
          : base.notificationPreferences.weeklyIntelligence,
      }
    : base.notificationPreferences;
  return {
    ...base,
    ...patch,
    notificationPreferences,
  } as UserAlertPreferences;
}

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
  const [resolvedFor, setResolvedFor] = useState<PreferenceResolution>(() => {
    if (qaPreview) return "preview";
    if (userId && getCachedAreaPreferences(userId)) return "signed-in";
    if (isLoaded && !isSignedIn) return "signed-out";
    return null;
  });

  const fetchPrefs = useCallback(async () => {
    if (qaPreview) {
      setPrefs(QA_PREVIEW_PREFERENCES);
      setResolvedFor("preview");
      return;
    }
    const requestedUserId = userId;
    if (!requestedUserId) {
      setPrefs(EMPTY_PREFS);
      setResolvedFor(isLoaded && !isSignedIn ? "signed-out" : null);
      return;
    }
    setLoading(true);
    setResolvedFor(null);
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
      if (activeUserIdRef.current === requestedUserId) {
        setLoading(false);
        setResolvedFor("signed-in");
      }
    }
  }, [isLoaded, isSignedIn, qaPreview, userId]);

  useEffect(() => {
    if (qaPreview) {
      clearCachedAreaPreferences();
      setPrefs(QA_PREVIEW_PREFERENCES);
      setLoading(false);
      setResolvedFor("preview");
      return;
    }

    invalidateAreaPreferencesCacheForUser(userId);
    if (!isLoaded) {
      setLoading(false);
      setResolvedFor(null);
      return;
    }
    if (!userId) {
      setPrefs(EMPTY_PREFS);
      setLoading(false);
      setResolvedFor("signed-out");
      return;
    }

    const cached = getCachedAreaPreferences(userId);
    if (cached) {
      setPrefs(cached);
      setLoading(false);
      setResolvedFor("signed-in");
      return;
    }

    setPrefs(EMPTY_PREFS);
    setResolvedFor(null);
    void fetchPrefs();
  }, [fetchPrefs, isLoaded, qaPreview, userId]);

  const expectedResolution: PreferenceResolution = qaPreview
    ? "preview"
    : !isLoaded
      ? null
      : isSignedIn
        ? "signed-in"
        : "signed-out";
  const ready = expectedResolution !== null && resolvedFor === expectedResolution;

  const savePreferences = useCallback(async (newPrefs: UserAlertPreferencePatch) => {
    const requestedUserId = userId;
    const merged = mergePreferencePatch(getCachedAreaPreferences(requestedUserId) || prefs || EMPTY_PREFS, newPrefs);
    setPrefs((current) => mergePreferencePatch(current, newPrefs));
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

  return { prefs, loading, ready, savePreferences };
}
