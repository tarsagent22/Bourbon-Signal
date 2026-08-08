import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  cachedSouthCarolinaCityHiveSignals,
  isAuthoritativeSouthCarolinaCityHiveMerchantPayload,
  isFreshSouthCarolinaCityHiveCacheTimestamp,
  mergeSouthCarolinaCityHiveSignals,
  resolveSouthCarolinaCityHiveProbePayload,
  runIsolatedSouthCarolinaSourceLane,
  southCarolinaCityHiveApiEvidenceBlobs,
  southCarolinaCityHiveBoundMerchantIds,
  southCarolinaCityHiveMerchantEvidence,
  southCarolinaCityHiveProbePlan,
} from '../src/collectors/precision-probes.mjs';
import { buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
import { isSouthCarolinaCityHiveInventory } from '../src/south-carolina-retailer-policy.mjs';

const collector = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../src/verify-sc.mjs', import.meta.url), 'utf8');
const refreshWorkflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
const liveProbe = readFileSync(new URL('../../scripts/run-state-expansion-live-probe.mjs', import.meta.url), 'utf8');
const storeUniverse = JSON.parse(readFileSync(new URL('../data/store-universe/SC.json', import.meta.url), 'utf8'));

function defaultHours(constantName) {
  const match = collector.match(new RegExp(`const ${constantName} = Number\\(process\\.env\\.[A-Z0-9_]+ \\|\\| (\\d+) \\* 60 \\* 60_000\\)`));
  assert.ok(match, `missing hour-based default for ${constantName}`);
  return Number(match[1]);
}

function defaultNumber(constantName) {
  const match = collector.match(new RegExp(`const ${constantName} = Number\\(process\\.env\\.[A-Z0-9_]+ \\|\\| (\\d+)\\)`));
  assert.ok(match, `missing numeric default for ${constantName}`);
  return Number(match[1]);
}

test('Myrtle catalog query failures are coalesced outside the bounded term loop', () => {
  const section = collector.slice(
    collector.indexOf('async function collectSouthCarolinaLiquorStoreNearMe'),
    collector.indexOf('async function collectSouthCarolinaBurntBarrel')
  );
  assert.match(section, /const queryFailures = \[\]/);
  const loop = section.slice(section.indexOf('for \(const term of SC_LIQUOR_STORE_NEAR_ME_TERMS\)'), section.indexOf('if \(queryFailures\.length > 0\)'));
  assert.doesNotMatch(loop, /roadblocks\.push/);
  assert.match(section, /WooCommerce catalog failed for \$\{queryFailures\.length\}\/\$\{SC_LIQUOR_STORE_NEAR_ME_TERMS\.length\} bounded terms/);
  assert.match(section, /signals\.length <= 1 && queryFailures\.length < SC_LIQUOR_STORE_NEAR_ME_TERMS\.length/);
});

test('Myrtle Beach CityHive inventory refresh stays inside the public freshness window', () => {
  assert.ok(defaultHours('SC_CITYHIVE_CACHE_MAX_AGE_MS') <= 6, 'SC CityHive cache must refresh at least every six hours');
  assert.equal(defaultNumber('SC_CITYHIVE_MAX_PAGES'), 1, 'one well-covered CityHive category page per merchant avoids request amplification');
});

test('Myrtle Beach live inventory remains a South Carolina release contract', () => {
  assert.match(refreshWorkflow, /states:[\s\S]*description: "Optional comma-separated state ids to refresh"/);
  assert.match(refreshWorkflow, /BOURBON_SIGNAL_RUN_STATES: \$\{\{ inputs\.states \|\| '' \}\}/);
  assert.match(collector, /id: 'beach-discount-beverages'[\s\S]*baseUrl: 'https:\/\/beachdiscountbeverages\.com'[\s\S]*https:\/\/beachdis0402bdcd\.sites\.cityhive\.app\/shop\/\?subtype=bourbon[\s\S]*merchantIds: \['6144e1c2085a5f20a622a15f'\]/);
  assert.match(collector, /id: 'greens-beverage'[\s\S]*https:\/\/greensbeb2c6efe1\.sites\.cityhive\.app\/shop\/\?subtype=bourbon/, "Green's should use the CityHive-hosted first-party storefront route that works from scheduled runners");
  assert.match(collector, /'61e1d04c823936166693c7f3'/, "Green's Myrtle Beach merchant must remain selected");
  assert.match(collector, /id: 'surf-beverage'[\s\S]*https:\/\/surfbeverages\.com\/shop\/\?subtype=bourbon[\s\S]*merchantIds: \['6a0b27396d36df004b28a7ab'\][\s\S]*apiKeyEnv: 'SC_CITYHIVE_SURF_PUBLIC_API_KEY'/);
  assert.match(collector, /id: 'greens-beverage'[\s\S]*apiKeyEnv: 'SC_CITYHIVE_GREENS_PUBLIC_API_KEY'/);
  assert.match(collector, /id: 'beach-discount-beverages'[\s\S]*apiKeyEnv: 'SC_CITYHIVE_BEACH_PUBLIC_API_KEY'/);
  assert.match(refreshWorkflow, /SC_CITYHIVE_SURF_PUBLIC_API_KEY: \$\{\{ secrets\.SC_CITYHIVE_SURF_PUBLIC_API_KEY \}\}/);
  assert.match(refreshWorkflow, /SC_CITYHIVE_GREENS_PUBLIC_API_KEY: \$\{\{ secrets\.SC_CITYHIVE_GREENS_PUBLIC_API_KEY \}\}/);
  assert.match(refreshWorkflow, /SC_CITYHIVE_BEACH_PUBLIC_API_KEY: \$\{\{ secrets\.SC_CITYHIVE_BEACH_PUBLIC_API_KEY \}\}/);
  assert.match(verifier, /Myrtle Beach inventory rows below threshold/);
  assert.match(verifier, /Myrtle Beach fresh inventory rows below threshold/);
  assert.match(verifier, /Myrtle Beach inventory store coverage too low/);
  assert.match(verifier, /Myrtle Beach exported drops below threshold/);
  assert.match(verifier, /Myrtle Beach exported store coverage too low/);
  assert.match(verifier, /myrtleStores\.length < 4/);
  assert.match(verifier, /Missing Surf Beverage Myrtle Beach inventory rows/);
  assert.match(verifier, /exportedMyrtleStores\.length < 1/);
});

test('Myrtle Beach merchants are probed first without widening the statewide CityHive request matrix', () => {
  assert.deepEqual(southCarolinaCityHiveProbePlan(null), []);
  assert.deepEqual(southCarolinaCityHiveProbePlan([{ merchantIds: null, urls: {} }]), []);
  assert.deepEqual(southCarolinaCityHiveProbePlan([{ merchantIds: ['61e1d04c823936166693c7f3'], urls: ['', 'not-a-url', 'http://insecure.example'] }]), []);
  const probes = southCarolinaCityHiveProbePlan();
  const myrtle = probes.filter((probe) => probe.priority === 'myrtle');
  assert.deepEqual(myrtle.map((probe) => probe.merchantId), [
    '6a0b27396d36df004b28a7ab',
    '61e1d04c823936166693c7f3',
    '6144e1c2085a5f20a622a15f',
  ]);
  assert.ok(probes.every((probe) => probe.page === 1));
  assert.ok(myrtle.every((probe) => new URL(probe.url).searchParams.get('merchant-id') === probe.merchantId));
  assert.match(collector, /failedProbeCounts = \{ myrtle: 0, statewide: 0 \}/);
  assert.match(collector, /blockedPriorities\.add\(probe\.priority\)/);
  assert.match(collector, /blockedSourceKeys\.add\(`\$\{probe\.priority\}\|\$\{source\.id\}`\)/);
  assert.match(collector, /typeof option\.full_address === 'string'/);
  assert.match(collector, /parentProductId && parentProductId !== productId/);
  assert.match(collector, /southCarolinaCityHiveMerchantEvidence\(blobs, merchantId\)/);
  assert.match(collector, /completedMerchantIds\.add\(merchantId\)/);
  assert.doesNotMatch(collector, /reachablePageCount \+= 1;\s*completedMerchantIds\.add/);
  assert.match(collector, /completedMerchantIds\.size === configuredProbeCount[\s\S]*writeSouthCarolinaCityHiveCache/);
});

test('CityHive completion requires requested-merchant configuration and product payload proof', () => {
  const merchantA = 'merchant-a';
  const merchantB = 'merchant-b';
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload(null), false);
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload({ requestedMerchantId: { forged: true }, hasProductPayload: true, configuredMerchantIds: [merchantA], payloadMerchantIds: [merchantA] }), false);
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload({ requestedMerchantId: merchantA, hasProductPayload: true, configuredMerchantIds: null, payloadMerchantIds: [merchantA] }), false);
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload({ requestedMerchantId: merchantA, hasProductPayload: true, configuredMerchantIds: [merchantA], payloadMerchantIds: {} }), false);
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload({
    requestedMerchantId: merchantA,
    hasProductPayload: false,
    configuredMerchantIds: [merchantA],
    payloadMerchantIds: [merchantA],
  }), false);
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload({
    requestedMerchantId: merchantA,
    hasProductPayload: true,
    configuredMerchantIds: [merchantB],
    payloadMerchantIds: [merchantB],
  }), false);
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload({
    requestedMerchantId: merchantA,
    hasProductPayload: true,
    configuredMerchantIds: [merchantA, merchantB],
    payloadMerchantIds: [merchantB],
  }), false);
  assert.equal(isAuthoritativeSouthCarolinaCityHiveMerchantPayload({
    requestedMerchantId: merchantA,
    hasProductPayload: true,
    configuredMerchantIds: [merchantA, merchantB],
    payloadMerchantIds: [merchantA, merchantB],
  }), true);
});

