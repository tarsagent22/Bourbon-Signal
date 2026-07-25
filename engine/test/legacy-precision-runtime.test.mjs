import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { SourceCircuitBreaker } from '../src/sources/circuit-breaker.mjs';
import { TransientSourceError } from '../src/sources/source-error.mjs';
import { runLegacyPrecisionSource } from '../src/sources/legacy-precision-runtime.mjs';
import { createSourceSkippedResult } from '../src/sources/source-result.mjs';
import { appendSourceSloObservations } from '../src/sources/slo-report.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/source-runtime/${name}`, import.meta.url), 'utf8'));

function resultValue(name) {
  return fixture(name).then((scenario) => ({
    signals: scenario.value?.signals || [],
    roadblocks: scenario.value?.roadblocks || [],
  }));
}

test('legacy precision source failures keep a healthy sibling result and retain an explicitly non-alertable stale fallback', async () => {
  const previousValue = await resultValue('stale-fallback.json');
  const previous = {
    sourceId: 'precision:fixture-stale',
    lastGoodAt: '2026-07-15T12:00:00.000Z',
    value: previousValue,
  };
  const [stale, healthy] = await Promise.all([
    runLegacyPrecisionSource({
      sourceId: 'precision:fixture-stale',
      label: 'Fixture stale precision source',
      url: 'https://stale.fixture.test/source',
      collect: async () => { throw new TransientSourceError('fixture unreachable'); },
      previousResults: { 'precision:fixture-stale': previous },
      sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0, now: () => '2026-07-15T13:00:00.000Z' },
    }),
    runLegacyPrecisionSource({
      sourceId: 'precision:fixture-healthy',
      label: 'Fixture healthy precision source',
      url: 'https://healthy.fixture.test/source',
      collect: () => resultValue('failed-sibling.json'),
      sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0 },
    }),
  ]);

  assert.equal(stale.sourceResults[0].status, 'transient_error');
  assert.equal(stale.sourceResults[0].stale, true);
  assert.equal(stale.signals[0].observedAt, '2026-07-15T12:00:00.000Z');
  assert.equal(stale.signals[0].canAlertAsInventory, false);
  assert.equal(stale.signals[0].canAlertAsWatch, false);
  assert.equal(healthy.sourceResults[0].status, 'success');
  assert.equal(healthy.signals[0].sourceRuntimeId, 'precision:fixture-healthy');
});

test('legacy precision collectors preserve an explicitly stale successful envelope', async () => {
  const result = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-declared-stale',
    label: 'Fixture declared stale precision source',
    stateId: 'OH',
    url: 'https://stale.fixture.test/source',
    collect: async () => ({
      signals: [{ id: 'stale-row', canAlertAsInventory: false, canAlertAsWatch: false }],
      roadblocks: [],
      stale: true,
      staleReason: 'retained state report',
      previousFinishedAt: '2026-07-22T12:00:00.000Z',
    }),
    sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100, now: () => '2026-07-22T12:01:00.000Z' },
  });

  assert.equal(result.stale, true);
  assert.equal(result.staleReason, 'retained state report');
  assert.equal(result.previousFinishedAt, '2026-07-22T12:00:00.000Z');
  assert.equal(result.lastGoodAt, '2026-07-22T12:00:00.000Z');
  assert.equal(result.staleFallbackAt, '2026-07-22T12:01:00.000Z', 'stale precision envelopes must record when the fallback was retained');
  assert.equal(result.sourceReports[0].stale, true);
  assert.equal(result.sourceResults[0].status, 'stale_fallback');
  assert.equal(result.sourceResults[0].stale, true);
  assert.equal(result.sourceResults[0].alertable, false);
  assert.equal(result.sourceResults[0].lastGoodAt, '2026-07-22T12:00:00.000Z');
  assert.equal(result.sourceResults[0].attempts[0].outcome, 'stale_fallback');
  assert.equal(result.signals[0].stale, true);
  assert.equal(result.signals[0].sourceStale, true);
  assert.equal(result.signals[0].canAlertAsInventory, false);
  assert.equal(result.signals[0].canAlertAsWatch, false);
  const history = appendSourceSloObservations(null, result.sourceResults, { now: '2026-07-22T12:01:00.000Z' });
  assert.equal(history.observations[0].outcome, 'stale_fallback');
  const unknownProvenance = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-stale-unknown-time',
    collect: async () => ({ signals: [], roadblocks: [], stale: true, staleReason: 'missing source timestamp' }),
    sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100 },
  });
  assert.equal(unknownProvenance.sourceResults[0].lastGoodAt, null, 'stale fallbacks must not invent a current last-good timestamp');
});

