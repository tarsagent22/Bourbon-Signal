import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildStateRecoveryPlan } from '../src/state-recovery-plan.mjs';

const contract = {
  contractVersion: 'bourbon-signal-state-operating-v1',
  summary: { retryStateIds: ['AA', 'BB'] },
  states: [
    { state: 'AA', health: 'degraded', recoveryAction: 'retry_state_collection', collection: { status: 'failed_timeout' } },
    { state: 'BB', health: 'stale_useful', recoveryAction: 'retry_state_collection', collection: { status: 'stale_useful' }, fallback: { reason: 'temporary network timeout' } },
    { state: 'CC', health: 'blocked', recoveryAction: 'manual_validation_required', collection: { status: 'failed_schema_validation' } },
    { state: 'DD', health: 'healthy', recoveryAction: 'none', collection: { status: 'useful' } },
  ],
};

test('recovery planning targets only requested transient degraded states', () => {
  const plan = buildStateRecoveryPlan(contract, { failedStateIds: ['CC', 'AA', 'DD', 'BB'], attempt: 0 });
  assert.deepEqual(plan.retryStateIds, ['AA', 'BB']);
  assert.deepEqual(plan.skipped, [
    { state: 'CC', reason: 'blocked_deterministic_validation' },
    { state: 'DD', reason: 'not_transient_or_degraded' },
  ]);
  assert.equal(plan.nextAttempt, 1);
  assert.equal(plan.maxAttempts, 2);
});

test('recovery attempts are capped at two and cannot be raised by callers', () => {
  const plan = buildStateRecoveryPlan(contract, { failedStateIds: ['AA'], attempt: 2, maxAttempts: 99 });
  assert.deepEqual(plan.retryStateIds, []);
  assert.deepEqual(plan.skipped, [{ state: 'AA', reason: 'attempt_cap_reached' }]);
  assert.equal(plan.maxAttempts, 2);
});

test('stale fallback without explicit transient evidence is not automatically retried', () => {
  const ambiguous = structuredClone(contract);
  ambiguous.states.find((state) => state.state === 'BB').fallback.reason = 'scheduled verifier failed';
  const plan = buildStateRecoveryPlan(ambiguous, { failedStateIds: ['BB'], attempt: 0 });
  assert.deepEqual(plan.retryStateIds, []);
  assert.deepEqual(plan.skipped, [{ state: 'BB', reason: 'not_transient_or_degraded' }]);
});

test('the shared refresh workflow plans recovery after fallback and dispatches one state-only run after production verification', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  const apply = workflow.indexOf('scheduled-state-verification.mjs apply');
  const plan = workflow.indexOf('plan-state-recovery.mjs');
  const production = workflow.indexOf('Verify production observes the refreshed engine');
  const dispatch = workflow.indexOf('Dispatch isolated recovery from current main');
  assert.ok(apply < plan && plan < production && production < dispatch);
  assert.match(workflow, /--max-attempts=2/);
  assert.match(workflow, /-f states="\$TARGET_STATES"/);
  assert.match(workflow, /if: \$\{\{ !inputs\.states \}\}/);
});
