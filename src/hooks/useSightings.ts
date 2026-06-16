"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemberSighting, SignalReport, SightingVoteKind, SightingsPreferences } from "@/lib/sightings";
import { EMPTY_SIGHTINGS_PREFERENCES } from "@/lib/sightings";

interface PreferencesResponse {
  sightingsPreferences?: SightingsPreferences;
  [key: string]: unknown;
}

interface SightingsFeedResponse {
  sightings?: MemberSighting[];
  states?: string[];
}

export function useSightings(enabled: boolean = true) {
  const [preferences, setPreferences] = useState<SightingsPreferences>(EMPTY_SIGHTINGS_PREFERENCES);
  const [rawPreferences, setRawPreferences] = useState<PreferencesResponse | null>(null);
  const [sightings, setSightings] = useState<MemberSighting[]>([]);
  const [states, setStates] = useState<string[]>([]);
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
    return data;
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setSightings([]);
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
      });
      if (!res.ok) throw new Error("Unable to save sighting");
      const data = (await res.json()) as SightingsFeedResponse & { sighting?: MemberSighting };
      setSightings(data.sightings || []);
      await refreshPreferences().catch(() => undefined);
      return data.sighting || sighting;
    } catch (err) {
      console.error("Failed to save sighting", err);
      setError("Unable to save sighting");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [refreshPreferences]);

  const voteSighting = useCallback(async (sightingId: string, vote: SightingVoteKind) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sightings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sightingId, vote }),
      });
      if (!res.ok) throw new Error("Unable to save vote");
      const data = (await res.json()) as SightingsFeedResponse;
      setSightings(data.sightings || []);
      await refreshPreferences().catch(() => undefined);
    } catch (err) {
      console.error("Failed to save sighting vote", err);
      setError("Unable to save vote");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [refreshPreferences]);

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
    reports: preferences.signalReports,
    reportsBySignalId,
    loading,
    saving,
    error,
    refresh,
    addSighting,
    voteSighting,
    addSignalReport,
  };
}
