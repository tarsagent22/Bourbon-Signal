import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createSourceAdapter } from '../src/sources/source-adapter.mjs';
import {
  MalformedSourceError,
  TransientSourceError,
} from '../src/sources/source-error.mjs';
import { SourceCircuitBreaker } from '../src/sources/circuit-breaker.mjs';
import { runSourceAdapters } from '../src/sources/source-runner.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/source-runtime/${name}`, import.meta.url), 'utf8'));

function adapter(id, execute, options = {}) {
  return createSourceAdapter({
    id,
    label: id,
    url: `https://${id}.fixture.test/source`,
    execute,
    recordCount: (value) => value.signals.length,
    ...options,
  });
}

function byId(results) {
  return Object.fromEntries(results.map((result) => [result.sourceId, result]));
}

test('throwing, timed out, malformed, and collapsed sources cannot stop healthy siblings', async () => {
  const previous = byId((await runSourceAdapters([
    adapter('collapse', async () => ({ signals: Array.from({ length: 10 }, (_, index) => ({ id: `old-${index}`, canAlertAsInventory: true, observedAt: '2026-07-15T12:00:00.000Z' })) })),
  ], {}, { now: () => '2026-07-15T12:00:00.000Z' })).results);

  const adapters = [
    adapter('healthy-a', async () => fixture('healthy-a.json')),
    adapter('throws', async () => { throw new Error('fixture exploded'); }),
    adapter('timeout', async (_context, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })),
    adapter('malformed', async () => fixture('malformed.json'), {
      validate: (value) => Array.isArray(value?.signals) || 'fixture payload requires signals',
    }),
    adapter('collapse', async () => ({ signals: [{ id: 'only-one' }] })),
    adapter('healthy-b', async () => fixture('healthy-b.json')),
  ];

  const { results } = await runSourceAdapters(adapters, {}, {
    previousResults: previous,
    concurrency: 3,
    timeoutMs: 50,
    maxAttempts: 2,
    retryDelayMs: 0,
    now: () => '2026-07-15T13:00:00.000Z',
  });
  const indexed = byId(results);

  assert.deepEqual(results.map((result) => result.sourceId), adapters.map((source) => source.id));
  assert.equal(indexed['healthy-a'].status, 'success');
  assert.equal(indexed['healthy-b'].status, 'success');
  assert.equal(indexed.throws.error.kind, 'unexpected');
  assert.equal(indexed.throws.attemptCount, 1);
  assert.equal(indexed.timeout.error.kind, 'timeout');
  assert.equal(indexed.timeout.attemptCount, 2);
  assert.equal(indexed.malformed.error.kind, 'malformed');
  assert.equal(indexed.malformed.attemptCount, 1);
  assert.equal(indexed.collapse.error.kind, 'collapsed');
  assert.equal(indexed.collapse.attemptCount, 1);
  assert.equal(indexed.collapse.stale, true);
  assert.equal(indexed.collapse.value.signals.length, 10);
});

test('only transient errors receive a bounded retry', async () => {
  const attempts = { transient: 0, malformed: 0 };
  const { results } = await runSourceAdapters([
    adapter('transient', async () => {
      attempts.transient += 1;
      if (attempts.transient < 3) throw new TransientSourceError('fixture 503');
      return fixture('healthy-a.json');
    }),
    adapter('malformed', async () => {
      attempts.malformed += 1;
      throw new MalformedSourceError('bad schema');
    }),
  ], {}, { maxAttempts: 3, retryDelayMs: 0, timeoutMs: 100 });

  const indexed = byId(results);
  assert.equal(indexed.transient.status, 'success');
  assert.equal(indexed.transient.attemptCount, 3);
  assert.equal(indexed.malformed.status, 'malformed');
  assert.equal(indexed.malformed.attemptCount, 1);
  assert.deepEqual(attempts, { transient: 3, malformed: 1 });
});

test('last-good provenance remains unchanged and stale or quarantined data is not alertable', async () => {
  const [lastGood] = (await runSourceAdapters([
    adapter('retained', async () => fixture('healthy-a.json')),
  ], {}, { now: () => '2026-07-15T12:00:00.000Z' })).results;

  const [stale] = (await runSourceAdapters([
    adapter('retained', async () => { throw new TransientSourceError('temporary outage'); }),
  ], {}, {
    previousResults: { retained: lastGood },
    maxAttempts: 1,
    now: () => '2026-07-15T13:00:00.000Z',
  })).results;

  assert.equal(stale.finishedAt, '2026-07-15T13:00:00.000Z');
  assert.equal(stale.lastGoodAt, '2026-07-15T12:00:00.000Z');
  assert.equal(stale.value.signals[0].observedAt, '2026-07-15T12:00:00.000Z');
  assert.equal(stale.stale, true);
  assert.equal(stale.alertable, false);
  assert.equal(stale.value.signals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false), true);

  const [quarantined] = (await runSourceAdapters([
    adapter('quarantined', async () => fixture('healthy-b.json')),
  ], {}, { quarantinedSourceIds: new Set(['quarantined']) })).results;
  assert.equal(quarantined.status, 'quarantined');
  assert.equal(quarantined.ok, true);
  assert.equal(quarantined.alertable, false);
  assert.equal(quarantined.value.signals[0].canAlertAsInventory, false);
});

