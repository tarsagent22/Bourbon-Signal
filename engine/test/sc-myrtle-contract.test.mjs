import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  cityHiveSafeBottleMatch,
  southCarolinaCityHiveBottleMatch,
  isSafeSouthCarolinaCityHiveBottleOption,
  shouldBlockSouthCarolinaCityHivePriority,
  fetchSouthCarolinaCityHivePublicApi,
  shouldAttemptSouthCarolinaCityHiveStorefrontFallback,
} from '../src/collectors/precision-probes.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
import { isSouthCarolinaCityHiveInventory } from '../src/south-carolina-retailer-policy.mjs';

const collector = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../src/verify-sc.mjs', import.meta.url), 'utf8');
const refreshWorkflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
const liveProbe = readFileSync(new URL('../../scripts/run-state-expansion-live-probe.mjs', import.meta.url), 'utf8');
const storeUniverse = JSON.parse(readFileSync(new URL('../data/store-universe/SC.json', import.meta.url), 'utf8'));
const inventoryBaseline = JSON.parse(readFileSync(new URL('../data/south-carolina-inventory-baseline.json', import.meta.url), 'utf8'));
const allocatedCityHiveCapture = JSON.parse(readFileSync(new URL('./fixtures/sc/allocated-cityhive-live.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));

function defaultHours(constantName) {
  const match = collector.match(new RegExp(`const ${constantName} = Number\\(process\\.env\\.[A-Z0-9_]+ \\|\\| (\\d+) \\* 60 \\* 60_000\\)`));
  assert.ok(match, `missing hour-based default for ${constantName}`);
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
  assert.match(collector, /SC_CITYHIVE_MAX_PAGES = Math\.max\(1, Math\.min\(3,[^\n]+\|\| 3\)\)/, 'three-probe default and hard maximum must remain bounded');
});

test('South Carolina expansion pins the complete 20-store production baseline and 22-store release floor', () => {
  assert.equal(inventoryBaseline.storeCount, 20);
  assert.equal(new Set(inventoryBaseline.stores.map((row) => row.storeId)).size, 20);
  const canonical = inventoryBaseline.stores.map((row) => `${row.storeId}|${row.storeName}|${row.storeAddress}`).join('\n');
  assert.equal(createHash('sha256').update(canonical).digest('hex'), '3a018509578df19765f5751777dfcde5f1d2de63cded8ec7f56f659b83cf7a89');
  assert.match(verifier, /South Carolina inventory expansion below 22-store floor/);
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

test('Myrtle Beach merchants are probed first with a strict three-request single-family rotation', () => {
  assert.deepEqual(southCarolinaCityHiveProbePlan(null), []);
  assert.deepEqual(southCarolinaCityHiveProbePlan([{ merchantIds: null, urls: {} }]), []);
  assert.deepEqual(southCarolinaCityHiveProbePlan([{ merchantIds: ['61e1d04c823936166693c7f3'], urls: ['', 'not-a-url', 'http://insecure.example'] }]), []);
  const probes = southCarolinaCityHiveProbePlan(undefined, allocatedCityHiveCapture.capturedAt);
  const myrtle = probes.filter((probe) => probe.priority === 'myrtle');
  assert.deepEqual([...new Set(myrtle.map((probe) => probe.merchantId))], [
    '6a0b27396d36df004b28a7ab',
    '61e1d04c823936166693c7f3',
    '6144e1c2085a5f20a622a15f',
  ]);
  assert.ok(probes.every((probe) => probe.page >= 1 && probe.page <= 3));
  for (const merchantId of new Set(probes.map((probe) => probe.merchantId))) {
    const merchantProbes = probes.filter((probe) => probe.merchantId === merchantId);
    assert.equal(merchantProbes.length, 3);
    assert.equal(merchantProbes[0].apiSearchText, 'bourbon');
    assert.equal(merchantProbes[1].apiSearchText, 'rye');
    assert.equal(new Set(merchantProbes.map((probe) => probe.apiSearchText)).size, 3);
    assert.deepEqual(merchantProbes.map((probe) => new URL(probe.url).searchParams.get('skip')), [null, '18', '36']);
  }
  const nextCadence = southCarolinaCityHiveProbePlan(undefined, new Date(Date.parse(allocatedCityHiveCapture.capturedAt) + 6 * 60 * 60_000).toISOString());
  assert.equal(nextCadence.length, probes.length);
  assert.ok(probes.every((probe) => /^(?:bourbon|rye|[a-z]+(?: [a-z]+)?)$/.test(probe.apiSearchText)));
  assert.ok(nextCadence.some((probe, index) => probe.page === 3 && probe.apiSearchText !== probes[index].apiSearchText));
  assert.ok(myrtle.every((probe) => new URL(probe.url).searchParams.get('merchant-id') === probe.merchantId));
  assert.match(collector, /failedPrioritySources = \{ myrtle: new Set\(\), statewide: new Set\(\) \}/);
  assert.match(collector, /failedPrioritySources\[priority\]\.add\(sourceId\)/);
  assert.match(collector, /blockedPriorities\.add\(priority\)/);
  assert.match(collector, /blockedSourceKeys\.add\(source\.id\)/);
  assert.match(collector, /blockedSourceKeys\.has\(source\.id\) \|\| failedMerchantIds\.has\(merchantId\)/);
  assert.match(collector, /failedMerchantIds\.add\(merchantId\)/);
  assert.match(collector, /typeof option\.full_address === 'string'/);
  assert.match(collector, /parentProductId && parentProductId !== productId/);
  assert.match(collector, /southCarolinaCityHiveMerchantEvidence\(blobs, merchantId\)/);
  assert.match(collector, /successfulProbeCount === SC_CITYHIVE_MAX_PAGES\) completedMerchantIds\.add\(merchantId\)/);
  assert.doesNotMatch(collector, /reachablePageCount \+= 1;\s*completedMerchantIds\.add/);
  assert.match(collector, /completedMerchantIds\.size === configuredProbeCount[\s\S]*writeSouthCarolinaCityHiveCache/);
});

test('captured CityHive API responses prove page-one loss and expanded bourbon plus rye detector breadth', () => {
  assert.equal(allocatedCityHiveCapture.schemaVersion, 'bourbon-signal-sc-cityhive-api-capture-v1');
  assert.equal(allocatedCityHiveCapture.baseline.rawProductCount, 30);
  assert.equal(allocatedCityHiveCapture.baseline.confirmedMissingNames.length, 5);
  const merchantId = allocatedCityHiveCapture.merchant.merchantId;
  const parsed = [];
  for (const capture of [allocatedCityHiveCapture.baseline, ...allocatedCityHiveCapture.expandedResponses]) {
    assert.match(capture.rawSha256, /^[a-f0-9]{64}$/);
    const blobs = southCarolinaCityHiveApiEvidenceBlobs(capture.response, merchantId);
    const evidence = southCarolinaCityHiveMerchantEvidence(blobs, merchantId);
    assert.equal(evidence.authoritative, true, `${capture.searchText} lost exact merchant/premise binding`);
    for (const { option, product } of evidence.optionRecords) {
      assert.equal(option.merchant_id, merchantId);
      assert.equal(option.full_address, allocatedCityHiveCapture.merchant.address);
      assert.equal(option.product_id, product.id);
      assert.ok(Number.isInteger(option.quantity) && option.quantity > 0);
      assert.match(JSON.stringify([product.basic_category, option.option_display_data?.basic_category]), /bourbon|rye|whiskey/i);
      parsed.push({ searchText: capture.searchText, name: option.option_display_data?.name || product.name, match: southCarolinaCityHiveBottleMatch(option.option_display_data?.name || product.name, bible) });
    }
  }
  assert.ok(parsed.some((row) => row.searchText === 'rye' && /rye/i.test(row.name)));
  for (const family of ['Elijah Craig', 'Wild Turkey']) {
    const row = parsed.find((candidate) => candidate.name.includes(family));
    assert.ok(row, `missing captured ${family} response`);
    assert.ok(row.match?.record, `${family} must survive the production Bottle Bible guard`);
  }
  for (const family of ['Larceny', 'Jack Daniel', 'Four Roses']) {
    const row = parsed.find((candidate) => candidate.name.includes(family));
    assert.ok(row, `missing captured ${family} response`);
    assert.equal(row.match?.record || null, null, `${family} must not be forced onto a different canonical bottle while the catalog lacks the exact expression`);
  }

  const capturedElijah = allocatedCityHiveCapture.expandedResponses.find((row) => row.searchText === 'elijah craig');
  const forged = structuredClone(capturedElijah.response);
  const option = forged.data.products[0].merchants[0].product_options[0];
  option.merchant_id = 'merchant-mismatch';
  assert.deepEqual(southCarolinaCityHiveApiEvidenceBlobs(forged, merchantId), []);
  option.merchant_id = merchantId;
  option.quantity = 0;
  const zeroEvidence = southCarolinaCityHiveMerchantEvidence(southCarolinaCityHiveApiEvidenceBlobs(forged, merchantId), merchantId);
  assert.equal(zeroEvidence.authoritative, true);
  assert.equal(zeroEvidence.options[0].quantity, 0);
  option.quantity = 1;
  option.option_id = '';
  assert.deepEqual(southCarolinaCityHiveApiEvidenceBlobs(forged, merchantId), []);
});

test('CityHive bottle format and source-failure budgets fail closed without retailer-wide starvation', () => {
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '750', measure: 'ml' } } }, "Booker's Bourbon"), true);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '1.75', measure: 'L' } } }, 'Wild Turkey Rare Breed'), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '50', measure: 'ml' } } }, "Booker's Bourbon"), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '750', measure: 'ml' } } }, "Booker's Bourbon 50ml"), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '750', measure: 'ml' } } }, "Booker's Bourbon 1L"), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({}, "Booker's Bourbon"), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '12', measure: 'ct' } } }, "Booker's Bourbon"), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '50', measure: '' } } }, "Booker's Bourbon 50ml"), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '750', measure: 'ml' } } }, "Booker's Bourbon 3 Pack"), false);
  assert.equal(isSafeSouthCarolinaCityHiveBottleOption({ option_params: { size: { quantity: '0', measure: 'ml' } } }, "Booker's Bourbon"), false);

  // Repeated 429/transport failures from one chain consume one source slot; a
  // second distinct failing chain closes that priority lane at the existing cap.
  assert.equal(shouldBlockSouthCarolinaCityHivePriority(['greens-beverage']), false);
  assert.equal(shouldBlockSouthCarolinaCityHivePriority(['greens-beverage', 'greens-beverage']), false);
  assert.equal(shouldBlockSouthCarolinaCityHivePriority(['greens-beverage', 'wine-bourbon-barn']), true);
});

