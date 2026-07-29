import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  hasReviewedTennesseeCityHivePayload,
  mergeTennesseeCityHiveCacheSignals,
  selectTennesseeCityHiveSourceCohort,
  tennesseeCityHiveSourceRefreshAt,
  updateTennesseeCityHiveSourceAttemptAt,
} from '../src/collectors/tennessee-cityhive-policy.mjs';
import { legacyPrecisionRuntimeOptions } from '../src/collectors/precision-probes.mjs';
import {
  registeredTennesseeStore,
  tennesseeStoresForSource,
} from '../src/collectors/tennessee-retailer-surfaces.mjs';
import {
  isTennesseeRetailerSignalIdentity,
} from '../src/tennessee-retailer-policy.mjs';

const HOUR = 60 * 60_000;

function exactSignal(overrides = {}) {
  return {
    id: 'signal-1',
    state: 'TN',
    stateCode: 'TN',
    eventType: 'cityhive_store_inventory_result',
    sourceLabel: 'Happy Ours Wine & Spirits CityHive store inventory',
    sourceUrl: 'https://happyour0c3f6e1f.sites.cityhive.app/shop/product/1792-bottled-in-bond/abc',
    sourceChain: 'happy-ours-wine-and-spirits',
    merchantId: '65499b36b456692bd7d53c32',
    productId: 'product-1',
    variantId: 'variant-1',
    rawName: '1792 Bourbon Bottled in Bond',
    storeId: 'happy-ours-wine-and-spirits:65499b36b456692bd7d53c32',
    storeName: 'Happy Ours Wine & Spirits',
    storeAddress: '327 Independence Sq, Franklin, TN 37064, USA',
    city: 'Franklin',
    zip: '37064',
    quantity: 3,
    quantityIsExact: true,
    reportedQuantity: 3,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
    observedAt: '2026-07-29T12:00:00.000Z',
    raw: { chain: 'happy-ours-wine-and-spirits', merchantId: '65499b36b456692bd7d53c32', reportedQuantity: 3 },
    ...overrides,
  };
}

test('Tennessee cohort selects least-recently refreshed sources instead of freezing one cache cohort', () => {
  const sources = [{ id: 'nashville' }, { id: 'memphis' }, { id: 'knoxville' }, { id: 'chattanooga' }];
  const cache = {
    sourceRefreshAt: {
      nashville: '2026-07-29T11:00:00.000Z',
      memphis: '2026-07-29T10:00:00.000Z',
      knoxville: '2026-07-29T09:00:00.000Z',
    },
  };
  assert.deepEqual(
    selectTennesseeCityHiveSourceCohort(sources, { cache, observedAt: '2026-07-29T12:00:00.000Z', cohortSize: 2 }).map((source) => source.id),
    ['chattanooga', 'knoxville'],
  );
});

test('legacy cache derives per-source refresh time from signal evidence', () => {
  const cache = { signals: [exactSignal({ observedAt: '2026-07-29T11:30:00.000Z' })] };
  assert.equal(tennesseeCityHiveSourceRefreshAt(cache).get('happy-ours-wine-and-spirits'), Date.parse('2026-07-29T11:30:00.000Z'));
});

test('a fully failed cohort records attempts and rotates to untried Tennessee sources', () => {
  const sources = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const attemptedAt = '2026-07-29T12:00:00.000Z';
  const cache = { sourceAttemptAt: updateTennesseeCityHiveSourceAttemptAt({}, new Set(['a', 'b']), attemptedAt) };
  assert.deepEqual(
    selectTennesseeCityHiveSourceCohort(sources, { cache, cohortSize: 2 }).map((source) => source.id),
    ['c', 'd'],
  );
});

test('targeted Tennessee precision gets one abortable deadline below the parent state watchdog', async () => {
  const runtime = legacyPrecisionRuntimeOptions('TN', {}, { BOURBON_SIGNAL_RUN_STATES: 'TN' });
  const runner = await readFile(new URL('../src/run.mjs', import.meta.url), 'utf8');
  const parentMatch = runner.match(/TN:\s*Number\(process\.env\.BOURBON_SIGNAL_TN_STATE_TIMEOUT_MS\s*\|\|\s*([0-9_]+)\)/);
  assert.ok(parentMatch, 'Tennessee parent timeout is explicitly bounded');
  const parentTimeoutMs = Number(parentMatch[1].replaceAll('_', ''));
  assert.ok(runtime.timeoutMs >= 600_000);
  assert.ok(parentTimeoutMs > runtime.timeoutMs, 'parent watchdog must leave cleanup margin above the precision deadline');
  assert.equal(runtime.maxAttempts, 1);
  assert.equal(runtime.schedule, false);
});

