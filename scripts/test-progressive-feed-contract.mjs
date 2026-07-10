import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDropCursor, encodeDropCursor, paginateDrops } from '../src/lib/drop-cursor.ts';
import { dropFeedCacheHeaders } from '../src/lib/api-cache-contract.ts';
import { buildStateDropPartitions, verifyStateDropPartitions } from '../engine/src/site-state-partitions.mjs';

const rows = [
  { id: 'a', state: 'NC' },
  { id: 'b', state: 'PA' },
  { id: 'c', state: 'NC' },
  { id: 'd', state: 'OH' },
  { id: 'e', state: 'PA' },
];

const cursor = encodeDropCursor({ snapshot: '2026-07-09T12:00:00.000Z', offset: 2 });
assert.deepEqual(decodeDropCursor(cursor), { snapshot: '2026-07-09T12:00:00.000Z', offset: 2 });
assert.equal(decodeDropCursor('not-a-cursor'), null, 'malformed cursors must be rejected');

const first = paginateDrops(rows, { limit: 2, snapshot: '2026-07-09T12:00:00.000Z' });
assert.deepEqual(first.items.map((row) => row.id), ['a', 'b']);
assert.ok(first.nextCursor);
const second = paginateDrops(rows, { limit: 2, snapshot: '2026-07-09T12:00:00.000Z', cursor: first.nextCursor });
assert.deepEqual(second.items.map((row) => row.id), ['c', 'd']);
assert.equal(second.offset, 2);
assert.throws(
  () => paginateDrops(rows, { limit: 2, snapshot: '2026-07-09T13:00:00.000Z', cursor: first.nextCursor }),
  /snapshot/i,
  'a cursor must never silently cross export snapshots',
);

const partitions = buildStateDropPartitions(rows, {
  contractVersion: 'bourbon-signal-site-v0.1',
  generatedAt: '2026-07-09T12:00:00.000Z',
  activeStates: ['NC', 'OH', 'PA', 'TN'],
});
assert.equal(partitions.index.totalCount, rows.length);
assert.deepEqual(partitions.index.states.map((state) => state.state), ['NC', 'OH', 'PA', 'TN']);
assert.equal(partitions.payloads.get('TN').count, 0, 'active states with no rows still need explicit complete partitions');
assert.deepEqual(partitions.payloads.get('NC').drops.map((row) => row.id), ['a', 'c']);
assert.deepEqual(verifyStateDropPartitions(rows, partitions), { ok: true, errors: [] });

const missing = structuredClone(partitions);
missing.payloads.get('NC').drops.pop();
assert.equal(verifyStateDropPartitions(rows, missing).ok, false, 'verification must detect lost rows');

assert.deepEqual(dropFeedCacheHeaders(false), {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  Vary: 'Cookie, Authorization',
});
assert.deepEqual(dropFeedCacheHeaders(true), {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, Authorization',
});

const exporterSource = readFileSync(new URL('../engine/src/export-site-contract.mjs', import.meta.url), 'utf8');
const verifierSource = readFileSync(new URL('../engine/src/verify-site-contract.mjs', import.meta.url), 'utf8');
assert.match(exporterSource, /stateDrops:\s*'states\/index\.json'/, 'manifest must declare the state partition index');
assert.match(verifierSource, /manifest\.files\?\.stateDrops/, 'verifier must use the same manifest key as the exporter');

console.log('Progressive feed contract tests passed.');
