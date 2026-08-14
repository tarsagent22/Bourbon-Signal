"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { normalizeGrowthAttribution } from "@/lib/growth-events";
import { recordGrowthMilestone } from "@/lib/growth-client";

const surfaceForPath = (path: string) => path === "/"
  ? "homepage"
  : path.startsWith("/sign-up")
    ? "sign_up"
    : path.startsWith("/welcome")
      ? "welcome"
      : path.startsWith("/dashboard")
        ? "dashboard"
        : path.startsWith("/bottle-check")
            ? "bottle_check"
            : path.startsWith("/pricing")
              ? "pricing"
              : path.startsWith("/retailers")
                ? "retailer"
                : path.startsWith("/drops")
                  ? "drop_feed"
                  : "unknown";

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

    const attribution = normalizeGrowthAttribution({
      surface,
      utm_source: search.get("utm_source"),
      utm_medium: search.get("utm_medium"),
      utm_campaign: search.get("utm_campaign"),
      referrer: referrerHost ? `https://${referrerHost}` : "",
    });
    recordGrowthMilestone(surface === "pricing" ? "pricing_viewed" : "product_surface_viewed", { surface }, { attribution });
  }, [pathname, search]);

  return null;
}
