"use client";

import { track } from "@vercel/analytics";
import { sanitizeGrowthEvent, type GrowthEventName } from "@/lib/growth-events";

type RadarGrowthEventName = Extract<GrowthEventName,
  "radar_release_followed" |
  "radar_bottle_tracked" |
  "radar_market_handoff" |
  "radar_calendar_exported"
>;

export function trackRadarGrowthEvent(name: RadarGrowthEventName, properties: Record<string, string>) {
  if (typeof window === "undefined" || !["bourbonsignal.com", "www.bourbonsignal.com"].includes(window.location.hostname)) return;
  const safeProperties = sanitizeGrowthEvent(name, properties);
  if (safeProperties) track(name, safeProperties);
}
