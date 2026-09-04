import test from 'node:test';
import assert from 'node:assert/strict';
import { planEngineRecovery } from '../../scripts/engine-recovery-dispatch-plan.mjs';
import { buildStateRecoveryPlan } from '../src/state-recovery-plan.mjs';
import { buildStateOperatingContract } from '../src/state-operating-contract.mjs';
const headSha = 'a'.repeat(40), now = '2026-09-04T20:00:00Z';
const watchdog = { recoveryStates: ['MS'], snapshotId: 'one', failures: ['age 30 hours'] };
const run = (key, i = 0) => ({ databaseId: i + 1, event: 'workflow_dispatch', headSha, status: 'completed', createdAt: `2026-09-04T19:${10 + i * 10}:00Z`, displayTitle: `Inventory recovery ${key}` });
test('E02 100 republishes and reason/release variation cannot reset a source circuit', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha, now });
  const runs = Array.from({ length: 4 }, (_, i) => run(first.incidentKey, i));
  for (let i = 0; i < 100; i++) {
    const p = planEngineRecovery({ watchdog: { ...watchdog, snapshotId: `snapshot-${i}`, failures: [`age ${i} hours`] }, runs, headSha: 'b'.repeat(40), now });
    assert.equal(p.reason, 'incident_circuit_open');
    assert.equal(p.priorAttempts, 4);
  }
});
test('E02 changing sibling set preserves each incident and advances unattempted siblings', () => {
  const first = planEngineRecovery({ watchdog, runs: [], headSha, now });
  const runs = [run(first.incidentKey)];
  const next = planEngineRecovery({ watchdog: { ...watchdog, recoveryStates: ['MS', 'NC', 'TX'] }, runs, headSha, now });
  assert.deepEqual(next.states, ['NC']);
  const ms = planEngineRecovery({ watchdog, runs, headSha, now });
  assert.equal(ms.priorAttempts, 1);
});
test('E03 successive published contracts durably advance supplemental sibling selection', () => {
  const states = ['MS', 'NC', 'OH', 'TX'];
  let previous = null;
  const selected = [];
  for (let i = 0; i < 4; i++) {
    const contract = buildStateOperatingContract({ activeStateIds: states, previous,
      generatedAt: `2026-09-04T${16 + i}:00:00Z`,
      summary: { fallbackStateIds: states, states: states.map(state => ({ state, status: 'stale_useful', stale: true, staleReason: 'timeout' })) } });
    selected.push(...buildStateRecoveryPlan(contract).retryStateIds);
    previous = JSON.parse(JSON.stringify(contract));
  }
  assert.deepEqual(selected, states);
});
test('E03 deterministic failures cannot be promoted by an accepted-output anomaly', () => {
  const contract = { summary: { retryStateIds: ['OH'] }, states: [{ state: 'OH', health: 'degraded', recoveryAction: 'retry_state_collection', collection: { status: 'failed_schema_validation' }, anomalyCodes: ['unexpected_zero_customer_visible_output'] }] };
  assert.deepEqual(buildStateRecoveryPlan(contract).retryStateIds, []);
});