test('CityHive public API fallback preserves exact merchant and product-option authority', () => {
  const merchantId = '6a0b27396d36df004b28a7ab';
  const option = {
    merchant_id: merchantId,
    merchant_name: 'Surf Beverage',
    full_address: '3140 US-17, Myrtle Beach, SC 29577, USA',
    product_id: 'product-1',
    option_id: 'option-1',
    quantity: 4,
    option_display_data: { name: 'Booker’s Bourbon 750ml' },
  };
  const payload = {
    result: 0,
    data: {
      products: [{ id: 'product-1', name: 'Booker’s Bourbon 750ml', merchants: [{ product_options: [option] }] }],
    },
  };
  const evidence = southCarolinaCityHiveMerchantEvidence(
    southCarolinaCityHiveApiEvidenceBlobs(payload, merchantId),
    merchantId,
  );
  assert.equal(evidence.authoritative, true);
  assert.equal(evidence.optionRecords.length, 1);
  assert.equal(evidence.optionRecords[0].option, option);
  const pollutedPayload = {
    ...payload,
    data: {
      products: [{
        ...payload.data.products[0],
        merchants: [{ product_options: [
          option,
          { ...option, option_id: 'wrong-parent-option', product_id: 'different-product' },
          { ...option, option_id: 'wrong-merchant-option', merchant_id: 'wrong-merchant' },
        ] }],
      }],
    },
  };
  const filteredBlobs = southCarolinaCityHiveApiEvidenceBlobs(pollutedPayload, merchantId);
  const filteredEvidence = southCarolinaCityHiveMerchantEvidence(filteredBlobs, merchantId);
  assert.equal(filteredEvidence.authoritative, true);
  assert.equal(filteredEvidence.optionRecords.length, 1);
  assert.equal(filteredBlobs[1].products[0].merchants[0].product_options.length, 1);
  const secondPremisePayload = {
    ...payload,
    data: {
      products: [{
        ...payload.data.products[0],
        merchants: [{ product_options: [
          option,
          { ...option, option_id: 'other-premise-option', full_address: '999 Other Rd, Myrtle Beach, SC 29577, USA' },
        ] }],
      }],
    },
  };
  assert.deepEqual(southCarolinaCityHiveApiEvidenceBlobs(secondPremisePayload, merchantId), []);
  assert.equal(southCarolinaCityHiveMerchantEvidence(
    southCarolinaCityHiveApiEvidenceBlobs(payload, 'wrong-merchant'),
    'wrong-merchant',
  ).authoritative, false);
  assert.deepEqual(southCarolinaCityHiveApiEvidenceBlobs({ ...payload, result: 2 }, merchantId), []);
  assert.deepEqual(southCarolinaCityHiveApiEvidenceBlobs({ result: 0, data: { products: {} } }, merchantId), []);
  assert.doesNotMatch(collector, /for \(const record of evidence\.optionRecords\)/);
});

