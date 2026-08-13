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

test('a stale or fallback-backed degraded state with an alert candidate fails closed without implicating healthy states', () => {
  const result = assessStateFailureIsolation(fixture({
    alerts: [{ state: 'OH', eligibleForDelivery: true }],
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.unsafeStateIds, ['OH']);
  assert.match(result.issues[0], /degraded state OH.*alert/i);
  assert.deepEqual(result.healthyStateIds, ['CA']);
});

test('a fresh anomaly-only degraded state may retain independently validated alerts', () => {
  const result = assessStateFailureIsolation({
    stateCoverage: { states: [{ state: 'VA', status: 'useful', stale: false }] },
    refreshHealth: {
      degradedStateCount: 1,
      staleStateCount: 0,
      failedStateCount: 0,
      states: [{ state: 'VA', health: 'degraded', freshness: { status: 'fresh' }, fallback: { status: 'none' } }],
      degradedStates: [{ state: 'VA', status: 'degraded', stale: false, staleReason: 'significant_drop_count_collapse' }],
    },
    alerts: [{ state: 'VA', eligibleForDelivery: true }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.degradedStateIds, ['VA']);
  assert.deepEqual(result.unsafeStateIds, []);
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

test('the operating contract can explicitly label a blocked state without rewriting legacy coverage status', () => {
  const result = assessStateFailureIsolation({
    stateCoverage: { states: [{ state: 'CA', status: 'useful' }] },
    refreshHealth: {
      degradedStateCount: 1,
      staleStateCount: 0,
      failedStateCount: 1,
      states: [{ state: 'CA', health: 'blocked' }],
      degradedStates: [{ state: 'CA', status: 'blocked', stale: false }],
    },
    alerts: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.degradedStateIds, ['CA']);
});

test('scheduled workflow contains California retained-not-due exceptions but keeps targeted recovery strict', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  assert.match(workflow, /Verify California scheduled lane or isolate a safe retained partition/);
  assert.match(workflow, /scheduled-state-verification\.mjs verify --state=CA -- npm run verify:ca -- --allow-safe-retained-not-due/);
  assert.match(workflow, /Verify California targeted exact-store recovery/);
  assert.match(workflow, /npm run verify:ca\s*$/m);
  assert.match(workflow, /Verify degraded state isolation before publication/);
  assert.match(workflow, /verify:state-isolation/);
});

test('scheduled workflow isolates state verifier failures before unconditional release gates while targeted runs stay strict', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const prepare = workflow.indexOf('scheduled-state-verification.mjs prepare');
  const refresh = workflow.indexOf('run: npm run refresh:site');
  const apply = workflow.indexOf('scheduled-state-verification.mjs apply');
  const coherence = workflow.indexOf('Verify coherent site contract unconditionally');
  const integration = workflow.indexOf('Verify no unproven state promotion entered the customer path');
  const isolation = workflow.indexOf('Verify degraded state isolation before publication');
  const release = workflow.indexOf('Refuse publication from a stale main checkout');
  const publish = workflow.indexOf('Publish and atomically activate encrypted snapshot');

  assert.ok(prepare > 0 && prepare < refresh, 'the last-published contract must be preserved before candidate export');
  assert.ok(refresh < apply && apply < coherence && coherence < integration && integration < isolation && isolation < release && release < publish,
    'fallback regeneration must precede every unconditional global, coherence, isolation, release, and publication gate');
  for (const state of ['NC', 'GA', 'VA', 'PA', 'FL', 'CA', 'TN']) {
    assert.match(workflow, new RegExp(`scheduled-state-verification\\.mjs verify --state=${state} -- npm run verify:`), `${state} scheduled verification must use the isolated wrapper`);
  }
  assert.match(workflow, /Verify Florida scheduled immutable full-store expansion or isolate its partition[\s\S]{0,300}--state=FL -- npm run verify:fl:15-20/);
  assert.match(workflow, /Verify Florida targeted immutable full-store expansion strictly[\s\S]{0,260}inputs\.states && contains\(inputs\.states, 'FL'\)[\s\S]{0,180}run: npm run verify:fl:15-20/);
  assert.match(workflow, /Verify North Carolina targeted recovery strictly[\s\S]{0,260}run: npm run verify:nc\s*$/m);
  assert.match(workflow, /engine\/out\/scheduled-state-verification\.json/, 'the failed-state ledger must be retained in refresh diagnostics');
  assert.doesNotMatch(workflow.slice(apply, publish), /continue-on-error:\s*true[\s\S]*Verify (?:coherent|no unproven|degraded)/,
    'global publication gates must remain fatal');
});

test('California verifier exposes an explicit safe scheduled mode without weakening targeted mode', async () => {
  const verifier = await readFile(new URL('../src/verify-ca.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /allow-safe-retained-not-due/);
  assert.match(verifier, /retainedNotDue/);
  assert.match(verifier, /scheduledOnlyException/);
});