test('a not-due source preserves a stale non-alertable envelope during backoff', () => {
  const previous = {
    sourceId: 'precision:ga',
    stale: true,
    alertable: false,
    lastGoodAt: '2026-07-24T21:41:49.438Z',
    value: {
      signals: [{
        id: 'ga-retained',
        stale: true,
        alertable: false,
        canAlertAsInventory: false,
        canAlertAsWatch: false,
        raw: { staleFallback: true },
      }],
      roadblocks: [],
    },
  };
  const result = createSourceSkippedResult({
    adapter: { id: 'precision:ga', label: 'Georgia precision', url: 'https://ga.example.test', metadata: { stateId: 'GA' } },
    previous,
    status: 'not_due',
    now: '2026-07-24T22:00:00.000Z',
  });

  assert.equal(result.status, 'not_due');
  assert.equal(result.stale, true);
  assert.equal(result.alertable, false);
  assert.equal(result.value.signals[0].stale, true);
  assert.equal(result.value.signals[0].canAlertAsInventory, false);
  assert.equal(result.value.signals[0].canAlertAsWatch, false);
});

test('legacy precision source quarantine remains public but non-alertable and recovery closes a persisted half-open circuit', async () => {
  const quarantined = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-quarantined',
    label: 'Fixture quarantined precision source',
    url: 'https://quarantined.fixture.test/source',
    collect: () => resultValue('public-nonalertable.json'),
    sourceRunnerOptions: { quarantinedSourceIds: new Set(['precision:fixture-quarantined']), maxAttempts: 1, timeoutMs: 100 },
  });
  assert.equal(quarantined.sourceResults[0].status, 'quarantined');
  assert.equal(quarantined.sourceResults[0].ok, false);
  assert.equal(quarantined.signals[0].canAlertAsInventory, false);
  assert.equal(quarantined.signals[0].canAlertAsWatch, false);

  let now = Date.parse('2026-07-15T12:00:00.000Z');
  const breaker = new SourceCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, now: () => now });
  const failed = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-recovery',
    label: 'Fixture recovery precision source',
    url: 'https://recovery.fixture.test/source',
    collect: async () => { throw new TransientSourceError('fixture unreachable'); },
    circuitBreaker: breaker,
    sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100 },
  });
  assert.equal(failed.sourceResults[0].status, 'transient_error');
  now += 1_001;
  const recovered = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-recovery',
    label: 'Fixture recovery precision source',
    url: 'https://recovery.fixture.test/source',
    collect: () => resultValue('recovery.json'),
    circuitBreaker: breaker,
    sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100 },
  });
  assert.equal(recovered.sourceResults[0].status, 'success');
  assert.equal(breaker.snapshot('precision:fixture-recovery').state, 'closed');
});

test('legacy precision malformed, unreachable, and collapsed fixture scenarios fail closed without touching healthy source history', async () => {
  const malformed = await fixture('malformed-payload.json');
  const unreachable = await fixture('unreachable.json');
  const collapse = await fixture('collapse.json');
  const malformedResult = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-malformed',
    label: 'Fixture malformed precision source',
    url: 'https://malformed.fixture.test/source',
    collect: () => Promise.resolve(malformed.value),
    sourceRunnerOptions: { maxAttempts: 2, timeoutMs: 100, retryDelayMs: 0 },
  });
  assert.equal(malformedResult.sourceResults[0].status, malformed.expected.status);
  assert.equal(malformedResult.sourceResults[0].attemptCount, 1);

  const unreachableResult = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-unreachable',
    label: 'Fixture unreachable precision source',
    url: 'https://unreachable.fixture.test/source',
    collect: async () => { throw new TransientSourceError(unreachable.scenario); },
    sourceRunnerOptions: { maxAttempts: 2, timeoutMs: 100, retryDelayMs: 0 },
  });
  assert.equal(unreachableResult.sourceResults[0].status, 'transient_error');
  assert.equal(unreachableResult.sourceResults[0].attemptCount, 2);

  const previousSignals = Array.from({ length: collapse.previousRecordCount }, (_, index) => ({
    id: `prior-${index}`,
    observedAt: '2026-07-15T12:00:00.000Z',
    canAlertAsInventory: true,
    canAlertAsWatch: true,
  }));
  const collapsedResult = await runLegacyPrecisionSource({
    sourceId: 'precision:fixture-collapse',
    label: 'Fixture collapsed precision source',
    url: 'https://collapse.fixture.test/source',
    collect: () => Promise.resolve({ signals: collapse.value.signals, roadblocks: [] }),
    previousResults: {
      'precision:fixture-collapse': {
        sourceId: 'precision:fixture-collapse',
        lastGoodAt: '2026-07-15T12:00:00.000Z',
        value: { signals: previousSignals, roadblocks: [] },
      },
    },
    sourceRunnerOptions: { maxAttempts: 2, timeoutMs: 100, retryDelayMs: 0 },
  });
  assert.equal(collapsedResult.sourceResults[0].status, collapse.expected.status);
  assert.equal(collapsedResult.sourceResults[0].attemptCount, 1);
  assert.equal(collapsedResult.signals.length, collapse.previousRecordCount);
  assert.equal(collapsedResult.signals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false), true);
});
