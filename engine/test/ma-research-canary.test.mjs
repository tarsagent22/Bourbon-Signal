import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMaResearchCanary, verifyMaPreviewIsolation } from '../src/ma-research-canary.mjs';
import { buildCanaryPreviewPayload } from '../src/build-state-canary-preview.mjs';
import { MA_JULIOS_SOURCE as store } from '../src/collectors/massachusetts-retailer-surfaces.mjs';

const nowMs = Date.parse('2026-10-20T05:00:00Z');
function inputs() {
  const row = { id: 'source-row', state: 'MA', eventType: 'cityhive_store_inventory_result', sourceChain: store.id, merchantId: store.merchantId, storeId: store.storeId, storeAddress: store.address, city: store.city, county: store.county, locationPrecision: 'store_level', sourceRuntimeId: 'precision:ma:julios-westborough:0', confidence: 1, canonicalBottleId: 'bottle', rawName: 'WILD TURKEY RARE BREED', productId: 'product-1', variantId: 'variant-1', sourceUrl: `${store.baseUrl}/shop/product/rare-breed/product-1?option-id=variant-1`, sourceAvailabilityVerified: true, availabilityStatus: 'orderable', inventorySemantics: 'binary_retailer_orderable_no_exact_count', quantity: 0, quantityIsExact: false, canAlertAsInventory: true, canAlertAsWatch: false, raw: { shadowOnly: true, premisesVerified: true, pickupOfferVerified: true, sourceMatchStatus: 'exact_bible_match' }, observedAt: new Date(nowMs - 60_000).toISOString(), stale: false, sourceStale: false, price: 54.99, alertable: false, eligibleForOnSite: false, eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false };
  return { nowMs, baseline: { generatedAt: new Date(nowMs - 300_000).toISOString(), runId: 'published', engineGeneratedAt: new Date(nowMs - 600_000).toISOString() }, lifecycle: { activeStates: ['NC'], states: { NC: { publicStatus: 'active' } } }, report: { state: 'MA', status: 'useful', stale: false, roadblocks: [], sources: [{ ok: true, status: 200 }, { ok: true, status: 200 }], signals: [row] }, drops: [{ ...row, quantity: null }] };
}

test('MA export rehearsal preserves binary orderability without production activation', () => {
  assert.equal(verifyMaResearchCanary(inputs()), true);
});

for (const [label, mutate] of [
  ['stale published baseline', value => { value.baseline.generatedAt = '2026-10-19T05:00:00Z'; }],
  ['pre-existing MA lifecycle registration', value => { value.lifecycle.states.MA = { publicStatus: 'active' }; }],
  ['forged premises', value => { value.report.signals[0].storeAddress = 'Wrong premises'; }],
  ['failed sibling source', value => { value.report.sources[1].ok = false; }],
  ['invented exact quantity', value => { value.drops[0].quantity = 4; }],
  ['enabled email', value => { value.drops[0].eligibleForEmail = true; }],
  ['renewed source timestamp', value => { value.drops[0].observedAt = new Date(nowMs).toISOString(); }],
]) test(`MA export rehearsal rejects ${label}`, () => {
  const value = inputs(); mutate(value); assert.throws(() => verifyMaResearchCanary(value));
});

test('MA preview retains other-state observations and never inherits MA alerts', () => {
  const base = { drops: { drops: [{ state: 'NC', id: 'nc-row' }] }, alerts: { alerts: [{ state: 'NC', id: 'nc-alert' }, { state: 'MA', id: 'old-ma-alert' }] } };
  const candidates = inputs().drops;
  const preview = buildCanaryPreviewPayload({ base, state: 'MA', candidateDrops: candidates });
  verifyMaPreviewIsolation(base, preview, candidates);
  preview.drops.drops[0].id = 'changed-nc-row';
  assert.throws(() => verifyMaPreviewIsolation(base, preview, candidates));
});
