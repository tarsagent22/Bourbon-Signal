import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildStateRecoveryPlan } from '../src/state-recovery-plan.mjs';
import { runStateRecoveryPlanner } from '../src/plan-state-recovery.mjs';

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

test('recovery planning isolates one transient degraded state and defers siblings', () => {
  const plan = buildStateRecoveryPlan(contract, { failedStateIds: ['CC', 'AA', 'DD', 'BB'], attempt: 0 });
  assert.deepEqual(plan.retryStateIds, ['AA']);
  assert.deepEqual(plan.deferredRetryStateIds, ['BB']);
  assert.deepEqual(plan.skipped, [
    { state: 'CC', reason: 'blocked_deterministic_validation' },
    { state: 'DD', reason: 'not_retryable_or_degraded' },
  ]);
  assert.equal(plan.nextAttempt, 1);
  assert.equal(plan.maxAttempts, 2);

  const next = buildStateRecoveryPlan(contract, { failedStateIds: ['AA', 'BB'], attempt: 1 });
  assert.deepEqual(next.retryStateIds, ['BB']);
  assert.deepEqual(next.deferredRetryStateIds, ['AA']);
});

test('recovery attempts are capped at two and cannot be raised by callers', () => {
  const plan = buildStateRecoveryPlan(contract, { failedStateIds: ['AA'], attempt: 2, maxAttempts: 99 });
  assert.deepEqual(plan.retryStateIds, []);
  assert.deepEqual(plan.skipped, [{ state: 'AA', reason: 'attempt_cap_reached' }]);
  assert.equal(plan.maxAttempts, 2);
});

test('retry_state_collection remains authoritative even when the fallback reason is generic', () => {
  const ambiguous = structuredClone(contract);
  ambiguous.states.find((state) => state.state === 'BB').fallback.reason = 'scheduled verifier failed';
  const plan = buildStateRecoveryPlan(ambiguous, { failedStateIds: ['BB'], attempt: 0 });
  assert.deepEqual(plan.retryStateIds, ['BB']);
  assert.deepEqual(plan.skipped, []);
});

test('an empty scheduled verifier ledger does not suppress operating-contract recovery targets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bs-state-recovery-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contractPath = path.join(root, 'state-health.json');
  const ledgerPath = path.join(root, 'scheduled-state-verification.json');
  await writeFile(contractPath, JSON.stringify(contract));
  await writeFile(ledgerPath, JSON.stringify({ failures: [] }));

  const plan = await runStateRecoveryPlanner([
    `--contract=${contractPath}`,
    `--verification-ledger=${ledgerPath}`,
    '--attempt=0',
  ]);

  assert.deepEqual(plan.requestedStateIds, ['AA', 'BB']);
  assert.deepEqual(plan.retryStateIds, ['AA']);
  assert.deepEqual(plan.deferredRetryStateIds, ['BB']);
});

test('scheduled verifier failures are unioned with the operating-contract retry set', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bs-state-recovery-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contractPath = path.join(root, 'state-health.json');
  const ledgerPath = path.join(root, 'scheduled-state-verification.json');
  const unionContract = {
    ...contract,
    summary: { retryStateIds: ['AA'] },
    states: [
      ...contract.states,
      { state: 'EE', health: 'degraded', recoveryAction: 'retry_state_collection', collection: { status: 'failed_timeout' } },
    ],
  };
  await writeFile(contractPath, JSON.stringify(unionContract));
  await writeFile(ledgerPath, JSON.stringify({ failures: [{ states: ['EE'] }] }));

  const plan = await runStateRecoveryPlanner([
    `--contract=${contractPath}`,
    `--verification-ledger=${ledgerPath}`,
    '--attempt=0',
  ]);

  assert.deepEqual(plan.requestedStateIds, ['AA', 'EE']);
  assert.deepEqual(plan.retryStateIds, ['AA']);
  assert.deepEqual(plan.deferredRetryStateIds, ['EE']);
});

test('accepted output with a zero-customer anomaly is still retryable even without transient collector text', () => {
  const anomalyOnly = {
    ...contract,
    summary: { retryStateIds: ['BB'] },
    states: [
      { state: 'BB', health: 'degraded', recoveryAction: 'retry_state_collection', collection: { status: 'useful' }, anomalyCodes: ['unexpected_zero_customer_visible_output'], fallback: { status: 'none', reason: null } },
    ],
  };
  const plan = buildStateRecoveryPlan(anomalyOnly, { failedStateIds: ['BB'], attempt: 0 });
  assert.deepEqual(plan.retryStateIds, ['BB']);
  assert.deepEqual(plan.skipped, []);
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
