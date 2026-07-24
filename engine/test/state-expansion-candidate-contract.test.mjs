import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ALL_US_STATE_IDS,
  validateStateExpansionCandidates,
} from '../src/state-expansion-candidate-contract.mjs';

const registryUrl = new URL('../data/state-expansion-candidates.json', import.meta.url);
const lifecycleUrl = new URL('../../src/config/state-lifecycle.json', import.meta.url);

test('national candidate registry gives every state an explicit lifecycle record without mutating activation', async () => {
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const lifecycle = JSON.parse(await readFile(lifecycleUrl, 'utf8'));
  const before = structuredClone(lifecycle.activeStates);
  const result = validateStateExpansionCandidates(registry, { activeStateIds: lifecycle.activeStates });

  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.deepEqual(registry.states.map((state) => state.state).sort(), [...ALL_US_STATE_IDS].sort());
  assert.deepEqual(lifecycle.activeStates, before, 'candidate validation must not mutate customer activation');
  assert.ok(registry.scopedControlMarkets.some((market) => market.id === 'MD-MONTGOMERY'));
  assert.equal(registry.states.find((state) => state.state === 'OR').lifecycleStage, 'discovery');
  assert.equal(registry.states.find((state) => state.state === 'NH').lifecycleStage, 'discovery');
  assert.equal(registry.states.find((state) => state.state === 'CO').lifecycleStage, 'canary');
  assert.equal(registry.states.find((state) => state.state === 'NY').lifecycleStage, 'canary');
});

test('candidate contract rejects missing fields, implicit states, and discovery records marked customer-active', () => {
  const registry = {
    states: [{ state: 'CO', customerLabel: 'Colorado', lifecycleStage: 'discovery' }],
    scopedControlMarkets: [],
  };
  const result = validateStateExpansionCandidates(registry, { activeStateIds: ['CO'] });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /50 states/i);
  assert.match(result.errors.join('\n'), /marketClassification/i);
  assert.match(result.errors.join('\n'), /discovery.*customer-active/i);
});
