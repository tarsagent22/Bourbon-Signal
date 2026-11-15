import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ALL_STATE_SOURCES, CUSTOMER_ACTIVE_STATE_IDS, DISABLED_STATE_SOURCES, STATE_SOURCES } from '../src/state-sources.mjs';
import { researchSourceForState } from '../src/research-state-registry.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { NORTH_DAKOTA_RETAIL_SOURCE_IDS } from '../src/collectors/north-dakota-retail-production.mjs';

const candidateRegistryUrl = new URL('../data/state-expansion-candidates.json', import.meta.url);

test('ND remains dormant while its guarded production source and exact research lane are prepared', async () => {
  const registry = JSON.parse(await readFile(candidateRegistryUrl, 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../data/state-integration/ND.json', import.meta.url), 'utf8'));
  assert.equal(registry.states.filter(row => row.state === 'ND').length, 1);
  assert.equal(registry.states.find(row => row.state === 'ND').lifecycleStage, 'discovery');
  assert.deepEqual(manifest.collector.sourceIds, NORTH_DAKOTA_RETAIL_SOURCE_IDS);

  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('ND'), false);
  assert.equal(Object.hasOwn(STATE_LIFECYCLE_CONFIG.states, 'ND'), false);
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('ND'), false);
  assert.equal(ALL_STATE_SOURCES.filter(row => row.id === 'ND').length, 1);
  assert.equal(STATE_SOURCES.filter(row => row.id === 'ND').length, 0);
  assert.equal(DISABLED_STATE_SOURCES.filter(row => row.id === 'ND').length, 1);

  const shadow = researchSourceForState('ND', { shadowMode: true });
  assert.ok(shadow, 'the exact existing shadow lane remains selectable');
  assert.equal(researchSourceForState('ND', { shadowMode: false }), null);
});
