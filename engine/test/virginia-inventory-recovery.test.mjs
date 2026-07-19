import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyVirginiaInventoryFreshness,
  evaluateVirginiaProductCoverage,
  mergeVirginiaProductPartitions,
  selectVirginiaProductsForRefresh,
  virginiaAbortableDelay
} from '../src/collectors/virginia-inventory-recovery.mjs';
import { legacyPrecisionRuntimeOptions } from '../src/collectors/precision-probes.mjs';
import { runLegacyPrecisionSource } from '../src/sources/legacy-precision-runtime.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';

const HOUR = 60 * 60_000;

function signal(code, storeId, observedAt, quantity = 1) {
  return {
    id: `${code}-${storeId}`,
    storeId: String(storeId),
    quantity,
    observedAt,
    canAlertAsInventory: quantity > 0,
    canAlertAsWatch: true,
    sourceStale: false,
    raw: { product: { code } }
  };
}

test('Virginia refresh scheduling prioritizes overdue regular inventory before limited watch products', () => {
  const now = Date.parse('2026-07-19T18:00:00.000Z');
  const products = [
    { code: 'regular-old', limitedCaveat: false },
    { code: 'limited-old', limitedCaveat: true },
    { code: 'regular-fresh', limitedCaveat: false }
  ];
  const cached = [
    signal('regular-old', '101', '2026-07-19T12:00:00.000Z'),
    signal('limited-old', '101', '2026-07-18T18:00:00.000Z'),
    signal('regular-fresh', '101', '2026-07-19T17:30:00.000Z')
  ];

  const selected = selectVirginiaProductsForRefresh(products, cached, now, {
    maxProducts: 2,
    regularIntervalMs: 2 * HOUR,
    limitedIntervalMs: 12 * HOUR
  });

  assert.deepEqual(selected.map((product) => product.code), ['regular-old', 'limited-old']);
});

test('Virginia cold bootstrap always includes verifier-required products', () => {
  const regular = Array.from({ length: 10 }, (_, index) => ({ code: `regular-${index}`, limitedCaveat: false }));
  const products = [
    ...regular,
    { code: 'limited-first', limitedCaveat: true },
    { code: 'limited-second', limitedCaveat: true },
    { code: 'buffalo-trace', limitedCaveat: true, bootstrapPriority: true }
  ];
  const selected = selectVirginiaProductsForRefresh(products, [], Date.now(), { maxProducts: 12 });
  assert.equal(selected.length, 12);
  assert.ok(selected.some((product) => product.code === 'buffalo-trace'));
});

test('Virginia product partitions replace only complete successful live products', () => {
  const cached = [
    signal('A', '101', '2026-07-18T00:00:00.000Z'),
    signal('A', '102', '2026-07-18T00:00:00.000Z'),
    signal('B', '101', '2026-07-18T00:00:00.000Z')
  ];
  const liveA = [
    signal('A', '101', '2026-07-19T18:00:00.000Z', 3),
    signal('A', '102', '2026-07-19T18:00:00.000Z', 0)
  ];
  const incompleteB = [signal('B', '101', '2026-07-19T18:00:00.000Z', 2)];

  const merged = mergeVirginiaProductPartitions(cached, new Map([
    ['A', liveA],
    ['B', incompleteB]
  ]), new Set(['A']));

  assert.equal(merged.filter((row) => row.raw.product.code === 'A').length, 2);
  assert.equal(merged.find((row) => row.raw.product.code === 'A' && row.storeId === '101')?.quantity, 3);
  assert.equal(merged.find((row) => row.raw.product.code === 'B')?.observedAt, '2026-07-18T00:00:00.000Z');
});

test('Virginia completeness requires every supported origin store before replacing a product partition', () => {
  const rows = [
    signal('A', '101', '2026-07-19T18:00:00.000Z'),
    signal('A', '102', '2026-07-19T18:00:00.000Z')
  ];

  assert.deepEqual(evaluateVirginiaProductCoverage(rows, new Set(['101', '102'])), {
    complete: true,
    coveredStoreCount: 2,
    expectedStoreCount: 2,
    missingStoreIds: [],
    unexpectedStoreIds: []
  });
  assert.equal(evaluateVirginiaProductCoverage(rows, new Set(['101', '102', '103'])).complete, false);
  assert.equal(evaluateVirginiaProductCoverage(rows, new Set(['101']), { minimumExpectedStoreCount: 390 }).complete, false);
  assert.equal(evaluateVirginiaProductCoverage(rows, new Set(['101'])).complete, false);
});

