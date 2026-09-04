import test from 'node:test';
import assert from 'node:assert/strict';

import { planEngineRecovery } from './engine-recovery-dispatch-plan.mjs';

const watchdog = {
  generatedAt: '2026-07-31T04:25:09.321Z',
  snapshotId: 'snapshot-123',
  recoveryStates: [],
  failures: ['Production engine snapshot is stale.'],
};
const headSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('holds the same completed full-recovery incident inside the bounded backoff window', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha });
  assert.equal(first.dispatch, true);
  assert.match(first.incidentKey, /^[a-f0-9]{20}$/);
  const repeated = planEngineRecovery({
    watchdog,
    headSha,
    now: '2026-07-31T04:25:00.000Z',
    runs: [{
      databaseId: 9,
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'success',
      headSha,
      createdAt: '2026-07-31T04:20:00.000Z',
      displayTitle: `Inventory recovery ${first.incidentKey}`,
    }],
  });
  assert.equal(repeated.dispatch, false);
  assert.equal(repeated.reason, 'recovery_backoff');
});

test('allows recovery after main or the incident fingerprint changes', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha });
  const prior = [{ event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', headSha, createdAt: '2026-07-31T03:00:00.000Z', displayTitle: `Inventory recovery ${first.incidentKey}` }];
  assert.equal(planEngineRecovery({ watchdog, runs: prior, headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }).dispatch, true);
  assert.equal(planEngineRecovery({ watchdog: { ...watchdog, failures: ['Different failure'] }, runs: prior, headSha }).dispatch, true);
});

test('deduplicates a matching targeted recovery but not an unrelated full failure', () => {
  const targeted = { ...watchdog, recoveryStates: ['NC'] };
  const plan = planEngineRecovery({ watchdog: targeted, runs: [], headSha });
  const unrelated = [{ event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', headSha, createdAt: '2026-07-31T03:00:00.000Z', displayTitle: 'Inventory recovery ffffffffffffffffffff' }];
  assert.equal(planEngineRecovery({ watchdog: targeted, runs: unrelated, headSha }).dispatch, true);
  const matching = [{ ...unrelated[0], createdAt: '2026-07-31T04:20:00.000Z', displayTitle: `Inventory recovery ${plan.incidentKey}` }];
  const backedOff = planEngineRecovery({ watchdog: targeted, runs: matching, headSha, now: '2026-07-31T04:25:00.000Z' });
  assert.equal(backedOff.dispatch, false);
  assert.equal(backedOff.reason, 'recovery_backoff');
});

test('does not queue behind an already active refresh', () => {
  const plan = planEngineRecovery({ watchdog, headSha, runs: [{ event: 'schedule', status: 'in_progress', conclusion: null, headSha, displayTitle: 'Production inventory refresh' }] });
  assert.equal(plan.dispatch, false);
  assert.equal(plan.reason, 'active_refresh');
});

test('defers Ohio from a multi-state recovery so missing OHLQ evidence cannot block other states', () => {
  const plan = planEngineRecovery({
    watchdog: { ...watchdog, recoveryStates: ['TX', 'OH', 'CO'] },
    runs: [],
    headSha,
  });
  assert.deepEqual(plan.states, ['CO', 'TX']);
  assert.deepEqual(plan.deferredStates, ['OH']);

  const ohioOnly = planEngineRecovery({
    watchdog: { ...watchdog, recoveryStates: ['OH'] },
    runs: [],
    headSha,
  });
  assert.deepEqual(ohioOnly.states, ['OH']);
  assert.deepEqual(ohioOnly.deferredStates, []);
});

test('retries the same unchanged incident after the bounded backoff window', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha });
  const repeated = planEngineRecovery({
    watchdog,
    headSha,
    now: '2026-07-31T04:50:00.000Z',
    runs: [{
      databaseId: 9,
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'failure',
      headSha,
      createdAt: '2026-07-31T04:20:00.000Z',
      displayTitle: `Inventory recovery ${first.incidentKey}`,
    }],
  });
  assert.equal(repeated.dispatch, true);
  assert.equal(repeated.attempt, 2);
  assert.equal(repeated.reason, 'recovery_needed');
});

test('opens a bounded incident circuit after repeated unchanged recovery attempts', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha });
  const runs = [0, 1, 2, 3].map((index) => ({
    databaseId: index + 1,
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'failure',
    headSha,
    createdAt: `2026-07-31T0${index + 1}:00:00.000Z`,
    displayTitle: `Inventory recovery ${first.incidentKey}`,
  }));
  const blocked = planEngineRecovery({
    watchdog,
    headSha,
    now: '2026-07-31T04:30:00.000Z',
    runs,
  });
  assert.equal(blocked.dispatch, false);
  assert.equal(blocked.reason, 'incident_circuit_open');
});
