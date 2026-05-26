import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeStoreForSite } from "@/lib/site-engine-contract";

export async function GET() {
  try {
    const exportPayload = readSiteExport("stores");
    const rawStores = Array.isArray(exportPayload?.stores) ? exportPayload.stores : [];
    const stores = rawStores.map((store) => normalizeStoreForSite(store as Record<string, unknown>));

    return NextResponse.json(
      {
        ...exportPayload,
        stores,
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
