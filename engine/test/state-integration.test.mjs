import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { verifyStateIntegration } from '../src/verify-state-integration.mjs';

function manifest() {
  const value = {
    schemaVersion: 1,
    state: 'ZZ',
    lifecycle: { customerLabel: 'Zed', publicStatus: 'active', coverageTier: 'live_store_inventory', refinementLevel: 'area' },
    collector: { sourceIds: ['zz:retailer'], registration: 'registered' },
    storeIdentity: { mode: 'exact_store', addressRequired: true, proof: 'exact store' },
    sourceSemantics: { availability: 'binary', inventoryAlertable: true, watchAlertable: true },
    customerPaths: Object.fromEntries(['stateFilter', 'areaFilter', 'preferences', 'dashboard', 'dropFeedApi', 'finder', 'alerts', 'monitoring', 'export'].map((key) => [key, { status: 'verified', assertion: key }])),
  };
  const sourceConfigHash = createHash('sha256').update(JSON.stringify({ lifecycle: value.lifecycle, collector: value.collector, storeIdentity: value.storeIdentity, sourceSemantics: value.sourceSemantics, customerPaths: value.customerPaths })).digest('hex');
  const immutablePromotionEvidence = {
    schemaVersion: 1, state: 'ZZ', generatedAt: '2026-07-16T00:00:00.000Z', sourceConfigHash, previewUrl: 'https://preview.example.test',
    shadowRuns: [1, 2, 3].map((index) => ({ runId: `shadow-${index}`, status: 'success', artifactHash: 'a'.repeat(64) })),
    canaryRuns: [1, 2].map((index) => ({ runId: `canary-${index}`, status: 'success', artifactHash: 'b'.repeat(64) })),
  };
  return { ...value, evidence: { shadow: { runs: 3, artifact: 'shadow.json' }, canary: { runs: 2, artifact: 'canary.json' }, production: { url: 'https://preview.example.test', assertion: 'ok' }, immutablePromotionEvidence } };
}

function fixtures() {
  return {
    schemaVersion: 1,
    state: 'ZZ',
    cases: [
      { id: 'positive', kind: 'positive_bottle_match', input: { rawName: 'test' }, expected: { matches: true } },
      { id: 'ordinary', kind: 'ordinary_vs_rare_negative', input: { rawName: 'test' }, expected: { matches: false } },
      { id: 'rye', kind: 'rye_cream_liqueur_rtd_exclusion', input: { rawName: 'test' }, expected: { matches: false } },
      { id: 'size', kind: 'size_or_multipack_exclusion', input: { rawName: 'test' }, expected: { matches: false } },
      { id: 'availability', kind: 'availability_semantics', input: { locationPrecision: 'store_level' }, expected: { quantity: null } },
      { id: 'identity', kind: 'store_identity', input: { storeId: 'zz-1' }, expected: { storeId: 'zz-1' } },
      { id: 'timestamp', kind: 'timestamp_freshness', input: { fetchedAt: '2026-07-16T00:00:00Z' }, expected: { freshness: 'fresh' } },
    ],
  };
}

test('integration verifier requires executable fixtures, bound evidence, partitioned rows, and alert semantics', () => {
  const integrationManifest = manifest();
  const config = {
    activeStates: ['ZZ'],
    reliabilityPolicy: { grandfatheredActiveStates: [] },
    states: { ZZ: { customerLabel: 'Zed', publicStatus: 'active', coverageTier: 'live_store_inventory', refinementLevel: 'area', promotionEvidence: { immutableEvidence: integrationManifest.evidence.immutablePromotionEvidence } } },
  };
  const drop = {
    state: 'ZZ', source: 'Zed retailer', sourceUrl: 'https://retailer.example.test/p/1', observedAt: '2026-07-16T00:00:00.000Z',
    locationPrecision: 'store_level', storeId: 'zz-1', storeAddress: '1 Main St, Zed, ZZ 00000',
    canAlertAsInventory: true, inventorySemantics: 'binary', dataLane: 'actionable_inventory',
  };
  const site = {
    manifest: { files: { stateDrops: 'states/index.json' } },
    stats: { stateCoverage: { states: [{ state: 'ZZ' }] } },
    stateIndex: { states: [{ state: 'ZZ', file: 'states/ZZ/drops.json', count: 1 }] },
    stateDrops: { ZZ: { state: 'ZZ', count: 1, drops: [drop] } },
    drops: { drops: [drop] },
    alerts: { alerts: [{ ...drop, eligibleForDelivery: true }] },
    locations: { locations: [{ state: 'ZZ', id: 'zz-1', address: '1 Main St, Zed, ZZ 00000' }] },
  };
  const result = verifyStateIntegration({ state: 'ZZ', config, manifest: integrationManifest, fixtures: fixtures(), site, sourceFiles: {} });
  assert.equal(result.ok, true, result.failures.join('\n'));

  const prePromotionCanary = structuredClone(integrationManifest);
  delete prePromotionCanary.evidence.immutablePromotionEvidence;
  const canaryResult = verifyStateIntegration({ state: 'ZZ', config, manifest: prePromotionCanary, fixtures: fixtures(), site, sourceFiles: {}, promotionEvidenceRequired: false });
  assert.equal(canaryResult.ok, true, canaryResult.failures.join('\n'));

  const noAddress = structuredClone(site);
  noAddress.drops.drops[0].storeAddress = null;
  noAddress.stateDrops.ZZ.drops[0].storeAddress = null;
  assert.match(verifyStateIntegration({ state: 'ZZ', config, manifest: integrationManifest, fixtures: fixtures(), site: noAddress, sourceFiles: {} }).failures.join('\n'), /address/i);
  assert.match(verifyStateIntegration({ state: 'ZZ', config, manifest: integrationManifest, fixtures: null, site, sourceFiles: {} }).failures.join('\n'), /fixture/i);
  const tampered = structuredClone(integrationManifest);
  tampered.collector.sourceIds.push('zz:unbound');
  assert.match(verifyStateIntegration({ state: 'ZZ', config, manifest: tampered, fixtures: fixtures(), site, sourceFiles: {} }).failures.join('\n'), /does not bind/i);
});