test('CityHive API 429 remains terminal even when storefront fallback fails or returns unusable HTTP 200', () => {
  assert.equal(shouldAttemptSouthCarolinaCityHiveStorefrontFallback({ ok: false, status: 429 }), false);
  assert.equal(shouldAttemptSouthCarolinaCityHiveStorefrontFallback({ ok: false, status: 0 }), true);
  for (const pageAttempt of [
    { ok: false, status: 0, error: 'network failure' },
    { ok: true, status: 200, text: '<html>not authoritative</html>' },
  ]) {
    const resolved = resolveSouthCarolinaCityHiveProbePayload({
      apiAttempt: { ok: false, status: 429, error: 'rate limited', publicUrl: 'https://api.cityhive.net/api/v1/products/search.json' },
      pageAttempt,
      pageBlobs: pageAttempt.ok ? [] : null,
      pageEvidence: pageAttempt.ok ? { authoritative: false } : null,
      pageUrl: 'https://retailer.example/shop/',
    });
    assert.equal(resolved.blobs, null);
    assert.equal(resolved.transportFailure.status, 429);
    assert.match(resolved.transportFailure.error, /rate limited/i);
  }
});

test('shared CityHive matcher baseline rejects SC-only abbreviations and dangerous suffix stripping', () => {
  for (const rawName of [
    'Elijah Craig Barrel Proof Store Pick Gift Set',
    'Elijah Craig Barrel Proof Store Pick 18 Year',
    'Four Roses Single Barrel OBSK Recipe Only',
    'Four Roses Single Barrel OBSK 50ml',
  ]) assert.equal(cityHiveSafeBottleMatch(rawName, bible).record, null, rawName);
  assert.equal(southCarolinaCityHiveBottleMatch('Elijah Craig Barrel Proof Store Pick', bible).record?.canonical, 'Elijah Craig Barrel Proof');
  assert.equal(southCarolinaCityHiveBottleMatch('Four Roses Sngl Brl Obsk', bible).record, null, 'recipe code and single barrel do not prove barrel strength');
});

