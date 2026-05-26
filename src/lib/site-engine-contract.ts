import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SITE_EXPORT_DIR = join(process.cwd(), "engine", "out", "site");
const CONTRACT_VERSION = "bourbon-signal-site-v0.1";

type JsonRecord = Record<string, unknown>;

export function readSiteExport(name: "alerts" | "bottles" | "drops" | "stats" | "stores") {
  const filePath = join(SITE_EXPORT_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  const payload = JSON.parse(readFileSync(filePath, "utf-8")) as JsonRecord;
  if (payload.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`Unsupported ${name} contract version: ${String(payload.contractVersion ?? "missing")}`);
  }
  return payload;
}

export function siteExportHeaders(source: "local-export" | "cache-fallback" | "empty-fallback" = "local-export") {
  return {
    "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
    "X-Api-Source": source,
    "X-Engine-Contract": CONTRACT_VERSION,
  };
}

export function listStates(items: unknown[], key = "state") {
  return Array.from(
    new Set(
      items
        .map((item) => (item && typeof item === "object" ? String((item as JsonRecord)[key] ?? "") : ""))
        .filter(Boolean)
    )
  ).sort();
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown) {
  return value === true;
}

export function normalizeBottleForSite(bottle: JsonRecord) {
  const states = Array.isArray(bottle.states) ? bottle.states.map(String) : [];
  const inventorySignalCount = asNumber(bottle.inventorySignalCount);
  const signalCount = asNumber(bottle.signalCount);
  const tier = asString(bottle.tier, "limited");

  return {
    ...bottle,
    state: states[0] ?? "",
    states,
    distillery: asString(bottle.producer, asString(bottle.distillery, "Unknown")),
    msrp: asNumber(bottle.msrp),
    has_inventory: inventorySignalCount > 0,
    limited_availability: tier === "limited" || tier === "allocated" || tier === "unicorn",
    last_drop: asString(bottle.latestObservedAt) || null,
    drop_count_30d: signalCount,
    signal_volume_30d: signalCount,
    actionable_count_30d: inventorySignalCount,
    exact_store_hits_30d: inventorySignalCount,
    board_leads_30d: Math.max(0, signalCount - inventorySignalCount),
  };
}

export function normalizeStoreForSite(store: JsonRecord) {
  return {
    ...store,
    lat: asOptionalNumber(store.lat),
    lng: asOptionalNumber(store.lng),
    district: asString(store.district),
    bottle_count: asNumber(store.signalCount, asNumber(store.bottle_count)),
  };
}

export function normalizeDropForSite(drop: JsonRecord) {
  const state = asString(drop.state);
  const quantity = asNumber(drop.quantity);
  const locationPrecision = asString(drop.locationPrecision);
  const canAlertAsInventory = asBoolean(drop.canAlertAsInventory);

  return {
    ...drop,
    timestamp: asString(drop.observedAt, new Date().toISOString()),
    event_type: asString(drop.type, "signal"),
    brand_name: asString(drop.bottleName, "Unknown Bottle"),
    tracked_brand_name: asString(drop.bottleName, "Unknown Bottle"),
    board_name: asString(drop.locationName) || undefined,
    store_address: asString(drop.storeAddress) || undefined,
    store_city: asString(drop.city) || undefined,
    store_county: asString(drop.county) || undefined,
    store_name: asString(drop.storeName) || undefined,
    store_id: asString(drop.storeId) || undefined,
    quantity_in_stock: quantity || undefined,
    quantity: quantity || undefined,
    rarity_tier: asString(drop.tier, "limited"),
    retail_price: asNumber(drop.price) || null,
    state,
    state_code: state,
    source: asString(drop.source, "engine-site-export"),
    exact_store: locationPrecision === "store_level",
    availability_scope: locationPrecision === "store_level" ? "exact" : "page",
    confidence_tier: canAlertAsInventory ? "exact_store" : "listing_only",
  };
}

export function normalizeStatsForSite(stats: JsonRecord, bottles: JsonRecord[] = [], stores: JsonRecord[] = [], drops: JsonRecord[] = []) {
  const states = listStates(drops.length ? drops : stores);
  const unicornCount = bottles.filter((bottle) => bottle.tier === "unicorn").length;
  const allocatedCount = bottles.filter((bottle) => bottle.tier === "allocated").length;

  const byState = drops.reduce<Record<string, { drops: number; stores: number; bottles: number }>>((acc, drop) => {
    const state = asString(drop.state);
    if (!state) return acc;
    acc[state] ??= { drops: 0, stores: 0, bottles: 0 };
    acc[state].drops += 1;
    return acc;
  }, {});

  for (const store of stores) {
    const state = asString(store.state);
    if (!state) continue;
    accEnsure(byState, state).stores += 1;
  }

  for (const bottle of bottles) {
    const bottleStates = Array.isArray(bottle.states) ? bottle.states.map(String) : [];
    for (const state of bottleStates) {
      accEnsure(byState, state).bottles += 1;
    }
  }

  return {
    ...stats,
    total_bottles: asNumber(stats.bottleCount, bottles.length),
    total_stores: asNumber(stats.storeCount, stores.length),
    states_covered: asNumber(stats.stateCount, states.length),
    drops_today: asNumber(stats.dropCount, drops.length),
    drops_this_week: asNumber(stats.dropCount, drops.length),
    unicorn_count: unicornCount,
    allocated_count: allocatedCount,
    by_state: byState,
    lastUpdated: asString(stats.generatedAt, new Date().toISOString()),
  };
}

function accEnsure(acc: Record<string, { drops: number; stores: number; bottles: number }>, state: string) {
  acc[state] ??= { drops: 0, stores: 0, bottles: 0 };
  return acc[state];
}
