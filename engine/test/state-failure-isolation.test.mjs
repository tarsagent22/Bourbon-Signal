import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assessStateFailureIsolation } from '../src/state-failure-isolation.mjs';

function fixture(overrides = {}) {
  return {
    stateCoverage: {
      states: [
        { state: 'CA', status: 'useful_retained_not_due', stale: false, signalCount: 20, roadblockCount: 0 },
        { state: 'OH', status: 'stale_useful', stale: true, signalCount: 399, roadblockCount: 1 },
        { state: 'ID', status: 'stale_reachable_needs_deeper_parser', stale: true, signalCount: 135, roadblockCount: 1 },
      ],
    },
    refreshHealth: {
      degradedStateCount: 2,
      staleStateCount: 2,
      failedStateCount: 0,
      degradedStates: [
        { state: 'OH', status: 'stale_useful', stale: true },
        { state: 'ID', status: 'stale_reachable_needs_deeper_parser', stale: true },
      ],
    },
    alerts: [
      { state: 'CA', eligibleForDelivery: true },
    ],
    ...overrides,
  };
}

test('degraded states remain visible but cannot emit alert candidates or poison healthy states', () => {
  const result = assessStateFailureIsolation(fixture());
  assert.equal(result.ok, true);
  assert.deepEqual(result.degradedStateIds, ['ID', 'OH']);
  assert.deepEqual(result.unsafeStateIds, []);
  assert.deepEqual(result.healthyStateIds, ['CA']);
});

test('a degraded state with an alert candidate fails closed without implicating healthy states', () => {
  const result = assessStateFailureIsolation(fixture({
    alerts: [{ state: 'OH', eligibleForDelivery: true }],
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.unsafeStateIds, ['OH']);
  assert.match(result.issues[0], /degraded state OH.*alert/i);
  assert.deepEqual(result.healthyStateIds, ['CA']);
});

test('every degraded state must remain represented in the published state contract', () => {
  const data = fixture();
  data.stateCoverage.states = data.stateCoverage.states.filter((row) => row.state !== 'ID');
  const result = assessStateFailureIsolation(data);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unsafeStateIds, ['ID']);
  assert.match(result.issues[0], /missing/i);
});

test('missing publication health inputs fail closed', () => {
  assert.equal(assessStateFailureIsolation().ok, false);
  const missingHealth = assessStateFailureIsolation({
    stateCoverage: { states: [{ state: 'CA', status: 'useful' }] },
    alerts: [],
  });
  assert.equal(missingHealth.ok, false);
  assert.match(missingHealth.issues.join(' '), /refresh health/i);
});

test('reported failure counts must agree with the labeled state list', () => {
  const result = assessStateFailureIsolation({
    stateCoverage: { states: [{ state: 'CA', status: 'useful' }] },
    refreshHealth: { failedStateCount: 1, degradedStateCount: 1, staleStateCount: 0, degradedStates: [] },
    alerts: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.issues.join(' '), /count/i);
});

test('scheduled workflow contains California retained-not-due exceptions but keeps targeted recovery strict', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Verify California scheduled lane or isolate a safe retained partition/);
  assert.match(workflow, /verify:ca -- --allow-safe-retained-not-due/);
  assert.match(workflow, /Verify California targeted exact-store recovery/);
  assert.match(workflow, /npm run verify:ca\s*$/m);
  assert.match(workflow, /Verify degraded state isolation before publication/);
  assert.match(workflow, /verify:state-isolation/);
});

test('California verifier exposes an explicit safe scheduled mode without weakening targeted mode', async () => {
  const verifier = await readFile(new URL('../src/verify-ca.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /allow-safe-retained-not-due/);
  assert.match(verifier, /retainedNotDue/);
  assert.match(verifier, /scheduledOnlyException/);
});