test('CityHive API transport sends the planned family query and returns merchant-bound evidence', async () => {
  const capture = allocatedCityHiveCapture.expandedResponses.find((row) => row.searchText === 'elijah craig');
  const envName = 'SC_CITYHIVE_TEST_PUBLIC_API_KEY';
  const priorKey = process.env[envName];
  const priorFetch = globalThis.fetch;
  let requestedUrl = null;
  process.env[envName] = 'fixture-public-key';
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(String(url));
    return new Response(JSON.stringify(capture.response), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await fetchSouthCarolinaCityHivePublicApi({
      apiKeyEnv: envName,
      apiClientOrigin: 'app://sites.fixture',
      apiClientOriginUrl: 'https://retailer.example/shop/',
    }, allocatedCityHiveCapture.merchant.merchantId, { searchText: 'elijah craig' });
    assert.equal(result.ok, true);
    assert.equal(requestedUrl.origin, 'https://api.cityhive.net');
    assert.equal(requestedUrl.searchParams.get('text'), 'elijah craig');
    assert.equal(requestedUrl.searchParams.get('merchant_id'), allocatedCityHiveCapture.merchant.merchantId);
    assert.ok(result.blobs.length >= 2);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey == null) delete process.env[envName];
    else process.env[envName] = priorKey;
  }
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
  assert.match(collector, /SC_CITYHIVE_EXCLUDED_EXPANSION_MERCHANT_IDS = new Set\(\)/);
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
    raw: { chain: 'greens-beverage', reportedQuantity: 100, binaryAvailability: true, option: { merchant_id: merchantId, merchant_name: "Green's Beverage", full_address: '400 Assembly St, Columbia, SC 29201', quantity: 100, product_id: productId, option_id: optionId } },
    ...overrides,
  };
}

