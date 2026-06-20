import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeStoreForSite, normalizeDropForSite, isUserFacingDropSignal } from "@/lib/site-engine-contract";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

function locationNeedles(location: Record<string, unknown>) {
  const values = [
    location.name,
    location.displayLabel,
    location.district,
    location.city,
    location.county,
    location.address,
  ]
    .map(normalizeText)
    .filter(Boolean);

  return Array.from(
    new Set(
      values.flatMap((value) => [
        value,
        value.replace(/\s+abc\s+board$/i, ""),
        value.replace(/\s+county\s+abc\s+board$/i, " county"),
      ]).map((value) => value.trim()).filter(Boolean)
    )
  );
}

function dropLocationValues(drop: Record<string, unknown>) {
  return [
    drop.store_name,
    drop.store_address,
    drop.store_city,
    drop.store_county,
    drop.board_name,
    drop.display_location,
    drop.locationName,
    drop.county,
  ]
    .map(normalizeText)
    .filter(Boolean);
}

function locationLookupKey(location: Record<string, unknown>) {
  const state = normalizeText(location.state ?? location.state_code).toUpperCase();
  const id = normalizeText(location.id ?? location.sourceStoreId);
  const address = normalizeText(location.address);
  const city = normalizeText(location.city);
  const name = normalizeText(location.name ?? location.displayLabel);

  if (state && address) return `address:${state}:${address}:${city}`;
  if (state && id) return `id:${state}:${id}`;
  return `name:${state}:${name}:${city}`;
}

type ActionableDropLocation = {
  values: string[];
  precision: string;
  scope: string;
};

function isBoardOrAreaLocation(location: Record<string, unknown>) {
  const precision = normalizeText(location.precision);
  const type = normalizeText(location.type || location.locationType);
  return precision.includes("board") || type.includes("board") || type === "area";
}

function isBoardLevelDrop(drop: ActionableDropLocation) {
  return drop.precision.includes("board") || drop.scope === "board";
}

function dropMatchesLocationValues(drop: ActionableDropLocation, location: Record<string, unknown>) {
  if (isBoardLevelDrop(drop) && !isBoardOrAreaLocation(location)) return false;
  const needles = locationNeedles(location);
  if (!needles.length) return false;
  return needles.some((needle) => drop.values.some((value) => value.includes(needle) || needle.includes(value)));
}

function hasActionableLocationDrop(drop: Record<string, unknown>) {
  if (!isUserFacingDropSignal(drop)) return false;
  const dropState = String(drop.state ?? drop.state_code ?? "").toUpperCase();
  const eventType = String(drop.event_type ?? "");
  const scope = String(drop.availability_scope ?? "");
  return !(dropState === "NC" && (eventType === "nc_statewide_warehouse_stock" || scope === "warehouse"));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();

  try {
    const locationsPayload = readSiteExport("locations");
    const storesPayload = readSiteExport("stores");
    const exportPayload = locationsPayload ?? storesPayload;
    const rawLocations = Array.isArray(locationsPayload?.locations)
      ? locationsPayload.locations
      : Array.isArray(locationsPayload?.stores)
        ? locationsPayload.stores
        : [];
    const rawStores = Array.isArray(storesPayload?.stores) ? storesPayload.stores : [];
    const seenLocationKeys = new Set<string>();
    const combinedRawLocations: Record<string, unknown>[] = [];
    for (const location of [...rawLocations, ...rawStores]) {
      const record = location as Record<string, unknown>;
      const key = locationLookupKey(record);
      if (seenLocationKeys.has(key)) continue;
      seenLocationKeys.add(key);
      combinedRawLocations.push(record);
    }
    const dropsPayload = readSiteExport("drops");
    const dropsByState = new Map<string, ActionableDropLocation[]>();
    (Array.isArray(dropsPayload?.drops) ? dropsPayload.drops : [])
      .map((drop) => normalizeDropForSite(drop as Record<string, unknown>))
      .filter((drop) => hasActionableLocationDrop(drop as Record<string, unknown>))
      .forEach((drop) => {
        const record = drop as Record<string, unknown>;
        const dropState = String(record.state ?? record.state_code ?? "").toUpperCase();
        if (!dropState) return;
        const values = dropLocationValues(record);
        if (!values.length) return;
        const existing = dropsByState.get(dropState) ?? [];
        existing.push({
          values,
          precision: normalizeText(record.locationPrecision ?? record.location_precision),
          scope: normalizeText(record.availabilityScope ?? record.availability_scope),
        });
        dropsByState.set(dropState, existing);
      });
    let locations = combinedRawLocations.map((location) => normalizeStoreForSite(location as Record<string, unknown>));

    locations = locations.map((location) => {
      const locationRecord = location as Record<string, unknown>;
      const locationState = String(locationRecord.state ?? "").toUpperCase();
      const stateDrops = dropsByState.get(locationState) ?? [];
      const signalCount = stateDrops.filter((drop) => dropMatchesLocationValues(drop, locationRecord)).length;

      return {
        ...location,
        hasSignals: signalCount > 0,
        signalCount,
        bottle_count: signalCount,
      };
    });

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
