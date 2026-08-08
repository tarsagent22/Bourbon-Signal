import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { recentSnapshots } from '../src/export-site-contract.mjs';

function snapshotAt(index) {
  const generatedAt = new Date(Date.parse('2026-08-03T00:00:00.000Z') + index * 30 * 60 * 1000).toISOString();
  return {
    generatedAt,
    file: `${generatedAt.replace(/:/g, '-').replace('.', '-')}.json`,
  };
}

test('snapshot retention deletes invalid or expired files and losslessly archives in-window files beyond the read cap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bs-history-retention-'));
  try {
    for (let index = 0; index < 42; index += 1) {
      const snapshot = snapshotAt(index);
      await writeFile(join(dir, snapshot.file), JSON.stringify({ generatedAt: snapshot.generatedAt, signals: [{ id: `fresh-${index}` }] }));
    }
    await writeFile(join(dir, '2026-06-01T00-00-00-000Z.json'), JSON.stringify({ generatedAt: '2026-06-01T00:00:00.000Z', signals: [{ id: 'expired-a' }] }));
    await writeFile(join(dir, '2026-06-02T00-00-00-000Z.json'), JSON.stringify({ generatedAt: '2026-06-02T00:00:00.000Z', signals: [{ id: 'expired-b' }] }));
    await writeFile(join(dir, '2026-06-03T00-00-00-000Z.json.gz'), gzipSync(JSON.stringify({ generatedAt: '2026-06-03T00:00:00.000Z' })));
    await writeFile(join(dir, '2026-02-31T00-00-00-000Z.json.gz'), gzipSync(JSON.stringify({ generatedAt: 'unknown' })));
    await writeFile(join(dir, 'malformed.json'), '{not-json');

    const options = {
      snapshotsPath: dir,
      now: Date.parse('2026-08-04T00:00:00.000Z'),
      limit: 40,
    };
    const snapshots = await recentSnapshots(30, options);

    assert.equal(snapshots.length, 40);
    const files = await readdir(dir);
    assert.equal(files.filter((file) => file.endsWith('.json')).length, 40);
    assert.equal(files.filter((file) => file.endsWith('.json.gz')).length, 3);
    assert.equal(files.includes('2026-06-01T00-00-00-000Z.json'), false);
    assert.equal(files.includes('2026-06-02T00-00-00-000Z.json'), false);
    assert.equal(files.includes('2026-06-03T00-00-00-000Z.json.gz'), false);
    assert.equal(files.includes('2026-02-31T00-00-00-000Z.json.gz'), true);
    assert.equal(files.includes('malformed.json'), false);

    const archived = files.filter((file) => file.endsWith('.json.gz') && !file.startsWith('2026-02-31'));
    const archivedIds = [];
    for (const file of archived) {
      const payload = JSON.parse(gunzipSync(await readFile(join(dir, file))).toString('utf8'));
      archivedIds.push(payload.signals[0].id);
    }
    assert.deepEqual(archivedIds.sort(), ['fresh-0', 'fresh-1']);

    const second = await recentSnapshots(30, options);
    assert.equal(second.length, 40);
    assert.deepEqual(await readdir(dir), files);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('snapshot retention reconciles verified crash duplicates and concurrent archive attempts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bs-history-retention-race-'));
  try {
    for (let index = 0; index < 41; index += 1) {
      const snapshot = snapshotAt(index);
      const payload = JSON.stringify({
        generatedAt: snapshot.generatedAt,
        signals: [{ id: `fresh-${index}` }],
        padding: index === 0 ? 'x'.repeat(5_000_000) : '',
      });
      await writeFile(join(dir, snapshot.file), payload);
      if (index === 0) await writeFile(join(dir, `${snapshot.file}.gz`), gzipSync(payload));
    }
    const options = {
      snapshotsPath: dir,
      now: Date.parse('2026-08-04T00:00:00.000Z'),
      limit: 40,
    };

    await recentSnapshots(30, options);
    const raceSnapshot = snapshotAt(-1);
    await writeFile(join(dir, raceSnapshot.file), JSON.stringify({
      generatedAt: raceSnapshot.generatedAt,
      signals: [{ id: 'concurrent' }],
      padding: 'x'.repeat(5_000_000),
    }));

    const settled = await Promise.allSettled([
      recentSnapshots(30, options),
      recentSnapshots(30, options),
    ]);
    assert.deepEqual(settled.map((result) => result.status), ['fulfilled', 'fulfilled']);
    const files = await readdir(dir);
    assert.equal(files.filter((file) => file.endsWith('.json')).length, 40);
    assert.equal(files.filter((file) => file.endsWith('.json.gz')).length, 2);
    assert.equal(files.some((file) => file.endsWith('.tmp')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
