import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PLATFORM_RARE_CAPABILITIES,
  RARE_ACQUISITION_CONTRACT_VERSION,
  RARE_PRODUCT_FAMILIES,
  RARE_SOURCE_REGISTRY,
  buildCityHiveRareAcquisitionUrls,
  buildRareAcquisitionPlan,
  buildRareAcquisitionReport,
  executeRareAcquisitionPlan,
  normalizeRareAcquisitionQuantity,
  readRareAcquisitionLedger,
  updateRareAcquisitionLedger,
  writeRareAcquisitionArtifacts,
} from '../src/optimization/rare-acquisition.mjs';

const AT = '2026-08-09T16:00:00.000Z';

function candidate(overrides = {}) {
  return {
    state: 'FL',
    sourceId: 'bourbon-barn-gainesville',
    platform: 'cityhive',
    merchantId: '68ac9741700b9b25a87e0f3b',
    categoryUrl: 'https://bourbonbarnfl.com/shop/?subtype=bourbon',
    ...overrides,
  };
}

test('rare acquisition registry is multi-state, bounded, exact-source, and capability aware', () => {
  assert.equal(RARE_ACQUISITION_CONTRACT_VERSION, 'bourbon-signal-rare-acquisition-v1');
  assert.deepEqual([...new Set(RARE_SOURCE_REGISTRY.map((source) => source.state))].sort(), ['FL', 'GA', 'IN', 'NV', 'TN']);
  assert.ok(RARE_PRODUCT_FAMILIES.length >= 12);
  assert.ok(RARE_PRODUCT_FAMILIES.every((family) => family.id && family.demandWeight >= 1 && family.terms.length >= 1));
  assert.equal(PLATFORM_RARE_CAPABILITIES.cityhive.discovery, 'brand_facet');
  assert.equal(PLATFORM_RARE_CAPABILITIES.shopify.activation, 'shadow_only_without_exact_pickup');
  for (const source of RARE_SOURCE_REGISTRY) {
    assert.ok(source.sourceId && source.state && source.platform);
    assert.ok(source.maxTasksPerRun >= 1 && source.maxTasksPerRun <= 4);
    assert.ok(source.familyIds.length >= 2 && source.familyIds.length <= 6);
    assert.equal(new Set(source.familyIds).size, source.familyIds.length);
    assert.equal(source.mode, 'shadow');
    assert.ok(source.allowedHosts.length >= 1);
  }
});

test('planner spends a deterministic rotating budget without widening unreviewed sources', () => {
  const candidates = [
    candidate(),
    candidate({ merchantId: 'second', categoryUrl: 'https://bourbonbarnfl.com/shop/?subtype=bourbon' }),
    candidate({ state: 'TN', sourceId: 'happy-ours-wine-and-spirits', merchantId: '65499b36b456692bd7d53c32', categoryUrl: 'https://happyour0c3f6e1f.sites.cityhive.app/shop/?subtype=bourbon' }),
    candidate({ sourceId: 'not-reviewed', merchantId: 'third' }),
  ];
  const first = buildRareAcquisitionPlan({ state: 'FL', candidates, ledger: null, at: AT, stateRequestBudget: 2 });
  const second = buildRareAcquisitionPlan({ state: 'FL', candidates, ledger: null, at: AT, stateRequestBudget: 2 });
  assert.deepEqual(first, second);
  assert.equal(first.tasks.length, 2);
  assert.ok(first.tasks.every((task) => task.state === 'FL' && task.sourceId === 'bourbon-barn-gainesville'));
  assert.equal(first.tasks.some((task) => task.sourceId === 'not-reviewed'), false);
  assert.ok(first.tasks.every((task) => !/bourbon|whiskey|allocated|rare/i.test(task.term)));
  assert.ok(first.tasks.every((task) => task.mode === 'discovery'));
});

test('CityHive task URLs remain HTTPS, first-party, exact-merchant, and pagination-free', () => {
  const plan = buildRareAcquisitionPlan({ state: 'FL', candidates: [candidate()], at: AT, stateRequestBudget: 1 });
  const urls = buildCityHiveRareAcquisitionUrls(candidate(), plan.tasks);
  assert.equal(urls.length, 1);
  const url = new URL(urls[0]);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'bourbonbarnfl.com');
  assert.equal(url.searchParams.get('merchant-id'), candidate().merchantId);
  assert.ok(url.searchParams.get('brands'));
  assert.equal(url.searchParams.has('skip'), false);
  assert.equal(url.searchParams.has('q'), false);
  assert.equal(url.searchParams.has('search'), false);
  assert.throws(() => buildCityHiveRareAcquisitionUrls(candidate({ categoryUrl: 'http://bourbonbarnfl.com/shop/' }), plan.tasks));
  assert.throws(() => buildCityHiveRareAcquisitionUrls(candidate({ categoryUrl: 'https://example.invalid/shop/' }), plan.tasks));
  assert.equal(buildRareAcquisitionPlan({
    state: 'FL',
    candidates: [candidate({ categoryUrl: 'https://example.invalid/shop/' })],
    at: AT,
    stateRequestBudget: 1,
  }).tasks.length, 0);
  assert.deepEqual(buildCityHiveRareAcquisitionUrls(candidate({ sourceId: 'unreviewed' }), plan.tasks), []);
});

