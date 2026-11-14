import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BourbonBible } from '../src/core/bible.mjs';
import { parseLouisianaAlaskaGroceryInventory } from '../src/collectors/louisiana-alaska-grocery-expansion.mjs';
import { LOUISIANA_ALASKA_GROCERY_SOURCES, LOUISIANA_ALASKA_RESOLVER_ZIPS } from '../src/collectors/louisiana-alaska-grocery-premises.mjs';
import { LOUISIANA_ALASKA_GROCERY_PRODUCTION_CONFIGS, LOUISIANA_ALASKA_GROCERY_BUDGETS } from '../src/louisiana-alaska-grocery-production-config.mjs';
import { collectLouisianaAlaskaGroceryProductionState, validateLouisianaAlaskaProductionResult } from '../src/collectors/louisiana-alaska-grocery-production-adapter.mjs';
import { isLouisianaAlaskaGroceryOnSiteSignal, toLouisianaAlaskaGroceryOnSiteSignal } from '../src/louisiana-alaska-grocery-policy.mjs';
import { syntheticLaakAdmission } from './helpers/synthetic-laak-admission.mjs';

const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const identity = JSON.parse(await readFile(new URL('./fixtures/louisiana-alaska/identity.json', import.meta.url), 'utf8'));

function rowFor(state) {
  const source = LOUISIANA_ALASKA_GROCERY_SOURCES.find(item => item.stateCode === state);
  const product = structuredClone(identity.product);
  product.storeId = source.merchantId;
  return parseLouisianaAlaskaGroceryInventory({ appCode: 'GR200', response: { docs: [product] } }, source, bible,
    { observedAt: '2026-11-14T08:20:00.000Z' })[0];
}

function fullProfile(state, row) {
  const sources = LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source => source.stateCode === state);
  const budget = LOUISIANA_ALASKA_GROCERY_BUDGETS[state];
  const expectedInventoryRequests = budget.maxRequests - LOUISIANA_ALASKA_RESOLVER_ZIPS[state].length;
  const termsByStore = new Map(sources.map(source => [source.id, ['bourbon', 'whiskey']]));
  let extraTerms = expectedInventoryRequests - sources.length * 2;
  for (const source of sources) {
    if (extraTerms-- <= 0) break;
    termsByStore.get(source.id).push(`reviewed-term-${source.id}`);
  }
  const requests = LOUISIANA_ALASKA_RESOLVER_ZIPS[state].map((zipcode, index) => ({
    kind: 'resolver', url: `https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=${zipcode}&radius=50&size=100`,
    status: 200, ok: true, sourceId: null, merchantId: null, term: null, requestId: `resolver-${index}`,
  }));
  const queryEvidence = [];
  let index = 0;
  for (const source of sources) for (const term of termsByStore.get(source.id)) {
    const params = new URLSearchParams({
      'request-id': String(1_000_000 + index), url: `https://${source.host}`, pageurl: `https://${source.host}`,
      pagename: 'search', rows: '100', start: '0', 'search-type': 'keyword', storeid: source.merchantId,
      featured: 'true', 'search-uid': '', q: term, channel: 'instore', banner: source.banner,
    });
    const url = `https://${source.host}/abs/pub/xapi/search/substitute?${params}`;
    requests.push({ kind: 'inventory', sourceId: source.id, merchantId: source.merchantId, term, url, status: 200, ok: true });
    queryEvidence.push({ sourceId: source.id, storeId: source.storeId, merchantId: source.merchantId, term, url,
      httpStatus: 200, disposition: term === 'bourbon' && source.storeId === row.storeId ? 'BOUND_PRODUCTS' : 'CONFIRMED_EMPTY',
      bodySha256: 'a'.repeat(64) });
    index += 1;
  }
  const positiveStores = row ? [row.storeId] : [];
  const sourceAttempts = Object.fromEntries(sources.map(source => [source.id, { status: 'success', inspected: true,
    positiveRows: source.storeId === row?.storeId ? 1 : 0, lastAttemptAt: '2026-11-14T08:20:00.000Z' }]));
  return { signals: row ? [row] : [], roadblocks: [], metadata: {
    complete: true, requestProfileComplete: true, negativeComplete: true, profileScope: 'COMPLETE_REVIEWED_PROFILE',
    unconfirmedNegativeQueryCount: 0, unconfirmedNegativeQueries: [], maxRequestCount: budget.maxRequests,
    requests, queryEvidence, selectedStores: sources.map(source => source.storeId),
    verifiedPremises: sources.map(source => source.storeId), positiveStores, sourceAttempts,
  } };
}

