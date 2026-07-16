import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyStateIntegration } from '../src/verify-state-integration.mjs';

function manifest() {
  return {
    schemaVersion: 1,
    state: 'ZZ',
    lifecycle: { customerLabel: 'Zed', publicStatus: 'active', coverageTier: 'live_store_inventory', refinementLevel: 'area' },
    collector: { sourceIds: ['zz:retailer'], registration: 'registered' },
    storeIdentity: { mode: 'exact_store', addressRequired: true, proof: 'exact store' },
    sourceSemantics: { availability: 'binary', inventoryAlertable: true, watchAlertable: true },
    customerPaths: Object.fromEntries(['stateFilter', 'areaFilter', 'preferences', 'dashboard', 'dropFeedApi', 'finder', 'alerts', 'monitoring', 'export'].map((key) => [key, { status: 'verified', assertion: key }])),
    evidence: { shadow: { runs: 3, artifact: 'shadow.json' }, canary: { runs: 2, artifact: 'canary.json' }, production: { url: 'https://preview.example.test', assertion: 'ok' } },
  };
}

function fixtures() {
  return {
    schemaVersion: 1,
    state: 'ZZ',
    cases: [
      { id: 'positive', kind: 'positive_bottle_match', expected: { matches: true } },
      { id: 'ordinary', kind: 'ordinary_vs_rare_negative', expected: { matches: false } },
      { id: 'rye', kind: 'rye_cream_liqueur_rtd_exclusion', expected: { matches: false } },
      { id: 'size', kind: 'size_or_multipack_exclusion', expected: { matches: false } },
      { id: 'availability', kind: 'availability_semantics', expected: { quantity: null } },
      { id: 'identity', kind: 'store_identity', expected: { storeId: 'zz-1' } },
      { id: 'timestamp', kind: 'timestamp_freshness', expected: { freshness: 'fresh' } },
    ],
  };
}

test('integration verifier requires partitioned customer rows, source/store truth, alert semantics, and a manifest', () => {
  const config = {
    activeStates: ['ZZ'],
    reliabilityPolicy: { grandfatheredActiveStates: [] },
    states: { ZZ: { customerLabel: 'Zed', publicStatus: 'active', coverageTier: 'live_store_inventory', refinementLevel: 'area' } },
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
  const result = verifyStateIntegration({ state: 'ZZ', config, manifest: manifest(), fixtures: fixtures(), site, sourceFiles: {} });
  assert.equal(result.ok, true, result.failures.join('\n'));

  const noAddress = structuredClone(site);
  noAddress.drops.drops[0].storeAddress = null;
  noAddress.stateDrops.ZZ.drops[0].storeAddress = null;
  assert.match(verifyStateIntegration({ state: 'ZZ', config, manifest: manifest(), fixtures: fixtures(), site: noAddress, sourceFiles: {} }).failures.join('\n'), /address/i);
  assert.match(verifyStateIntegration({ state: 'ZZ', config, manifest: manifest(), fixtures: null, site, sourceFiles: {} }).failures.join('\n'), /fixture/i);
});