test('authoritative zero-relevant API completion survives a blocked storefront without inventing inventory', () => {
  const apiBlobs = [{ merchant_configs: [] }, { products: [] }];
  const apiEvidence = { authoritative: true, merchants: [{ id: 'merchant' }], optionRecords: [] };
  const resolved = resolveSouthCarolinaCityHiveProbePayload({
    apiAttempt: { ok: true, status: 200, publicUrl: 'https://api.cityhive.net/api/v1/products/search.json', blobs: apiBlobs },
    apiEvidence,
    useApiEvidence: false,
    pageAttempt: { ok: false, status: 403, error: 'HTTP 403' },
    pageUrl: 'https://retailer.example/shop/',
  });
  assert.equal(resolved.blobs, apiBlobs);
  assert.equal(resolved.evidence, apiEvidence);
  assert.equal(resolved.transportFailure, null);
  assert.equal(resolved.evidenceUrl, 'https://api.cityhive.net/api/v1/products/search.json');

  const malformedPage = resolveSouthCarolinaCityHiveProbePayload({
    apiAttempt: { ok: true, status: 200, publicUrl: 'https://api.cityhive.net/api/v1/products/search.json', blobs: apiBlobs },
    apiEvidence,
    useApiEvidence: false,
    pageAttempt: { ok: true, status: 200 },
    pageBlobs: [{ malformed: true }],
    pageEvidence: { authoritative: false },
    pageUrl: 'https://retailer.example/shop/',
  });
  assert.equal(malformedPage.blobs, apiBlobs);
  assert.equal(malformedPage.evidence, apiEvidence);
  assert.equal(malformedPage.transportFailure, null);

  const failed = resolveSouthCarolinaCityHiveProbePayload({
    apiAttempt: { ok: true, status: 200, publicUrl: 'https://api.cityhive.net/api/v1/products/search.json', blobs: apiBlobs },
    apiEvidence: { authoritative: false },
    useApiEvidence: false,
    pageAttempt: { ok: false, status: 403, error: 'HTTP 403' },
    pageUrl: 'https://retailer.example/shop/',
  });
  assert.equal(failed.blobs, null);
  assert.equal(failed.transportFailure.status, 403);
});

