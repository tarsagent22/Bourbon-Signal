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
import {
  clearPendingCollection,
  markPendingCollectionConflict,
  readPendingCollection,
  syncPendingCollection,
  writePendingCollection,
} from "@/lib/collection-offline-store";

const EMPTY_PREFS: UserAlertPreferences = {
  collectionAccess: { canRead: true, canEditExisting: true, canAdd: true, limit: 10, remaining: 10, showCapacityNotice: false },
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

  memberProfile: { homeState: null, homeStateSelectedAt: null },
};

type PreferenceResolution = "preview" | "signed-in" | "signed-out" | null;

function mergePreferencePatch(base: UserAlertPreferences, patch: UserAlertPreferencePatch): UserAlertPreferences {
  const notificationPatch = patch.notificationPreferences;
  const weeklyAction = notificationPatch?.weeklyIntelligence?.action;
  const notificationPreferences = notificationPatch
    ? {
        ...base.notificationPreferences,
        ...(notificationPatch.rarityTiers ? { rarityTiers: notificationPatch.rarityTiers } : {}),
        ...(notificationPatch.onSite ? { onSite: { ...base.notificationPreferences.onSite, ...notificationPatch.onSite } } : {}),
        ...(notificationPatch.push ? { push: { ...base.notificationPreferences.push, ...notificationPatch.push } } : {}),
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

function mergeCollectionConflict(
  local: UserAlertPreferences["collectionPreferences"],
  remote: UserAlertPreferences["collectionPreferences"],
) {
  const bottles = new Map(remote.bottles.map((bottle) => [bottle.canonicalKey, bottle]));
  for (const bottle of local.bottles) bottles.set(bottle.canonicalKey, bottle);
  return {
    bottles: [...bottles.values()].sort((left, right) => right.rating - left.rating || left.bottleName.localeCompare(right.bottleName)),
    version: remote.version ?? 0,
  };
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
  const [confirmedPrefs, setConfirmedPrefs] = useState<UserAlertPreferences | null>(() => (
    qaPreview
      ? QA_PREVIEW_PREFERENCES
      : getCachedAreaPreferences(userId) ?? (isLoaded && !isSignedIn ? EMPTY_PREFS : null)
  ));
  const [loading, setLoading] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [collectionSyncState, setCollectionSyncState] = useState<"idle" | "pending" | "conflict">("idle");
  const [resolvedFor, setResolvedFor] = useState<PreferenceResolution>(() => {
    if (qaPreview) return "preview";
    if (userId && getCachedAreaPreferences(userId)) return "signed-in";
    if (isLoaded && !isSignedIn) return "signed-out";
    return null;
  });

  const fetchPrefs = useCallback(async () => {
    if (qaPreview) {
      setPreferenceError(null);
      setPrefs(QA_PREVIEW_PREFERENCES);
      setConfirmedPrefs(QA_PREVIEW_PREFERENCES);
      setResolvedFor("preview");
      return;
    }
    const requestedUserId = userId;
    if (!requestedUserId) {
      setPreferenceError(null);
      setPrefs(EMPTY_PREFS);
      setConfirmedPrefs(isLoaded && !isSignedIn ? EMPTY_PREFS : null);
      setCollectionSyncState("idle");
      setResolvedFor(isLoaded && !isSignedIn ? "signed-out" : null);
      return;
    }
    setLoading(true);
    setPreferenceError(null);
    setResolvedFor(null);
    const pendingBeforeRequest = await readPendingCollection(requestedUserId);
    setCollectionSyncState(pendingBeforeRequest?.blockedByConflict ? "conflict" : pendingBeforeRequest ? "pending" : "idle");
    if (pendingBeforeRequest && activeUserIdRef.current === requestedUserId) {
      setPrefs((current) => ({ ...current, collectionPreferences: pendingBeforeRequest.collectionPreferences }));
    }
    try {
      const res = await fetch("/api/user/preferences");
      if (!res.ok) throw new Error("Failed to load saved preferences");
      {
        let data: UserAlertPreferences = await res.json();
        const pending = pendingBeforeRequest;
        if (pending) {
          const pendingPreferences = {
            ...pending.collectionPreferences,
            version: pending.collectionPreferences.version ?? 0,
          };
          data = { ...data, collectionPreferences: pendingPreferences };
          let conflictPreferences: UserAlertPreferences["collectionPreferences"] | null = null;
          try {
            const synced = await syncPendingCollection(requestedUserId, async (collectionPreferences, pendingRecord) => {
              const response = await fetch("/api/user/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ collectionPreferences }),
              });
              if (response.status === 409) {
                const conflict = await response.json().catch(() => null) as { currentCollection?: UserAlertPreferences["collectionPreferences"] } | null;
                if (conflict?.currentCollection) {
                  conflictPreferences = mergeCollectionConflict(collectionPreferences, conflict.currentCollection);
                  const rebased = await writePendingCollection(requestedUserId, conflictPreferences);
                  if (rebased) await markPendingCollectionConflict(requestedUserId, rebased.operationId);
                } else await markPendingCollectionConflict(requestedUserId, pendingRecord.operationId);
                throw new Error("pending_collection_conflict");
              }
              if (!response.ok) throw new Error("pending_collection_sync_failed");
              return await response.json() as UserAlertPreferences;
            });
            if (synced) {
              data = synced;
              setCollectionSyncState("idle");
            }
          } catch {
            // Keep the device copy visible and retry after the next successful preferences load/save.
            data = {
              ...data,
              collectionPreferences: conflictPreferences || pending.collectionPreferences,
            };
            setCollectionSyncState(conflictPreferences || pending.blockedByConflict ? "conflict" : "pending");
          }
        }
        if (activeUserIdRef.current === requestedUserId) {
          setCachedAreaPreferences(requestedUserId, data);
          setPrefs(data);
          setConfirmedPrefs(data);
        }
      }
    } catch {
      if (activeUserIdRef.current === requestedUserId) {
        setPreferenceError("Failed to load saved preferences");
      }
      // Preserve the last confirmed or device-cached preferences during an outage.
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
      setPreferenceError(null);
      setPrefs(QA_PREVIEW_PREFERENCES);
      setConfirmedPrefs(QA_PREVIEW_PREFERENCES);
      setCollectionSyncState("idle");
      setLoading(false);
      setResolvedFor("preview");
      return;
    }

    invalidateAreaPreferencesCacheForUser(userId);
    if (!isLoaded) {
      setPreferenceError(null);
      setConfirmedPrefs(null);
      setLoading(false);
      setResolvedFor(null);
      return;
    }
    if (!userId) {
      setPreferenceError(null);
      setPrefs(EMPTY_PREFS);
      setConfirmedPrefs(EMPTY_PREFS);
      setCollectionSyncState("idle");
      setLoading(false);
      setResolvedFor("signed-out");
      return;
    }

    const cached = getCachedAreaPreferences(userId);
    if (cached) {
      setPreferenceError(null);
      setPrefs(cached);
      setConfirmedPrefs(cached);
      setLoading(false);
      setResolvedFor("signed-in");
      void readPendingCollection(userId).then((pending) => {
        if (activeUserIdRef.current === userId) {
          setCollectionSyncState(pending?.blockedByConflict ? "conflict" : pending ? "pending" : "idle");
        }
      });
      return;
    }

    setPrefs(EMPTY_PREFS);
    setConfirmedPrefs(null);
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
    const base = getCachedAreaPreferences(requestedUserId) || prefs || EMPTY_PREFS;
    const requestPatch: UserAlertPreferencePatch = newPrefs.collectionPreferences
      ? {
          ...newPrefs,
          collectionPreferences: {
            ...newPrefs.collectionPreferences,
            version: newPrefs.collectionPreferences.version ?? base.collectionPreferences.version ?? 0,
          },
        }
      : newPrefs;
    const merged = mergePreferencePatch(base, requestPatch);
    setPrefs((current) => mergePreferencePatch(current, requestPatch));
    if (requestedUserId && requestPatch.collectionPreferences) setCachedAreaPreferences(requestedUserId, merged);
    if (qaPreview) {
      setConfirmedPrefs(merged);
      return { status: "synced" as const };
    }

    const collectionWrite = Boolean(requestedUserId && requestPatch.collectionPreferences);
    let pendingWrite = null as Awaited<ReturnType<typeof writePendingCollection>>;
    if (collectionWrite && requestedUserId && requestPatch.collectionPreferences) {
      pendingWrite = await writePendingCollection(requestedUserId, requestPatch.collectionPreferences);
    }

    const res = await fetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPatch),
    }).catch(() => null);
    if (!res) {
      if (collectionWrite && pendingWrite) {
        setCollectionSyncState("pending");
        return { status: "pending" as const };
      }
      if (requestedUserId) clearCachedAreaPreferences(requestedUserId);
      if (activeUserIdRef.current === requestedUserId) await fetchPrefs();
      throw new Error("Failed to save preferences");
    }
    if (res.status === 409 && collectionWrite && requestedUserId && pendingWrite) {
      const conflict = await res.json().catch(() => null) as { currentCollection?: UserAlertPreferences["collectionPreferences"] } | null;
      const mergedConflict = conflict?.currentCollection && requestPatch.collectionPreferences
        ? mergeCollectionConflict(requestPatch.collectionPreferences, conflict.currentCollection)
        : requestPatch.collectionPreferences;
      if (mergedConflict) {
        const rebased = await writePendingCollection(requestedUserId, mergedConflict);
        if (rebased) await markPendingCollectionConflict(requestedUserId, rebased.operationId);
        const conflictedPreferences = { ...merged, collectionPreferences: mergedConflict };
        setCachedAreaPreferences(requestedUserId, conflictedPreferences);
        if (activeUserIdRef.current === requestedUserId) setPrefs(conflictedPreferences);
      } else await markPendingCollectionConflict(requestedUserId, pendingWrite.operationId);
      setCollectionSyncState("conflict");
      return { status: "conflict" as const };
    }
    if (!res.ok) {
      if (collectionWrite && pendingWrite && (res.status >= 500 || res.status === 408 || res.status === 429)) {
        setCollectionSyncState("pending");
        return { status: "pending" as const };
      }
      if (collectionWrite && requestedUserId && pendingWrite) {
        await clearPendingCollection(requestedUserId, pendingWrite.operationId);
      }
      if (requestedUserId) clearCachedAreaPreferences(requestedUserId);
      if (activeUserIdRef.current === requestedUserId) await fetchPrefs();
      throw new Error("Failed to save preferences");
    }
    const saved = await res.json().catch(() => null) as UserAlertPreferences | null;
    if (collectionWrite && requestedUserId && pendingWrite) await clearPendingCollection(requestedUserId, pendingWrite.operationId);
    if (collectionWrite) setCollectionSyncState("idle");
    if (activeUserIdRef.current !== requestedUserId) return { status: "synced" as const };
    if (saved && requestedUserId) {
      setCachedAreaPreferences(requestedUserId, saved);
      setPrefs(saved);
      setConfirmedPrefs(saved);
    } else {
      setPrefs(merged);
      setConfirmedPrefs(merged);
    }
    return { status: "synced" as const };
  }, [fetchPrefs, prefs, qaPreview, userId]);

  return { prefs, confirmedPrefs, loading, ready, preferenceError, savePreferences, collectionSyncState };
}
