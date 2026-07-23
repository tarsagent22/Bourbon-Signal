"use client";

import { track } from "@vercel/analytics";
import {
  sanitizeCoverageAnalyticsEvent,
  type CoverageAnalyticsEvent,
} from "@/lib/coverage-analytics";

export function trackCoverageEvent(event: CoverageAnalyticsEvent, properties: Record<string, unknown>) {
  if (typeof window === "undefined" || !["bourbonsignal.com", "www.bourbonsignal.com"].includes(window.location.hostname)) return;
  const safe = sanitizeCoverageAnalyticsEvent(event, properties);
  if (safe) track(event, safe);
}