test('closed production admission accepts only the full reviewed AK and LA profiles', () => {
  for (const state of ['AK', 'LA']) {
    const row = rowFor(state);
    const result = fullProfile(state, row);
    const proof = validateLouisianaAlaskaProductionResult(state, bible, result);
    assert.equal(proof.status, 'closed_profile_verified');
    assert.equal(proof.requestCount, LOUISIANA_ALASKA_GROCERY_BUDGETS[state].maxRequests);
    assert.equal(proof.reviewedStoreCount, LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source => source.stateCode === state).length);
    assert.equal(proof.positiveStoreCount, 1);
  }
});

test('production admission rejects incomplete, unconfirmed, altered-store, and malformed profiles', () => {
  const valid = fullProfile('AK', rowFor('AK'));
  const mutations = [
    value => { value.metadata.requestProfileComplete = false; },
    value => { value.metadata.unconfirmedNegativeQueryCount = 1; value.metadata.unconfirmedNegativeQueries = [{}]; },
    value => { value.metadata.requests.pop(); },
    value => { value.metadata.verifiedPremises.pop(); },
    value => { value.signals[0].storeAddress = 'Unreviewed address'; },
    value => { value.metadata.queryEvidence[0].bodySha256 = 'invalid'; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => validateLouisianaAlaskaProductionResult('AK', bible, changed), /production profile rejected/);
  }
});

test('on-site projection reports binary zero and retains exact source product evidence with alerts off', () => {
  const sourceRow = rowFor('AK');
  const row = toLouisianaAlaskaGroceryOnSiteSignal(sourceRow);
  assert.ok(row);
  assert.equal(row.quantity, 0);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.inventorySemantics, 'binary_retailer_orderable_no_exact_count');
  assert.equal(row.canAlertAsInventory, false);
  assert.equal(row.canAlertAsWatch, false);
  assert.equal(row.eligibleForDelivery, false);
  assert.equal(row.eligibleForEmail, false);
  assert.equal(row.eligibleForSms, false);
  assert.equal(row.sourceProductBinding.productSnapshot.channelInventory.instoreItemQty, '4');
  assert.equal(isLouisianaAlaskaGroceryOnSiteSignal(row), true);
  assert.equal(isLouisianaAlaskaGroceryOnSiteSignal({ ...row, quantity: 4 }), false);
  assert.equal(isLouisianaAlaskaGroceryOnSiteSignal({ ...row, canAlertAsInventory: true }), false);
});

test('durable 403 journal blocks replay before another source request', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'laak-production-adapter-'));
  try {
    let calls = 0;
    const config = LOUISIANA_ALASKA_GROCERY_PRODUCTION_CONFIGS.find(item => item.id === 'AK');
    const {lifecycle,manifest:promotionManifest}=syntheticLaakAdmission('AK');
    const fetchText = async (url, options) => {
      calls += 1;
      const response = { ok: false, status: 403, url, text: '', retryAfterSeconds: 0 };
      await options.onResponse(response);
      return response;
    };
    const first=await collectLouisianaAlaskaGroceryProductionState(config, bible, { fetchText, incidentDirectory: directory,lifecycleConfig:lifecycle,promotionManifest,env:{} });
    assert.equal(first.status,'blocked');assert.deepEqual(first.signals,[]);
    assert.equal(calls, 1);
    const journal = JSON.parse(await readFile(path.join(directory, 'AK.json'), 'utf8'));
    assert.equal(journal['host:www.safeway.com'].status, 'access_denied');
    assert.equal(journal['host:www.safeway.com'].reviewRequired, true);
    const second=await collectLouisianaAlaskaGroceryProductionState(config, bible, { fetchText, incidentDirectory: directory,lifecycleConfig:lifecycle,promotionManifest,env:{} });
    assert.equal(second.status,'blocked');assert.deepEqual(second.signals,[]);
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