test("reviewed O'Darby's Heckle and Riverchase merchants pass exact premise and quantity policy", () => {
  for (const store of [
    { merchantId: '607f9bdbb73eb4091ef976e7', name: "O'Darby's Heckle", address: '1740 Heckle Blvd, Rock Hill, SC 29732, USA' },
    { merchantId: '607f1c35f568f15818499db8', name: "O'Darby's Riverchase", address: '1421 Riverchase Blvd, Rock Hill, SC 29732, USA' },
  ]) {
    const productId = '56c26aa075627570b0070000';
    const optionId = '616cdd37627f3bf97233606fd49ef7d88342fab27f82fe39106de468fbe3cd47';
    const signal = validCityHiveSignal({
      sourceLabel: "O'Darby's Liquor Barn South Carolina CityHive store inventory",
      sourceUrl: `https://odarbysliquorbarn.com/shop/product/angels-envy-kentucky-straight-bourbon-whiskey/${productId}?option-id=${optionId}`,
      sourceChain: 'odarbys-liquor-barn', merchantId: store.merchantId, productId, optionId,
      storeId: `odarbys-liquor-barn:${store.merchantId}`, storeName: store.name, locationName: store.name,
      storeAddress: store.address, city: 'Rock Hill', postalCode: '29732', zip: '29732',
      quantity: 7, quantityIsExact: true, availabilityStatus: 'in_stock',
      raw: { chain: 'odarbys-liquor-barn', reportedQuantity: 7, binaryAvailability: false, product: { id: productId }, option: { merchant_id: store.merchantId, merchant_name: store.name, full_address: store.address, quantity: 7, product_id: productId, option_id: optionId } },
    });
    assert.equal(isSouthCarolinaCityHiveInventory(signal), true);
    assert.equal(isSouthCarolinaCityHiveInventory({ ...signal, storeAddress: '100 Main St, Rock Hill, SC 29732' }), false);
    assert.equal(isSouthCarolinaCityHiveInventory({ ...signal, quantity: 0 }), false);
    const rawOverride = (option, raw = {}) => ({ ...signal, raw: { ...signal.raw, ...raw, option: { ...signal.raw.option, ...option } } });
    assert.equal(isSouthCarolinaCityHiveInventory(rawOverride({ full_address: '100 Main St, Rock Hill, SC 29732' })), false);
    assert.equal(isSouthCarolinaCityHiveInventory(rawOverride({ merchant_name: 'Forged Store' })), false);
    assert.equal(isSouthCarolinaCityHiveInventory(rawOverride({ quantity: 8 })), false);
    assert.equal(isSouthCarolinaCityHiveInventory(rawOverride({ quantity: '7' })), false);
    assert.equal(isSouthCarolinaCityHiveInventory(rawOverride({ quantity: true })), false);
    assert.equal(isSouthCarolinaCityHiveInventory(rawOverride({ quantity: 7.5 }, { reportedQuantity: 7.5 })), false);
    assert.equal(isSouthCarolinaCityHiveInventory(rawOverride({ quantity: 1000 }, { reportedQuantity: 1000, binaryAvailability: true })), false);
    assert.equal(isSouthCarolinaCityHiveInventory({ ...signal, quantity: '7' }), false);
    assert.equal(isSouthCarolinaCityHiveInventory({ ...signal, quantity: true }), false);
    assert.equal(isSouthCarolinaCityHiveInventory({ ...signal, quantity: 7.5, raw: { ...signal.raw, reportedQuantity: 7.5, option: { ...signal.raw.option, quantity: 7.5 } } }), false);
  }
});

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
    raw: { chain: 'surf-beverage', reportedQuantity: 100, binaryAvailability: true, option: { merchant_id: merchantId, merchant_name: 'Surf Beverage', full_address: '3140 US-17, Myrtle Beach, SC 29577, USA', quantity: 100, product_id: productId, option_id: optionId } },
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
