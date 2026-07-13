import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateProductionHealth } from '../../scripts/production-engine-watchdog.mjs';

const now = Date.parse('2026-07-13T12:00:00.000Z');
const activeStates = ['NC', 'FL', 'TX'];

function healthyInput(overrides = {}) {
  return {
    nowMs: now,
    activeStates,
    stats: {
      ok: true,
      status: 200,
      snapshotId: 'snapshot-1',
      source: 'remote-snapshot',
      body: {
        generatedAt: '2026-07-13T11:30:00.000Z',
        stateCount: 3,
        refreshHealth: { failedStateCount: 0 },
      },
    },
    stateChecks: activeStates.map((state) => ({ state, ok: true, status: 200, total: state === 'NC' ? 0 : 2, source: 'remote-snapshot', snapshotId: 'snapshot-1' })),
    ...overrides,
  };
}

test('watchdog accepts a fresh exact-coverage remote production snapshot', () => {
  const result = evaluateProductionHealth(healthyInput());
  assert.equal(result.ok, true);
  assert.equal(result.snapshotAgeMinutes, 30);
  assert.deepEqual(result.failures, []);
});

test('watchdog rejects stale, partial, bundled, or failed-state production', () => {
  const input = healthyInput();
  input.stats.source = 'local-export';
  input.stats.body.generatedAt = '2026-07-13T10:00:00.000Z';
  input.stats.body.stateCount = 2;
  input.stats.body.refreshHealth.failedStateCount = 1;
  input.stateChecks[2].ok = false;
  const result = evaluateProductionHealth(input);
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /remote snapshot/i);
  assert.match(result.failures.join('\n'), /45 minutes/i);
  assert.match(result.failures.join('\n'), /state count/i);
  assert.match(result.failures.join('\n'), /failed state/i);
  assert.match(result.failures.join('\n'), /TX/i);
});

test('watchdog rejects a state partition served from fallback or a different snapshot', () => {
  const input = healthyInput();
  input.stateChecks[1].source = 'cache-fallback';
  input.stateChecks[2].snapshotId = 'snapshot-older';
  const result = evaluateProductionHealth(input);
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /FL.*remote snapshot/i);
  assert.match(result.failures.join('\n'), /TX.*snapshot/i);
});

test('watchdog reports recent rollback events without treating a healthy feed as failed', () => {
  const report = evaluateProductionHealth({
    ...healthyInput(),
    opsHealth: { body: { engine: { lastRollback: { at: '2026-07-13T11:30:00.000Z', from: 'bad', to: 'good' } } } },
  });
  assert.equal(report.ok, true);
  assert.match(report.warnings[0], /rollback observed/i);
});

test('watchdog treats zero rows as valid when the state endpoint and partition are healthy', () => {
  const result = evaluateProductionHealth(healthyInput());
  assert.equal(result.stateChecks.find((row) => row.state === 'NC').total, 0);
  assert.equal(result.ok, true);
});
