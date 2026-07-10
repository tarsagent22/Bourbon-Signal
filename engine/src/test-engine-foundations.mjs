import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { buildConditionalHeaders, decideCollectorProbe, updateCollectorMetadata } from './optimization/collector-state.mjs';
import { runBoundedPool, WorkerTimeoutError } from './optimization/worker-pool.mjs';
import { buildChangeSet, planIncrementalPartitions } from './optimization/change-set.mjs';
import { compressUnchangedHistory, expandHistory } from './optimization/history-compression.mjs';
import { buildQueryIndexes } from './optimization/query-indexes.mjs';
import { appendChangeJournal } from './optimization/change-journal.mjs';
import { evaluateStatePromotion } from './optimization/promotion-gate.mjs';
import { decideSourceSchedule } from './optimization/source-scheduler.mjs';

const test = async (name, fn) => {
  await fn();
  console.log(`ok - ${name}`);
};

await test('collector metadata drives conditional and cadence probes', () => {
  const previous = { etag: '"abc"', lastModified: 'Mon, 06 Jul 2026 10:00:00 GMT', contentHash: 'h1', lastCheckedAt: '2026-07-09T10:00:00.000Z', nextProbeAt: '2026-07-09T11:00:00.000Z', consecutiveUnchanged: 2 };
  assert.deepEqual(buildConditionalHeaders(previous), { 'if-none-match': '"abc"', 'if-modified-since': 'Mon, 06 Jul 2026 10:00:00 GMT' });
  assert.equal(decideCollectorProbe(previous, { now: '2026-07-09T10:30:00.000Z' }).decision, 'skip_not_due');
  assert.equal(decideCollectorProbe(previous, { now: '2026-07-09T10:30:00.000Z', force: true }).decision, 'probe');
  const unchanged = updateCollectorMetadata(previous, { status: 304, checkedAt: '2026-07-09T11:00:00.000Z' }, { cadenceMs: 3_600_000 });
  assert.equal(unchanged.consecutiveUnchanged, 3);
  assert.equal(unchanged.lastChangedAt, undefined);
  const changed = updateCollectorMetadata(unchanged, { status: 200, etag: '"def"', contentHash: 'h2', checkedAt: '2026-07-09T12:00:00.000Z' }, { cadenceMs: 3_600_000 });
  assert.equal(changed.consecutiveUnchanged, 0);
  assert.equal(changed.lastChangedAt, '2026-07-09T12:00:00.000Z');
});

await test('bounded pool enforces global/domain limits and timeouts while preserving order', async () => {
  let active = 0; let peak = 0;
  const domainActive = new Map(); const domainPeak = new Map();
  const tasks = [
    { id: 'a', domain: 'one.test', ms: 25 }, { id: 'b', domain: 'one.test', ms: 25 },
    { id: 'c', domain: 'two.test', ms: 25 }, { id: 'd', domain: 'two.test', ms: 25 }
  ];
  const results = await runBoundedPool(tasks, async (task) => {
    active += 1; peak = Math.max(peak, active);
    const perDomain = (domainActive.get(task.domain) || 0) + 1;
    domainActive.set(task.domain, perDomain);
    domainPeak.set(task.domain, Math.max(domainPeak.get(task.domain) || 0, perDomain));
    await delay(task.ms);
    active -= 1; domainActive.set(task.domain, perDomain - 1);
    return task.id;
  }, { concurrency: 3, perDomain: 1, timeoutMs: 100 });
  assert.deepEqual(results.map((result) => result.value), ['a', 'b', 'c', 'd']);
  assert.ok(peak <= 3);
  assert.deepEqual([...domainPeak.values()], [1, 1]);
  const [timedOut] = await runBoundedPool([{ id: 'slow', domain: 'one.test' }], async () => delay(40), { timeoutMs: 5 });
  assert.equal(timedOut.status, 'rejected');
  assert.ok(timedOut.reason instanceof WorkerTimeoutError);
});

await test('change sets distinguish content changes and select only affected partitions', () => {
  const previous = [{ key: 'a', state: 'NC', city: 'Raleigh', quantity: 1 }, { key: 'b', state: 'VA', city: 'Richmond', quantity: 2 }];
  const current = [{ key: 'a', state: 'NC', city: 'Raleigh', quantity: 3 }, { key: 'c', state: 'NC', city: 'Durham', quantity: 1 }];
  const changes = buildChangeSet(previous, current);
  assert.deepEqual(changes.map((change) => change.type), ['updated', 'removed', 'added']);
  const plan = planIncrementalPartitions(changes, { dimensions: ['state', 'city'], allPartitions: ['state:NC', 'state:VA', 'state:OH', 'state:PA', 'city:Raleigh', 'city:Richmond', 'city:Durham', 'city:Columbus', 'city:Pittsburgh'] });
  assert.deepEqual(plan.rebuild, ['city:Durham', 'city:Raleigh', 'city:Richmond', 'state:NC', 'state:VA']);
  assert.equal(plan.mode, 'incremental');
});

