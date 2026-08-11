"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { upload as uploadBlob } from "@vercel/blob/client";
import type { MemberSighting, SignalReport, SightingVoteKind, SightingsPreferences } from "@/lib/sightings";
import { EMPTY_SIGHTINGS_PREFERENCES } from "@/lib/sightings";
import {
  ALLOWED_SIGHTING_PHOTO_TYPES,
  buildSightingPhotoPath,
  MAX_SIGHTING_PHOTO_BYTES,
  SIGHTING_PHOTO_MULTIPART_THRESHOLD_BYTES,
} from "@/lib/sighting-photo-upload";

import type { MemberRewardsSummary } from "@/lib/sighting-rewards";

interface PreferencesResponse {
  sightingsPreferences?: SightingsPreferences;
  [key: string]: unknown;
}

interface SightingsFeedResponse {
  sightings?: MemberSighting[];
  states?: string[];
  rewards?: MemberRewardsSummary;
  previewLimit?: number | null;
  totalSightings?: number;
  created?: boolean;
}

interface UseSightingsOptions {
  includePreferences?: boolean;
  includeRewards?: boolean;
  feedLimit?: number;
}

export function useSightings(
  enabled: boolean = true,
  { includePreferences = true, includeRewards = true, feedLimit = 60 }: UseSightingsOptions = {},
) {
  const [preferences, setPreferences] = useState<SightingsPreferences>(EMPTY_SIGHTINGS_PREFERENCES);
  const [rawPreferences, setRawPreferences] = useState<PreferencesResponse | null>(null);
  const [sightings, setSightings] = useState<MemberSighting[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [rewards, setRewards] = useState<MemberRewardsSummary | null>(null);
  const [previewLimit, setPreviewLimit] = useState<number | null>(null);
  const [totalSightings, setTotalSightings] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPreferences = useCallback(async () => {
    const res = await fetch("/api/user/preferences");
    if (!res.ok) throw new Error("Unable to load preferences");
    const data = (await res.json()) as PreferencesResponse;
    const sightingsPreferences = data.sightingsPreferences ?? EMPTY_SIGHTINGS_PREFERENCES;
    setRawPreferences(data);
    setPreferences(sightingsPreferences);
    return data;
  }, []);

  const refreshSightings = useCallback(async () => {
    const params = new URLSearchParams();
    if (!includeRewards) params.set("rewards", "0");
    params.set("limit", String(Math.max(1, Math.min(feedLimit, 1_000))));
    const res = await fetch(`/api/sightings?${params.toString()}`);
    if (!res.ok) throw new Error("Unable to load sightings");
    const data = (await res.json()) as SightingsFeedResponse;
    setSightings(data.sightings || []);
    setStates(data.states || []);
    setRewards(data.rewards || null);
    setPreviewLimit(typeof data.previewLimit === "number" ? data.previewLimit : null);
    setTotalSightings(typeof data.totalSightings === "number" ? data.totalSightings : (data.sightings || []).length);
    return data;
  }, [feedLimit, includeRewards]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setSightings([]);
      setPreviewLimit(null);
      setTotalSightings(0);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      if (!includePreferences) {
        await refreshSightings();
        return null;
      }
      const [preferencesData] = await Promise.all([refreshPreferences(), refreshSightings()]);
      return preferencesData;
    } catch (err) {
      console.error("Failed to load sightings", err);
      setError("Unable to load sightings");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, includePreferences, refreshPreferences, refreshSightings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveSightingsPreferences = useCallback(async (next: SightingsPreferences) => {
    setSaving(true);
    setError(null);
    try {
      const base = rawPreferences ?? (await refreshPreferences()) ?? {};
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, sightingsPreferences: next }),
      });
      if (!res.ok) throw new Error("Unable to save sightings");
      const data = (await res.json()) as PreferencesResponse;
      const saved = data.sightingsPreferences ?? next;
      setRawPreferences(data);
      setPreferences(saved);
      return saved;
    } catch (err) {
      console.error("Failed to save sightings", err);
      setError("Unable to save sightings");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [rawPreferences, refreshPreferences]);

  const addSighting = useCallback(async (sighting: MemberSighting) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sightings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sighting),
      });
      const data = (await res.json().catch(() => ({}))) as SightingsFeedResponse & { sighting?: MemberSighting; error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to save sighting");
      const savedSighting = data.sighting || sighting;
      setSightings((current) => {
        const next = [savedSighting, ...current.filter((item) => item.id !== savedSighting.id)];
        return previewLimit === null ? next : next.slice(0, previewLimit);
      });
      if (data.rewards) setRewards(data.rewards);
      setTotalSightings((current) => (current === null ? current : current + (data.created ? 1 : 0)));
      return { sighting: savedSighting, created: data.created !== false };
    } catch (err) {
      console.error("Failed to save sighting", err);
      const message = err instanceof Error ? err.message : "Unable to save sighting";
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [previewLimit]);

  const voteSighting = useCallback(async (sightingId: string, vote: SightingVoteKind) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sightings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sightingId, vote }),
      });
      const data = (await res.json().catch(() => ({}))) as SightingsFeedResponse & { sighting?: MemberSighting; error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to save vote");
      if (data.sighting) setSightings((current) => current.map((item) => item.id === data.sighting!.id ? data.sighting! : item));
      if (data.rewards) setRewards(data.rewards);
    } catch (err) {
      console.error("Failed to save sighting vote", err);
      setError("Unable to save vote");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [refreshPreferences]);

  const uploadSightingPhoto = useCallback(async (sightingId: string, file: File) => {
    setSaving(true);
    setError(null);
    try {
      if (file.size > MAX_SIGHTING_PHOTO_BYTES) throw new Error("Photo must be 10 MB or smaller.");
      if (file.type && !ALLOWED_SIGHTING_PHOTO_TYPES.includes(file.type.toLowerCase() as typeof ALLOWED_SIGHTING_PHOTO_TYPES[number])) throw new Error("Upload a JPEG, PNG, WebP, or HEIC image.");
      const pathname = buildSightingPhotoPath(sightingId, file.name, file.type);
      const blob = await uploadBlob(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/sightings/photo",
        clientPayload: JSON.stringify({ sightingId }),
        contentType: file.type || undefined,
        multipart: file.size > SIGHTING_PHOTO_MULTIPART_THRESHOLD_BYTES,
      });
      const res = await fetch("/api/sightings/photo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sightingId, blob: { url: blob.url, pathname: blob.pathname } }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; [key: string]: unknown };
      if (!res.ok) throw new Error(data.error || "Unable to attach uploaded photo");
      await refreshSightings();
      return data;
    } catch (err) {
      console.error("Failed to upload sighting photo", err);
      const message = err instanceof Error ? err.message : "Unable to upload photo";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setSaving(false);
    }
  }, [refreshSightings]);

  const addSignalReport = useCallback(async (report: SignalReport) => {
    const withoutSameUserSignal = preferences.signalReports.filter((item) => item.signalId !== report.signalId);
    const next = {
      submittedSightings: preferences.submittedSightings,
      signalReports: [report, ...withoutSameUserSignal].slice(0, 250),
      sightingVotes: preferences.sightingVotes || [],
    };
    return saveSightingsPreferences(next);
  }, [preferences, saveSightingsPreferences]);

  const reportsBySignalId = useMemo(() => {
    const map = new Map<string, SignalReport>();
    for (const report of preferences.signalReports) map.set(report.signalId, report);
    return map;
  }, [preferences.signalReports]);

  return {
    sightings,
    states,
    rewards,
    previewLimit,
    totalSightings,
    reports: preferences.signalReports,
    reportsBySignalId,
    loading,
    saving,
    error,
    refresh,
    addSighting,
    voteSighting,
    uploadSightingPhoto,
    addSignalReport,
  };
}
