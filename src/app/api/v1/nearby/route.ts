import { withNearbyFeedScope } from "@/lib/nearby-feed-scope";
import { NextRequest, NextResponse } from "next/server";
import { GET as feed } from "../signals/route";
import { readSiteExportResults } from "@/lib/site-engine-contract";
import { nearbyStoreIndex, addNearbySignals } from "@/lib/nearby";

import { validPoint, type NearbyStore } from "../../../../../shared/nearby";
import type { SignalFeedPage } from "../../../../../apps/mobile/src/api/types";
export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const origin = {
      latitude: Number(q.get("lat")),
      longitude: Number(q.get("lng")),
    },
    radius = Number(q.get("radius") || 25);
  if (
    !q.get("lat")?.trim() ||
    !q.get("lng")?.trim() ||
    !validPoint(origin) ||
    ![10, 25, 50, 100].includes(radius)
  )
    return NextResponse.json(
      { error: "Choose a valid location and radius." },
      { status: 400, headers },
    );
  try {
    const exports = await readSiteExportResults(["stores", "locations"]);
    const byAddress = nearbyStoreIndex(
      exports.flatMap((e) => [
        ...(Array.isArray(e.payload?.stores) ? e.payload.stores : []),
        ...(Array.isArray(e.payload?.locations) ? e.payload.locations : []),
      ]),
    );
    const started = Date.now();
    const found = new Map<string, NearbyStore>();
    let cursor: string | null = null,
      partial = exports.some(
        (e) =>
          !e.payload ||
          e.source === "cache-fallback" ||
          e.source === "empty-fallback",
      ),
      unmapped = 0,
      previewLocked = false;
    for (let page = 0; page < 100; page++) {
      if (page > 0 && Date.now() - started > 8000) {
        partial = true;
        break;
      }
      const url = new URL("/api/v1/signals", request.url);
      url.searchParams.set("limit", q.get("view") === "community" ? "100" : "9999");
      for (const key of [
        "view",
        "search",
        "tiers",
        "freshness",
        "state",
        "area",
      ]) {
        const v = q.get(key);
        if (v) url.searchParams.set(key, v);
      }
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await withNearbyFeedScope(byAddress, origin, radius, () =>
        feed(new NextRequest(url, { headers: request.headers })),
      );
      if (!response.ok) return response;
      const data = (await response.json()) as SignalFeedPage;
      previewLocked = data.access.previewLocked;
      partial ||= data.degraded;
      unmapped += addNearbySignals(
        data.signals,
        byAddress,
        origin,
        radius,
        found,
      );
      if (!data.hasMore || !data.nextCursor) {
        cursor = null;
        break;
      }
      if (cursor === data.nextCursor) {
        partial = true;
        break;
      }
      cursor = data.nextCursor;
    }
    partial ||= Boolean(cursor);
    return NextResponse.json(
      {
        stores: [...found.values()].sort((a, b) => a.distance - b.distance),
        partial,
        unmapped,
        previewLocked,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Nearby reports could not be loaded. Please try again." },
      { status: 503, headers },
    );
  }
}
