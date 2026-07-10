#!/usr/bin/env node
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { PostgresAlertQueueRepository } from '../src/lib/alert-queue/postgres-repository.ts';

const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing Bourbon queue database connection.');

const query = neon(connectionString);
const executor = {
  async query(text, params = []) {
    return { rows: await query.query(text, params) };
  },
};
const repository = new PostgresAlertQueueRepository(executor);
const suffix = `${Date.now()}-${process.pid}`;
const snapshotId = `smoke-snapshot-${suffix}`;
const userId = `smoke-user-${suffix}`;
const now = new Date();
const earlier = new Date(now.getTime() - 60_000).toISOString();

try {
  await repository.registerSnapshot({
    snapshotId,
    appCommit: 'smoke',
    engineCommit: 'smoke',
    collectionRunId: `smoke-run-${suffix}`,
    generatedAt: now.toISOString(),
    activatedAt: now.toISOString(),
    manifest: { smoke: true },
  });
  const input = {
    snapshotId,
    userId,
    channel: 'onSite',
    stableMatchKey: `smoke-key-${suffix}`,
    alertWindow: 'smoke-window',
    createdAt: now.toISOString(),
  };
  const first = await repository.enqueue(input);
  const duplicate = await repository.enqueue(input);
  assert.equal(first.id, duplicate.id, 'database uniqueness must return the original candidate');

  const claimed = await repository.claim(first.id, 'smoke-worker-1', now.toISOString());
  assert.equal(claimed?.status, 'claimed');
  await repository.markFailed(first.id, 'SMOKE_RETRY', now.toISOString(), earlier);
  assert.equal((await repository.get(first.id))?.status, 'pending');

  const reclaimed = await repository.claim(first.id, 'smoke-worker-2', now.toISOString());
  assert.equal(reclaimed?.status, 'claimed');
  await repository.markDelivered(first.id, `smoke-provider-${suffix}`, now.toISOString());
  const delivered = await repository.get(first.id);
  assert.equal(delivered?.status, 'delivered');
  assert.equal(delivered?.attemptCount, 1);

  const auditRows = await query.query(
    'select status, attempt_number from alert_deliveries where candidate_id = $1 order by attempt_number',
    [first.id],
  );
  assert.deepEqual(auditRows.map((row) => row.status), ['failed', 'delivered']);
  console.log(JSON.stringify({
    ok: true,
    idempotent: true,
    retryRecovered: true,
    deliveredWithAudit: true,
    deliveryAttemptCount: auditRows.length,
  }, null, 2));
} finally {
  await query.query('delete from alert_deliveries where candidate_id in (select id from alert_candidates where snapshot_id = $1)', [snapshotId]);
  await query.query('delete from alert_candidates where snapshot_id = $1', [snapshotId]);
  await query.query('delete from engine_snapshots where snapshot_id = $1', [snapshotId]);
}
