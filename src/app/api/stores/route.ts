import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeStoreForSite } from "@/lib/site-engine-contract";
import { californiaAreaMatchesFields, parseCaliforniaAreaQuery } from "@/lib/california-area";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();
  const californiaArea = parseCaliforniaAreaQuery(url.searchParams.get("area"));
  if (state === "CA" && californiaArea.requested && !californiaArea.valid) {
    return NextResponse.json({ stores: [], locations: [], total: 0, error: "Unsupported California area" }, { status: 400 });
  }

  try {
    const storesPayload = await readSiteExport("stores");
    const exportPayload = storesPayload ?? await readSiteExport("locations");
    const rawStores = Array.isArray(exportPayload?.stores)
      ? exportPayload.stores
      : Array.isArray(exportPayload?.locations)
        ? exportPayload.locations
        : [];
    let stores = rawStores.map((store) => normalizeStoreForSite(store as Record<string, unknown>));

    if (state) {
      stores = stores.filter((store) => {
        const record = store as Record<string, unknown>;
        return String(record.state ?? record.state_code ?? "").toUpperCase() === state;
      });
    }
    if (state === "CA" && californiaArea.areas.length) {
      stores = stores.filter((store) => {
        const record = store as Record<string, unknown>;
        return californiaAreaMatchesFields([
          record.city,
          record.address,
          record.name,
          record.displayLabel,
        ], californiaArea.areas);
      });
    }

    return NextResponse.json(
      {
        ...exportPayload,
        stores,
        locations: stores,
        total: stores.length,
        states: listStates(stores),
        lastUpdated: exportPayload?.generatedAt ?? new Date().toISOString(),
      },
      { headers: siteExportHeaders("local-export") }
    );
  } catch (err) {
    console.error("[api/stores] Error reading site export:", err);

    return NextResponse.json(
      {
        stores: [],
        total: 0,
        states: [],
        error: "Engine export temporarily unavailable",
      },
      {
        status: 200,
        headers: siteExportHeaders("empty-fallback"),
      }
    );
  }
}