test('CityHive completion merchant extraction fails closed on malformed and incomplete option payloads', () => {
  assert.deepEqual(southCarolinaCityHiveBoundMerchantIds(null), []);
  assert.deepEqual(southCarolinaCityHiveBoundMerchantIds([{ merchants: {} }, { merchants: [{ product_options: {} }] }]), []);
  assert.deepEqual(southCarolinaCityHiveBoundMerchantIds([{ merchants: [{ product_options: [null,
    { merchant_id: { forged: true }, product_id: { forged: true }, option_id: { forged: true } },
    { merchant_id: 'merchant-a', product_id: '', option_id: 'option-a' },
    { merchant_id: 'merchant-b', product_id: 'product-b', option_id: '' },
  ] }] }]), []);
  assert.deepEqual(southCarolinaCityHiveBoundMerchantIds([{ merchants: [{ product_options: [null,
    { merchant_id: 'merchant-a', product_id: 'product-a', option_id: 'option-a' },
    { merchant_id: 'merchant-a', product_id: 'product-a', option_id: 'option-a' },
  ] }] }]), ['merchant-a']);
});

test('South Carolina CityHive evidence traversal is bounded and preserves requested merchant page provenance', () => {
  const merchantId = 'merchant-a';
  const merchant = { id: merchantId, display_name: 'Surf Beverage', address: { state: 'SC', full_address: '3140 US-17, Myrtle Beach, SC 29577' } };
  const option = { merchant_id: merchantId, product_id: 'product-a', option_id: 'option-a', full_address: '3140 US-17, Myrtle Beach, SC 29577' };
  const product = { id: 'product-a', name: 'Buffalo Trace Bourbon', basic_category: 'Bourbon', product_options: [option] };
  const evidence = southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [product] } }], merchantId, null);
  assert.equal(evidence.authoritative, true);
  assert.equal(evidence.merchants[0], merchant);
  assert.equal(evidence.options[0], option);
  assert.equal(evidence.optionRecords[0].product, product);
  const merchantWrappedProduct = { id: 'product-a', name: 'Buffalo Trace Bourbon', basic_category: 'Bourbon', merchants: [{ product_options: [option] }] };
  const wrappedEvidence = southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [merchantWrappedProduct] } }], merchantId);
  assert.equal(wrappedEvidence.authoritative, true);
  assert.equal(wrappedEvidence.optionRecords[0].product, merchantWrappedProduct);
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [product] } }], merchantId).authoritative, true);
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [{ ...product, id: 'other-product' }] } }], merchantId).authoritative, false);
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [{ ...product, id: { forged: true } }] } }], merchantId).authoritative, false);
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [{ id: 'product-a', metadata: { product_options: [option] } }] } }], merchantId).authoritative, false);
  const mismatchedOption = { ...option, full_address: '100 Main St, Columbia, SC 29201' };
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [{ product_options: [mismatchedOption] }] } }], merchantId).authoritative, false);
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant] }, { payload: { products: [{ product_options: [option] }] } }], merchantId).authoritative, true);
  const sparse = new Array(3);
  sparse[2] = { merchant_configs: [merchant] };
  assert.equal(southCarolinaCityHiveMerchantEvidence(sparse, merchantId).authoritative, false);
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [{ product_options: [option] }] } }], 'merchant-b').authoritative, false);
  assert.equal(southCarolinaCityHiveMerchantEvidence([{ merchant_configs: [merchant], payload: { products: [{ product_options: [option] }] } }], merchantId, { maxNodes: 1 }).truncated, true);
});

