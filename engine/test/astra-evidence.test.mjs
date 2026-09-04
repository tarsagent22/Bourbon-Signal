import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStateOperatingContract } from '../src/state-operating-contract.mjs';
import { guardStateReport } from '../src/state-report-guard.mjs';
import { dropHasPositiveAlertInventory, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
const now = '2026-09-04T20:00:00Z';
const row = (id, confirmed = now) => ({ id, state: 'VA', bottleName: 'Fixture', canonicalId: id, storeId: id, sourceRuntimeId: 'source-a', type: 'store_inventory_result', locationPrecision: 'store_level', sourceEventAt: '2026-08-01T00:00:00Z', observedAt: confirmed, lastConfirmedAt: confirmed, canAlertAsInventory: false });
function health(drops) { return buildStateOperatingContract({ activeStateIds: ['VA'], generatedAt: now, summary: { states: [{ state: 'VA', status: 'useful', signalCount: drops.length }] }, drops }).states[0]; }
test('E01 old event with current confirmation has fresh inventory diagnostics', () => {
  const h = health([row('one')]);
  assert.equal(h.freshness.status, 'stale');
  assert.equal(h.evidenceFreshness.inventory.freshCount, 1);
  assert.equal(h.health, 'healthy');
});
test('E01 one fresh store cannot conceal stale and future inventory confirmations', () => {
  const h = health([row('fresh'), row('old', '2026-09-04T16:00:00Z'), row('future', '2026-09-05T20:00:00Z')]);
  assert.equal(h.health, 'degraded');
  assert.equal(h.evidenceFreshness.inventory.overdueCount, 2);
  assert.equal(h.evidenceFreshness.sources[0].status, 'overdue');
});
test('E01 informational shipment history does not inherit inventory SLA', () => {
  const h = health([{ ...row('shipment', '2026-08-01T00:00:00Z'), type: 'retailer_purchase_lead', informationalOnly: true }]);
  assert.equal(h.evidenceFreshness.inventory.totalCount, 0);
  assert.equal(h.health, 'healthy');
});
test('E04 independently validated current sub-source rows survive state collapse', () => {
  const previous = { state: 'VA', status: 'useful', signals: Array.from({ length: 10 }, (_, i) => row(String(i))), roadblocks: [] };
  const candidate = { state: 'VA', status: 'useful', signals: [{ ...row('new'), sourceRuntimeId: 'good', canAlertAsInventory: true, sourceAvailabilityVerified: true }], sourceResults: [{ sourceId: 'good', status: 'success', ok: true, stale: false, quarantined: false }], roadblocks: [] };
  const result = guardStateReport({ previous, candidate, now });
  assert.equal(result.report.signals[0].id, 'new');
  assert.equal(result.report.signals[0].canAlertAsInventory, true);
  assert.equal(result.report.signals.slice(1).every(s => s.stale && s.sourceAvailabilityVerified === false && s.canAlertAsInventory === false), true);
});
test('E04 full fallback clears source verification and every outbound authority flag', () => {
  const previous = { state: 'VA', status: 'useful', signals: [{ ...row('old'), sourceAvailabilityVerified: true, canAlertAsInventory: true, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true }] };
  const result = guardStateReport({ previous, candidate: null, now });
  const retained = result.report.signals[0];
  assert.equal(retained.sourceAvailabilityVerified, false);
  assert.equal(retained.eligibleForDelivery, false);
  assert.equal(retained.eligibleForEmail, false);
  assert.equal(retained.eligibleForSms, false);
});
test('E04 missing source identity is never evidence of independent validation', () => {
  const previous = { state: 'VA', status: 'useful', signals: Array.from({ length: 10 }, (_, i) => row(String(i))) };
  const candidate = { state: 'VA', signals: [{ ...row('new'), sourceRuntimeId: undefined, canAlertAsInventory: true }], sourceResults: [{ status: 'success', ok: true }] };
  assert.equal(guardStateReport({ previous, candidate, now }).report.signals.some(s => s.id === 'new'), false);
});
test('E04 failed or quarantined sub-source cannot preserve current alert authority', () => {
  const previous = { state: 'VA', status: 'useful', signals: Array.from({ length: 10 }, (_, i) => row(String(i))) };
  for (const result of [{ status: 'success', ok: true, quarantined: true }, { status: 'malformed', ok: false }]) {
    const candidate = { state: 'VA', signals: [{ ...row('new'), sourceRuntimeId: 'bad', canAlertAsInventory: true }], sourceResults: [{ sourceId: 'bad', ...result }] };
    assert.equal(guardStateReport({ previous, candidate, now }).report.signals.some(s => s.id === 'new'), false);
  }
});
const tx = () => ({ id: 'tx', state: 'TX', stateCode: 'TX', canonicalId: 'bottle', bottleName: 'Fixture', tier: 'allocated', type: 'cityhive_store_inventory_result', sourceLabel: 'Twin Liquors CityHive store inventory', sourceChain: 'twin-liquors', sourceUrl: 'https://twinliquors.com/product/fixture', merchantId: 'a'.repeat(24), storeId: `twin-liquors:${'a'.repeat(24)}`, productId: 'product', optionId: 'option', storeAddress: '1 Fixture St, Austin, TX 78701', locationPrecision: 'store_level', quantity: 0, quantityIsExact: false, sourceAvailabilityVerified: true, availabilityStatus: 'in_stock', canAlertAsInventory: true, observedAt: new Date().toISOString(), availabilityEpisodeId: 'tx-episode' });
test('F04 verified TX binary inventory reaches current candidate without inventing count', () => {
  const d = tx();
  assert.equal(dropHasPositiveAlertInventory(d), true);
  const [candidate] = buildCurrentInventoryAlertsFromDrops([d]);
  assert.equal(candidate.quantity, 0);
  assert.equal(candidate.quantityIsExact, false);
  assert.equal(candidate.optionId, 'option');
  assert.ok(candidate.gates.includes('verified_binary_orderability'));
});
test('F04 public projection retains option identity needed by TX policy', async () => {
  const { publicSignal, bibleLookup } = await import('../src/export-site-contract.mjs');
  const signal = { ...tx(), eventType: 'cityhive_store_inventory_result', canonicalName: 'Fixture', confidence: 0.9 };
  const d = publicSignal(signal, bibleLookup([]));
  assert.equal(d.optionId, 'option');
  assert.equal(dropHasPositiveAlertInventory(d), true);
});
test('F04 legacy sentinel-derived TX row explicitly exports unknown count', () => {
  const d = tx();
  delete d.quantityIsExact;
  assert.equal(buildCurrentInventoryAlertsFromDrops([d])[0].quantityIsExact, false);
});
test('F04 TX stale, unverified, wrong-identity and unavailable controls stay denied', () => {
  for (const change of [{ stale: true }, { sourceStale: true }, { raw: { staleFallback: true } }, { sourceAvailabilityVerified: false }, { storeId: 'wrong' }, { state: 'XX' }, { availabilityStatus: 'out_of_stock' }, { observedAt: '2020-01-01T00:00:00Z' }]) {
    assert.equal(buildCurrentInventoryAlertsFromDrops([{ ...tx(), ...change }]).length, 0, JSON.stringify(change));
  }
});
