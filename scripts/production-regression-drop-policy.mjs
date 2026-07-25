const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_INVENTORY_DROP_AGE_MS = 72 * HOUR_MS;
const MAX_OH_STALE_FEED_AGE_MS = 14 * DAY_MS;
const MAX_DELIVERY_DROP_AGE_MS = 14 * DAY_MS;
const MAX_CONTEXT_DROP_AGE_MS = 30 * DAY_MS;
const FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;
const DROP_FEED_TIERS = new Set(['unicorn', 'allocated', 'limited']);

function asTime(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NaN;
}

function isInventorySignal(drop) {
  const type = String(drop.event_type ?? drop.type ?? '').toLowerCase();
  const category = String(drop.signal_category || drop.signalCategory || '').toLowerCase();
  const aggregateContext = type === 'board_inventory_aggregate' || type === 'county_inventory_aggregate';
  return drop.can_alert_as_inventory === true
    || drop.canAlertAsInventory === true
    || category === 'inventory'
    || (type === 'store_inventory_aggregate' && Number(drop.quantity || 0) > 0)
    || (!aggregateContext && type.includes('inventory'))
    || type.includes('in_stock')
    || type.includes('availability');
}

function dropFreshnessTime(drop) {
  const confirmation = asTime(drop.last_confirmed_at ?? drop.lastConfirmedAt);
  if (isInventorySignal(drop) && Number.isFinite(confirmation)) return confirmation;
  return asTime(drop.timestamp ?? drop.displayAt ?? drop.event_at ?? drop.eventAt ?? drop.first_seen_at ?? drop.firstSeenAt ?? drop.last_confirmed_at ?? drop.lastConfirmedAt);
}

function maxAgeForDrop(drop) {
  const type = String(drop.event_type ?? drop.type ?? '').toLowerCase();
  const category = String(drop.signal_category ?? drop.signalCategory ?? '').toLowerCase();
  if (String(drop.state ?? '').toUpperCase() === 'OH' && drop.sourceStale === true) return MAX_OH_STALE_FEED_AGE_MS;
  if (isInventorySignal(drop)) return MAX_INVENTORY_DROP_AGE_MS;
  if (category === 'delivery' || type.includes('shipment') || type.includes('delivery') || type.includes('allocation_snapshot')) return MAX_DELIVERY_DROP_AGE_MS;
  return MAX_CONTEXT_DROP_AGE_MS;
}

export function parseLiveDropTotal(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function liveDropTotalMeetsRegressionFloor({ localTotal, liveTotal, minRatio }) {
  if (liveTotal === null) return false;
  if (localTotal > 0 && liveTotal === 0) return false;
  if (localTotal >= 20 && liveTotal < Math.floor(localTotal * minRatio)) return false;
  return true;
}

export function isDropExpectedInLiveFeed(drop, now = Date.now()) {
  const tier = String(drop.rarity_tier ?? drop.tier ?? '').toLowerCase();
  if (!DROP_FEED_TIERS.has(tier)) return false;
  if (isInventorySignal(drop) && !(Number(drop?.quantity || 0) > 0)) return false;
  const timestamp = dropFreshnessTime(drop);
  if (!Number.isFinite(timestamp)) return false;
  if (timestamp > now + FUTURE_CLOCK_SKEW_MS) return false;
  return now - timestamp <= maxAgeForDrop(drop);
}
