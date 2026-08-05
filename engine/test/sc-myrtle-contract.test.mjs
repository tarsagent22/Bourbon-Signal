import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  cachedSouthCarolinaCityHiveSignals,
  isFreshSouthCarolinaCityHiveCacheTimestamp,
  runIsolatedSouthCarolinaSourceLane,
} from '../src/collectors/precision-probes.mjs';
import { buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
import { isSouthCarolinaCityHiveInventory } from '../src/south-carolina-retailer-policy.mjs';

const collector = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../src/verify-sc.mjs', import.meta.url), 'utf8');
const refreshWorkflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
const liveProbe = readFileSync(new URL('../../scripts/run-state-expansion-live-probe.mjs', import.meta.url), 'utf8');

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
  assert.match(verifier, /Myrtle Beach inventory rows below threshold/);
  assert.match(verifier, /Myrtle Beach fresh inventory rows below threshold/);
  assert.match(verifier, /Myrtle Beach inventory store coverage too low/);
  assert.match(verifier, /Myrtle Beach exported drops below threshold/);
  assert.match(verifier, /Myrtle Beach exported store coverage too low/);
  assert.match(verifier, /myrtleStores\.length < 2/);
  assert.match(verifier, /exportedMyrtleStores\.length < 1/);
});

test('targeted South Carolina expansion forces a complete bounded first-party source pass', () => {
  assert.match(refreshWorkflow, /BOURBON_SIGNAL_SC_FORCE_CITYHIVE_LIVE:[^\n]*contains\(inputs\.states, 'SC'\)[^\n]*'1'/);
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
