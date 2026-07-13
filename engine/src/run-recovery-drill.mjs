#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyPipelineFreshness } from './data-plane/freshness.mjs';
import { planRecovery } from './data-plane/recovery-watchdog.mjs';
import { InMemoryObjectStorage, publishSiteSnapshot, rollbackSiteSnapshot } from './data-plane/site-snapshot-publisher.mjs';
import { guardStateReport } from './state-report-guard.mjs';

const checks = [];
async function check(name, fn) {
  try { await fn(); checks.push({ name, ok: true }); }
  catch (error) { checks.push({ name, ok: false, error: error.message }); }
}

await check('collector collapse preserves last known-good report', () => {
  const previous = { state: 'TX', status: 'useful', finishedAt: '2026-07-12T00:00:00.000Z', signals: [{ id: 'one', locationPrecision: 'store_level', canAlertAsInventory: true }], roadblocks: [] };
  const candidate = { state: 'TX', status: 'empty', signals: [], roadblocks: [] };
  const result = guardStateReport({ previous, candidate, now: '2026-07-13T00:00:00.000Z' });
  assert.equal(result.accepted, false);
  assert.equal(result.report.signals.length, 1);
  assert.equal(result.report.stale, true);
});

await check('pipeline recovery starts at earliest failed stage', () => {
  const nowMs = Date.parse('2026-07-13T12:00:00.000Z');
  const policies = Object.fromEntries(['collect', 'aggregate', 'publish', 'consume'].map((stage) => [stage, { staleAfterMs: 10_000, failedAfterMs: 20_000 }]));
  const health = classifyPipelineFreshness({ collect: '2026-07-13T11:59:00.000Z', aggregate: '2026-07-13T12:00:00.000Z', publish: '2026-07-13T12:00:00.000Z', consume: '2026-07-13T12:00:00.000Z' }, { policies, nowMs });
  assert.deepEqual(planRecovery(health), ['collect', 'aggregate', 'publish', 'consume']);
});

await check('corrupt immutable snapshot cannot activate', async () => {
  const storage = new InMemoryObjectStorage({ corruptReadPath: 'stats.json' });
  const key = Buffer.alloc(32, 9).toString('base64url');
  const files = { 'stats.json': JSON.stringify({ generatedAt: '2026-07-13T12:00:00.000Z' }) };
  const metadata = { generatedAt: '2026-07-13T12:00:00.000Z', appCommit: 'drill', engineCommit: 'drill', collectionRunId: 'drill', stateHealth: { NC: { status: 'healthy' } } };
  await assert.rejects(() => publishSiteSnapshot(storage, files, metadata, { encryptionKey: key }));
  assert.equal(await storage.readPointer(), null);
});

await check('rollback restores the prior complete snapshot', async () => {
  const storage = new InMemoryObjectStorage();
  const key = Buffer.alloc(32, 8).toString('base64url');
  const base = { appCommit: 'drill', engineCommit: 'drill', stateHealth: { NC: { status: 'healthy' } } };
  const first = await publishSiteSnapshot(storage, { 'stats.json': '{"version":1}' }, { ...base, generatedAt: '2026-07-13T10:00:00.000Z', collectionRunId: 'one' }, { encryptionKey: key });
  await publishSiteSnapshot(storage, { 'stats.json': '{"version":2}' }, { ...base, generatedAt: '2026-07-13T11:00:00.000Z', collectionRunId: 'two' }, { encryptionKey: key });
  await rollbackSiteSnapshot(storage);
  assert.equal((await storage.readPointer()).active, first.manifest.snapshotId);
});

const payload = { ok: checks.every((item) => item.ok), checkedAt: new Date().toISOString(), mode: 'simulation_no_production_mutation', checks };
await mkdir(path.resolve('out'), { recursive: true });
await writeFile(path.resolve('out/recovery-drill.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
if (!payload.ok) process.exit(1);
