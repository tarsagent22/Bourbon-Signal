"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemberSighting, SignalReport, SightingVoteKind, SightingsPreferences } from "@/lib/sightings";
import { EMPTY_SIGHTINGS_PREFERENCES } from "@/lib/sightings";

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
}

export function useSightings(enabled: boolean = true) {
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
    const res = await fetch("/api/sightings");
    if (!res.ok) throw new Error("Unable to load sightings");
    const data = (await res.json()) as SightingsFeedResponse;
    setSightings(data.sightings || []);
    setStates(data.states || []);
    setRewards(data.rewards || null);
    setPreviewLimit(typeof data.previewLimit === "number" ? data.previewLimit : null);
    setTotalSightings(typeof data.totalSightings === "number" ? data.totalSightings : (data.sightings || []).length);
    return data;
  }, []);

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
      const [preferencesData] = await Promise.all([refreshPreferences(), refreshSightings()]);
      return preferencesData;
    } catch (err) {
      console.error("Failed to load sightings", err);
      setError("Unable to load sightings");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, refreshPreferences, refreshSightings]);

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
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json().catch(() => ({}))) as SightingsFeedResponse & { sighting?: MemberSighting; error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to save sighting");
      setSightings(data.sightings || []);
      if (data.rewards) setRewards(data.rewards);
      setPreviewLimit(typeof data.previewLimit === "number" ? data.previewLimit : null);
      setTotalSightings(typeof data.totalSightings === "number" ? data.totalSightings : (data.sightings || []).length);
      await refreshPreferences().catch(() => undefined);
      return data.sighting || sighting;
    } catch (err) {
      console.error("Failed to save sighting", err);
      setError(err instanceof Error ? err.message : "Unable to save sighting");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [refreshPreferences]);

  const voteSighting = useCallback(async (sightingId: string, vote: SightingVoteKind) => {
    setSaving(true);
    setError(null);
    setSightings((current) => current.map((sighting) => {
      if (sighting.id !== sightingId) return sighting;
      const sameVote = sighting.myVote === vote;
      const wasUp = sighting.myVote === "up";
      const wasDown = sighting.myVote === "down";
      return {
        ...sighting,
        myVote: sameVote ? null : vote,
        upCount: Math.max(0, (sighting.upCount || 0) - (wasUp ? 1 : 0) + (!sameVote && vote === "up" ? 1 : 0)),
        downCount: Math.max(0, (sighting.downCount || 0) - (wasDown ? 1 : 0) + (!sameVote && vote === "down" ? 1 : 0)),
      };
    })); // optimistic: both feeds respond immediately while persistence completes
    try {
      const res = await fetch("/api/sightings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sightingId, vote }),
      });
      const data = (await res.json().catch(() => ({}))) as SightingsFeedResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to save vote");
      setSightings(data.sightings || []);
      if (data.rewards) setRewards(data.rewards);
      setPreviewLimit(typeof data.previewLimit === "number" ? data.previewLimit : null);
      setTotalSightings(typeof data.totalSightings === "number" ? data.totalSightings : (data.sightings || []).length);
      await refreshPreferences().catch(() => undefined);
    } catch (err) {
      console.error("Failed to save sighting vote", err);
      setError(err instanceof Error ? err.message : "Unable to save vote");
      await refreshSightings().catch(() => undefined);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [refreshPreferences, refreshSightings]);

  const uploadSightingPhoto = useCallback(async (sightingId: string, file: File) => {
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("sightingId", sightingId);
      form.set("photo", file);
      const res = await fetch("/api/sightings/photo", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to upload photo");
      await refreshSightings();
      return data;
    } catch (err) {
      console.error("Failed to upload sighting photo", err);
      setError("Unable to upload photo");
      throw err;
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