test('configured quarantine survives timeout and failure outcomes', async () => {
  const [lastGood] = (await runSourceAdapters([
    adapter('quarantined-failure', async () => fixture('healthy-a.json')),
  ], {}, { now: () => '2026-07-15T12:00:00.000Z' })).results;

  const [timedOut] = (await runSourceAdapters([
    adapter('quarantined-failure', async (_context, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })),
  ], {}, {
    previousResults: { 'quarantined-failure': lastGood },
    quarantinedSourceIds: new Set(['quarantined-failure']),
    maxAttempts: 1,
    timeoutMs: 10,
    now: () => '2026-07-15T13:00:00.000Z',
  })).results;

  assert.equal(timedOut.status, 'quarantined');
  assert.equal(timedOut.quarantined, true);
  assert.equal(timedOut.ok, false, 'quarantine must not disguise a failed diagnostic probe as success');
  assert.equal(timedOut.error.kind, 'timeout');
  assert.equal(timedOut.stale, true);
  assert.equal(timedOut.alertable, false);
  assert.equal(timedOut.value.signals.every((signal) => signal.canAlertAsInventory === false && signal.canAlertAsWatch === false), true);

  const [failed] = (await runSourceAdapters([
    adapter('quarantined-failure', async () => { throw new Error('fixture failure'); }),
  ], {}, {
    quarantinedSourceIds: new Set(['quarantined-failure']),
    maxAttempts: 1,
    now: () => '2026-07-15T14:00:00.000Z',
  })).results;
  assert.equal(failed.status, 'quarantined');
  assert.equal(failed.quarantined, true);
  assert.equal(failed.ok, false);
  assert.equal(failed.error.kind, 'unexpected');
});

test('circuit breaker opens per source and admits one half-open recovery after cooldown', async () => {
  let nowMs = Date.parse('2026-07-15T12:00:00.000Z');
  let calls = 0;
  const breaker = new SourceCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000, now: () => nowMs });
  const failing = adapter('fragile', async () => {
    calls += 1;
    throw new TransientSourceError('upstream unavailable');
  });

  for (let count = 0; count < 2; count += 1) {
    const [result] = (await runSourceAdapters([failing], {}, { circuitBreaker: breaker, maxAttempts: 1 })).results;
    assert.equal(result.status, 'transient_error');
  }
  const [open] = (await runSourceAdapters([failing], {}, { circuitBreaker: breaker, maxAttempts: 1 })).results;
  assert.equal(open.status, 'circuit_open');
  assert.equal(open.attemptCount, 0);
  assert.equal(calls, 2);

  nowMs += 1_001;
  const [recovered] = (await runSourceAdapters([
    adapter('fragile', async () => { calls += 1; return fixture('healthy-b.json'); }),
  ], {}, { circuitBreaker: breaker, maxAttempts: 1 })).results;
  assert.equal(recovered.status, 'success');
  assert.equal(breaker.snapshot('fragile').state, 'closed');
  assert.equal(calls, 3);
});

test('source scheduler reuses a retained result without probing or inventing a new check time', async () => {
  let calls = 0;
  const scheduled = adapter('scheduled', async () => { calls += 1; return fixture('healthy-b.json'); });
  const [previous] = (await runSourceAdapters([scheduled], {}, {
    now: () => '2026-07-15T12:00:00.000Z',
  })).results;
  const [notDue] = (await runSourceAdapters([scheduled], {}, {
    previousResults: { scheduled: previous },
    sourceMetrics: { scheduled: { probes: 1, lastProbeAt: '2026-07-15T12:00:00.000Z' } },
    baseCadenceMs: 60_000,
    minCadenceMs: 60_000,
    maxCadenceMs: 60_000,
    now: () => '2026-07-15T12:00:30.000Z',
  })).results;

  assert.equal(calls, 1);
  assert.equal(notDue.status, 'not_due');
  assert.equal(notDue.attemptCount, 0);
  assert.equal(notDue.checkedAt, previous.checkedAt);
  assert.equal(notDue.lastGoodAt, previous.lastGoodAt);
  assert.equal(notDue.alertable, true);
  assert.equal(notDue.value.signals[0].canAlertAsInventory, true);
});

test('quarantine overrides scheduler short-circuits and retained alertability', async () => {
  const scheduled = adapter('scheduled-quarantine', async () => fixture('healthy-b.json'));
  const [previous] = (await runSourceAdapters([scheduled], {}, {
    now: () => '2026-07-15T12:00:00.000Z',
  })).results;
  const [notDue] = (await runSourceAdapters([scheduled], {}, {
    previousResults: { 'scheduled-quarantine': previous },
    quarantinedSourceIds: new Set(['scheduled-quarantine']),
    sourceMetrics: { 'scheduled-quarantine': { probes: 1, lastProbeAt: '2026-07-15T12:00:00.000Z' } },
    baseCadenceMs: 60_000,
    minCadenceMs: 60_000,
    maxCadenceMs: 60_000,
    now: () => '2026-07-15T12:00:30.000Z',
  })).results;

  assert.equal(notDue.status, 'quarantined');
  assert.equal(notDue.quarantined, true);
  assert.equal(notDue.alertable, false);
  assert.equal(notDue.stale, true);
  assert.equal(notDue.value.signals[0].canAlertAsInventory, false);
});
