import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  buildFloridaConfiguredStoreLocationSignals,
  FLORIDA_CITYHIVE_SOURCES,
  registeredFloridaStore,
} from '../src/collectors/florida-retailer-surfaces.mjs';
import {
  buildPensacolaShopifyStoreLocationSignals,
  pensacolaVariantPickupUrl,
  PENSACOLA_SHOPIFY_SOURCE,
  PENSACOLA_SHOPIFY_STORES,
} from '../src/collectors/florida-pensacola-surfaces.mjs';
import {
  floridaCityHiveProductIdentity,
  floridaCityHiveSignalIdentityParts,
  markFloridaCityHiveFallbackNonAlertable,
  mergeFloridaTargetProbeHistory,
} from '../src/collectors/florida-cityhive-policy.mjs';
import { oldestSourceEvidenceCohort } from '../src/collectors/cityhive-hardening.mjs';
import { isFloridaRetailerInventory } from '../src/florida-retailer-policy.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { markStaleReport } from '../src/state-report-fallback.mjs';
import { buildFloridaStandaloneStoreLocationSignals, legacyPrecisionRuntimeOptions, precisionExistingSignalsForState } from '../src/collectors/precision-probes.mjs';

test('Florida standalone retailer directory identities survive transient inventory failures', () => {
  const rows = buildFloridaStandaloneStoreLocationSignals('2026-07-31T00:00:00.000Z');
  assert.equal(rows.length, 10);
  assert.equal(new Set(rows.map((row) => row.storeId)).size, 10);
  assert.ok(rows.every((row) => row.eventType === 'retailer_store_location'));
  assert.ok(rows.every((row) => row.canAlertAsInventory === false && row.canAlertAsWatch === false));
  assert.ok(rows.every((row) => row.raw.configuredStoreIdentity === true));
});

test('Florida CityHive registry materially expands exact-store coverage across underserved regions', () => {
  const stores = FLORIDA_CITYHIVE_SOURCES.flatMap((source) => [...source.merchants.values()].map((store) => ({ ...store, sourceId: source.id })));
  assert.equal(FLORIDA_CITYHIVE_SOURCES.length, 12);
  assert.equal(stores.length, 59);
  assert.equal(new Set(stores.map((store) => `${store.sourceId}:${store.id}`)).size, stores.length);
  for (const city of ['Orlando', 'Jacksonville', 'West Palm Beach', 'Fort Lauderdale', 'Sarasota', 'Gainesville', 'Fort Walton Beach', 'Panama City Beach', 'Destin']) {
    assert.ok(stores.some((store) => store.city === city), `missing an exact configured store in ${city}`);
  }
  for (const source of FLORIDA_CITYHIVE_SOURCES) {
    assert.match(source.categoryUrl, /^https:\/\//);
    assert.ok(source.merchants.size >= 1);
  }
});

test('configured Florida store-locator rows are useful directory evidence but never inventory alerts', () => {
  const observedAt = '2026-07-29T23:00:00.000Z';
  const signals = buildFloridaConfiguredStoreLocationSignals(observedAt);
  assert.equal(signals.length, 59);
  assert.ok(signals.every((signal) => signal.eventType === 'retailer_store_location'));
  assert.ok(signals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false));
  assert.ok(signals.every((signal) => signal.storeAddress && signal.postalCode));
});

test('Florida registry lookup is source-bound and preserves exact identity', () => {
  assert.equal(registeredFloridaStore('golden-ox-liquors', '5c5c8696e2b6475f65dd8abf')?.city, 'Jacksonville');
  assert.equal(registeredFloridaStore('big-daddys-liquors', '5c5c8696e2b6475f65dd8abf'), null);
  assert.equal(registeredFloridaStore('unknown-source', '5c5c8696e2b6475f65dd8abf'), null);
});

test('Florida CityHive product identity fails closed without both product and variant identifiers', () => {
  assert.deepEqual(floridaCityHiveProductIdentity({ product_id: 'product-1', option_id: 'variant-1' }, {}), { productId: 'product-1', variantId: 'variant-1' });
  assert.deepEqual(floridaCityHiveProductIdentity({ option_id: 'variant-1' }, { id: 'product-2' }), { productId: 'product-2', variantId: 'variant-1' });
  assert.equal(floridaCityHiveProductIdentity({ option_id: 'variant-1' }, {}), null);
  assert.equal(floridaCityHiveProductIdentity({ product_id: 'product-1' }, {}), null);
  assert.equal(floridaCityHiveProductIdentity([], []), null);
});