test('Grand Strand store universe expands without overstating static storefronts', () => {
  const grandStrandCities = new Set(['Myrtle Beach', 'North Myrtle Beach', 'Surfside Beach', 'Murrells Inlet']);
  const stores = storeUniverse.stores.filter((store) => grandStrandCities.has(store.city));
  assert.ok(stores.length >= 13, `expected at least 13 Grand Strand stores, got ${stores.length}`);
  const surf = stores.find((store) => store.id === 'surf-beverage:6a0b27396d36df004b28a7ab');
  assert.equal(surf?.inventoryStatus, 'live-inventory');
  for (const name of ['Myrtle Beach Liquor', 'Gator Hole Spirits II', 'Gator Hole Spirits III', 'Ocean Liquors', 'Hurricane Liquor', 'Surfside Beach Liquors']) {
    const store = stores.find((row) => row.name === name);
    assert.ok(store, `missing ${name}`);
    assert.notEqual(store.inventoryStatus, 'live-inventory', `${name} must not be promoted without bottle-level availability`);
  }
});

test('targeted South Carolina expansion forces a complete bounded first-party source pass', () => {
  assert.match(refreshWorkflow, /BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE:[^\n]*contains\(inputs\.states, 'SC'\)[^\n]*'1'/);
  assert.match(refreshWorkflow, /BOURBON_SIGNAL_SC_FORCE_PHASE1_LIVE:[^\n]*contains\(inputs\.states, 'SC'\)[^\n]*'1'/);
  assert.match(collector, /async function collectSouthCarolina[\s\S]*runBoundedSourceLanes\(\[/);
  assert.match(collector, /\{ name: 'cityhive', domain: 'sc-cityhive-group'/);
  assert.match(collector, /\{ name: 'all-american', domain: 'aalmauldin\.com'/);
  assert.match(collector, /stateKey === 'SC' \? 420_000/);
  assert.match(liveProbe, /state !== 'FL' && state !== 'SC'/);
  assert.match(liveProbe, /BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE: state === 'SC' \? '1'/);
  assert.match(liveProbe, /state === 'SC'[\s\S]*score-sc-user-reach\.mjs/);
  assert.match(collector, /SC_CITYHIVE_EXCLUDED_EXPANSION_MERCHANT_IDS/);
  assert.match(collector, /cachedSouthCarolinaCityHiveSignals[\s\S]*SC_CITYHIVE_INVENTORY_MERCHANT_IDS\.has/);
  assert.match(collector, /Da Brown Bag searches failed for \$\{failures\.length\}/);
  assert.doesNotMatch(verifier, /Missing Da Brown Bag Clover inventory rows/);
  assert.match(refreshWorkflow, /Verify complete targeted South Carolina inventory[\s\S]*npm run verify:sc/);
  assert.match(liveProbe, /process\.env\.GH_TOKEN \|\| process\.env\.GITHUB_TOKEN/);
});

function validCityHiveSignal(overrides = {}) {
  const merchantId = '61dc4ab6a1d5721307e9c20e';
  const productId = '5521cef065613100036e0000';
  const optionId = '4d23517a3d7cce00e2ed4044a2b7be75f5c9cb9f01366ef0efa59e03309fdd97';
  return {
    state: 'SC', stateCode: 'SC', eventType: 'cityhive_store_inventory_result',
    sourceLabel: "Green's Beverage South Carolina CityHive store inventory",
    sourceUrl: `https://greensbeverages.com/shop/product/bulleit-bourbon/${productId}?option-id=${optionId}`,
    sourceChain: 'greens-beverage', merchantId, productId, optionId,
    canonicalBottleId: 'bulleit-bourbon', locationPrecision: 'store_level',
    storeId: `greens-beverage:${merchantId}`, storeName: "Green's Beverage",
    storeAddress: '400 Assembly St, Columbia, SC 29201',
    quantity: 0, quantityIsExact: false, availabilityStatus: 'binary_retailer_in_stock',
    sourceAvailabilityVerified: true, canAlertAsInventory: true, canAlertAsWatch: true,
    observedAt: new Date().toISOString(),
    raw: { chain: 'greens-beverage', option: { merchant_id: merchantId, product_id: productId, option_id: optionId } },
    ...overrides,
  };
}

test('South Carolina CityHive policy rejects forged source, merchant, product, option, host, and quantity bindings', () => {
  const valid = validCityHiveSignal();
  assert.equal(isSouthCarolinaCityHiveInventory(valid), true);
  const { raw, optionId, ...normalized } = valid;
  assert.equal(isSouthCarolinaCityHiveInventory({ ...normalized, variantId: optionId, sourceProductProofId: valid.productId }), true);
  const publicDrop = { ...normalized, id: 'sc-cityhive-binary', eventType: undefined, type: valid.eventType, variantId: optionId, sourceProductProofId: valid.productId, tier: 'allocated' };
  assert.equal(isSouthCarolinaCityHiveInventory(publicDrop), true);
  const alerts = buildCurrentInventoryAlertsFromDrops([publicDrop]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].eligibleForEmail, false);
  assert.equal(alerts[0].eligibleForSms, false);
  assert.equal(alerts[0].sendRecommendation, 'display_on_site_until_change_detected');
  assert.ok(alerts[0].gates.includes('verified_binary_in_store_availability'));
  for (const forged of [
    { sourceChain: 'wine-bourbon-barn' },
    { sourceLabel: 'Generic CityHive inventory' },
    { sourceUrl: 'https://evil.example/shop/product/bottle' },
    { merchantId: '607f9bdbb73eb4091ef976e7' },
    { productId: '' },
    { optionId: '' },
    { quantity: 1 },
    { quantityIsExact: true },
    { sourceAvailabilityVerified: false },
    { raw: undefined, variantId: valid.optionId, sourceProductProofId: 'forged' },
    { raw: { chain: 'greens-beverage', option: { merchant_id: valid.merchantId, product_id: 'forged', option_id: valid.optionId } } },
  ]) assert.equal(isSouthCarolinaCityHiveInventory({ ...valid, ...forged }), false);
});

test('Surf Beverage exact-store CityHive rows pass the South Carolina proof contract', () => {
  const merchantId = '6a0b27396d36df004b28a7ab';
  const productId = '5521cef065613100036c0000';
  const optionId = '71749b184cecfd234aaf9a96879b65ae10b91c0e3d5ea5c3d9fe48e5a42c97f5';
  const signal = validCityHiveSignal({
    sourceLabel: 'Surf Beverage South Carolina CityHive store inventory',
    sourceUrl: `https://surfbeverages.com/shop/product/buffalo-trace-bourbon/${productId}?option-id=${optionId}`,
    sourceChain: 'surf-beverage',
    merchantId,
    productId,
    optionId,
    storeId: `surf-beverage:${merchantId}`,
    storeName: 'Surf Beverage',
    storeAddress: '3140 US-17, Myrtle Beach, SC 29577, USA',
    city: 'Myrtle Beach',
    postalCode: '29577',
    zip: '29577',
    raw: { chain: 'surf-beverage', option: { merchant_id: merchantId, product_id: productId, option_id: optionId } },
  });
  assert.equal(isSouthCarolinaCityHiveInventory(signal), true);
  assert.equal(isSouthCarolinaCityHiveInventory({ ...signal, storeAddress: '3140 US-17, Myrtle Beach, SC 29577' }), true);
  for (const forged of [
    { storeName: 'Forged Surf Beverage' },
    { storeAddress: '100 Main St, Columbia, SC 29201' },
    { city: 'Columbia' },
    { city: 'Myrtle Beach USA' },
    { storeName: 'Surf Beverage USA' },
    { postalCode: '29201', zip: '29201' },
    { storeName: ['Surf Beverage'], locationName: ['Surf Beverage'] },
    { city: ['Myrtle Beach'] },
    { postalCode: ['29577'], zip: ['29577'] },
    { storeName: 0, locationName: 'Surf Beverage' },
    { postalCode: false, zip: '29577' },
    { locationName: 'Forged Surf Beverage' },
    { zip: '00000' },
    { eventType: { forged: true } },
    { canonicalBottleId: { forged: true } },
    { type: 'forged_cityhive_event' },
    { canonicalId: 'forged-bottle' },
    { variantId: 'forged-option' },
    { sourceProductProofId: 'forged-product' },
    { productId: { forged: true }, optionId: { forged: true }, raw: { chain: 'surf-beverage', option: { merchant_id: merchantId, product_id: { forged: true }, option_id: { forged: true } } } },
    { raw: { chain: 'surf-beverage', option: null }, sourceProductProofId: productId, variantId: optionId },
  ]) assert.equal(isSouthCarolinaCityHiveInventory({ ...signal, ...forged }), false);
});

test('partial South Carolina CityHive success retains untouched cached merchants as stale non-alerting context', () => {
  assert.deepEqual(mergeSouthCarolinaCityHiveSignals(null), []);
  assert.deepEqual(mergeSouthCarolinaCityHiveSignals({ liveSignals: null, completedMerchantIds: [] }), []);
  assert.deepEqual(mergeSouthCarolinaCityHiveSignals({ liveSignals: [null, undefined], completedMerchantIds: [] }), []);
  const observedAt = new Date().toISOString();
  const liveMerchantId = '61e1d04c823936166693c7f3';
  const live = validCityHiveSignal({
    observedAt,
    id: 'test-greens-myrtle-live',
    merchantId: liveMerchantId,
    storeId: `greens-beverage:${liveMerchantId}`,
    raw: { chain: 'greens-beverage', option: { merchant_id: liveMerchantId, product_id: '5521cef065613100036e0000', option_id: '4d23517a3d7cce00e2ed4044a2b7be75f5c9cb9f01366ef0efa59e03309fdd97' } },
  });
  const collision = mergeSouthCarolinaCityHiveSignals({
    liveSignals: [{ id: live.id, storeId: live.storeId, eventType: 'cityhive_store_inventory_result' }],
    cache: { generatedAt: observedAt, signals: [live] },
    completedMerchantIds: [],
    observedAt,
  });
  assert.equal(collision[0]?.sourceStale, true);
  assert.equal(collision[0]?.productId, live.productId);
  const spoofedChain = mergeSouthCarolinaCityHiveSignals({
    liveSignals: [{ ...live, sourceChain: 'forged-chain', storeId: `forged-chain:${liveMerchantId}` }],
    cache: { generatedAt: observedAt, signals: [live] },
    completedMerchantIds: [],
    observedAt,
  });
  assert.equal(spoofedChain[0]?.sourceStale, true);
  assert.equal(spoofedChain[0]?.sourceChain, 'greens-beverage');
  const surf = validCityHiveSignal({
    observedAt,
    sourceLabel: 'Surf Beverage South Carolina CityHive store inventory',
    sourceUrl: 'https://surfbeverages.com/shop/product/buffalo-trace-bourbon/5521cef065613100036c0000?option-id=71749b184cecfd234aaf9a96879b65ae10b91c0e3d5ea5c3d9fe48e5a42c97f5',
    sourceChain: 'surf-beverage', merchantId: '6a0b27396d36df004b28a7ab',
    productId: '5521cef065613100036c0000', optionId: '71749b184cecfd234aaf9a96879b65ae10b91c0e3d5ea5c3d9fe48e5a42c97f5',
    storeId: 'surf-beverage:6a0b27396d36df004b28a7ab', storeName: 'Surf Beverage',
    storeAddress: '3140 US-17, Myrtle Beach, SC 29577, USA', city: 'Myrtle Beach', postalCode: '29577', zip: '29577',
    raw: { chain: 'surf-beverage', option: { merchant_id: '6a0b27396d36df004b28a7ab', product_id: '5521cef065613100036c0000', option_id: '71749b184cecfd234aaf9a96879b65ae10b91c0e3d5ea5c3d9fe48e5a42c97f5' } },
  });
  const merged = mergeSouthCarolinaCityHiveSignals({
    liveSignals: [live],
    cache: { generatedAt: observedAt, signals: [live, surf] },
    completedMerchantIds: [live.merchantId],
    observedAt,
  });
  assert.equal(merged.length, 2);
  assert.equal(merged.find((row) => row.merchantId === live.merchantId)?.sourceStale, undefined);
  const retained = merged.find((row) => row.merchantId === surf.merchantId);
  assert.equal(retained?.sourceStale, true);
  assert.equal(retained?.canAlertAsInventory, false);
  assert.equal(retained?.canAlertAsWatch, false);
});

test('South Carolina CityHive cache rejects future and legacy rows and demotes failed-live fallback', () => {
  const now = Date.now();
  assert.equal(isFreshSouthCarolinaCityHiveCacheTimestamp(new Date(now + 6 * 60_000).toISOString(), now), false);
  assert.equal(isFreshSouthCarolinaCityHiveCacheTimestamp(new Date(now - 60_000).toISOString(), now), true);
  const valid = validCityHiveSignal();
  const location = {
    eventType: 'retailer_store_location',
    storeId: valid.storeId,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    raw: { chain: valid.sourceChain, merchant: { id: valid.merchantId } },
  };
  const retained = cachedSouthCarolinaCityHiveSignals({ generatedAt: valid.observedAt, signals: [valid, { ...valid, optionId: '' }, location] }, valid.observedAt, { sourceStale: true });
  assert.equal(retained.length, 2);
  assert.equal(retained[0].sourceStale, true);
  assert.equal(retained[0].canAlertAsInventory, false);
  assert.equal(retained[0].canAlertAsWatch, false);
  assert.equal(retained[1].eventType, 'retailer_store_location');
});

test('one South Carolina source exception is isolated as a roadblock', async () => {
  const result = await runIsolatedSouthCarolinaSourceLane({ name: 'test-source', source: 'Test source', run: async () => { throw new Error('offline'); } }, { id: 'SC' });
  assert.deepEqual(result.signals, []);
  assert.equal(result.roadblocks.length, 1);
  assert.equal(result.roadblocks[0].status, 'source_exception');
  assert.match(result.roadblocks[0].error, /without stopping the remaining South Carolina sources/);
});
