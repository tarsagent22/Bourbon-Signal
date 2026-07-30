export const MISSISSIPPI_ONSITE_SOURCE_PERMITS = new Map<string, string>([
  ["retailer:ms:cityhive:68ba2980113a7a29c2076fc3", "029254"],
  ["retailer:ms:moonshine:323", "044411"],
  ["retailer:ms:moonshine:2118", "049222"],
  ["retailer:ms:moonshine:7", "051851"],
  ["retailer:ms:moonshine:1882", "007481"],
  ["retailer:ms:cityhive:669150d28f28f1287440bdce", "044692"],
  ["retailer:ms:moonshine:767", "041265"],
  ["retailer:ms:tupelo2go:1187", "055298"],
  ["retailer:ms:tupelo2go:1237", "041251"],
  ["retailer:ms:tupelo2go:1544", "041113"],
]);

export type UserFacingDropSignal = {
  type?: string;
  event_type?: string;
  state?: string;
  stateCode?: string;
  state_code?: string;
  quantity?: number;
  quantityIsExact?: boolean;
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
  canAlertAsWatch?: boolean;
  can_alert_as_watch?: boolean;
  sourceRuntimeId?: string;
  permitNumber?: string;
  storeId?: string;
  sourceAvailabilityVerified?: boolean;
  premisesVerified?: boolean;
  stale?: boolean;
  sourceStale?: boolean;
  source_stale?: boolean;
  pickupOfferVerified?: boolean;
  orderabilityOfferVerified?: boolean;
  eligibleForOnSite?: boolean;
  eligibleForDropFeed?: boolean;
  eligibleForWatch?: boolean;
  eligibleForDelivery?: boolean;
  eligibleForEmail?: boolean;
  eligibleForSms?: boolean;
  inventorySemantics?: string;
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isUserFacingDropSignal(drop: UserFacingDropSignal) {
  const type = String(drop.type ?? drop.event_type ?? "").toLowerCase();
  const state = String(drop.state ?? drop.stateCode ?? drop.state_code ?? "").toUpperCase();
  const quantity = asNumber(drop.quantity, asNumber(drop.quantity_in_stock, asNumber(drop.boardShipmentQuantity, asNumber(drop.quantity_shipped, asNumber(drop.storeQty, asNumber(drop.store_qty, asNumber(drop.warehouseQty, asNumber(drop.warehouse_qty))))))));
  const precision = String(drop.locationPrecision ?? drop.location_precision ?? "").toLowerCase();
  const canAlert = drop.canAlertAsInventory === true || drop.can_alert_as_inventory === true;
  const permitNumber = String(drop.permitNumber ?? "");
  const isMississippiSparseOnSiteInventory = state === "MS"
    && /^(?:retailer_store_inventory_result|cityhive_store_inventory_result)$/.test(type)
    && precision === "store_level"
    && quantity === 0
    && drop.quantityIsExact === false
    && MISSISSIPPI_ONSITE_SOURCE_PERMITS.get(String(drop.sourceRuntimeId ?? "")) === permitNumber
    && drop.storeId === `ms-permit-${permitNumber}`
    && drop.sourceAvailabilityVerified === true
    && drop.premisesVerified === true
    && drop.stale !== true
    && drop.sourceStale !== true
    && drop.source_stale !== true
    && (drop.pickupOfferVerified === true || drop.orderabilityOfferVerified === true)
    && drop.eligibleForOnSite === true
    && drop.eligibleForDropFeed === true
    && drop.canAlertAsWatch === false
    && drop.can_alert_as_watch !== true
    && drop.eligibleForWatch === false
    && drop.eligibleForDelivery === false
    && drop.eligibleForEmail === false
    && drop.eligibleForSms === false
    && drop.inventorySemantics === "binary_retailer_orderable_no_exact_count"
    && !canAlert;

  if (!type) return false;
  if (type.includes("out_of_stock") || type.includes("out-of-stock")) return false;
  if (type.includes("lottery")) return false;
  if (type === "alabc_limited_release_store_drop") return precision === "store_level";
  if (type.includes("allocated_release") || type.includes("statewide_policy")) return false;
  if (type.includes("county_allocated")) return false;
  if (type.includes("catalog") || precision === "statewide_catalog") return false;
  if (state === "MS" && /^(?:retailer_store_inventory_result|cityhive_store_inventory_result)$/.test(type)) {
    return isMississippiSparseOnSiteInventory;
  }

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
