"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";

const surfaceForPath = (path: string) => path === "/" ? "homepage" : path.startsWith("/release-radar") ? "release_radar" : path.startsWith("/bottle-check") ? "bottle_check" : path.startsWith("/pricing") ? "pricing" : path.startsWith("/retailers") ? "retailer" : path.startsWith("/drops") ? "drop_feed" : "unknown";

export default function GrowthAnalytics() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const surface = surfaceForPath(pathname);
    if (surface === "unknown" || !["bourbonsignal.com", "www.bourbonsignal.com"].includes(window.location.hostname)) return;

    let referrerHost = "";
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : "";
    } catch {
      referrerHost = "";
    }

    track("product_surface_viewed", { surface });
    void fetch("/api/growth/attribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface,
        event: surface === "pricing" ? "pricing_viewed" : undefined,
        utm_source: search.get("utm_source"),
        utm_medium: search.get("utm_medium"),
        utm_campaign: search.get("utm_campaign"),
        referrerHost,
      }),
    }).catch(() => undefined);
  }, [pathname, search]);

  return null;
}