test('Virginia precision runtime gives one bounded shard enough time and never duplicates it after timeout', () => {
  assert.deepEqual(legacyPrecisionRuntimeOptions('VA', {}, {}), { schedule: false, timeoutMs: 1_140_000, maxAttempts: 1 });
  assert.equal(legacyPrecisionRuntimeOptions('VA', { schedule: true }, {}).schedule, false);
});

test('Virginia parent state watchdog stays above the bounded precision runtime', async () => {
  const runSource = await readFile(new URL('../src/run.mjs', import.meta.url), 'utf8');
  assert.match(runSource, /VA:[^\n]*1_200_000/);
});

test('Virginia retry and batch delays stop immediately when the source runtime aborts', async () => {
  const controller = new AbortController();
  const pending = virginiaAbortableDelay(10_000, controller.signal);
  controller.abort(new Error('Virginia source timeout'));
  await assert.rejects(pending, /Virginia source timeout/);
});

test('Virginia collector continuously refreshes bounded product shards instead of treating cache reuse as a roadblock', async () => {
  const collectorSource = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(collectorSource, /selectVirginiaProductsForRefresh\(/);
  assert.match(collectorSource, /evaluateVirginiaProductCoverage\(/);
  assert.match(collectorSource, /mergeVirginiaProductPartitions\(/);
  assert.match(collectorSource, /applyVirginiaInventoryFreshness\(/);
  assert.match(collectorSource, /collectVirginia\(config, bible, options\)/);
  assert.match(collectorSource, /fetchVirginiaInventoryOrigin\(product, origin, options\.signal/);
  assert.match(collectorSource, /VIRGINIA_COLD_START_PRODUCTS_PER_RUN/);
  assert.match(collectorSource, /recoveryBacklogProductCodes\.size\s*>\s*VIRGINIA_PRODUCTS_PER_RUN/);
  assert.match(collectorSource, /missingCachedProductCodes/);
  assert.match(collectorSource, /supportedCachedSignals/);
  assert.match(collectorSource, /cacheNeedsSanitization/);
  assert.match(collectorSource, /sharedRateLimitState/);
  assert.match(collectorSource, /retryAfter:\s*res\.headers\.get\('retry-after'\)/);
  assert.match(collectorSource, /writeCachedVirginiaSignals\(mergedSignals, options\.signal\)/);
  assert.match(collectorSource, /renameSync\(temporaryPath, VIRGINIA_CACHE_PATH\)/);
  assert.doesNotMatch(collectorSource, /source:\s*['"]Virginia ABC storeNearby inventory API cache reuse['"]/);
  assert.doesNotMatch(collectorSource, /if \(process\.env\.BOURBON_SIGNAL_VA_FORCE_LIVE[^]*return \{ signals: cachedSignals\.map/);
});

test('Virginia verifier blocks stale alertable rows and incomplete regular-product store coverage', async () => {
  const verifierSource = await readFile(new URL('../src/verify-va.mjs', import.meta.url), 'utf8');
  assert.match(verifierSource, /staleAlertableSignals/);
  assert.match(verifierSource, /regularProductCoverage/);
  assert.match(verifierSource, /sourceStale/);
  assert.match(verifierSource, /productLimitedCaveat/);
  assert.match(verifierSource, /supportedOriginStoreIds/);
  assert.match(verifierSource, /missingSupportedStores/);
  assert.match(verifierSource, /rollingFreshnessRoadblocks/);
  assert.match(verifierSource, /expiredInventorySignals/);
});

test('production refresh runs the Virginia recovery verifier before snapshot publication', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const verifyIndex = workflow.indexOf('npm run verify:va');
  const publishIndex = workflow.indexOf('Publish and atomically activate encrypted snapshot');
  assert.ok(verifyIndex >= 0, 'refresh workflow must run verify:va');
  assert.ok(publishIndex > verifyIndex, 'Virginia verification must precede publication');
  assert.match(workflow, /uses:\s*actions\/cache\/restore@v4/);
  assert.match(workflow, /if:\s*always\(\)[^]*uses:\s*actions\/cache\/save@v4/);
  assert.match(workflow, /inventory-collector-state-/);
  assert.match(workflow, /if:\s*success\(\)[^]*inventory-published-site-/);
  const collectorRestore = workflow.match(/- name: Restore collector artifacts[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  const siteRestore = workflow.match(/- name: Restore last published site contract[\s\S]*?(?=\n      - name:)/)?.[0] || '';
  assert.doesNotMatch(collectorRestore, /inventory-refresh-/);
  assert.doesNotMatch(siteRestore, /inventory-refresh-/);
});

test('operational snapshot preserves Virginia product and stale-source metadata for downstream verification', async () => {
  const operational = await readFile(new URL('../src/operational-report.mjs', import.meta.url), 'utf8');
  assert.match(operational, /productCode:/);
  assert.match(operational, /productLimitedCaveat:/);
  assert.match(operational, /sourceStale:\s*signal\.sourceStale === true \|\| virginiaInventoryExpired\(signal\)/);
});

test('Virginia supported-store identities propagate from precision collection into the state report', async () => {
  const precisionRuntime = await readFile(new URL('../src/sources/legacy-precision-runtime.mjs', import.meta.url), 'utf8');
  const stateCollector = await readFile(new URL('../src/collectors/generic-state.mjs', import.meta.url), 'utf8');
  assert.match(precisionRuntime, /const metadata = value\.metadata \|\| result\.metadata/);
  assert.match(stateCollector, /precisionMetadata:\s*precisionProbe\.metadata/);
});

test('Virginia supported-store metadata survives a retained not-due precision result', async () => {
  let calls = 0;
  const base = {
    sourceId: 'precision:va-metadata-test',
    stateId: 'VA',
    label: 'Virginia metadata test',
    url: 'https://example.test/va',
    collect: async () => {
      calls += 1;
      return { signals: [], roadblocks: [], metadata: { virginia: { supportedOriginStoreIds: ['101'], storeUniverseVerified: true } } };
    }
  };
  const first = await runLegacyPrecisionSource({
    ...base,
    sourceRunnerOptions: { now: () => '2026-07-19T12:00:00.000Z', baseCadenceMs: 60_000, minCadenceMs: 60_000, maxCadenceMs: 60_000, maxAttempts: 1 }
  });
  first.sourceResults[0].schedule.nextProbeAt = '2026-07-19T12:01:00.000Z';
  first.sourceResults[0].value = { signals: [], roadblocks: [] };
  const retained = await runLegacyPrecisionSource({
    ...base,
    previousResults: first.sourceResults,
    sourceRunnerOptions: {
      now: () => '2026-07-19T12:00:30.000Z',
      baseCadenceMs: 60_000,
      minCadenceMs: 60_000,
      maxCadenceMs: 60_000,
      maxAttempts: 1,
      sourceMetrics: { 'precision:va-metadata-test': { lastProbeAt: '2026-07-19T12:00:00.000Z' } }
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(retained.metadata, first.metadata);
});

test('site export preserves Virginia stale-source labeling instead of silently normalizing it away', async () => {
  const exporter = await readFile(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
  assert.match(exporter, /signal\.sourceStale === true \|\| ohioFeedStaleCaveat\(signal\)/);
  assert.match(exporter, /signal\.staleSourceCaveat \|\|/);
  assert.match(exporter, /productCode:\s*signal\.productCode/);
  assert.match(exporter, /productLimitedCaveat:[^\n]*signal\.productLimitedCaveat/);
});

test('confidence policy cannot re-enable stale Virginia inventory after collector freshness gating', () => {
  const result = confidenceForSignal({
    state: 'VA',
    eventType: 'store_inventory_result',
    locationPrecision: 'store_level',
    quantity: 4,
    availabilityStatus: 'in_stock',
    confidence: 0.78,
    sourceStale: true,
    raw: { product: { code: 'A', limitedCaveat: false } }
  });
  assert.equal(result.canAlertAsInventory, false);
  assert.equal(result.canAlertAsWatch, false);

  const expired = confidenceForSignal({
    state: 'VA',
    eventType: 'store_inventory_result',
    locationPrecision: 'store_level',
    quantity: 4,
    availabilityStatus: 'in_stock',
    confidence: 0.78,
    sourceStale: false,
    observedAt: new Date(Date.now() - 25 * HOUR).toISOString(),
    raw: { product: { code: 'A', limitedCaveat: false } }
  });
  assert.equal(expired.canAlertAsInventory, false);
  assert.equal(expired.canAlertAsWatch, false);
});

test('stale Virginia cache remains visible but is never labeled live or alertable', () => {
  const now = Date.parse('2026-07-19T18:00:00.000Z');
  const rows = applyVirginiaInventoryFreshness([
    signal('A', '101', '2026-07-18T16:00:00.000Z', 4),
    signal('A', '102', '2026-07-19T17:00:00.000Z', 2)
  ], now, 24 * HOUR);

  const stale = rows.find((row) => row.storeId === '101');
  const fresh = rows.find((row) => row.storeId === '102');
  assert.equal(stale?.sourceStale, true);
  assert.equal(stale?.canAlertAsInventory, false);
  assert.match(stale?.staleSourceCaveat || '', /last confirmed/i);
  assert.equal(fresh?.sourceStale, false);
  assert.equal(fresh?.canAlertAsInventory, true);
});
