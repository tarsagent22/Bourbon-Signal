import {
  withNearbyFeedScope,
  nearbySearchCities,
} from "@/lib/nearby-feed-scope";
import { NextRequest, NextResponse } from "next/server";
import { GET as feed } from "../signals/route";
import {
  readSiteExportResults,
  readBundledSiteExport,
  normalizeStoreForSite,
} from "@/lib/site-engine-contract";
import {
  nearbyStoreIndex,
  addNearbySignals,
  unlocatedNearbySignals,
} from "@/lib/nearby";

import { validPoint, type NearbyStore } from "../../../../../shared/nearby";
import type { SignalFeedPage } from "../../../../../apps/mobile/src/api/types";
import { nearbyBoards, addBoardSignals } from "@/lib/nearby-boards";
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
    const directoryRows = (payloads: Array<Record<string, unknown> | null>) =>
      payloads
        .flatMap((payload) => [
          ...(Array.isArray(payload?.locations) ? payload.locations : []),
          ...(Array.isArray(payload?.stores) ? payload.stores : []),
        ])
        .map(normalizeStoreForSite);
    const byAddress = nearbyStoreIndex(
      directoryRows(exports.map((e) => e.payload)),
      directoryRows([
        readBundledSiteExport("locations"),
        readBundledSiteExport("stores"),
      ]),
    );
    const started = Date.now();
    const found = new Map<string, NearbyStore>();
    const candidates = nearbyBoards(origin, radius);
    const boardNames = new Set(candidates.map((b) => b.name));
    const boardResults = new Map<string, NearbyStore>();
    const unlocated = new Map<string, SignalFeedPage["signals"][number]>();
    const place = {
      state: (q.get("placeState") || "").toUpperCase(),
      city: q.get("placeCity") || "",
    };
    const cities = nearbySearchCities(byAddress, origin, radius, place);
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
      url.searchParams.set(
        "limit",
        q.get("view") === "community" ? "100" : "9999",
      );
      for (const key of [
        "view",
        "search",
        "tiers",
        "freshness",
        "state",
        "area",
      ]) {
        const v = q.get(key);
        if (v && !(key === "view" && v === "all")) url.searchParams.set(key, v);
      }
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await withNearbyFeedScope(
        byAddress,
        origin,
        radius,
        () => feed(new NextRequest(url, { headers: request.headers })),
        place,
        boardNames,
      );
      if (!response.ok) return response;
      const data = (await response.json()) as SignalFeedPage;
      previewLocked = data.access.previewLocked;
      addBoardSignals(data.signals, candidates, boardResults);
      for (const signal of unlocatedNearbySignals(
        data.signals,
        byAddress,
        cities,
      ))
        unlocated.set(signal.id, signal);
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
        boards: [...boardResults.values()].sort(
          (a, b) => a.distance - b.distance,
        ),
        partial,
        unmapped,
        previewLocked,
        unlocated: [...unlocated.values()],
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
