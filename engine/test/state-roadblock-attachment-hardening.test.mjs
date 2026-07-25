import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildGeorgiaConfiguredStoreLocationSignals } from '../src/collectors/georgia-retailer-surfaces.mjs';
import { buildIndianaTargetStoreLocationSignals, INDIANA_TARGET_STORES } from '../src/collectors/indiana-retailer-surfaces.mjs';
import {
  attachConfiguredStoreIdentity,
  isTerminalProbeFailure,
  summarizeRepeatedPlatformFailures,
} from '../src/collectors/probe-hardening.mjs';

const collectorSource = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');

test('configured Indiana Target identities attach as non-inventory exact-store locations', () => {
  const observedAt = '2026-07-24T20:00:00.000Z';
  const signals = buildIndianaTargetStoreLocationSignals(observedAt);
  assert.equal(signals.length, INDIANA_TARGET_STORES.size);
  for (const signal of signals) {
    const store = INDIANA_TARGET_STORES.get(signal.merchantId);
    assert.ok(store);
    assert.equal(signal.storeId, `target:${store.id}`);
    assert.equal(signal.sourceUrl, store.officialUrl);
    assert.equal(signal.storeAddress, store.address);
    assert.equal(signal.eventType, 'retailer_store_location');
    assert.equal(signal.locationPrecision, 'store_level');
    assert.equal(signal.canAlertAsInventory, false);
    assert.equal(signal.canAlertAsWatch, false);
    assert.equal(signal.observedAt, observedAt);
  }
});

test('configured Georgia first-party identities attach without inventing inventory', () => {
  const observedAt = '2026-07-24T20:00:00.000Z';
  const signals = buildGeorgiaConfiguredStoreLocationSignals(observedAt);
  assert.equal(signals.length, 16);
  assert.equal(new Set(signals.map((signal) => signal.storeId)).size, signals.length);
  assert.ok(signals.every((signal) => signal.state === 'GA' && signal.stateCode === 'GA'));
  assert.ok(signals.every((signal) => signal.eventType === 'retailer_store_location'));
  assert.ok(signals.every((signal) => signal.locationPrecision === 'store_level'));
  assert.ok(signals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false));
  assert.ok(signals.every((signal) => /^https:\/\//.test(signal.sourceUrl)));
  assert.ok(signals.every((signal) => /,\s*GA\s+\d{5}/.test(signal.storeAddress)));
});

test('configured identity repair replaces legacy bare ids without changing evidence semantics', () => {
  const store = {
    id: 'liquor-store-near-me-myrtle-beach',
    name: 'Liquor Store Near Me Myrtle Beach',
    address: '811 Seaboard St, Myrtle Beach, SC 29577',
    city: 'Myrtle Beach',
    zip: '29577',
  };
  const repaired = attachConfiguredStoreIdentity({
    storeId: store.id,
    eventType: 'retailer_product_catalog_signal',
    quantity: 0,
    canAlertAsInventory: false,
    evidence: 'Existing catalog evidence.',
    raw: { chain: 'liquor-store-near-me-myrtle-beach', cacheFallback: true },
  }, 'liquor-store-near-me-myrtle-beach', store, 'SC');

  assert.equal(repaired.storeId, 'liquor-store-near-me-myrtle-beach:liquor-store-near-me-myrtle-beach');
  assert.equal(repaired.storeAddress, store.address);
  assert.equal(repaired.eventType, 'retailer_product_catalog_signal');
  assert.equal(repaired.quantity, 0);
  assert.equal(repaired.canAlertAsInventory, false);
  assert.equal(repaired.evidence, 'Existing catalog evidence.');
  assert.equal(repaired.raw.cacheFallback, true);
});

test('terminal client failures stop dead pagination and fanout while server failures remain retryable', () => {
  for (const status of [400, 401, 403, 404, 410, 429]) assert.equal(isTerminalProbeFailure(status), true, status);
  for (const status of [0, 408, 500, 502, 'reachable_no_safe_inventory_rows']) assert.equal(isTerminalProbeFailure(status), false, status);
});

test('repeated platform failures become one evidence-preserving blocker', () => {
  const failures = [
    { state: 'SC', source: "Green's Beverage", url: 'https://greens.example/store-a', status: 403, error: 'HTTP 403' },
    { state: 'SC', source: 'Wine & Bourbon Barn', url: 'https://wine.example/store-b', status: 403, error: 'HTTP 403' },
  ];
  const [summary] = summarizeRepeatedPlatformFailures(failures, {
    state: 'SC',
    source: 'South Carolina CityHive exact-store inventory platform',
    configuredProbeCount: 18,
    nextRoute: 'Retry at the next bounded cadence without bypassing source controls.',
  });

  assert.equal(summary.status, 403);
  assert.match(summary.error, /2 representative configured probes returned HTTP 403/i);
  assert.match(summary.error, /skipped 16 redundant probes/i);
  assert.deepEqual(summary.evidence.attemptedUrls, failures.map((failure) => failure.url));
  assert.equal(summary.evidence.configuredProbeCount, 18);
  assert.equal(summary.evidence.skippedProbeCount, 16);
  assert.deepEqual(summarizeRepeatedPlatformFailures(failures.slice(0, 1), {
    state: 'SC',
    source: 'South Carolina CityHive exact-store inventory platform',
    configuredProbeCount: 18,
  }), failures.slice(0, 1));
});

test('state collectors consume bounded blockers, quiet safe cache reuse, use live retailer hosts, and share configured store ids', () => {
  assert.match(collectorSource, /summarizeRepeatedPlatformFailures/);
  assert.match(collectorSource, /isTerminalProbeFailure/);
  assert.match(collectorSource, /id:\s*'zipps-liquor'[\s\S]{0,260}baseUrl:\s*'https:\/\/shop\.zippsliquor\.com'[\s\S]{0,260}https:\/\/shop\.zippsliquor\.com\/shop\/\?tags=bourbon/);
  assert.match(collectorSource, /buildIndianaTargetStoreLocationSignals/);
  assert.match(collectorSource, /buildGeorgiaConfiguredStoreLocationSignals/);
  assert.doesNotMatch(collectorSource, /source:\s*['"]Indiana ATC public facility permit search cache reuse['"]/);
  assert.doesNotMatch(collectorSource, /source:\s*['"]Indiana CityHive retailer inventory cache reuse['"]/);
  assert.doesNotMatch(collectorSource, /source:\s*['"]South Carolina CityHive retailer inventory cache reuse['"]/);
  assert.doesNotMatch(collectorSource, /source:\s*['"]South Carolina Phase 1 Myrtle Beach watch cache reuse['"]/);
  assert.doesNotMatch(collectorSource, /source:\s*['"]Texas CityHive inventory cache['"]/);
  assert.doesNotMatch(collectorSource, /status:\s*['"]private_market_no_control_inventory['"]/);
  assert.match(collectorSource, /phase1CatalogSignal[\s\S]*storeId:\s*configuredStoreId/);
});
