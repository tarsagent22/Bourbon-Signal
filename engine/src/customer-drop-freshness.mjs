const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const INVENTORY_DROP_AGE_MS = 72 * HOUR_MS;
const CURRENT_INVENTORY_AGE_MS = 2 * HOUR_MS;
const OREGON_DAILY_INVENTORY_URL = 'https://www.olcc.state.or.us/pdfs/DailyStoreInventory.csv';
const OREGON_CANARY_INVENTORY_AGE_MS = 48 * HOUR_MS;
const OH_STALE_FEED_AGE_MS = 14 * DAY_MS;
const DELIVERY_DROP_AGE_MS = 14 * DAY_MS;
const CONTEXT_DROP_AGE_MS = 30 * DAY_MS;

function text(...values) {
  return String(values.find(value => value !== null && value !== undefined) ?? '').trim().toLowerCase();
}

export function isCustomerInventoryDrop(drop = {}) {
  const type = text(drop.event_type, drop.type);
  const category = text(drop.signal_category, drop.signalCategory);
  const scope = text(drop.availability_scope, drop.availabilityScope);
  const precision = text(drop.location_precision, drop.locationPrecision);
  return drop.can_alert_as_inventory === true || drop.canAlertAsInventory === true
    || category === 'inventory' || scope === 'store_reported' || precision === 'store_level'
    || type.includes('in_stock') || type.includes('inventory_result');
}

export function customerDropTimestamp(drop = {}) {
  const inventory = isCustomerInventoryDrop(drop);
  const values = inventory
    ? [drop.last_confirmed_at, drop.lastConfirmedAt,
      drop.timestamp, drop.displayAt, drop.event_at, drop.eventAt, drop.first_seen_at, drop.firstSeenAt]
    : [drop.timestamp, drop.displayAt, drop.event_at, drop.eventAt, drop.first_seen_at, drop.firstSeenAt,
      drop.last_confirmed_at, drop.lastConfirmedAt];
  for (const value of values) {
    const parsed = Date.parse(String(value ?? ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

export function inventoryConfirmationTimestamp(drop = {}) {
  const value = drop.lastConfirmedAt ?? drop.last_confirmed_at ?? drop.inventoryCheckedAt
    ?? drop.inventory_checked_at ?? drop.observedAt ?? drop.observed_at;
  return typeof value === 'string' ? Date.parse(value) : Number.NaN;
}

export function publicDropMaxAgeMs(drop = {}) {
  const type = text(drop.event_type, drop.type);
  const category = text(drop.signal_category, drop.signalCategory);
  const scope = text(drop.availability_scope, drop.availabilityScope);
  const state = text(drop.state, drop.state_code).toUpperCase();
  const sourceStale = drop.sourceStale === true || drop.source_stale === true;
  if (state === 'OH' && sourceStale) return OH_STALE_FEED_AGE_MS;
  if (category === 'delivery' || /shipment|delivery|allocation_snapshot/.test(type)) return DELIVERY_DROP_AGE_MS;
  if (isCustomerInventoryDrop(drop)) return INVENTORY_DROP_AGE_MS;
  return CONTEXT_DROP_AGE_MS;
}

export function currentInventoryMaxAgeMs(drop = {}) {
  const state = text(drop.state, drop.state_code).toUpperCase();
  const binding = drop.sourceProductBinding && typeof drop.sourceProductBinding === 'object'
    ? drop.sourceProductBinding
    : {};
  if (state === 'TX' && binding.source === 'texas-shopify-pickup') return HOUR_MS;
  if (state === 'OR' && drop.previewOnly === true
    && drop.sourceUrl === OREGON_DAILY_INVENTORY_URL && drop.sourceAvailabilityVerified === true
    && drop.canAlertAsInventory === false && drop.canAlertAsWatch === false
    && drop.locationPrecision === 'store_level' && Boolean(drop.storeId && drop.storeAddress && drop.canonicalBottleId)
    && Number.isSafeInteger(drop.quantity) && Number(drop.quantity) > 0) return OREGON_CANARY_INVENTORY_AGE_MS;
  return CURRENT_INVENTORY_AGE_MS;
}

export function isWithinCustomerFreshnessWindow(drop, now = Date.now(), { currentInventory = false } = {}) {
  const useConfirmation = currentInventory && isCustomerInventoryDrop(drop);
  const timestamp = useConfirmation ? inventoryConfirmationTimestamp(drop) : customerDropTimestamp(drop);
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = Number(now) - timestamp;
  const maxAge = useConfirmation ? currentInventoryMaxAgeMs(drop) : publicDropMaxAgeMs(drop);
  return ageMs >= -15 * 60 * 1000 && ageMs <= maxAge;
}

export function isVerifiedRetailerDropCurrentlyUsable(drop = {}, now = Date.now()) {
  if (drop.source !== 'verified-retailer' || drop.retailerReported !== true) return false;
  const expiry = Date.parse(String(drop.expiresAt ?? drop.expires_at ?? ''));
  return Number.isFinite(expiry) && Number(now) < expiry;
}
