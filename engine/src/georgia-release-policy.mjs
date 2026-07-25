import assert from 'node:assert/strict';

import {
  isGeorgiaRetailerInventory,
  isGeorgiaRetailerInventoryEvidence,
  isGeorgiaRetailerSignalIdentity,
} from './georgia-retailer-policy.mjs';

const GEORGIA_RETAILER_EVENT = /^(cityhive_store_inventory_result|retailer_store_inventory_result)$/i;
const LABELED_FALLBACK_STATUS = /^stale_(?:useful|useful_retained_not_due)(?:_quality_fallback)?$/i;
const INVALID_BOTTLE_FORMAT = /\b(?:50|100|187|200|250|375)\s*ml\b|\b(?:bundle|multipack|multi-pack|case\s+of|pack\s+of|\d+\s*(?:pack|pk)|\d+\s*x\s*\d+\s*(?:ml|l))\b/i;

function rows(payload, key) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

function isFiniteTimestamp(value) {
  return Number.isFinite(Date.parse(value || ''));
}

function isFresh(row, nowMs, maxInventoryAgeHours) {
  const observedAt = Date.parse(row.observedAt || row.signalAt || '');
  return Number.isFinite(observedAt)
    && nowMs >= observedAt
    && nowMs - observedAt <= maxInventoryAgeHours * 60 * 60 * 1000;
}

function isNonAlerting(row) {
  return row.alertable !== true
    && row.canAlertAsInventory !== true
    && row.canAlertAsWatch !== true;
}

function isDeliveryDisabled(alert) {
  return alert.eligibleForDelivery !== true
    && alert.eligibleForOnSite !== true
    && alert.eligibleForEmail !== true
    && alert.eligibleForSms !== true;
}

function assertQuantitySemantics(rowsToCheck) {
  const binary = rowsToCheck.filter((row) => row.inventorySemantics === 'binary_retailer_orderable_no_exact_count');
  const exact = rowsToCheck.filter((row) => row.inventorySemantics === 'exact_retailer_reported_quantity');
  assert.equal(binary.length + exact.length, rowsToCheck.length, 'Georgia rows must preserve an approved binary or exact-quantity inventory semantic.');
  assert.ok(binary.every((row) => row.quantity === 0 && row.quantityIsExact === false && row.sourceAvailabilityVerified === true), 'Georgia binary rows must never invent positive quantity.');
  assert.ok(exact.every((row) => row.quantity > 0 && row.quantity < 100 && row.quantityIsExact === true), 'Georgia exact CityHive quantities must be finite positive values below the binary sentinel.');
  return { binary, exact };
}

function assertExplicitFallbackState(state) {
  assert.equal(state.stale, true, 'Georgia last-known fallback must remain explicitly labeled stale.');
  assert.match(String(state.status || ''), LABELED_FALLBACK_STATUS, `Georgia fallback status ${JSON.stringify(state.status)} is not an explicit labeled last-known fallback.`);
  assert.ok(String(state.staleReason || '').trim(), 'Georgia fallback must include an explicit preservation reason.');
  assert.ok(isFiniteTimestamp(state.staleFallbackAt), 'Georgia fallback must record staleFallbackAt.');
  assert.ok(isFiniteTimestamp(state.lastGoodAt || state.previousFinishedAt), 'Georgia fallback must preserve lastGoodAt or previousFinishedAt provenance.');
}

