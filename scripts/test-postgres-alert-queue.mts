import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresAlertQueueRepository } from '../src/lib/alert-queue/postgres-repository.ts';

function row(overrides = {}) {
  return {
    id: 'candidate-1', snapshot_id: 'snapshot-1', user_id: 'user-1', channel: 'email', stable_match_key: 'key-1', alert_window: '2026-07-10', status: 'pending', created_at: '2026-07-10T12:00:00.000Z', claimed_by: null, claimed_at: null, delivered_at: null, provider_message_id: null, ...overrides,
  };
}

test('postgres adapter enqueues idempotently and maps durable records', async () => {
  const calls = [];
  const sql = { query: async (text, params) => { calls.push({ text, params }); return { rows: [row()] }; } };
  const repository = new PostgresAlertQueueRepository(sql);
  const result = await repository.enqueue({ snapshotId: 'snapshot-1', userId: 'user-1', channel: 'email', stableMatchKey: 'key-1', alertWindow: '2026-07-10', createdAt: '2026-07-10T12:00:00.000Z' });
  assert.equal(result.snapshotId, 'snapshot-1');
  assert.equal(result.status, 'pending');
  assert.match(calls[0].text, /on conflict\s*\(user_id, channel, stable_match_key, alert_window\)/i);
});

test('postgres adapter claims with one atomic conditional update', async () => {
  const calls = [];
  const sql = { query: async (text, params) => { calls.push({ text, params }); return { rows: [row({ status: 'claimed', claimed_by: 'worker-1', claimed_at: '2026-07-10T12:01:00.000Z' })] }; } };
  const repository = new PostgresAlertQueueRepository(sql);
  const claimed = await repository.claim('candidate-1', 'worker-1', '2026-07-10T12:01:00.000Z');
  assert.equal(claimed?.claimedBy, 'worker-1');
  assert.match(calls[0].text, /where id = \$1 and status = 'pending'/i);
});

test('delivery audit insertion and candidate transition occur in one statement', async () => {
  const calls = [];
  const sql = { query: async (text, params) => { calls.push({ text, params }); return { rows: [{ id: 'candidate-1' }] }; } };
  const repository = new PostgresAlertQueueRepository(sql);
  await repository.markDelivered('candidate-1', 'provider-1', '2026-07-10T12:02:00.000Z');
  assert.match(calls[0].text, /with claimed as/i);
  assert.match(calls[0].text, /insert into alert_deliveries/i);
  assert.match(calls[0].text, /update alert_candidates/i);
});

test('retryable failure and stale claim recovery are durable atomic transitions', async () => {
  const calls = [];
  const sql = { query: async (text, params) => { calls.push({ text, params }); return { rows: [{ id: 'candidate-1' }] }; } };
  const repository = new PostgresAlertQueueRepository(sql);
  await repository.markFailed('candidate-1', 'provider_timeout', '2026-07-10T12:03:00.000Z', '2026-07-10T12:05:00.000Z');
  assert.match(calls[0].text, /insert into alert_deliveries/i);
  assert.match(calls[0].text, /next_attempt_at/i);
  const recovered = await repository.recoverStaleClaims('2026-07-10T12:00:00.000Z');
  assert.equal(recovered, 1);
  assert.match(calls[1].text, /status = 'claimed'/i);
});

test('postgres adapter reserves an underlying group with one locked SQL statement', async () => {
  const calls = [];
  const sql = { query: async (text, params) => {
    calls.push({ text, params });
    return { rows: [row({ id: 'candidate-a', stable_match_key: 'A', status: 'claimed', claimed_by: 'worker-1' })] };
  } };
  const repository = new PostgresAlertQueueRepository(sql);
  const claimed = await repository.reserveBatch({
    snapshotId: 'snapshot-1', userId: 'user-1', channel: 'email', locationKey: 'store-1', alertWindow: 'stable-v2',
    createdAt: '2026-07-10T12:00:00.000Z', children: [{ stableMatchKey: 'A', payload: { bottle: 'A' } }, { stableMatchKey: 'B' }],
  }, 'worker-1', '2026-07-10T12:00:00.000Z', true);
  assert.deepEqual(claimed.map((candidate) => candidate.stableMatchKey), ['A']);
  assert.equal(calls.length, 1, 'batch insertion and claim must use exactly one SQL statement');
  assert.match(calls[0].text, /pg_advisory_xact_lock/i);
  assert.match(calls[0].text, /jsonb_to_recordset/i);
  assert.match(calls[0].text, /insert into alert_candidates/i);
  assert.match(calls[0].text, /alert_baselines/i);
  assert.match(calls[0].text, /on conflict[\s\S]*do update set/i);
  assert.match(calls[0].text, /when \$10::boolean then 'claimed'/i);
  assert.match(calls[0].text, /claimed_by\s*=\s*case/i);
  assert.equal(calls[0].params.filter((value) => value === 'stable-v2').length, 1);
});

test('lease acquisition self-bootstraps its additive table before claiming', async () => {
  const calls = [];
  const sql = { query: async (text, params) => {
    calls.push({ text, params });
    return { rows: /insert into alert_delivery_leases/i.test(text) ? [{ lease_key: 'member:user-1' }] : [] };
  } };
  const repository = new PostgresAlertQueueRepository(sql);
  assert.equal(await repository.acquireLease('member:user-1', 'worker-1', '2026-07-10T12:00:00.000Z', '2026-07-10T12:10:00.000Z'), true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /create table if not exists alert_delivery_leases/i);
  assert.match(calls[1].text, /on conflict \(lease_key\) do update/i);
});

test('group delivery and failure transitions update all claimed children in one statement', async () => {
  const calls = [];
  const sql = { query: async (text, params) => { calls.push({ text, params }); return { rows: [{ id: 'candidate-a' }, { id: 'candidate-b' }] }; } };
  const repository = new PostgresAlertQueueRepository(sql);
  await repository.markBatchDelivered(['candidate-a', 'candidate-b'], 'provider-group', '2026-07-10T12:02:00.000Z');
  assert.match(calls[0].text, /unnest\(\$1::text\[\]\)/i);
  assert.match(calls[0].text, /insert into alert_deliveries/i);
  assert.match(calls[0].text, /update alert_candidates/i);
  await repository.markBatchFailed(['candidate-a', 'candidate-b'], 'provider_timeout', '2026-07-10T12:03:00.000Z', '2026-07-10T12:05:00.000Z');
  assert.match(calls[1].text, /unnest\(\$1::text\[\]\)/i);
  assert.match(calls[1].text, /next_attempt_at/i);
});
