import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShadowEvidence, selectShadowCandidates } from '../src/run-expansion-shadow.mjs';

test('shadow collection only selects explicitly eligible non-active candidates and never emits publishable rows', () => {
  const lifecycle = {
    activeStates: ['AA'],
    states: {
      AA: { publicStatus: 'active', shadowEligible: true },
      ZZ: { publicStatus: 'research_only', shadowEligible: true },
      YY: { publicStatus: 'research_only', shadowEligible: false },
    },
  };
  assert.deepEqual(selectShadowCandidates(lifecycle, { limit: 5 }), ['ZZ']);
  const evidence = buildShadowEvidence('ZZ', {
    status: 'useful', signals: [{ storeId: 'zz-1', storeAddress: '1 Main', observedAt: '2026-07-16T00:00:00.000Z', canAlertAsInventory: true }],
    sources: [{ ok: true }], roadblocks: [], startedAt: '2026-07-16T00:00:00.000Z', finishedAt: '2026-07-16T00:00:01.000Z',
  });
  assert.equal(evidence.publication.allowed, false);
  assert.equal(evidence.alerts.disabled, true);
  assert.equal(evidence.metrics.exactStoreRatio, 1);
});