test('ledger distinguishes empty, unavailable, failure, and positive evidence with negative backoff', () => {
  let ledger = updateRareAcquisitionLedger(null, {
    at: AT,
    tasks: [{ id: 'empty', state: 'FL', sourceId: 'bourbon-barn-gainesville', merchantId: 'm1', familyId: 'weller', mode: 'discovery' }],
    outcomes: [{ taskId: 'empty', status: 'empty', observations: [] }],
  });
  const empty = ledger.entries['FL|bourbon-barn-gainesville|m1|weller'];
  assert.equal(empty.consecutiveEmptyChecks, 1);
  assert.ok(Date.parse(empty.nextEligibleAt) > Date.parse(AT));

  ledger = updateRareAcquisitionLedger(ledger, {
    at: '2026-08-10T16:00:00.000Z',
    tasks: [{ id: 'positive', state: 'FL', sourceId: 'bourbon-barn-gainesville', merchantId: 'm1', familyId: 'weller', mode: 'discovery' }],
    outcomes: [{ taskId: 'positive', status: 'success', observations: [{ productId: 'p1', variantId: 'v1', productUrl: 'https://bourbonbarnfl.com/shop/product/x/p1?option-id=v1', available: true, quantity: 1 }] }],
  });
  const positive = ledger.entries['FL|bourbon-barn-gainesville|m1|weller'];
  assert.equal(positive.consecutiveEmptyChecks, 0);
  assert.equal(positive.knownProducts['p1|v1'].availability, 'available');
  assert.equal(positive.knownProducts['p1|v1'].lastInventoryConfirmedAt, '2026-08-10T16:00:00.000Z');

  ledger = updateRareAcquisitionLedger(ledger, {
    at: '2026-08-10T17:00:00.000Z',
    tasks: [{ id: 'failed', state: 'FL', sourceId: 'bourbon-barn-gainesville', merchantId: 'm1', familyId: 'weller', mode: 'monitor' }],
    outcomes: [{ taskId: 'failed', status: 'failed', observations: [] }],
  });
  assert.equal(ledger.entries['FL|bourbon-barn-gainesville|m1|weller'].knownProducts['p1|v1'].availability, 'available', 'a source failure must not fabricate unavailability');
});

test('known products outrank discovery while respecting eligibility and request ceilings', () => {
  const task = { id: 'seed', state: 'FL', sourceId: 'bourbon-barn-gainesville', merchantId: candidate().merchantId, familyId: 'weller', mode: 'discovery' };
  const ledger = updateRareAcquisitionLedger(null, {
    at: '2026-08-08T00:00:00.000Z',
    tasks: [task],
    outcomes: [{ taskId: 'seed', status: 'success', observations: [{ productId: 'p1', variantId: 'v1', productUrl: 'https://bourbonbarnfl.com/shop/product/x/p1?option-id=v1', available: false }] }],
  });
  const plan = buildRareAcquisitionPlan({ state: 'FL', candidates: [candidate()], ledger, at: AT, stateRequestBudget: 1 });
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].mode, 'monitor');
  assert.equal(plan.tasks[0].productId, 'p1');
  assert.equal(plan.tasks[0].variantId, 'v1');
});

test('executor short-circuits a rate-limited source and deduplicates product-option-store evidence', async () => {
  const tasks = [
    { id: 'a', state: 'FL', sourceId: 's1', merchantId: 'm1' },
    { id: 'b', state: 'FL', sourceId: 's1', merchantId: 'm1' },
    { id: 'c', state: 'FL', sourceId: 's2', merchantId: 'm2' },
    { id: 'd', state: 'FL', sourceId: 's2', merchantId: 'm2' },
  ];
  const called = [];
  const result = await executeRareAcquisitionPlan({ contractVersion: RARE_ACQUISITION_CONTRACT_VERSION, tasks }, async (task) => {
    called.push(task.id);
    if (task.id === 'a') return { status: 429, observations: [] };
    return { status: 200, observations: [{ sourceId: task.sourceId, merchantId: task.merchantId, productId: 'p', variantId: 'v', available: true }] };
  });
  assert.deepEqual(called, ['a', 'c', 'd']);
  assert.equal(result.observations.length, 1);
  assert.equal(result.metrics.rateLimitedSourceCount, 1);
  assert.equal(result.metrics.deduplicatedObservationCount, 1);
});