test('Florida CityHive signal identity remains stable across quantity and price changes', () => {
  const identity = { sourceId: 'golden-ox-liquors', merchantId: '5c5c8696e2b6475f65dd8abf', productId: 'product-1', variantId: 'variant-1' };
  assert.deepEqual(floridaCityHiveSignalIdentityParts({ ...identity, quantity: 1, price: 49.99 }), floridaCityHiveSignalIdentityParts({ ...identity, quantity: 9, price: 59.99 }));
  assert.deepEqual(floridaCityHiveSignalIdentityParts(identity), ['FL', 'cityhive-store-inventory', 'golden-ox-liquors', '5c5c8696e2b6475f65dd8abf', 'product-1', 'variant-1']);
});

test('stale Florida CityHive fallback is visibly stale and cannot qualify as inventory', () => {
  const source = FLORIDA_CITYHIVE_SOURCES.find((entry) => entry.id === 'golden-ox-liquors');
  const merchantId = '5c5c8696e2b6475f65dd8abf';
  const store = source.merchants.get(merchantId);
  const live = {
    state: 'FL',
    sourceLabel: source.sourceLabel,
    sourceUrl: 'https://goldenoxliquors.com/shop/product/example',
    sourceChain: source.id,
    merchantId,
    storeId: `${source.id}:${merchantId}`,
    storeAddress: store.address,
    eventType: 'cityhive_store_inventory_result',
    locationPrecision: 'store_level',
    quantity: 2,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    raw: { sourceAvailabilityVerified: true },
  };
  assert.equal(isFloridaRetailerInventory(live), true);
  const stale = markFloridaCityHiveFallbackNonAlertable(live);
  assert.equal(stale.availabilityStatus, 'stale');
  assert.equal(stale.sourceAvailabilityVerified, false);
  assert.equal(stale.canAlertAsInventory, false);
  assert.equal(stale.canAlertAsWatch, false);
  assert.equal(stale.raw.sourceAvailabilityVerified, false);
  assert.equal(stale.raw.sourceRuntimeNonAlertable, true);
  assert.equal(stale.raw.staleFallback, true);
  assert.equal(stale.raw.staleNonAlertable, true);
  assert.equal(isFloridaRetailerInventory(stale), false);
  const confidence = confidenceForSignal(stale);
  assert.equal(confidence.canAlertAsInventory, false);
  assert.equal(confidence.canAlertAsWatch, false);
});

test('Florida Target cohorts prioritize never-refreshed stores, then oldest successful evidence', () => {
  const stores = [['a', {}], ['b', {}], ['c', {}], ['d', {}]];
  const signals = [
    { merchantId: 'a', observedAt: '2026-07-29T18:00:00.000Z' },
    { merchantId: 'b', raw: { lastSuccessfulRefreshAt: '2026-07-29T17:00:00.000Z' } },
    { merchantId: 'd', observedAt: '2026-07-29T16:00:00.000Z' },
  ];
  assert.deepEqual(oldestSourceEvidenceCohort(stores, signals, 3).map(([id]) => id), ['c', 'd', 'b']);
  const afterAttempt = [
    ...signals,
    { merchantId: 'c', raw: { lastAttemptAt: '2026-07-29T19:00:00.000Z' } },
    { merchantId: 'd', raw: { lastAttemptAt: '2026-07-29T19:00:00.000Z' } },
    { merchantId: 'b', raw: { lastAttemptAt: '2026-07-29T19:00:00.000Z' } },
  ];
  assert.deepEqual(oldestSourceEvidenceCohort(stores, afterAttempt, 3).map(([id]) => id), ['a', 'b', 'c']);
});

test('Florida production history persists every Target attempt until all stores advance before cycling', () => {
  const stores = Array.from({ length: 21 }, (_, index) => [`store-${String(index + 1).padStart(2, '0')}`, {}]);
  let previousReport = { 'precision:fl': { value: { signals: [] } } };
  const attemptedOrder = [];
  for (let run = 0; run < 6; run += 1) {
    const merged = precisionExistingSignalsForState('FL', [], previousReport);
    const cohort = oldestSourceEvidenceCohort(stores, merged, 4);
    const observedAt = new Date(Date.UTC(2026, 6, 29, 19, run)).toISOString();
    const currentProbes = cohort.map(([merchantId]) => {
      attemptedOrder.push(merchantId);
      return {
        id: `probe-${merchantId}`,
        merchantId,
        sourceChain: 'target',
        eventType: 'retailer_store_probe_status',
        observedAt,
        raw: { sourceKey: merchantId, lastAttemptAt: observedAt },
      };
    });
    previousReport = { 'precision:fl': { value: { signals: mergeFloridaTargetProbeHistory(merged, currentProbes) } } };
  }
  assert.deepEqual(attemptedOrder.slice(0, 21), stores.map(([id]) => id), 'all 21 stores advance before the first cohort cycles');
  assert.deepEqual(attemptedOrder.slice(21), stores.slice(0, 3).map(([id]) => id), 'rotation restarts only after statewide attempt coverage');
  assert.equal(previousReport['precision:fl'].value.signals.length, 21, 'latest report retains every store attempt timestamp');
  assert.equal(precisionExistingSignalsForState('TN', [], { 'precision:tn': { value: { signals: previousReport['precision:fl'].value.signals } } }).length, 0, 'Florida history wiring does not alter other legacy precision states');
});

