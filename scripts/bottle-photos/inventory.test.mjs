import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, snapshotHash } from './inventory.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('falsy non-null previous inventories are corrupt, not new work', () => {
  for (const previous of [false, 0, '']) assert.throws(() => reconcile(snap(record('a')), previous, time));
});
test('CLI never overwrites an existing malformed ledger or summary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bottle-inventory-regression-'));
  try {
    const snapshot = path.join(dir, 'snapshot.json'), ledger = path.join(dir, 'ledger.json'), summary = path.join(dir, 'summary.json');
    fs.writeFileSync(snapshot, JSON.stringify({ total: 1, bottles: [{ id: 'a', canonicalName: 'a' }] }));
    for (const corrupt of [null, false, 0, '']) {
      const original = JSON.stringify(corrupt);
      fs.writeFileSync(ledger, original); fs.writeFileSync(summary, 'preserve existing summary');
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./inventory.mjs', import.meta.url)), snapshot, ledger, summary, '2026-09-09T12:00:00.000Z'], { encoding: 'utf8' });
      assert.equal(result.status, 1, `must reject ${original}: ${result.stderr}`);
      assert.equal(fs.readFileSync(ledger, 'utf8'), original);
      assert.equal(fs.readFileSync(summary, 'utf8'), 'preserve existing summary');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
const record = (id, canonicalName = id) => ({ id, canonicalName, brand: 'Brand', category: 'bourbon' });
const snap = (...bottles) => ({ total: bottles.length, bottles });
const time = '2026-09-09T12:00:00.000Z';
test('every exact ID is a separate unsearched item; stable hash, full metadata', () => {
  const s = snap(record('a', 'Same'), record('b', 'Same'));
  const l = reconcile(s, null, time);
  assert.equal(l.items.length, 2);
  assert.ok(l.items.every(x => x.status === 'unsearched' && x.present));
  assert.deepEqual(l.items[0].catalog, s.bottles[0]);
  assert.deepEqual(l.items[0].possibleDuplicateIds, ['b']);
  assert.equal(snapshotHash(s), snapshotHash({ bottles: [...s.bottles].reverse(), total: 2 }));
  assert.deepEqual(reconcile(s, l, time), l);
});
test('resume preserves work and detects changed, removed and readded records', () => {
  let l = reconcile(snap(record('a'), record('b')), null, time);
  l.items[0].status = 'ready'; l.items[0].privateWork = { evidence: 'keep' };
  l = reconcile(snap(record('a', 'New edition'), record('c')), l, time);
  assert.equal(l.items.find(x => x.id === 'a').status, 'ready');
  assert.deepEqual(l.items.find(x => x.id === 'a').privateWork, { evidence: 'keep' });
  assert.equal(l.items.find(x => x.id === 'a').requiresReview, true);
  assert.equal(l.items.find(x => x.id === 'a').history[1].previousCatalog.canonicalName, 'a');
  assert.equal(l.items.find(x => x.id === 'b').present, false);
  l = reconcile(snap(record('a', 'New edition'), record('b'), record('c')), l, time);
  assert.equal(l.items.find(x => x.id === 'b').history.at(-1).event, 'readded');
  assert.equal(l.items.length, 3);
});
test('reject incomplete snapshots and corrupt resumes instead of dropping work', () => {
  for (const s of [{ bottles: [record('a')] }, { total: 2, bottles: [record('a')] },
    snap(record('a'), record('a')), snap({ canonicalName: 'missing' }), snap(record(' a')),
    { ...snap(record('a')), has_more: true }, { ...snap(record('a')), nextCursor: 'more' }])
    assert.throws(() => reconcile(s, null, time));
  const l = reconcile(snap(record('a')), null, time);
  assert.throws(() => reconcile(snap(record('a')), { ...l, items: [...l.items, l.items[0]] }, time));
  assert.throws(() => reconcile(snap(record('a')), { ...l, items: [] }, time));
  l.items[0].status = 'invented'; assert.throws(() => reconcile(snap(record('a')), l, time));
});
test('seed reconciliation reports exact missing IDs without merging', () => {
  const l = reconcile(snap(record('a'), record('b')), null, time, [record('a'), record('c')]);
  assert.deepEqual(l.summary.seedOnlyIds, ['c']);
  assert.deepEqual(l.summary.snapshotOnlyIds, ['b']);
  assert.equal(l.summary.active, 2); assert.equal(l.summary.statusCounts.unsearched, 2);
});
