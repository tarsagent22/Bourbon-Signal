import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MA_JULIOS_SOURCE as source, parseMassachusettsJulios } from '../src/collectors/massachusetts-retailer-surfaces.mjs';
import { collectMassachusettsJulios } from '../src/collectors/massachusetts-retailer-collector.mjs';
import { STATE_SOURCES, ALL_STATE_SOURCES } from '../src/state-sources.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { buildShadowEvidence } from '../src/run-expansion-shadow.mjs';

function fixture(change = () => {}) {
  const merchant = { id: source.merchantId, full_address: source.address };
  const option = { product_id: 'p1', option_id: 'v1', merchant_id: source.merchantId,
    full_address: source.address, price: 54.99, quantity: 2, preorder_details: null,
    allowed_offer_types: null, product_url: `${source.baseUrl}/shop/product/rare-breed/p1?option-id=v1`,
    option_params: { size: { measure: 'ml', quantity: '750' } },
    original_option_params: { size: { measure: 'ml', quantity: '750' } }, units_of_measure: [],
    option_display_data: { name: 'WILD TURKEY RARE BREED', size: { measure: 'ml', quantity: '750' } } };
  const productMerchant = { merchant_id: source.merchantId, full_address: source.address,
    offer_types: ['pick_up', 'shipping'], product_options: [option] };
  const payload = { merchant_configs: [{ merchant }], products: [{ id: 'p1', name: 'WILD TURKEY RARE BREED', merchants: [productMerchant] }] };
  change({ merchant, option, productMerchant, payload });
  return `<script>window.products=JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"))</script>`;
}

test('exact merchant premises and current pickup offer remain binary, never an exact bottle count', () => {
  const rows = parseMassachusettsJulios(fixture());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pickupOfferVerified, true);
  assert.equal(rows[0].quantityIsExact, false);
  assert.equal(rows[0].quantity, 0);
});

test('preorders, unknown option policy and shipping-only options fail closed', () => {
  for (const change of [
    ({ option }) => { option.preorder_details = { release_date: '2099-01-01' }; },
    ({ option }) => { delete option.preorder_details; },
    ({ option }) => { delete option.allowed_offer_types; },
    ({ option }) => { option.allowed_offer_types = ['shipping']; },
    ({ option }) => { option.description = 'Pre-order, ships next month'; },
    ({ productMerchant }) => { productMerchant.offer_types = ['shipping']; },
  ]) assert.equal(parseMassachusettsJulios(fixture(change)).length, 0);
});

test('wrong merchant, wrong premises and variant URL substitution cannot enter MA research', () => {
  for (const change of [
    ({ merchant }) => { merchant.id = 'another-merchant'; },
    ({ merchant }) => { merchant.full_address = '140 Turnpike Road, another city'; },
    ({ option }) => { option.full_address = 'another store'; },
    ({ option }) => { option.merchant_id = 'another-merchant'; },
    ({ option }) => { option.product_url = option.product_url.replace('option-id=v1', 'option-id=other'); },
    ({ option }) => { option.product_url = option.product_url.replace(source.hostname, 'example.com'); },
  ]) assert.equal(parseMassachusettsJulios(fixture(change)).length, 0);
});

test('nonpositive stock/price and bundles, creams, flavored whiskey or miniatures are excluded', () => {
  for (const change of [
    ({ option }) => { option.quantity = 0; },
    ({ option }) => { option.quantity = -1; },
    ({ option }) => { option.price = 0; },
    ({ option }) => { delete option.option_display_data.size; },
    ({ option }) => { option.option_params.size.quantity = '50'; },
    ({ option }) => { option.units_of_measure = ['case']; },
    ({ payload }) => { payload.products[0].name = 'Wild Turkey Rare Breed Gift Pack'; },
    ...['Buffalo Trace Pack', 'Buffalo Trace Bourbon Cream 50ML NIP', 'Jim Beam Apple 750ML']
      .map(name => ({ option }) => { option.option_display_data.name = name; }),
  ]) assert.equal(parseMassachusettsJulios(fixture(change)).length, 0);
  assert.deepEqual(parseMassachusettsJulios('x'.repeat(2_000_001)), []);
});

const bible = { match: () => ({ confidence: 1, record: { id: 'rare-breed', canonical: 'Wild Turkey Rare Breed Straight Bourbon' } }) };

test('MA stays research-only and a production call cannot fetch or collect the candidate', async () => {
  assert.ok(ALL_STATE_SOURCES.some(row => row.id === 'MA'));
  assert.equal(STATE_SOURCES.some(row => row.id === 'MA'), false);
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('MA'), false);
  assert.equal(STATE_LIFECYCLE_CONFIG.states.MA.publicStatus, 'research_only');
  const result = await collectMassachusettsJulios({ id: 'MA' }, bible, { shadowMode: false,
    fetchImpl: () => { throw new Error('Must not request a source outside shadow mode'); } });
  assert.equal(result.signals.length, 0);
  assert.equal(result.roadblocks[0].status, 'promotion_required');
});

test('shadow observations require exact catalog identity and never enable delivery or exact counts', async () => {
  const options = { shadowMode: true, fetchImpl: async () => new Response(fixture()) };
  const result = await collectMassachusettsJulios({ id: 'MA' }, bible, options);
  assert.equal(result.signals.length, 1, 'Duplicate product variants across probes must coalesce');
  const row = result.signals[0];
  assert.equal(row.storeAddress, source.address);
  assert.equal(row.storeId, source.storeId);
  assert.equal(row.canonicalBottleId, 'rare-breed');
  assert.equal(row.sourceAvailabilityVerified, true);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.quantity, 0);
  for (const flag of ['alertable', 'eligibleForOnSite', 'eligibleForDelivery', 'eligibleForEmail', 'eligibleForSms']) assert.equal(row[flag], false);
  const ambiguous = await collectMassachusettsJulios({ id: 'MA' }, { match: () => ({ confidence: 0.9, record: { id: 'wrong-bottle' } }) }, options);
  assert.deepEqual(ambiguous.signals, []);
});

test('a failed sibling request remains visible and cannot produce complete shadow evidence', async () => {
  let count = 0;
  const startedAt = new Date().toISOString();
  const result = await collectMassachusettsJulios({ id: 'MA' }, bible, { shadowMode: true,
    fetchImpl: async () => ++count === 1 ? new Response(fixture()) : new Response('Forbidden', { status: 403 }) });
  assert.equal(result.signals.length, 1);
  assert.equal(result.roadblocks[0].error, 'source_http_403');
  assert.equal(result.sourceReports[1].ok, false);
  const evidence = buildShadowEvidence('MA', { state: 'MA', strategy: 'retailer_store_inventory', status: 'useful',
    startedAt, finishedAt: new Date().toISOString(), ...result, sources: result.sourceReports });
  assert.equal(evidence.complete, false);
  assert.equal(evidence.publication.productionSnapshotTouched, false);
  assert.equal(evidence.alerts.disabled, true);
});
