import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeStoreForSite } from "@/lib/site-engine-contract";

export async function GET() {
  try {
    const exportPayload = readSiteExport("locations") ?? readSiteExport("stores");
    const rawLocations = Array.isArray(exportPayload?.locations)
      ? exportPayload.locations
      : Array.isArray(exportPayload?.stores)
        ? exportPayload.stores
        : [];
    const locations = rawLocations.map((location) => normalizeStoreForSite(location as Record<string, unknown>));

    return NextResponse.json(
      {
        ...exportPayload,
        locations,
        stores: locations,
        total: locations.length,
        states: listStates(locations),
        lastUpdated: exportPayload?.generatedAt ?? new Date().toISOString(),
      },
      { headers: siteExportHeaders("local-export") }
    );
  } catch (err) {
    console.error("[api/locations] Error reading site export:", err);

    return NextResponse.json(
      {
        locations: [],
        stores: [],
        total: 0,
        states: [],
        error: "Location bible temporarily unavailable",
      },
      {
        status: 200,
        headers: siteExportHeaders("empty-fallback"),
      }
    );
  }
}
