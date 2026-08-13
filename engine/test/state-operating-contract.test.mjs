import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStateOperatingContract } from '../src/state-operating-contract.mjs';

const generatedAt = '2026-08-13T12:00:00.000Z';

function drop(state, id, overrides = {}) {
  return {
    id,
    state,
    bottleName: `${state} bottle`,
    observedAt: '2026-08-13T11:00:00.000Z',
    locationPrecision: 'store_level',
    storeId: `${state}-store`,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    sourceStale: false,
    ...overrides,
  };
}

function state(state, overrides = {}) {
  return { state, status: 'useful', reachableSourceCount: 2, signalCount: 10, ...overrides };
}

test('state operating records preserve healthy isolation and classify volume collapse as retryable degradation', () => {
  const contract = buildStateOperatingContract({
    activeStateIds: ['AA', 'BB', 'CC'],
    generatedAt,
    summary: {
      attemptedStateIds: ['AA', 'CC'],
      fallbackStateIds: ['BB'],
      states: [state('AA'), state('BB', { stale: true, status: 'stale_useful', staleReason: 'timeout' }), state('CC')],
    },
    stateCoverage: { states: [state('AA'), state('BB'), state('CC')] },
    drops: [
      drop('AA', 'aa-1'),
      drop('BB', 'bb-1', { sourceStale: true, canAlertAsInventory: false, canAlertAsWatch: false }),
      ...Array.from({ length: 4 }, (_, index) => drop('CC', `cc-${index}`)),
    ],
    stateReports: [
      { state: 'AA', status: 'useful', finishedAt: '2026-08-13T11:30:00.000Z', sources: [{ ok: true }, { ok: true }] },
      { state: 'BB', status: 'stale_useful', stale: true, previousFinishedAt: '2026-08-12T11:30:00.000Z', sources: [{ ok: false }] },
      { state: 'CC', status: 'useful', finishedAt: '2026-08-13T11:30:00.000Z', sources: [{ ok: true }] },
    ],
    previous: {
      states: [
        { state: 'BB', lastPublicationAt: '2026-08-12T12:00:00.000Z', customerVisibleDropCount: 1 },
        { state: 'CC', lastPublicationAt: '2026-08-12T12:00:00.000Z', customerVisibleDropCount: 12 },
      ],
    },
  });

  const byState = new Map(contract.states.map((row) => [row.state, row]));
  assert.equal(byState.get('AA').health, 'healthy');
  assert.equal(byState.get('BB').health, 'stale_useful');
  assert.equal(byState.get('BB').lastPublicationAt, '2026-08-12T12:00:00.000Z');
  assert.equal(byState.get('BB').alertCandidateCount, 0);
  assert.equal(byState.get('CC').health, 'degraded');
  assert.deepEqual(byState.get('CC').anomalyCodes, ['significant_drop_count_collapse']);
  assert.equal(byState.get('CC').recoveryAction, 'retry_state_collection');
  assert.equal(byState.get('AA').health, 'healthy', 'a volume anomaly must not block an unrelated state');
});

test('deterministic customer validation anomalies block automatic recovery', () => {
  const duplicateRows = Array.from({ length: 8 }, (_, index) => drop('DD', index < 6 ? 'same-id' : `unique-${index}`));
  const contract = buildStateOperatingContract({
    activeStateIds: ['DD', 'EE', 'FF'],
    generatedAt,
    summary: { attemptedStateIds: ['DD', 'EE', 'FF'], states: [state('DD'), state('EE'), state('FF')] },
    stateCoverage: { states: [state('DD'), state('EE'), state('FF')] },
    drops: [
      ...duplicateRows,
      drop('EE', 'missing-title', { bottleName: null, canonicalName: null, rawName: null }),
      drop('FF', 'stale-alert', { sourceStale: true }),
    ],
  });
  const byState = new Map(contract.states.map((row) => [row.state, row]));
  assert.ok(byState.get('DD').anomalyCodes.includes('duplicate_identity_spike'));
  assert.ok(byState.get('EE').anomalyCodes.includes('missing_required_customer_fields'));
  assert.ok(byState.get('FF').anomalyCodes.includes('stale_or_noninventory_alert_flags'));
  for (const stateId of ['DD', 'EE', 'FF']) {
    assert.equal(byState.get(stateId).health, 'blocked');
    assert.equal(byState.get(stateId).recoveryAction, 'manual_validation_required');
  }
});

test('unexpected zero and healthy collection without publication advance remain targeted recovery anomalies', () => {
  const contract = buildStateOperatingContract({
    activeStateIds: ['GG', 'HH'],
    generatedAt: '2026-08-13T10:00:00.000Z',
    summary: { attemptedStateIds: ['GG', 'HH'], states: [state('GG', { signalCount: 0 }), state('HH')] },
    stateCoverage: { states: [state('GG', { signalCount: 0 }), state('HH')] },
    drops: [drop('HH', 'hh-1')],
    stateReports: [{ state: 'HH', status: 'useful', finishedAt: '2026-08-13T11:00:00.000Z', sources: [{ ok: true }] }],
    previous: { states: [{ state: 'HH', lastPublicationAt: '2026-08-13T10:00:00.000Z', customerVisibleDropCount: 1 }] },
  });
  const byState = new Map(contract.states.map((row) => [row.state, row]));
  assert.ok(byState.get('GG').anomalyCodes.includes('unexpected_zero_valid_output'));
  assert.ok(byState.get('HH').anomalyCodes.includes('healthy_collection_publication_not_advanced'));
  assert.equal(byState.get('HH').recoveryAction, 'rerun_export_only');
});
