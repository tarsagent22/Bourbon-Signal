import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ALL_STATE_SOURCES, CUSTOMER_ACTIVE_STATE_IDS, DISABLED_STATE_SOURCES, STATE_SOURCES } from '../src/state-sources.mjs';
import { researchSourceForState } from '../src/research-state-registry.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { NORTH_DAKOTA_RETAIL_SOURCE_IDS } from '../src/collectors/north-dakota-retail-production.mjs';

const candidateRegistryUrl = new URL('../data/state-expansion-candidates.json', import.meta.url);

test('ND has one exact active registration bound to the reviewed source and evidence', async () => {
  const registry = JSON.parse(await readFile(candidateRegistryUrl, 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../data/state-integration/ND.json', import.meta.url), 'utf8'));
  assert.equal(registry.states.filter(row => row.state === 'ND').length, 1);
  assert.equal(registry.states.find(row => row.state === 'ND').lifecycleStage, 'active');
  assert.ok(registry.states.find(row => row.state === 'ND').promotionEvidenceRefs.includes('src/config/state-lifecycle.json'));
  assert.deepEqual(manifest.collector.sourceIds, NORTH_DAKOTA_RETAIL_SOURCE_IDS);

  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('ND'), true);
  assert.equal(STATE_LIFECYCLE_CONFIG.states.ND.publicStatus, 'active');
  assert.equal(STATE_LIFECYCLE_CONFIG.states.ND.inventoryAlertable, false);
  assert.equal(STATE_LIFECYCLE_CONFIG.states.ND.watchAlertable, false);
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('ND'), true);
  assert.equal(ALL_STATE_SOURCES.filter(row => row.id === 'ND').length, 1);
  assert.equal(STATE_SOURCES.filter(row => row.id === 'ND').length, 1);
  assert.equal(DISABLED_STATE_SOURCES.filter(row => row.id === 'ND').length, 0);

  const shadow = researchSourceForState('ND', { shadowMode: true });
  assert.ok(shadow, 'the exact existing shadow lane remains selectable');
  assert.equal(researchSourceForState('ND', { shadowMode: false }), null);
});