export function verifyGeorgiaReleasePolicy({
  state,
  siteDrops,
  siteAlerts,
  allowLabeledLastKnownFallback = false,
  maxInventoryAgeHours = 12,
  nowMs = Date.now(),
} = {}) {
  assert.equal(state?.state, 'GA');
  assert.ok(Number.isFinite(nowMs), 'Georgia verification requires a finite current time.');
  assert.ok(Number.isFinite(maxInventoryAgeHours) && maxInventoryAgeHours > 0, 'Georgia freshness window must be positive.');

  const signals = rows(state?.signals, 'signals');
  const drops = rows(siteDrops, 'drops');
  const alerts = rows(siteAlerts, 'alerts');
  const retailerRows = signals.filter((signal) => GEORGIA_RETAILER_EVENT.test(String(signal.eventType || '')));
  const georgiaDrops = drops.filter((drop) => drop.state === 'GA' && GEORGIA_RETAILER_EVENT.test(String(drop.type || drop.eventType || '')));
  const georgiaAlerts = alerts.filter((alert) => alert.state === 'GA');
  const currentInventoryAlerts = georgiaAlerts.filter((alert) => alert.changeType === 'current_inventory_signal');
  const fallback = state.stale === true || /^stale_/i.test(String(state.status || ''));
  const invalidFormats = signals.filter((signal) => (signal.canAlertAsInventory || signal.canAlertAsWatch)
    && INVALID_BOTTLE_FORMAT.test(String(signal.rawName || '')));
  assert.equal(invalidFormats.length, 0, 'Georgia alertable rows must reject 375ml-or-smaller bottles, bundles, and multipacks.');

  if (fallback) {
    assert.ok(allowLabeledLastKnownFallback, 'Georgia verification requires fresh inventory unless the explicit labeled last-known fallback policy is enabled.');
    assertExplicitFallbackState(state);
    assert.ok(retailerRows.length > 0, 'Georgia labeled fallback must retain at least one exact-identity last-known retailer row.');
    assert.ok(retailerRows.every(isGeorgiaRetailerSignalIdentity), 'Georgia fallback contains a retailer row that lost exact source/store identity.');
    assert.ok(retailerRows.every(isGeorgiaRetailerInventoryEvidence), 'Georgia fallback contains a row that lost its source-backed inventory evidence or quantity semantics.');
    assert.ok(retailerRows.every((row) => row.stale === true
      && row.raw?.staleFallback === true
      && Boolean(row.staleReason || row.raw?.staleReason)
      && isNonAlerting(row)), 'Georgia retained signals must stay explicitly stale and non-alerting.');
    assertQuantitySemantics(retailerRows);

    assert.ok(georgiaDrops.length > 0, 'Georgia labeled fallback must retain its last-known customer rows.');
    assert.ok(georgiaDrops.every(isGeorgiaRetailerSignalIdentity), 'Georgia fallback drops must retain exact source/store identity.');
    assert.ok(georgiaDrops.every(isGeorgiaRetailerInventoryEvidence), 'Georgia fallback drops must retain source-backed inventory evidence and quantity semantics.');
    assert.ok(georgiaDrops.every((drop) => drop.stale === true
      && drop.sourceStale === true
      && Boolean(drop.staleSourceCaveat)
      && isNonAlerting(drop)), 'Georgia fallback drops must stay explicitly stale and non-alerting.');
    assert.ok(georgiaAlerts.every(isDeliveryDisabled), 'Georgia fallback must export zero alert-eligible rows on every channel.');

    return {
      status: 'ok',
      fallback: true,
      stateStatus: state.status,
      inventorySignals: retailerRows.length,
      binarySignals: retailerRows.filter((row) => row.inventorySemantics === 'binary_retailer_orderable_no_exact_count').length,
      exactQuantitySignals: retailerRows.filter((row) => row.inventorySemantics === 'exact_retailer_reported_quantity').length,
      stores: new Set(retailerRows.map((row) => row.storeId)).size,
      sources: [...new Set(retailerRows.map((row) => row.sourceLabel || row.source))],
      projectedDrops: georgiaDrops.length,
      currentInventoryAlerts: currentInventoryAlerts.length,
    };
  }

  assert.ok(['useful', 'useful_retained_not_due'].includes(state.status), `Georgia status ${JSON.stringify(state.status)} is not release-fresh.`);
  assert.notEqual(state.stale, true, 'Georgia fresh release lane cannot contain a stale state report.');
  assert.ok(retailerRows.length > 0, 'Expected at least one exact-identity Georgia retailer inventory row.');
  assert.ok(retailerRows.every(isGeorgiaRetailerInventory), 'Georgia retailer output contains an identity, geography, availability, quantity-semantics, or stale-row violation.');
  assert.ok(retailerRows.every((row) => isFresh(row, nowMs, maxInventoryAgeHours)), `Georgia retailer inventory must be source-fresh within ${maxInventoryAgeHours} hours.`);
  const { binary, exact } = assertQuantitySemantics(retailerRows);
  assert.ok(new Set(retailerRows.map((signal) => signal.storeId)).size > 0, 'Expected at least one exact Georgia retailer premises.');
  assert.ok(georgiaDrops.length > 0, 'Georgia retailer inventory must survive the customer drop projection.');
  assert.ok(georgiaDrops.every(isGeorgiaRetailerInventory), 'Every projected Georgia retailer drop must retain its exact identity and quantity semantics without stale labeling.');
  assert.ok(georgiaDrops.every((drop) => isFresh(drop, nowMs, maxInventoryAgeHours)), `Georgia projected retailer drops must be source-fresh within ${maxInventoryAgeHours} hours.`);
  assert.ok(currentInventoryAlerts.every((alert) => alert.eligibleForEmail === false && alert.eligibleForSms === false), 'Georgia activation baselines must remain on-site only; outbound alerts require a later source-backed change.');
  assert.ok(currentInventoryAlerts.filter((alert) => alert.inventorySemantics === 'exact_retailer_reported_quantity')
    .every((alert) => alert.quantityIsExact === true && alert.reportedQuantity === alert.quantity), 'Georgia exact-quantity alerts must preserve source quantity evidence.');
  assert.ok(currentInventoryAlerts.filter((alert) => alert.inventorySemantics === 'binary_retailer_orderable_no_exact_count')
    .every((alert) => alert.quantityIsExact === false), 'Georgia binary alerts must preserve non-exact quantity semantics.');

  return {
    status: 'ok',
    fallback: false,
    stateStatus: state.status,
    inventorySignals: retailerRows.length,
    binarySignals: binary.length,
    exactQuantitySignals: exact.length,
    stores: new Set(retailerRows.map((row) => row.storeId)).size,
    sources: [...new Set(retailerRows.map((row) => row.sourceLabel || row.source))],
    projectedDrops: georgiaDrops.length,
    currentInventoryAlerts: currentInventoryAlerts.length,
  };
}
