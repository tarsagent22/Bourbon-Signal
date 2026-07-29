import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unstable_cache } from "next/cache";
import { getActiveEngineStateName } from "@/lib/activeStates";
import { getScheduledReleaseSignalCopy } from "@/lib/scheduled-release-signals";
import { createRemoteSiteSnapshotReader } from "@/lib/remote-site-snapshot";
import { VercelBlobSnapshotStorage } from "@/lib/vercel-blob-snapshot-storage";
import { buildStateStats } from "@/lib/site-stats-metrics";
import { resolveDropQuantitySemantics } from "@/lib/drop-quantity-semantics";

const SITE_EXPORT_DIR = join(process.cwd(), "engine", "out", "site");
const CONTRACT_VERSION = "bourbon-signal-site-v0.1";

export type SiteExportName = "alerts" | "bottles" | "drops" | "events" | "locations" | "nc-intelligence" | "stats" | "stores";
type JsonRecord = Record<string, unknown>;
export type SiteExportSource = "remote-snapshot" | "local-export" | "cache-fallback" | "empty-fallback";

export interface SiteExportResult {
  payload: JsonRecord | null;
  source: SiteExportSource;
  snapshotId: string | null;
  generatedAt: string | null;
  snapshotUploadedAt?: string | null;
  snapshotActivatedAt?: string | null;
  appCommit?: string | null;
  engineCommit?: string | null;
  collectionRunId?: string | null;
  lastRollbackAt?: string | null;
  lastRollbackFrom?: string | null;
  lastRollbackTo?: string | null;
  shadowMatch?: boolean;
  fallbackReason?: string;
}

function validatePayload(name: SiteExportName, payload: JsonRecord | null) {
  if (payload && payload.contractVersion !== CONTRACT_VERSION) {
    throw new Error(`Unsupported ${name} contract version: ${String(payload.contractVersion ?? "missing")}`);
  }
  return payload;
}

export function readBundledSiteExport(name: SiteExportName) {
  const filePath = join(SITE_EXPORT_DIR, `${name}.json`);
  if (!existsSync(filePath)) return null;
  return validatePayload(name, JSON.parse(readFileSync(filePath, "utf-8")) as JsonRecord);
}

const blobStorage = new VercelBlobSnapshotStorage();
// The pointer is the only mutable object in the snapshot reader. A very short
// Data Cache window removes a Blob round trip from every private/filter request
// while keeping a newly activated snapshot visible within seconds.
const readActivePointer = unstable_cache(
  async () => blobStorage.readPointer(),
  ["engine-active-snapshot-pointer-v2"],
  { revalidate: 15 },
);
const readImmutableObject = unstable_cache(
  async (key: string) => blobStorage.readObject(key),
  ["engine-immutable-snapshot-object-v1"],
  { revalidate: 31_536_000 },
);
const remoteReader = createRemoteSiteSnapshotReader({
  encryptionKey: process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || "",
  storage: { readPointer: readActivePointer, readObject: readImmutableObject },
});

function payloadHash(payload: JsonRecord | null) {
  return payload ? createHash("sha256").update(JSON.stringify(payload)).digest("hex") : null;
}

function remoteExportResult(name: SiteExportName, remote: Awaited<ReturnType<typeof remoteReader.read>>, bundled: JsonRecord | null, mode: string): SiteExportResult {
  const payload = validatePayload(name, remote.payload);
  if (mode === "shadow") {
    return {
      payload: bundled,
      source: "local-export",
      snapshotId: remote.snapshotId,
      generatedAt: typeof bundled?.generatedAt === "string" ? bundled.generatedAt : null,
      shadowMatch: payloadHash(payload) === payloadHash(bundled),
    };
  }
  return {
    payload,
    source: "remote-snapshot",
    snapshotId: remote.snapshotId,
    generatedAt: remote.generatedAt,
    snapshotUploadedAt: remote.snapshotUploadedAt,
    snapshotActivatedAt: remote.snapshotActivatedAt,
    appCommit: remote.appCommit,
    engineCommit: remote.engineCommit,
    collectionRunId: remote.collectionRunId,
    lastRollbackAt: remote.lastRollbackAt,
    lastRollbackFrom: remote.lastRollbackFrom,
    lastRollbackTo: remote.lastRollbackTo,
  };
}

