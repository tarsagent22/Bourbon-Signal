import assert from 'node:assert/strict';
import test from 'node:test';

import { validateStateVerticalSliceManifest } from '../src/state-vertical-slice-contract.mjs';

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    state: 'ZZ',
    lifecycle: {
      customerLabel: 'Zed',
      publicStatus: 'active',
      coverageTier: 'live_store_inventory',
      refinementLevel: 'area',
    },
    collector: { sourceIds: ['zz:retailer'], registration: 'state source registry' },
    storeIdentity: { mode: 'exact_store', addressRequired: true, proof: 'store id and street address' },
    sourceSemantics: { availability: 'binary_retailer_orderable', inventoryAlertable: true, watchAlertable: true },
    customerPaths: Object.fromEntries([
      'stateFilter', 'areaFilter', 'preferences', 'dashboard', 'dropFeedApi', 'finder', 'alerts', 'monitoring', 'export',
    ].map((key) => [key, { status: 'verified', assertion: `${key} assertion` }])),
    evidence: {
      shadow: { runs: 3, artifact: 'out/shadow/ZZ/latest.json' },
      canary: { runs: 2, artifact: 'out/canary/ZZ/preview.json' },
      production: { url: 'https://preview.example.test', assertion: 'preview passes' },
    },
    ...overrides,
  };
}

test('vertical slice manifest demands every customer path and truthful not-applicable reasons', () => {
  assert.deepEqual(validateStateVerticalSliceManifest(manifest()), { ok: true, failures: [] });
  const invalid = manifest({ customerPaths: { stateFilter: { status: 'verified', assertion: 'ok' } } });
  const result = validateStateVerticalSliceManifest(invalid);
  assert.equal(result.ok, false);
  assert.match(result.failures.join('\n'), /preferences/i);

  const notApplicable = manifest();
  notApplicable.customerPaths.areaFilter = { status: 'not_applicable' };
  assert.match(validateStateVerticalSliceManifest(notApplicable).failures.join('\n'), /reason/i);
});
