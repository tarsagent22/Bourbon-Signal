import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeStoreForSite } from "@/lib/site-engine-contract";
import { californiaAreaMatchesFields, parseCaliforniaAreaQuery } from "@/lib/california-area";
import { nevadaAreaMatchesFields, parseNevadaAreaQuery } from "@/lib/nevada-area";
import {
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  parseDemandMetroAreaQuery,
} from "@/lib/demand-metro-areas";
import { readSightingStoreDirectory, SIGHTING_STORE_DIRECTORY_VERSION } from "@/lib/sighting-store-directory";

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
    const exportPayload = await readSiteExport("stores").catch(() => null);
    let stores = (await readSightingStoreDirectory()).map(store => normalizeStoreForSite({ ...store, locationType: "store", precision: "store", inventoryCapability: "directory_only" }));

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

    const total = stores.length;
    const offset = Math.max(0, Math.min(100_000, Math.floor(Number(url.searchParams.get("offset"))) || 0));
    const limit = Math.max(1, Math.min(1000, Math.floor(Number(url.searchParams.get("limit"))) || 1000));
    const cities = [...new Set(stores.flatMap(store => { const city = (store as Record<string, unknown>).city; return typeof city === "string" && city ? [city] : []; }))].sort();
    const states = listStates(stores);
    stores = stores.slice(offset, offset + limit);
    return NextResponse.json(
      {
        ...exportPayload,
        stores,
        locations: stores,
        total,
        count: total,
        cities,
        states,
        offset,
        limit,
        hasMore: offset + stores.length < total,
        nextOffset: offset + stores.length < total ? offset + stores.length : null,
        lastUpdated: exportPayload?.generatedAt ?? new Date().toISOString(),
        directoryVersion: SIGHTING_STORE_DIRECTORY_VERSION,
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
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