export async function readSiteExportResults(names: SiteExportName[]): Promise<SiteExportResult[]> {
  const mode = String(process.env.ENGINE_SNAPSHOT_READ_MODE || "off").toLowerCase();
  const bundled = names.map((name) => readBundledSiteExport(name));
  if (mode === "off") {
    return bundled.map((payload) => ({
      payload,
      source: "local-export" as const,
      snapshotId: null,
      generatedAt: typeof payload?.generatedAt === "string" ? payload.generatedAt : null,
    }));
  }
  try {
    const pointer = await readActivePointer();
    const pinnedReader = createRemoteSiteSnapshotReader({
      encryptionKey: process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || "",
      storage: { readPointer: async () => pointer, readObject: readImmutableObject },
    });
    const remote = await Promise.all(names.map((name) => pinnedReader.read(name)));
    return remote.map((result, index) => remoteExportResult(names[index], result, bundled[index], mode));
  } catch (error) {
    if (bundled.some((payload) => !payload)) throw error;
    return bundled.map((payload) => ({
      payload,
      source: "cache-fallback" as const,
      snapshotId: null,
      generatedAt: typeof payload?.generatedAt === "string" ? payload.generatedAt : null,
      fallbackReason: error instanceof Error ? error.message : "remote_snapshot_unavailable",
    }));
  }
}

export async function readSiteExportResult(name: SiteExportName): Promise<SiteExportResult> {
  const mode = String(process.env.ENGINE_SNAPSHOT_READ_MODE || "off").toLowerCase();
  const bundled = readBundledSiteExport(name);
  if (mode === "off") {
    return { payload: bundled, source: "local-export", snapshotId: null, generatedAt: typeof bundled?.generatedAt === "string" ? bundled.generatedAt : null };
  }

  try {
    const remote = await remoteReader.read(name);
    const payload = validatePayload(name, remote.payload);
    if (mode === "shadow") {
      return {
        payload: bundled,
        source: "local-export",
        snapshotId: remote.snapshotId,
        generatedAt: typeof bundled?.generatedAt === "string" ? bundled.generatedAt : null,
        shadowMatch: payloadHash(payload) === payloadHash(bundled),
      };
    }
    return {
      payload,
      source: "remote-snapshot",
      snapshotId: remote.snapshotId,
      generatedAt: remote.generatedAt,
      snapshotUploadedAt: remote.snapshotUploadedAt,
      snapshotActivatedAt: remote.snapshotActivatedAt,
      appCommit: remote.appCommit,
      engineCommit: remote.engineCommit,
      collectionRunId: remote.collectionRunId,
      lastRollbackAt: remote.lastRollbackAt,
      lastRollbackFrom: remote.lastRollbackFrom,
      lastRollbackTo: remote.lastRollbackTo,
    };
  } catch (error) {
    if (!bundled) throw error;
    return {
      payload: bundled,
      source: "cache-fallback",
      snapshotId: null,
      generatedAt: typeof bundled.generatedAt === "string" ? bundled.generatedAt : null,
      fallbackReason: error instanceof Error ? error.message : "remote_snapshot_unavailable",
    };
  }
}

export async function readSiteExport(name: SiteExportName) {
  return (await readSiteExportResult(name)).payload;
}

