import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeStoreForSite } from "@/lib/site-engine-contract";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();

  try {
    const exportPayload = readSiteExport("locations") ?? readSiteExport("stores");
    const rawLocations = Array.isArray(exportPayload?.locations)
      ? exportPayload.locations
      : Array.isArray(exportPayload?.stores)
        ? exportPayload.stores
        : [];
    let locations = rawLocations.map((location) => normalizeStoreForSite(location as Record<string, unknown>));

    if (state) {
      locations = locations.filter((location) => {
        const record = location as Record<string, unknown>;
        return String(record.state ?? record.state_code ?? "").toUpperCase() === state;
      });
    }

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