await test('unchanged history compression is pure and reversible', () => {
  const history = [
    { observedAt: '2026-07-01T00:00:00Z', value: { status: 'in_stock', quantity: 2 } },
    { observedAt: '2026-07-02T00:00:00Z', value: { status: 'in_stock', quantity: 2 } },
    { observedAt: '2026-07-03T00:00:00Z', value: { status: 'sold_out', quantity: 0 } }
  ];
  const original = structuredClone(history);
  const compressed = compressUnchangedHistory(history);
  assert.equal(compressed.length, 2);
  assert.equal(compressed[0].kind, 'unchanged_interval');
  assert.deepEqual(expandHistory(compressed), history);
  assert.deepEqual(history, original);
});

await test('query indexes preserve board, county, city, and store detail', () => {
  const rows = [
    { id: '1', state: 'NC', board: 'Wake ABC', county: 'Wake', city: 'Raleigh', storeId: 'W1', storeName: 'Capital Blvd' },
    { id: '2', state: 'NC', board: 'Wake ABC', county: 'Wake', city: 'Cary', storeId: 'W2', storeName: 'Cary Store' }
  ];
  const indexes = buildQueryIndexes(rows);
  assert.deepEqual(indexes.board['wake abc'], ['1', '2']);
  assert.deepEqual(indexes.county['nc|wake'], ['1', '2']);
  assert.deepEqual(indexes.city['nc|raleigh'], ['1']);
  assert.deepEqual(indexes.store['nc|w1'], ['1']);
  assert.deepEqual(indexes.details['1'], rows[0]);
});

await test('journal novelty is stable and ignores quantity-only changes', () => {
  const first = { state: 'NC', bottleId: 'bt', eventType: 'store_inventory', sourceLabel: 'Wake', storeId: '1', quantity: 2, observedAt: '2026-07-09T10:00:00Z' };
  const quantityOnly = { ...first, quantity: 7, observedAt: '2026-07-09T11:00:00Z' };
  const moved = { ...quantityOnly, storeId: '2' };
  const journal = appendChangeJournal([], [first, quantityOnly, moved], { recordedAt: '2026-07-09T12:00:00Z' });
  assert.equal(journal.entries.length, 2);
  assert.equal(journal.entries[0].occurrences, 2);
  assert.equal(journal.entries[0].latest.quantity, 7);
  assert.notEqual(journal.entries[0].noveltyKey, journal.entries[1].noveltyKey);
});

await test('promotion gate retains stale useful state on collapse and quality failure', () => {
  const prior = { status: 'useful', signalCount: 120, data: { version: 1 } };
  const collapse = evaluateStatePromotion(prior, { status: 'useful', signalCount: 5, qualityScore: 0.9, data: { version: 2 } }, { minQualityScore: 0.7, collapseRatio: 0.5 });
  assert.equal(collapse.status, 'stale_useful');
  assert.deepEqual(collapse.promotedData, prior.data);
  assert.ok(collapse.reasons.includes('signal_count_collapse'));
  const quality = evaluateStatePromotion(prior, { status: 'useful', signalCount: 130, qualityScore: 0.4, data: { version: 3 } }, { minQualityScore: 0.7 });
  assert.equal(quality.status, 'stale_useful');
  assert.ok(quality.reasons.includes('quality_gate_failed'));
  const healthy = evaluateStatePromotion(prior, { status: 'useful', signalCount: 130, qualityScore: 0.9, data: { version: 4 } });
  assert.equal(healthy.status, 'useful');
  assert.deepEqual(healthy.promotedData, { version: 4 });
});

await test('source scheduler adapts cadence to ROI, changes, failures, and due time', () => {
  const hot = decideSourceSchedule({ sourceId: 'wake', usefulChanges: 8, probes: 10, failures: 0, consecutiveUnchanged: 0, lastProbeAt: '2026-07-09T10:00:00Z' }, { now: '2026-07-09T11:00:00Z', baseCadenceMs: 3_600_000 });
  assert.equal(hot.decision, 'probe_now');
  assert.ok(hot.roiScore > 0.5);
  const cold = decideSourceSchedule({ sourceId: 'cold', usefulChanges: 0, probes: 20, failures: 0, consecutiveUnchanged: 12, lastProbeAt: '2026-07-09T10:00:00Z' }, { now: '2026-07-09T11:00:00Z', baseCadenceMs: 3_600_000, maxCadenceMs: 86_400_000 });
  assert.equal(cold.decision, 'wait');
  assert.ok(cold.cadenceMs > 3_600_000);
  const failing = decideSourceSchedule({ sourceId: 'bad', usefulChanges: 3, probes: 10, failures: 8, consecutiveFailures: 4, lastProbeAt: '2026-07-09T10:00:00Z' }, { now: '2026-07-09T11:00:00Z', baseCadenceMs: 3_600_000 });
  assert.ok(failing.cadenceMs > hot.cadenceMs);
});

console.log('Engine foundation tests passed.');
