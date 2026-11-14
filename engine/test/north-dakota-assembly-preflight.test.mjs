import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ALL_STATE_SOURCES, CUSTOMER_ACTIVE_STATE_IDS, STATE_SOURCES } from '../src/state-sources.mjs';
import { researchSourceForState } from '../src/research-state-registry.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';

const candidateRegistryUrl = new URL('../data/state-expansion-candidates.json', import.meta.url);

test('ND stays a single dormant candidate until its production source is explicitly registered', async () => {
  const registry = JSON.parse(await readFile(candidateRegistryUrl, 'utf8'));
  assert.equal(registry.states.filter(row => row.state === 'ND').length, 1);
  assert.equal(registry.states.find(row => row.state === 'ND').lifecycleStage, 'discovery');

  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('ND'), false);
  assert.equal(Object.hasOwn(STATE_LIFECYCLE_CONFIG.states, 'ND'), false);
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('ND'), false);
  assert.equal(ALL_STATE_SOURCES.filter(row => row.id === 'ND').length, 0);
  assert.equal(STATE_SOURCES.filter(row => row.id === 'ND').length, 0);

  const shadow = researchSourceForState('ND', { shadowMode: true });
  assert.ok(shadow, 'the exact existing shadow lane remains selectable');
  assert.equal(researchSourceForState('ND', { shadowMode: false }), null);
});
