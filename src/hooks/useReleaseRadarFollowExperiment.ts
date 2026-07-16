"use client";

import { useCallback, useEffect, useState } from "react";
import { RELEASE_RADAR_FOLLOW_CTA_LABELS } from "@/lib/growth-experiments";

interface ExperimentResponse {
  enabled?: boolean;
  ctaLabel?: string;
}

async function record(action: "exposure" | "conversion") {
  const response = await fetch("/api/experiments/release-radar-follow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return await response.json() as ExperimentResponse;
}

export function useReleaseRadarFollowExperiment(eligible: boolean) {
  const [ctaLabel, setCtaLabel] = useState<string>(RELEASE_RADAR_FOLLOW_CTA_LABELS.control);

  useEffect(() => {
    if (!eligible) {
      setCtaLabel(RELEASE_RADAR_FOLLOW_CTA_LABELS.control);
      return;
    }
    let active = true;
    record("exposure")
      .then((result) => {
        if (active && result?.enabled && result.ctaLabel) setCtaLabel(result.ctaLabel);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [eligible]);

  const recordConversion = useCallback(async () => {
    if (!eligible) return;
    await record("conversion").catch(() => null);
  }, [eligible]);

  return { ctaLabel, recordConversion };
}
