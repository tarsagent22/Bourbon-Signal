import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPipelineFreshness } from '../src/data-plane/freshness.mjs';
import { createRecoveryWatchdog, planRecovery } from '../src/data-plane/recovery-watchdog.mjs';

const NOW = Date.parse('2026-07-09T12:00:00.000Z');
const isoMinutesAgo = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
const policies = {
  collect: { staleAfterMs: 10 * 60_000, failedAfterMs: 30 * 60_000 },
  aggregate: { staleAfterMs: 5 * 60_000, failedAfterMs: 15 * 60_000 },
  publish: { staleAfterMs: 3 * 60_000, failedAfterMs: 10 * 60_000 },
  consume: { staleAfterMs: 2 * 60_000, failedAfterMs: 6 * 60_000 },
};

test('freshness is stage-specific at exact deterministic boundaries', () => {
  const result = classifyPipelineFreshness({
    collect: isoMinutesAgo(10),
    aggregate: isoMinutesAgo(6),
    publish: isoMinutesAgo(11),
    consume: null,
  }, { nowMs: NOW, policies });

  assert.equal(result.collect.classification, 'fresh');
  assert.equal(result.aggregate.classification, 'stale');
  assert.equal(result.publish.classification, 'failed');
  assert.equal(result.consume.classification, 'missing');
  assert.equal(result.overall, 'failed');
});

test('recovery plan starts at earliest unhealthy pipeline stage', () => {
  assert.deepEqual(planRecovery({
    collect: { classification: 'fresh' },
    aggregate: { classification: 'failed' },
    publish: { classification: 'stale' },
    consume: { classification: 'missing' },
  }), ['aggregate', 'publish', 'consume']);
});

test('watchdog retries deterministically and coalesces concurrent runs', async () => {
  let attempts = 0;
  const delays = [];
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const watchdog = createRecoveryWatchdog({
    maxAttempts: 3,
    retryDelayMs: 25,
    sleep: async (ms) => { delays.push(ms); },
    runStage: async (stage) => {
      attempts += 1;
      if (attempts === 1) await gate;
      if (attempts < 3) throw new Error(`${stage} transient`);
      return `${stage}-ok`;
    },
  });
  const health = {
    collect: { classification: 'failed' },
    aggregate: { classification: 'fresh' },
    publish: { classification: 'fresh' },
    consume: { classification: 'fresh' },
  };

  const first = watchdog.recover(health);
  const second = watchdog.recover(health);
  assert.equal(first, second);
  releaseFirst();
  const result = await first;

  assert.equal(attempts, 6);
  assert.deepEqual(delays, [25, 50]);
  assert.equal(result.ok, true);
  assert.equal(result.stages[0].attempts, 3);
  assert.deepEqual(result.stages.map(({ stage }) => stage), ['collect', 'aggregate', 'publish', 'consume']);
});
