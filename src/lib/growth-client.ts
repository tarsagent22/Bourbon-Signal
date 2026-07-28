"use client";

import { track } from "@vercel/analytics";
import {
  sanitizeGrowthEvent,
  type GrowthAttribution,
  type GrowthEventName,
} from "@/lib/growth-events";

interface GrowthRecordOptions {
  attribution?: GrowthAttribution;
  navigation?: boolean;
}

let growthPersistenceQueue: Promise<boolean> = Promise.resolve(true);

export function recordGrowthMilestone(
  name: GrowthEventName,
  properties: Record<string, unknown>,
  options: GrowthRecordOptions = {},
) {
  const safeProperties = sanitizeGrowthEvent(name, properties);
  if (!safeProperties) return Promise.resolve(false);

  if (typeof window !== "undefined" && ["bourbonsignal.com", "www.bourbonsignal.com"].includes(window.location.hostname)) {
    track(name, safeProperties);
  }

  const attribution = options.attribution
    ? {
        campaign: options.attribution.campaign,
        referrerHost: options.attribution.referrerHost,
      }
    : {};

  const persist = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2_500);
    try {
      const response = await fetch("/api/growth/attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        signal: controller.signal,
        body: JSON.stringify({
          ...attribution,
          ...safeProperties,
          event: name,
        }),
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  if (options.navigation) {
    // Start the keepalive request immediately instead of placing a
    // navigation-bound milestone behind earlier metadata writes.
    return persist();
  }

  growthPersistenceQueue = growthPersistenceQueue
    .catch(() => false)
    .then(persist);

  return growthPersistenceQueue;
}
