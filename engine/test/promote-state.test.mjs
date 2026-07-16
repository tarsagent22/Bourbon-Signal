import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareStatePromotion, rollbackPromotionFiles } from '../src/promote-state.mjs';

function promotionInput() {
  const hash = 'a'.repeat(64);
  const config = {
    activeStates: ['AA'],
    reliabilityPolicy: {
      grandfatheredActiveStates: ['AA'], refreshIntervalMs: 1_800_000, refreshSafetyMarginMs: 300_000,
      defaultExpectedStateRunMs: 60_000, workerConcurrency: 2, promotionPolicy: { minShadowRuns: 3, minCanaryRuns: 2 },
    },
    states: {
      AA: { publicStatus: 'active' },
      ZZ: { customerLabel: 'Zed', publicStatus: 'research_only', coverageTier: 'live_store_inventory', refinementLevel: 'area', shadowEligible: true },
    },
  };
  const manifest = {
    schemaVersion: 1, state: 'ZZ',
    lifecycle: { customerLabel: 'Zed', publicStatus: 'active', coverageTier: 'live_store_inventory', refinementLevel: 'area' },
    collector: { sourceIds: ['zz:retailer'], registration: 'registered' },
    storeIdentity: { mode: 'exact_store', addressRequired: true, proof: 'proof' },
    sourceSemantics: { availability: 'binary', inventoryAlertable: true, watchAlertable: true },
    customerPaths: Object.fromEntries(['stateFilter', 'areaFilter', 'preferences', 'dashboard', 'dropFeedApi', 'finder', 'alerts', 'monitoring', 'export'].map((key) => [key, { status: 'verified', assertion: key }])),
    evidence: {
      shadow: { runs: 3, artifact: 'shadow.json' },
      canary: { runs: 2, artifact: 'canary.json' },
      production: { url: 'https://preview.example.test', assertion: 'ok' },
      immutablePromotionEvidence: {
        schemaVersion: 1, state: 'ZZ', generatedAt: '2026-07-16T00:00:00.000Z', sourceConfigHash: hash,
        previewUrl: 'https://preview.example.test',
        shadowRuns: [1, 2, 3].map((index) => ({ runId: `shadow-${index}`, status: 'success', artifactHash: hash })),
        canaryRuns: [1, 2].map((index) => ({ runId: `canary-${index}`, status: 'success', artifactHash: hash })),
      },
    },
  };
  const fixtures = { schemaVersion: 1, state: 'ZZ', cases: [
    { id: 'positive', kind: 'positive_bottle_match', input: { rawName: 'test' }, expected: { matches: true } },
    { id: 'ordinary', kind: 'ordinary_vs_rare_negative', input: { rawName: 'test' }, expected: { matches: false } },
    { id: 'rye', kind: 'rye_cream_liqueur_rtd_exclusion', input: { rawName: 'test' }, expected: { matches: false } },
    { id: 'size', kind: 'size_or_multipack_exclusion', input: { rawName: 'test' }, expected: { matches: false } },
    { id: 'availability', kind: 'availability_semantics', input: { locationPrecision: 'store_level' }, expected: { quantity: null } },
    { id: 'identity', kind: 'store_identity', input: { storeId: 'zz-1' }, expected: { storeId: 'zz-1' } },
    { id: 'timestamp', kind: 'timestamp_freshness', input: { fetchedAt: '2026-07-16T00:00:00Z' }, expected: { freshness: 'fresh' } },
  ] };
  return { config, manifest, fixtures };
}

test('promotion is a default-dry-run, capacity-checked lifecycle transaction with a rollback payload', () => {
  const { config, manifest, fixtures } = promotionInput();
  const result = prepareStatePromotion({ state: 'ZZ', config, manifest, fixtures, now: '2026-07-16T00:00:00.000Z' });
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.deepEqual(result.nextConfig.activeStates, ['AA', 'ZZ']);
  assert.equal(result.nextConfig.states.ZZ.publicStatus, 'active');
  assert.equal(result.deploy, false);
  assert.equal(result.rollback.files.length, 2);
  assert.equal(typeof rollbackPromotionFiles, 'function');
});
