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
