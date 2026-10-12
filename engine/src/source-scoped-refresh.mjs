import { markSignalStaleNonAlertable } from './stale-signal-policy.mjs';
import { hasSouthCarolinaPositiveInventoryEvidence } from './south-carolina-retailer-policy.mjs';

export const SC_SOURCE_LANES = Object.freeze(['cityhive', 'da-brown-bag', 'taste-liquors', 'southern-spirits', 'dunes',
  'liquor-library', 'discount-liquor-fort-mill', 'all-american', 'phase1-myrtle']);

export function sourceRefreshScope(env = process.env) {
  const raw = String(env.BOURBON_SIGNAL_REFRESH_SOURCES || '').trim();
  if (!raw) return [];
  const states = String(env.BOURBON_SIGNAL_RUN_STATES || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  const ids = [...new Set(raw.split(',').map(value => value.trim()))];
  if (states.length !== 1 || states[0] !== 'SC' || !ids.length || ids.some(id => !SC_SOURCE_LANES.includes(id))) {
    throw new Error('Source-scoped refresh requires exactly SC and reviewed South Carolina source lane ids.');
  }
  return ids;
}

function sourceLane(row) {
  const stamped = String(row.leafSourceRuntimeId || '').replace(/^sc:/, '');
  if (SC_SOURCE_LANES.includes(stamped)) return stamped;
  const store = String(row.storeId || '');
  const prefixes = { 'taste-liquors': 'taste-liquors', 'da-brown-bag': 'da-brown-bag', 'southern-spirits': 'southern-spirits',
    'dunes': 'dunes', 'liquor-library': 'liquor-library', 'discount-liquor-fort-mill': 'discount-liquor-fort-mill', 'all-american-liquor': 'all-american' };
  for (const [prefix, lane] of Object.entries(prefixes)) if (store === prefix || store.startsWith(`${prefix}:`)) return lane;
  return null;
}

export function mergeSourceScopedReport(previous, candidate, sourceIds, now = new Date().toISOString()) {
  if (!previous || previous.state !== 'SC' || !Array.isArray(previous.signals) || !Array.isArray(previous.sources)) {
    throw new Error('Source-scoped refresh requires a complete previous SC report.');
  }
  if (candidate?.state !== 'SC' || !Array.isArray(candidate.signals)) throw new Error('Invalid source-scoped candidate.');
  const selected = new Set(sourceIds);
  const current = candidate.signals.filter(row => selected.has(sourceLane(row)));
  const currentIds = new Set(current.map(row => row.id));
  // Retain unrequested observations as explicitly stale; never stamp them with the new run's freshness.
  const retained = previous.signals.filter(row => !selected.has(sourceLane(row)) && !currentIds.has(row.id))
    .map(row => ({ ...markSignalStaleNonAlertable(row, 'source_not_refreshed', now),
      staleSourceCaveat: 'This source was not checked in the latest targeted refresh. Verify directly before driving.',
      eligibleForDelivery: false, deliveryEligible: false, eligibleForEmail: false, eligibleForSms: false }));
  return { ...candidate, status: 'partial_useful_quality_fallback', partial: true, stale: false,
    partialReason: 'Only the requested sources were refreshed; other observations are retained as stale context.',
    sourceRefresh: { state: 'SC', sourceIds, observedAt: now, previousFinishedAt: previous.finishedAt },
    signals: [...current, ...retained], sources: [...candidate.sources, ...previous.sources.map(row => ({ ...row, stale: true, ok: false }))] };
}

export function verifySourceScopedEvidence(report, drops, sourceIds, now = new Date().toISOString()) {
  if (report?.state !== 'SC' || report.stale || report.sourceRefresh?.sourceIds?.join(',') !== sourceIds.join(',')) {
    throw new Error('Source refresh report does not match the dispatched source scope.');
  }
  const reference = Date.parse(now);
  const start = Date.parse(report.startedAt);
  const verified = [];
  for (const id of sourceIds) {
    const rows = report.signals.filter(row => row.leafSourceRuntimeId === `sc:${id}` && row.locationPrecision === 'store_level'
      && row.canAlertAsInventory === true && row.sourceAvailabilityVerified === true && !row.stale && !row.sourceStale
      && row.raw?.staleFallback !== true && (row.canonicalBottleId || row.canonicalId) && row.storeId && row.storeAddress
      && hasSouthCarolinaPositiveInventoryEvidence(row)
      && /^[hH][tT][tT][pP][sS]:\/\//.test(row.sourceUrl || '')
      && /^(?:in_stock|limited|available)$/.test(String(row.availabilityStatus || ''))
      && Number.isFinite(start) && Date.parse(row.observedAt) >= start - 5000
      && Date.parse(row.observedAt) <= reference + 300000 && reference - Date.parse(row.observedAt) <= 2 * 3600000);
    if (!rows.length) throw new Error(`${id}: no fresh, verified exact-store inventory from this run.`);
    const exported = drops.filter(drop => drop.leafSourceRuntimeId === `sc:${id}` && drop.state === 'SC'
      && drop.locationPrecision === 'store_level' && !drop.sourceStale && !drop.stale
      && rows.some(row => row.storeId === drop.storeId && row.sourceUrl === drop.sourceUrl));
    if (!exported.length) throw new Error(`${id}: verified source has no fresh customer-visible rows.`);
    verified.push({ sourceId: `sc:${id}`, inventoryRows: rows.length, exportedRows: exported.length });
  }
  const selected = new Set(sourceIds.map(id => `sc:${id}`));
  for (const row of report.signals) {
    if (!selected.has(row.leafSourceRuntimeId) && (row.canAlertAsInventory === true || row.canAlertAsWatch === true
      || row.alertable === true || row.sourceAvailabilityVerified === true)) throw new Error('An unrequested source became current or alertable.');
  }
  return { verified: true, state: 'SC', observedAt: now, sources: verified };
}
