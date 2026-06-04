import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SITE_EXPORT_DIR = join(process.cwd(), "engine", "out", "site");
const CONTRACT_VERSION = "bourbon-signal-site-v0.1";

type JsonRecord = Record<string, unknown>;

export function readSiteExport(name: "alerts" | "bottles" | "drops" | "locations" | "nc-intelligence" | "stats" | "stores") {
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
  const aliases = Array.isArray(bottle.aliases) ? bottle.aliases.map(String) : [];
  const inventorySignalCount = asNumber(bottle.inventorySignalCount);
  const signalCount = asNumber(bottle.signalCount);
  const tier = asString(bottle.tier, "limited");

  return {
    ...bottle,
    id: asString(bottle.canonical_id, asString(bottle.id)),
    canonical_id: asString(bottle.canonical_id, asString(bottle.id)),
    canonical_name: asString(bottle.canonical_name, asString(bottle.name)),
    canonical_key: asString(bottle.canonical_key),
    aliases,
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
  const signalCount = asNumber(store.signalCount, asNumber(store.bottle_count));
  return {
    ...store,
    lat: asOptionalNumber(store.lat),
    lng: asOptionalNumber(store.lng),
    district: asString(store.district),
    type: asString(store.type, asString(store.locationType, "store")),
    locationType: asString(store.locationType, asString(store.type, "store")),
    precision: asString(store.precision, asString(store.locationPrecision, "store_level")),
    sourceUrl: asString(store.sourceUrl),
    inventoryCapability: asString(store.inventoryCapability),
    searchable: store.searchable !== false,
    collectorAttached: asBoolean(store.collectorAttached),
    hasSignals: asBoolean(store.hasSignals) || signalCount > 0,
    signalCount,
    bottle_count: signalCount,
  };
}

export function normalizeDropForSite(drop: JsonRecord) {
  const state = asString(drop.state);
  const quantity = asNumber(drop.quantity);
  const locationPrecision = asString(drop.locationPrecision);
  const canAlertAsInventory = asBoolean(drop.canAlertAsInventory);
  const type = asString(drop.type, "signal");
  const signalLabel = getPublicSignalLabel(type, locationPrecision, quantity, canAlertAsInventory);
  const locationLabel = getPublicLocationLabel(state, asString(drop.locationName), asString(drop.city), asString(drop.county));

  return {
    ...drop,
    bottle_id: asString(drop.canonicalId, asString(drop.bottleId)),
    canonical_id: asString(drop.canonicalId, asString(drop.bottleId)),
    canonical_name: asString(drop.canonicalName, asString(drop.bottleName, "Unknown Bottle")),
    canonical_key: asString(drop.canonicalKey),
    raw_name: asString(drop.rawName),
    aliases: Array.isArray(drop.aliases) ? drop.aliases.map(String) : [],
    timestamp: asString(drop.observedAt, new Date().toISOString()),
    event_type: type,
    brand_name: asString(drop.bottleName, "Unknown Bottle"),
    tracked_brand_name: asString(drop.bottleName, "Unknown Bottle"),
    board_name: locationLabel || undefined,
    store_address: asString(drop.storeAddress) || undefined,
    store_city: asString(drop.city) || undefined,
    store_county: asString(drop.county) || undefined,
    store_name: asString(drop.storeName) || undefined,
    store_id: asString(drop.storeId) || undefined,
    quantity_in_stock: type === "nc_board_shipment_snapshot" ? undefined : quantity || undefined,
    quantity_shipped: type === "nc_board_shipment_snapshot" ? quantity || undefined : undefined,
    quantity: quantity || undefined,
    rarity_tier: asString(drop.tier, "limited"),
    retail_price: asNumber(drop.price) || null,
    state,
    state_code: state,
    source: asString(drop.source, "engine-site-export"),
    exact_store: locationPrecision === "store_level",
    availability_scope: locationPrecision === "store_level" ? "exact" : locationPrecision === "board_county" ? "board" : locationPrecision === "board_warehouse" ? "warehouse" : "page",
    confidence_tier: canAlertAsInventory ? "exact_store" : (type === "nc_board_shipment_snapshot" || type === "nc_statewide_warehouse_stock") ? "online_positive" : "listing_only",
    location_precision: locationPrecision,
    can_alert_as_inventory: canAlertAsInventory,
    signal_label: signalLabel,
    signal_category: getPublicSignalCategory(type, locationPrecision, quantity, canAlertAsInventory),
    display_state: getPublicStateLabel(state),
    display_location: locationLabel,
    is_user_facing_drop: isUserFacingDropSignal({
      type,
      quantity,
      locationPrecision,
      canAlertAsInventory,
    }),
  };
}

export function isUserFacingDropSignal(drop: {
  type?: string;
  event_type?: string;
  quantity?: number;
  quantity_in_stock?: number;
  locationPrecision?: string;
  location_precision?: string;
  canAlertAsInventory?: boolean;
  can_alert_as_inventory?: boolean;
}) {
  const type = String(drop.type ?? drop.event_type ?? "").toLowerCase();
  const quantity = asNumber(drop.quantity, asNumber(drop.quantity_in_stock));
  const precision = String(drop.locationPrecision ?? drop.location_precision ?? "").toLowerCase();
  const canAlert = drop.canAlertAsInventory === true || drop.can_alert_as_inventory === true;

  if (!type) return false;
  if (type.includes("out_of_stock") || type.includes("out-of-stock")) return false;
  if (type.includes("lottery")) return false;
  if (type === "alabc_limited_release_store_drop") return precision === "store_level";
  if (type.includes("allocated_release") || type.includes("statewide_policy")) return false;
  if (type.includes("county_allocated")) return false;
  if (type.includes("catalog") || precision === "statewide_catalog") return false;

  if (type === "nc_board_shipment_snapshot") return quantity > 0;
  if (type === "nc_statewide_warehouse_stock") return quantity > 0;
  if (canAlert && precision === "store_level") return true;
  if (type === "store_delivery_snapshot") return quantity > 0;
  if (type === "retailer_allocated_raffle_item") return quantity > 0;
  if (type === "retailer_tasting_event") return precision === "store_level";
  if (type === "store_inventory_aggregate" && precision === "store_aggregate") return quantity > 0;
  if (type === "browser_assisted_store_inventory_limited_supply") return true;
  if (type === "browser_assisted_store_inventory_in_stock") return true;
  if (type === "store_inventory_result") return quantity > 0;

  return false;
}

function getPublicSignalCategory(type: string, locationPrecision: string, quantity: number, canAlertAsInventory: boolean) {
  const normalized = type.toLowerCase();
  if (normalized.includes("limited_supply")) return "inventory";
  if (normalized.includes("in_stock")) return "inventory";
  if (normalized === "nc_board_shipment_snapshot") return "delivery";
  if (normalized === "nc_statewide_warehouse_stock") return "warehouse";
  if (normalized === "retailer_allocated_raffle_item") return "retailer_watch";
  if (normalized === "retailer_tasting_event") return "retailer_watch";
  if (normalized === "alabc_limited_release_store_drop") return "release_watch";
  if (normalized === "store_delivery_snapshot") return "delivery";
  if (normalized === "store_inventory_aggregate" && quantity > 0) return "inventory";
  if (normalized === "store_inventory_result" && (quantity > 0 || canAlertAsInventory)) return "inventory";
  if (locationPrecision === "store_level" && canAlertAsInventory) return "inventory";
  return "context";
}

function getPublicSignalLabel(type: string, locationPrecision: string, quantity: number, canAlertAsInventory: boolean) {
  const category = getPublicSignalCategory(type, locationPrecision, quantity, canAlertAsInventory);
  const normalized = type.toLowerCase();
  if (normalized === "nc_board_shipment_snapshot") return "Board shipment";
  if (normalized === "nc_statewide_warehouse_stock") return "Warehouse radar";
  if (normalized.includes("limited_supply")) return "Limited supply";
  if (normalized.includes("in_stock")) return "In stock";
  if (normalized === "retailer_allocated_raffle_item") return "Retailer allocated watch";
  if (normalized === "retailer_tasting_event") return "Retailer tasting watch";
  if (normalized === "alabc_limited_release_store_drop") return "Scheduled ABC release";
  if (category === "delivery") return "Store delivery";
  if (normalized === "store_inventory_aggregate") return "Statewide inventory";
  if (category === "inventory") return quantity > 0 ? "In stock" : "Store signal";
  return "Source signal";
}

function getPublicStateLabel(state: string) {
  if (state === "MD-MONTGOMERY") return "Montgomery, MD";
  return state;
}

function getPublicLocationLabel(state: string, locationName: string, city: string, county: string) {
  if (state === "MD-MONTGOMERY") return "Montgomery County, MD";
  if (city && county) return `${city} (${county} Co.)`;
  if (city) return city;
  if (county && /abc board/i.test(county)) return county;
  if (county) return `${county} County`;
  return locationName;
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