export function siteExportHeaders(source: SiteExportSource = "local-export", snapshotId?: string | null) {
  return {
    "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
    "X-Api-Source": source,
    "X-Engine-Contract": CONTRACT_VERSION,
    ...(snapshotId ? { "X-Engine-Snapshot": snapshotId } : {}),
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

function isStoreLevelInventory(type: string, locationPrecision: string, canAlertAsInventory: boolean) {
  const normalized = type.toLowerCase();
  return locationPrecision === "store_level" && (canAlertAsInventory || normalized.includes("store_inventory") || normalized.includes("limited_supply") || normalized.includes("in_stock"));
}

function hasExactStoreDetails(drop: JsonRecord) {
  return Boolean(asString(drop.storeName) || asString(drop.storeAddress) || asString(drop.storeId));
}

function isDistilleryDrop(type: string, locationPrecision: string) {
  return locationPrecision === "distillery" && type.toLowerCase() === "distillery_gift_shop_availability";
}

function shouldAnchorInventoryToFirstSeen(type: string) {
  const normalized = type.toLowerCase();
  return normalized.includes("inventory") || normalized.includes("in_stock") || normalized.includes("limited_supply");
}

export function normalizeBottleForSite(bottle: JsonRecord) {
  const states = Array.isArray(bottle.states) ? bottle.states.map(String) : [];
  const aliases = Array.isArray(bottle.aliases) ? bottle.aliases.map(String) : [];
  const inventorySignalCount = asNumber(bottle.inventorySignalCount);
  const signalCount = asNumber(bottle.signalCount);
  const tier = asString(bottle.tier, "unknown");

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
  const { inventoryQuantity: quantity, shipmentQuantity, visibilityQuantity } = resolveDropQuantitySemantics(drop);
  const locationPrecision = asString(drop.locationPrecision);
  const exactStoreDetails = hasExactStoreDetails(drop);
  const sourceStale = asBoolean(drop.sourceStale) || asBoolean(drop.stale);
  const staleSourceCaveat = asString(drop.staleSourceCaveat) || "Last-known source availability; verify with the store before driving.";
  const canAlertAsInventory = asBoolean(drop.canAlertAsInventory) && exactStoreDetails && !sourceStale;
  const type = asString(drop.type, "signal");
  const signalLabel = getPublicSignalLabel(type, locationPrecision, visibilityQuantity, canAlertAsInventory);
  const isStoreInventory = isStoreLevelInventory(type, locationPrecision, canAlertAsInventory) && exactStoreDetails;
  const locationLabel = getPublicLocationLabel(state, asString(drop.locationName), asString(drop.city), asString(drop.county));
  const eventAt = asString(drop.eventAt);
  const firstSeenAt = asString(drop.firstSeenAt);
  const lastConfirmedAt = asString(drop.lastConfirmedAt, asString(drop.observedAt));
  const exportedDisplayAt = asString(drop.displayAt, eventAt || firstSeenAt || lastConfirmedAt || asString(drop.observedAt));
  const exportedTimestampBasis = asString(drop.timestampBasis, eventAt ? "source_event_at" : firstSeenAt ? "first_seen_at" : "last_confirmed_at");
  const anchorRepeatedInventoryToFirstSeen = shouldAnchorInventoryToFirstSeen(type) && firstSeenAt && lastConfirmedAt && firstSeenAt !== lastConfirmedAt;
  const publicDisplayAt = anchorRepeatedInventoryToFirstSeen ? (eventAt || firstSeenAt) : exportedDisplayAt;
  const publicTimestampBasis = anchorRepeatedInventoryToFirstSeen ? (eventAt ? "source_event_at" : "first_seen_at") : exportedTimestampBasis;
  const scheduledReleaseCopy = getScheduledReleaseSignalCopy(drop);

  return {
    ...drop,
    sourceStale,
    staleSourceCaveat: sourceStale ? staleSourceCaveat : asString(drop.staleSourceCaveat) || undefined,
    inventoryCaveat: sourceStale ? staleSourceCaveat : asString(drop.inventoryCaveat) || undefined,
    bottle_id: asString(drop.canonicalId, asString(drop.bottleId)),
    canonical_id: asString(drop.canonicalId, asString(drop.bottleId)),
    canonical_name: asString(drop.canonicalName, asString(drop.bottleName, "Unknown Bottle")),
    canonical_key: asString(drop.canonicalKey),
    raw_name: asString(drop.rawName),
    aliases: Array.isArray(drop.aliases) ? drop.aliases.map(String) : [],
    timestamp: publicDisplayAt,
    observed_at: asString(drop.observedAt),
    event_at: eventAt || undefined,
    first_seen_at: firstSeenAt || undefined,
    last_confirmed_at: lastConfirmedAt || undefined,
    timestamp_basis: publicTimestampBasis,
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
    quantity_shipped: shipmentQuantity || undefined,
    quantity: quantity || undefined,
    rarity_tier: asString(drop.tier, "unknown"),
    retail_price: asNumber(drop.price) || null,
    state,
    state_code: state,
    source: asString(drop.source, "engine-site-export"),
    exact_store: locationPrecision === "store_level" && exactStoreDetails,
    availability_scope: sourceStale && isStoreInventory ? "stale_store_context" : isStoreInventory ? "store_reported" : isDistilleryDrop(type, locationPrecision) ? "distillery" : (locationPrecision === "board_county" || locationPrecision === "store_equivalent_shipment") ? "board" : locationPrecision === "board_warehouse" ? "warehouse" : "page",
    confidence_tier: sourceStale && isStoreInventory ? "stale_store_context" : isStoreInventory ? "source_reported_store" : isDistilleryDrop(type, locationPrecision) ? "official_distillery_drop" : (type === "nc_board_shipment_snapshot" || type === "nc_statewide_warehouse_stock") ? "online_positive" : "listing_only",
    location_precision: locationPrecision,
    can_alert_as_inventory: canAlertAsInventory,
    signal_label: sourceStale && isStoreInventory ? "Last-known store availability" : signalLabel,
    scheduled_release: Boolean(scheduledReleaseCopy),
    scheduledRelease: Boolean(scheduledReleaseCopy),
    scheduledReleaseLabel: scheduledReleaseCopy?.statusLine,
    scheduledReleaseDetail: scheduledReleaseCopy?.detail,
    scheduledReleaseCaveat: scheduledReleaseCopy?.explanation,
    signal_category: getPublicSignalCategory(type, locationPrecision, visibilityQuantity, canAlertAsInventory),
    display_state: getPublicStateLabel(state),
    display_location: locationLabel,
    is_user_facing_drop: isUserFacingDropSignal({
      type,
      quantity: visibilityQuantity,
      locationPrecision,
      canAlertAsInventory,
    }),
  };
}

export function isUserFacingDropSignal(drop: {
  type?: string;
  event_type?: string;
  quantity?: number;
  boardShipmentQuantity?: number;
  quantity_shipped?: number;
  quantity_in_stock?: number;
  storeQty?: number;
  store_qty?: number;
  warehouseQty?: number;
  warehouse_qty?: number;
  locationPrecision?: string;
  location_precision?: string;
  canAlertAsInventory?: boolean;
  can_alert_as_inventory?: boolean;
}) {
  const type = String(drop.type ?? drop.event_type ?? "").toLowerCase();
  const quantity = asNumber(drop.quantity, asNumber(drop.quantity_in_stock, asNumber(drop.boardShipmentQuantity, asNumber(drop.quantity_shipped, asNumber(drop.storeQty, asNumber(drop.store_qty, asNumber(drop.warehouseQty, asNumber(drop.warehouse_qty))))))));
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
  if (type === "store_allocation_snapshot" && precision === "store_level") return quantity > 0;
  if (type === "county_inventory_aggregate" && precision === "store_aggregate") return quantity > 0;
  if (type === "board_inventory_aggregate" && precision === "board_warehouse") return quantity > 0;
  if (type === "store_inventory_aggregate" && precision === "store_aggregate") return quantity > 0;
  if (type === "browser_assisted_store_inventory_limited_supply") return true;
  if (type === "browser_assisted_store_inventory_in_stock") return true;
  if (type === "retailer_store_inventory_result") return quantity > 0;
  if (type === "cityhive_store_inventory_result") return quantity > 0;
  if (type === "distillery_gift_shop_availability" && precision === "distillery") return true;
  if (type === "store_inventory_result") return quantity > 0;

  return false;
}

function getPublicSignalCategory(type: string, locationPrecision: string, quantity: number, canAlertAsInventory: boolean) {
  const normalized = type.toLowerCase();
  if (normalized.includes("limited_supply")) return "inventory";
  if (normalized === "distillery_gift_shop_availability") return "distillery_drop";
  if (normalized.includes("in_stock")) return "inventory";
  if (normalized === "nc_board_shipment_snapshot") return "delivery";
  if (normalized === "nc_statewide_warehouse_stock") return "warehouse";
  if (normalized === "retailer_allocated_raffle_item") return "retailer_watch";
  if (normalized === "retailer_tasting_event") return "retailer_watch";
  if (normalized === "alabc_limited_release_store_drop") return "release_watch";
  if (normalized === "store_delivery_snapshot") return "delivery";
  if (normalized === "store_allocation_snapshot") return "delivery";
  if (normalized === "county_inventory_aggregate") return "warehouse";
  if (normalized === "board_inventory_aggregate") return "warehouse";
  if (normalized === "store_inventory_aggregate" && quantity > 0) return "inventory";
  if (normalized === "store_inventory_result" && (quantity > 0 || canAlertAsInventory)) return "inventory";
  if (locationPrecision === "store_level" && canAlertAsInventory) return "inventory";
  return "context";
}

function getPublicSignalLabel(type: string, locationPrecision: string, quantity: number, canAlertAsInventory: boolean) {
  const category = getPublicSignalCategory(type, locationPrecision, quantity, canAlertAsInventory);
  const normalized = type.toLowerCase();
  if (normalized === "nc_board_shipment_snapshot") return "Board shipment";
  if (normalized === "nc_statewide_warehouse_stock") return "Warehouse shipment";
  if (normalized.includes("limited_supply")) return "Limited supply reported";
  if (normalized === "distillery_gift_shop_availability") return "Distillery drop";
  if (normalized.includes("in_stock")) return "Availability reported";
  if (normalized === "retailer_allocated_raffle_item") return "Retailer allocated watch";
  if (normalized === "retailer_tasting_event") return "Retailer tasting watch";
  if (normalized === "alabc_limited_release_store_drop") return "Scheduled ABC release";
  if (category === "delivery") return "Bottle shipment";
  if (normalized === "county_inventory_aggregate") return "County aggregate lead";
  if (normalized === "board_inventory_aggregate") return "State aggregate lead";
  if (normalized === "store_inventory_aggregate") return "Statewide inventory";
  if (category === "inventory") return quantity > 0 ? "Store availability reported" : "Store-level bottle signal";
  return "Bottle drop";
}

function getPublicStateLabel(state: string) {
  return getActiveEngineStateName(state);
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

  const byState = buildStateStats(drops, stores, bottles);

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