test('Florida verifier rejects evidence older than 90 minutes and alertable stale markers in both modes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bs-fl-verifier-'));
  const fixturePath = join(dir, 'FL.json');
  const verifierPath = fileURLToPath(new URL('../src/verify-fl.mjs', import.meta.url));
  const makeFixture = (observedAt, mutate = (signals) => signals) => {
    const inventory = [];
    let index = 0;
    for (const source of FLORIDA_CITYHIVE_SOURCES) {
      for (const store of source.merchants.values()) {
        index += 1;
        const productId = `product-${index}`;
        const variantId = `variant-${index}`;
        const sourceUrl = new URL(`/shop/product/buffalo-trace-bourbon/${productId}?option-id=${variantId}`, source.baseUrl).href;
        inventory.push({
          id: `fixture-${index}`,
          state: 'FL',
          sourceLabel: source.sourceLabel,
          sourceUrl,
          sourceChain: source.id,
          merchantId: store.id,
          productId,
          variantId,
          rawName: 'Buffalo Trace Bourbon 750ml',
          canonicalBottleId: 'buffalo-trace-bourbon',
          canonicalName: 'Buffalo Trace Bourbon',
          eventType: 'cityhive_store_inventory_result',
          locationPrecision: 'store_level',
          storeName: store.name,
          storeId: `${source.id}:${store.id}`,
          storeAddress: store.address,
          city: store.city,
          stateCode: 'FL',
          postalCode: store.zip,
          quantity: 1,
          quantityIsExact: true,
          reportedQuantity: 1,
          availabilityStatus: 'in_stock',
          sourceAvailabilityVerified: true,
          canAlertAsInventory: true,
          canAlertAsWatch: true,
          inventorySemantics: 'exact_retailer_reported_quantity',
          observedAt,
          raw: {
            chain: source.id,
            merchantId: store.id,
            reportedQuantity: 1,
            sourceAvailabilityVerified: true,
            configuredStoreIdentity: true,
            product: { id: productId },
            option: {
              merchant_id: store.id,
              product_id: productId,
              option_id: variantId,
              full_address: store.address,
              quantity: 1,
              product_url: sourceUrl,
            },
          },
        });
      }
    }
    for (const store of PENSACOLA_SHOPIFY_STORES.values()) {
      index += 1;
      inventory.push({
        id: `fixture-${index}`,
        state: 'FL',
        sourceLabel: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
        sourceUrl: 'https://www.pensacolaliquors.com/products/buffalo-trace-bourbon-750ml',
        sourceChain: PENSACOLA_SHOPIFY_SOURCE.id,
        merchantId: store.id,
        productId: '7603067060419',
        variantId: '42469227430083',
        sourceProductBinding: pensacolaVariantPickupUrl('42469227430083'),
        rawName: 'Buffalo Trace Bourbon 750ml',
        canonicalBottleId: 'buffalo-trace-bourbon',
        canonicalName: 'Buffalo Trace Bourbon',
        eventType: 'retailer_store_inventory_result',
        locationPrecision: 'store_level',
        storeName: store.name,
        storeId: store.id,
        storeAddress: store.address,
        city: store.city,
        stateCode: 'FL',
        postalCode: store.zip,
        quantity: 0,
        quantityIsExact: false,
        availabilityStatus: 'in_stock',
        sourceAvailabilityVerified: true,
        pickupOfferVerified: true,
        premisesVerified: true,
        canAlertAsInventory: true,
        canAlertAsWatch: true,
        observedAt,
        raw: {
          chain: PENSACOLA_SHOPIFY_SOURCE.id,
          merchantId: store.id,
          productId: '7603067060419',
          variantId: '42469227430083',
          pickupVerified: true,
          variantPickupVerified: true,
          variantPickupUrl: pensacolaVariantPickupUrl('42469227430083'),
          sourceAvailabilityVerified: true,
        },
      });
    }
    const signals = [
      ...buildFloridaConfiguredStoreLocationSignals(observedAt),
      ...buildPensacolaShopifyStoreLocationSignals(observedAt),
      ...inventory,
      { id: 'liquor-depot-watch', state: 'FL', sourceLabel: 'Liquor Depot Tampa online quantity watch', eventType: 'retailer_catalog_availability', locationPrecision: 'store_aggregate', canAlertAsInventory: false, canAlertAsWatch: true, observedAt },
    ];
    return { status: 'useful', stale: false, signals: mutate(signals) };
  };
  const runVerifier = (fixture, args = []) => {
    writeFileSync(fixturePath, JSON.stringify(fixture));
    return spawnSync(process.execPath, [verifierPath, ...args], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      env: { ...process.env, BOURBON_SIGNAL_FL_VERIFY_FILE: fixturePath, BOURBON_SIGNAL_FL_MAX_INVENTORY_AGE_MS: String(24 * 60 * 60_000) },
    });
  };
  try {
    const freshAt = new Date(Date.now() - 89 * 60_000).toISOString();
    assert.equal(runVerifier(makeFixture(freshAt)).status, 0);
    assert.equal(runVerifier(makeFixture(freshAt), ['--allow-safe-stale-fallback']).status, 0);
    const retainedNotDue = { ...makeFixture(freshAt), status: 'useful_retained_not_due' };
    assert.equal(runVerifier(retainedNotDue, ['--allow-safe-stale-fallback']).status, 0, 'scheduled mode accepts fresh non-stale retained-not-due evidence');
    assert.notEqual(runVerifier(retainedNotDue).status, 0, 'targeted mode still requires a fresh live collection');
    const guardedFallback = markStaleReport(
      { ...makeFixture(freshAt), status: 'stale_useful_quality_fallback', stale: true },
      { id: 'FL', label: 'Florida' },
      'quality guard preserved the previous report',
      new Date().toISOString(),
    );
    assert.equal(guardedFallback.status, 'stale_useful_quality_fallback');
    assert.equal(runVerifier(guardedFallback, ['--allow-safe-stale-fallback']).status, 0, 'scheduled mode accepts only fully normalized guarded stale fallback evidence');
    assert.notEqual(runVerifier(guardedFallback).status, 0, 'targeted mode still rejects guarded stale fallback evidence');
    const reachableFallback = { ...guardedFallback, status: 'stale_reachable_needs_deeper_parser' };
    assert.equal(runVerifier(reachableFallback, ['--allow-safe-stale-fallback']).status, 0, 'scheduled mode accepts a fully safe stale partition regardless of the retained diagnostic status suffix');
    assert.notEqual(runVerifier(reachableFallback).status, 0, 'targeted mode still rejects a stale reachable fallback');
    const tooOldAt = new Date(Date.now() - 91 * 60_000).toISOString();
    assert.notEqual(runVerifier(makeFixture(tooOldAt)).status, 0, 'environment overrides cannot expand the 90-minute ceiling');
    const alertableFallback = makeFixture(freshAt, (signals) => {
      let mutated = false;
      return signals.map((signal) => {
        if (mutated || !/inventory_result$/.test(signal.eventType || '')) return signal;
        mutated = true;
        return { ...signal, raw: { ...signal.raw, cacheFallback: true } };
      });
    });
    assert.notEqual(runVerifier(alertableFallback, ['--allow-safe-stale-fallback']).status, 0, 'scheduled mode rejects alertable stale fallback rows');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Florida statewide collector budgets and scheduled/targeted production verification remain aligned', () => {
  const runtime = legacyPrecisionRuntimeOptions('FL', {}, {});
  assert.equal(runtime.timeoutMs, 600_000);
  assert.equal(runtime.maxAttempts, 1);
  const parent = readFileSync(new URL('../src/run.mjs', import.meta.url), 'utf8');
  const verifier = readFileSync(new URL('../src/verify-fl.mjs', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  assert.match(parent, /FL:\s*Number\([^\n]+720_000\)/);
  assert.match(verifier, /maxInventoryAgeMs[\s\S]*hasStaleMarker[\s\S]*isFresh/);
  assert.match(workflow, /Verify Florida scheduled lane[\s\S]*!inputs\.states[\s\S]*npm run verify:fl -- --allow-safe-stale-fallback/);
  assert.match(workflow, /Verify Florida targeted statewide exact-store expansion[\s\S]*contains\(inputs\.states, 'FL'\)[\s\S]*npm run verify:fl/);
});
