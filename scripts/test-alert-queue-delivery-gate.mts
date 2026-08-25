import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAlertQueueRepository } from '../src/lib/alert-queue/repository.ts';
import { reserveAlertDelivery, reserveAlertDeliveryBatch } from '../src/lib/alert-queue/delivery-gate.ts';

const snapshot = {
  snapshotId: 'snapshot-1',
  appCommit: 'app-1',
  engineCommit: 'engine-1',
  collectionRunId: 'run-1',
  generatedAt: '2026-07-10T14:00:00.000Z',
  activatedAt: '2026-07-10T14:01:00.000Z',
  manifest: { contract: 'test' },
};
const intent = {
  snapshotId: snapshot.snapshotId,
  userId: 'user-1',
  channel: 'email' as const,
  stableMatchKey: 'location-group:abc',
  alertWindow: '2026-07-10T14:00Z',
  createdAt: '2026-07-10T14:02:00.000Z',
  payload: { recipient: 'masked-at-runtime', bottle: "Blanton's" },
};

test('shadow mode persists one idempotent intent without claiming it', async () => {
  const repository = new InMemoryAlertQueueRepository();
  await repository.registerSnapshot(snapshot);
  const first = await reserveAlertDelivery(repository, intent, { mode: 'shadow', workerId: 'worker-a', now: intent.createdAt });
  const second = await reserveAlertDelivery(repository, intent, { mode: 'shadow', workerId: 'worker-b', now: intent.createdAt });
  assert.equal(first.candidate.id, second.candidate.id);
  assert.equal(first.claimed, false);
  assert.equal(second.claimed, false);
  assert.equal((await repository.listPending()).length, 1);
});

test('active mode grants a single claim for duplicate workers', async () => {
  const repository = new InMemoryAlertQueueRepository();
  await repository.registerSnapshot(snapshot);
  const first = await reserveAlertDelivery(repository, intent, { mode: 'active', workerId: 'worker-a', now: intent.createdAt });
  const second = await reserveAlertDelivery(repository, intent, { mode: 'active', workerId: 'worker-b', now: intent.createdAt });
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal(second.reason, 'already_claimed');
});

test('retry is not claimable until nextAttemptAt', async () => {
  const repository = new InMemoryAlertQueueRepository();
  await repository.registerSnapshot(snapshot);
  const first = await reserveAlertDelivery(repository, intent, { mode: 'active', workerId: 'worker-a', now: intent.createdAt });
  assert.equal(first.claimed, true);
  await repository.markFailed(first.candidate.id, 'TEMPORARY', '2026-07-10T14:03:00.000Z', '2026-07-10T14:10:00.000Z');
  const early = await reserveAlertDelivery(repository, intent, { mode: 'active', workerId: 'worker-b', now: '2026-07-10T14:05:00.000Z' });
  assert.equal(early.claimed, false);
  assert.equal(early.reason, 'retry_not_due');
  const due = await reserveAlertDelivery(repository, intent, { mode: 'active', workerId: 'worker-c', now: '2026-07-10T14:11:00.000Z' });
  assert.equal(due.claimed, true);
});

test('batch gate reserves every underlying child at stable-v2 and returns only this worker claims', async () => {
  const repository = new InMemoryAlertQueueRepository();
  const input = {
    snapshotId: snapshot.snapshotId,
    userId: 'user-1',
    channel: 'email' as const,
    locationKey: 'store-1',
    alertWindow: 'stable-v2',
    createdAt: intent.createdAt,
    children: [
      { stableMatchKey: 'A', payload: { bottle: 'A' } },
      { stableMatchKey: 'B', payload: { bottle: 'B' } },
    ],
  };
  const first = await reserveAlertDeliveryBatch(repository, input, { mode: 'active', workerId: 'worker-a', now: input.createdAt });
  const second = await reserveAlertDeliveryBatch(repository, { ...input, children: [input.children[0]!, { stableMatchKey: 'C', payload: { bottle: 'C' } }] }, { mode: 'active', workerId: 'worker-b', now: input.createdAt });
  assert.deepEqual(first.claimed.map((row) => row.stableMatchKey), ['A', 'B']);
  assert.deepEqual(second.claimed.map((row) => row.stableMatchKey), ['C']);
});

test('shadow batch persists child intents without claiming', async () => {
  const repository = new InMemoryAlertQueueRepository();
  const input = {
    snapshotId: snapshot.snapshotId,
    userId: 'user-1',
    channel: 'onSite' as const,
    locationKey: 'store-1',
    alertWindow: 'stable-v2',
    createdAt: intent.createdAt,
    children: [{ stableMatchKey: 'A', payload: { bottle: 'A' } }],
  };
  const result = await reserveAlertDeliveryBatch(repository, input, { mode: 'shadow', workerId: 'worker-a', now: input.createdAt });
  assert.deepEqual(result.claimed, []);
  assert.equal((await repository.listPending()).length, 1);
});
