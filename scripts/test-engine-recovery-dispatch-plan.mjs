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

test('suppresses the same completed full-recovery incident regardless of outcome', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha });
  assert.equal(first.dispatch, true);
  assert.match(first.incidentKey, /^[a-f0-9]{20}$/);
  const repeated = planEngineRecovery({
    watchdog,
    headSha,
    runs: [{
      databaseId: 9,
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'success',
      headSha,
      displayTitle: `Inventory recovery ${first.incidentKey}`,
    }],
  });
  assert.equal(repeated.dispatch, false);
  assert.equal(repeated.reason, 'matching_recovery_attempt');
});

test('allows recovery after main or the incident fingerprint changes', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha });
  const prior = [{ event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', headSha, displayTitle: `Inventory recovery ${first.incidentKey}` }];
  assert.equal(planEngineRecovery({ watchdog, runs: prior, headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }).dispatch, true);
  assert.equal(planEngineRecovery({ watchdog: { ...watchdog, failures: ['Different failure'] }, runs: prior, headSha }).dispatch, true);
});

test('deduplicates a matching targeted recovery but not an unrelated full failure', () => {
  const targeted = { ...watchdog, recoveryStates: ['NC'] };
  const plan = planEngineRecovery({ watchdog: targeted, runs: [], headSha });
  const unrelated = [{ event: 'workflow_dispatch', status: 'completed', conclusion: 'failure', headSha, displayTitle: 'Inventory recovery ffffffffffffffffffff' }];
  assert.equal(planEngineRecovery({ watchdog: targeted, runs: unrelated, headSha }).dispatch, true);
  const matching = [{ ...unrelated[0], displayTitle: `Inventory recovery ${plan.incidentKey}` }];
  assert.equal(planEngineRecovery({ watchdog: targeted, runs: matching, headSha }).dispatch, false);
});

test('does not queue behind an already active refresh', () => {
  const plan = planEngineRecovery({ watchdog, headSha, runs: [{ event: 'schedule', status: 'in_progress', conclusion: null, headSha, displayTitle: 'Production inventory refresh' }] });
  assert.equal(plan.dispatch, false);
  assert.equal(plan.reason, 'active_refresh');
});
