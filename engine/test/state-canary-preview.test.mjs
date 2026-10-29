import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCanaryPreviewPayload, buildStateCanaryPreview } from '../src/build-state-canary-preview.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('isolated lifecycle and coverage rows agree without modifying the source lifecycle', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'canary-coverage-contract-'));
  try {
    const siteDir = path.join(directory, 'baseline');
    await mkdir(siteDir);
    await writeFile(path.join(siteDir, 'manifest.json'), '{}');
    const lifecycle = { activeStates: ['AA'], states: { ZZ: { publicStatus: 'research_only', customerLabel: 'Test State', coverageTier: 'sparse_live_store_inventory', refinementLevel: 'store', inventoryAlertable: false, watchAlertable: false } } };
    const before = JSON.stringify(lifecycle);
    const outDir = path.join(directory, 'canary');
    await buildStateCanaryPreview({ state: 'ZZ', candidateDrops: [], lifecycleConfig: lifecycle, siteDir, outDir });
    const stats = JSON.parse(await readFile(path.join(outDir, 'stats.json')));
    const preview = JSON.parse(await readFile(path.join(outDir, 'lifecycle-preview.json')));
    assert.equal(stats.stateCoverage.states[0].publicStatus, 'active');
    assert.equal(stats.stateCoverage.states[0].coverageTier, 'sparse_live_store_inventory');
    assert.equal(preview.states.ZZ.publicStatus, 'active');
    assert.equal(preview.states.ZZ.inventoryAlertable, false);
    assert.equal(JSON.stringify(lifecycle), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('canary preview adds only the candidate partition and prevents candidate alert delivery', () => {
  const base = {
    manifest: { files: { stateDrops: 'states/index.json' }, statePartitions: [{ state: 'AA', file: 'states/AA/drops.json', count: 1 }] },
    drops: { drops: [{ state: 'AA', id: 'aa-1' }] },
    stateIndex: { states: [{ state: 'AA', file: 'states/AA/drops.json', count: 1 }], totalCount: 1, stateCount: 1 },
    alerts: { alerts: [{ state: 'AA', id: 'alert-aa' }] },
    locations: { locations: [{ state: 'AA', id: 'store-aa', address: '1 Main St' }] },
  };
  const preview = buildCanaryPreviewPayload({
    base,
    state: 'ZZ',
    candidateDrops: [{ state: 'ZZ', id: 'zz-1', storeId: 'store-zz', storeName: 'ZZ Store', storeAddress: '2 Main St', city: 'Testville', zip: '00000' }],
    candidateLocations: [{ state: 'ZZ', id: 'directory-zz', name: 'Directory Store', address: '3 Main St', city: 'Testville', disposition: 'directory_only', canAlertAsInventory: false }],
  });
  assert.equal(preview.drops.drops.length, 2);
  assert.deepEqual(preview.stateIndex.states.map((entry) => entry.state), ['AA', 'ZZ']);
  assert.equal(preview.alerts.alerts.some((alert) => alert.state === 'ZZ'), false);
  assert.ok(preview.locations.locations.some((location) => location.state === 'ZZ' && location.storeId === 'store-zz'));
  assert.ok(preview.locations.locations.some((location) => location.state === 'ZZ' && location.storeId === 'directory-zz' && location.disposition === 'directory_only'));
  assert.equal(preview.previewPolicy.alertDeliveryEnabled, false);
});

test('canary preview rejects directory locations from another state', () => {
  assert.throws(() => buildCanaryPreviewPayload({
    base: { drops: { drops: [] }, stateIndex: { states: [] }, alerts: { alerts: [] }, stats: {}, locations: { locations: [] } },
    state: 'ZZ',
    candidateDrops: [],
    candidateLocations: [{ state: 'YY', id: 'forged', name: 'Forged Store', address: '1 Wrong State Rd' }],
  }), /locations must all use the requested state/i);
});
