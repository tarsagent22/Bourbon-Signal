import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeStoreForSite } from "@/lib/site-engine-contract";
import { californiaAreaMatchesFields, parseCaliforniaAreaQuery } from "@/lib/california-area";
import { nevadaAreaMatchesFields, parseNevadaAreaQuery } from "@/lib/nevada-area";
import {
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  parseDemandMetroAreaQuery,
} from "@/lib/demand-metro-areas";
import { listApprovedLocations } from "@/lib/approved-catalog-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();
  const californiaArea = parseCaliforniaAreaQuery(url.searchParams.get("area"));
  const nevadaArea = parseNevadaAreaQuery(url.searchParams.get("area"));
  const demandMetroAreas = parseDemandMetroAreaQuery(state || "", url.searchParams.get("area"));
  if (state === "CA" && californiaArea.requested && !californiaArea.valid) {
    return NextResponse.json({ stores: [], locations: [], total: 0, error: "Unsupported California area" }, { status: 400 });
  }
  if (state === "NV" && nevadaArea.requested && !nevadaArea.valid) {
    return NextResponse.json({ stores: [], locations: [], total: 0, error: "Unsupported Nevada area" }, { status: 400 });
  }
  if (["NC", "GA", "TN"].includes(state || "") && demandMetroAreas.requested && !demandMetroAreas.valid) {
    return NextResponse.json({ stores: [], locations: [], total: 0, error: `Unsupported ${state} metro area` }, { status: 400 });
  }

  try {
    const storesPayload = await readSiteExport("stores");
    const exportPayload = storesPayload ?? await readSiteExport("locations");
    const engineStores = Array.isArray(exportPayload?.stores)
      ? exportPayload.stores
      : Array.isArray(exportPayload?.locations)
        ? exportPayload.locations
        : [];
    const approvedStores = await listApprovedLocations().catch((error) => {
      console.error("[api/stores] Approved catalog unavailable:", error);
      return [];
    });
    const storesById = new Map<string, Record<string, unknown>>();
    for (const store of [...engineStores, ...approvedStores]) {
      const record = store as Record<string, unknown>;
      storesById.set(String(record.id || `${record.state}:${record.name}:${record.address || record.city}`), record);
    }
    let stores = [...storesById.values()].map((store) => normalizeStoreForSite(store));

    if (state) {
      stores = stores.filter((store) => {
        const record = store as Record<string, unknown>;
        return String(record.state ?? record.state_code ?? "").toUpperCase() === state;
      });
    }
    if (["NC", "GA", "TN"].includes(state || "") && demandMetroAreas.areas.length) {
      stores = stores.filter((store) => {
        const record = store as Record<string, unknown>;
        const fields = [record.city, record.address, record.name, record.displayLabel, record.area, record.county, record.district];
        return state === "NC"
          ? demandMetroBoardGroupMatchesFields(fields, demandMetroAreas.areas)
          : demandMetroAreaMatchesFields(state || "", fields, demandMetroAreas.areas);
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
    if (state === "NV" && nevadaArea.areas.length) {
      stores = stores.filter((store) => {
        const record = store as Record<string, unknown>;
        return nevadaAreaMatchesFields([record.city, record.address, record.name, record.displayLabel], nevadaArea.areas);
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
