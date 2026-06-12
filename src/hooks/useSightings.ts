"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MemberSighting, SignalReport, SightingsPreferences } from "@/lib/sightings";
import { EMPTY_SIGHTINGS_PREFERENCES } from "@/lib/sightings";

interface PreferencesResponse {
  sightingsPreferences?: SightingsPreferences;
  [key: string]: unknown;
}

export function useSightings(enabled: boolean = true) {
  const [preferences, setPreferences] = useState<SightingsPreferences>(EMPTY_SIGHTINGS_PREFERENCES);
  const [rawPreferences, setRawPreferences] = useState<PreferencesResponse | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/user/preferences");
      if (!res.ok) throw new Error("Unable to load sightings");
      const data = (await res.json()) as PreferencesResponse;
      const sightingsPreferences = data.sightingsPreferences ?? EMPTY_SIGHTINGS_PREFERENCES;
      setRawPreferences(data);
      setPreferences(sightingsPreferences);
      return data;
    } catch (err) {
      console.error("Failed to load sightings", err);
      setError("Unable to load sightings");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveSightingsPreferences = useCallback(async (next: SightingsPreferences) => {
    setSaving(true);
    setError(null);
    try {
      const base = rawPreferences ?? (await refresh()) ?? {};
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
  }, [rawPreferences, refresh]);

  const addSighting = useCallback(async (sighting: MemberSighting) => {
    const next = {
      submittedSightings: [sighting, ...preferences.submittedSightings].slice(0, 100),
      signalReports: preferences.signalReports,
    };
    return saveSightingsPreferences(next);
  }, [preferences, saveSightingsPreferences]);

  const addSignalReport = useCallback(async (report: SignalReport) => {
    const withoutSameUserSignal = preferences.signalReports.filter((item) => item.signalId !== report.signalId);
    const next = {
      submittedSightings: preferences.submittedSightings,
      signalReports: [report, ...withoutSameUserSignal].slice(0, 250),
    };
    return saveSightingsPreferences(next);
  }, [preferences, saveSightingsPreferences]);

  const reportsBySignalId = useMemo(() => {
    const map = new Map<string, SignalReport>();
    for (const report of preferences.signalReports) map.set(report.signalId, report);
    return map;
  }, [preferences.signalReports]);

  return {
    sightings: preferences.submittedSightings,
    reports: preferences.signalReports,
    reportsBySignalId,
    loading,
    saving,
    error,
    refresh,
    addSighting,
    addSignalReport,
  };
}
