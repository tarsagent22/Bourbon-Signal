import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { collectSiteFiles, parseArgs, siteSnapshotMetadata } from '../src/data-plane/publish-site-snapshot.mjs';

test('publisher recursively collects only declared JSON snapshot files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bs-site-snapshot-'));
  try {
    await mkdir(path.join(root, 'states', 'NC'), { recursive: true });
    await writeFile(path.join(root, 'stats.json'), '{"generatedAt":"2026-07-10T12:33:49.778Z"}');
    await writeFile(path.join(root, 'states', 'NC', 'drops.json'), '{"drops":[]}');
    await writeFile(path.join(root, 'ignore.txt'), 'secret');
    const files = await collectSiteFiles(root);
    assert.deepEqual(Object.keys(files), ['states/NC/drops.json', 'stats.json']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('publisher CLI exposes an explicit rollback mode for failed live verification', () => {
  assert.equal(parseArgs(['--rollback']).rollback, true);
  assert.equal(parseArgs(['--stage']).activate, false);
});

test('publisher metadata binds collection, app, engine, and state health provenance', () => {
  const metadata = siteSnapshotMetadata({
    stats: { generatedAt: '2026-07-10T12:33:49.778Z', engineGeneratedAt: '2026-07-10T12:30:00.000Z', stateCoverage: { states: [{ state: 'NC', status: 'live', signalCount: 10 }] } },
    appCommit: 'app123',
    engineCommit: 'engine123-dirty-hash',
    collectionRunId: 'run123',
  });
  assert.equal(metadata.generatedAt, '2026-07-10T12:33:49.778Z');
  assert.equal(metadata.appCommit, 'app123');
  assert.equal(metadata.stateHealth.NC.signalCount, 10);
  assert.equal(metadata.stateHealth.NC.status, 'live');
});