test('selected successful source replaces old rows while failed and unselected sources retain only fresh evidence', () => {
  const now = '2026-07-29T12:00:00.000Z';
  const oldSelected = exactSignal({ id: 'selected-old', sourceChain: 'selected', raw: { chain: 'selected' }, observedAt: '2026-07-29T11:00:00.000Z' });
  const oldFailed = exactSignal({ id: 'failed-old', sourceChain: 'failed', raw: { chain: 'failed' }, observedAt: '2026-07-29T11:00:00.000Z' });
  const oldUnselected = exactSignal({ id: 'unselected-old', sourceChain: 'unselected', raw: { chain: 'unselected' }, observedAt: '2026-07-29T11:00:00.000Z' });
  const expired = exactSignal({ id: 'expired', sourceChain: 'unselected', raw: { chain: 'unselected' }, observedAt: '2026-07-28T20:00:00.000Z' });
  const live = exactSignal({ id: 'selected-live', sourceChain: 'selected', raw: { chain: 'selected' }, observedAt: now });
  const merged = mergeTennesseeCityHiveCacheSignals({
    liveSignals: [live],
    cachedSignals: [oldSelected, oldFailed, oldUnselected, expired],
    selectedSourceIds: new Set(['selected', 'failed']),
    failedSourceIds: new Set(['failed']),
    observedAt: now,
    maxAgeMs: 12 * HOUR,
    validate: () => true,
  });
  assert.deepEqual(merged.map((row) => row.id).sort(), ['failed-old', 'selected-live', 'unselected-old']);
});

test('HTTP 200 is not authoritative CityHive evidence without product schema and a reviewed merchant-bound payload', () => {
  assert.equal(hasReviewedTennesseeCityHivePayload(['reviewed'], [], true), false);
  assert.equal(hasReviewedTennesseeCityHivePayload(['reviewed'], ['unknown'], true), false);
  assert.equal(hasReviewedTennesseeCityHivePayload(['reviewed'], ['reviewed'], false), false);
  assert.equal(hasReviewedTennesseeCityHivePayload(['reviewed'], ['unknown', 'reviewed'], true), true);
});

test('reviewed CityHive canonical product hosts and alternate product paths remain exact-identity eligible', () => {
  const cases = [
    ['kirby-wines-liquors', '6054cfa68c3b62112b04dc2e', 'https://www.kirbywines.com/shop/product/1792-bourbon/abc'],
    ['green-meadow-wine-spirits', '5980fcd8d05b4360e32f7ed2', 'https://greenmeadowtn.com/shop/product/1792-bourbon/abc'],
    ['good-times-crossville', '624b47df137f3348be13d671', 'https://goodtimeswsb.com/shop/product/1792-bourbon/abc'],
    ['one-stop-wines-johnson-city', '672b6a0791de502911a082b3', 'https://onestopwines.net/product/1792-bourbon/abc'],
  ];
  for (const [sourceId, merchantId, sourceUrl] of cases) {
    const store = registeredTennesseeStore(sourceId, merchantId);
    assert.ok(store, `${sourceId} store is registered`);
    assert.equal(isTennesseeRetailerSignalIdentity(exactSignal({
      sourceLabel: store.sourceLabel,
      sourceUrl,
      sourceChain: sourceId,
      merchantId,
      storeId: store.storeId,
      storeName: store.name,
      storeAddress: store.address,
      city: store.city,
      zip: store.zip,
      raw: { chain: sourceId, merchantId },
    })), true, `${sourceId} canonical product URL is accepted`);
  }
});

test('multi-store Tennessee sources expose every reviewed merchant for exact-store crawling', () => {
  assert.equal(tennesseeStoresForSource('corkdorks').length, 2);
  assert.equal(tennesseeStoresForSource('busters-liquors').length, 2);
  assert.equal(tennesseeStoresForSource('one-stop-wines-johnson-city').length, 2);
});

test('targeted Tennessee workflow forces the source runtime and complete CityHive source universe', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const collector = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(workflow, /BOURBON_SIGNAL_FORCE_SOURCE_RUN:[^\n]*inputs\.states/);
  assert.match(workflow, /BOURBON_SIGNAL_TN_CITYHIVE_FORCE_ALL_SOURCES:[^\n]*contains\(inputs\.states, 'TN'\)/);
  assert.match(collector, /await sleepWithSignal\(500, options\.signal\)/);
  assert.match(collector, /writeFile\(temporaryPath,[\s\S]*?\{ signal \}/);
  assert.match(collector, /signal\?\.throwIfAborted\(\);\s*renameSync\(temporaryPath, TN_CITYHIVE_ARTIFACT_PATH\)/);
});
