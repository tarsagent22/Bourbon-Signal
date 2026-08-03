import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recentSnapshots } from '../src/export-site-contract.mjs';

function slug(index) {
  return `2026-08-03T${String(index).padStart(2, '0')}-00-00-000Z.json`;
}

test('snapshot retention deletes every expired file before applying the read cap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bs-history-retention-'));
  try {
    for (let index = 0; index < 42; index += 1) {
      await writeFile(join(dir, slug(index)), JSON.stringify({ generatedAt: `2026-08-03T${String(index % 24).padStart(2, '0')}:00:00.000Z`, signals: [{ id: `fresh-${index}` }] }));
    }
    await writeFile(join(dir, '2026-06-01T00-00-00-000Z.json'), JSON.stringify({ generatedAt: '2026-06-01T00:00:00.000Z', signals: [{ id: 'expired-a' }] }));
    await writeFile(join(dir, '2026-06-02T00-00-00-000Z.json'), JSON.stringify({ generatedAt: '2026-06-02T00:00:00.000Z', signals: [{ id: 'expired-b' }] }));

    const snapshots = await recentSnapshots(30, {
      snapshotsPath: dir,
      now: Date.parse('2026-08-04T00:00:00.000Z'),
      limit: 40,
    });

    assert.equal(snapshots.length, 40);
    const files = await readdir(dir);
    assert.equal(files.includes('2026-06-01T00-00-00-000Z.json'), false);
    assert.equal(files.includes('2026-06-02T00-00-00-000Z.json'), false);
    assert.equal(files.length, 42);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