test('quantity anomalies preserve availability but never invent exact shelf counts', () => {
  assert.deepEqual(normalizeRareAcquisitionQuantity(2), { available: true, quantity: 2, quantityIsExact: true, anomalous: false });
  assert.deepEqual(normalizeRareAcquisitionQuantity(100), { available: true, quantity: 0, quantityIsExact: false, anomalous: true });
  assert.deepEqual(normalizeRareAcquisitionQuantity(null, { explicitlyAvailable: true }), { available: true, quantity: 0, quantityIsExact: false, anomalous: false });
  assert.deepEqual(normalizeRareAcquisitionQuantity(0), { available: false, quantity: 0, quantityIsExact: true, anomalous: false });
});

test('report exposes the complete acquisition funnel and efficiency without changing customer semantics', () => {
  const report = buildRareAcquisitionReport({
    state: 'FL',
    at: AT,
    candidateSourceCount: 3,
    plan: { tasks: [{ sourceId: 's1' }, { sourceId: 's2' }] },
    execution: {
      outcomes: [{ status: 'success' }, { status: 'empty' }],
      observations: [{ available: true }, { available: false }],
      metrics: { requestCount: 2, deduplicatedObservationCount: 1, rateLimitedSourceCount: 0 },
    },
    acceptedSignals: [{ canAlertAsInventory: true, tier: 'unicorn' }],
  });
  assert.equal(report.funnel.eligibleSources, 3);
  assert.equal(report.funnel.requestsAttempted, 2);
  assert.equal(report.funnel.positiveInventoryObservations, 1);
  assert.equal(report.funnel.acceptedExactStoreSignals, 1);
  assert.equal(report.funnel.acceptedRareSignals, 1);
  assert.equal(report.efficiency.acceptedRareSignalsPerRequest, 0.5);
  assert.equal('feedOrdering' in report, false);
  assert.equal('deliveryPolicy' in report, false);
});

test('artifact persistence atomically merges concurrent same-key evidence and fails closed on corruption', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'rare-acquisition-'));
  try {
    const first = updateRareAcquisitionLedger(null, {
      at: '2026-08-09T16:00:00.000Z',
      tasks: [{ id: 'a', state: 'FL', sourceId: 'bourbon-barn-gainesville', merchantId: 'm1', familyId: 'weller' }],
      outcomes: [{ taskId: 'a', status: 'success', observations: [{ productId: 'p1', variantId: 'v1', productUrl: 'https://bourbonbarnfl.com/shop/product/p1', available: true }] }],
    });
    const second = updateRareAcquisitionLedger(null, {
      at: '2026-08-09T16:01:00.000Z',
      tasks: [{ id: 'b', state: 'FL', sourceId: 'bourbon-barn-gainesville', merchantId: 'm1', familyId: 'weller' }],
      outcomes: [{ taskId: 'b', status: 'success', observations: [{ productId: 'p2', variantId: 'v2', productUrl: 'https://bourbonbarnfl.com/shop/product/p2', available: true }] }],
    });
    await Promise.all([
      writeRareAcquisitionArtifacts('FL', { ledger: first }, { root }),
      writeRareAcquisitionArtifacts('FL', { ledger: second }, { root }),
    ]);
    const persisted = await readRareAcquisitionLedger('FL', { root });
    const entry = persisted.entries['FL|bourbon-barn-gainesville|m1|weller'];
    assert.equal(entry.checks, 2);
    assert.equal(entry.positiveObservationCount, 2);
    assert.deepEqual(Object.keys(entry.knownProducts).sort(), ['p1|v1', 'p2|v2']);
    assert.equal(persisted.generatedAt, '2026-08-09T16:01:00.000Z');
    assert.deepEqual((await readdir(root)).filter((name) => name.endsWith('.lock') || name.endsWith('.tmp')), []);

    await writeFile(path.join(root, 'FL.json'), '{not-json', 'utf8');
    await assert.rejects(() => readRareAcquisitionLedger('FL', { root }), /Unable to read rare-acquisition ledger/);
    await assert.rejects(() => writeRareAcquisitionArtifacts('FL', { ledger: first }, { root }), /Unable to read rare-acquisition ledger/);
    assert.deepEqual((await readdir(root)).filter((name) => name.endsWith('.lock') || name.endsWith('.tmp')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('standalone shadow planner is not wired into production inventory request loops', async () => {
  const source = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /buildRareAcquisitionPlan|buildCityHiveRareAcquisitionUrls|prepareRareAcquisition|finalizeRareAcquisition/);
  assert.match(source, /TN_CITYHIVE_RARE_PRIORITY_SOURCE_IDS[\s\S]*prioritySlots:\s*TN_CITYHIVE_RARE_PRIORITY_SLOTS/);
  assert.match(source, /IN_CITYHIVE_RARE_PRIORITY_SOURCE_IDS[\s\S]*prioritySlots:\s*IN_CITYHIVE_RARE_PRIORITY_SLOTS/);
  assert.doesNotMatch(source, /drop-feed-policy|eligibleForDelivery\s*=|tier\s*=\s*['"]unicorn['"]/);
});
