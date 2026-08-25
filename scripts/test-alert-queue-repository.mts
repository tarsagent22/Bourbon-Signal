import assert from "node:assert/strict";
import { InMemoryAlertQueueRepository } from "../src/lib/alert-queue/repository.ts";

const repository = new InMemoryAlertQueueRepository();
const candidate = {
  snapshotId: "snapshot-1",
  userId: "user-1",
  channel: "sms" as const,
  stableMatchKey: "weller-12|store-44|inventory",
  alertWindow: "2026-07-10",
  createdAt: "2026-07-10T03:00:00.000Z",
};

const first = await repository.enqueue(candidate);
const duplicate = await repository.enqueue(candidate);
assert.equal(first.id, duplicate.id, "candidate uniqueness must be durable at repository boundary");
assert.equal((await repository.listPending()).length, 1);

await repository.baseline({ userId: candidate.userId, channel: candidate.channel, stableMatchKey: candidate.stableMatchKey, createdAt: candidate.createdAt });
assert.equal((await repository.listPending()).length, 0, "baselined candidates must not remain deliverable");

const next = await repository.enqueue({ ...candidate, stableMatchKey: "ehtaylor|store-44|inventory" });
const claim = await repository.claim(next.id, "worker-a", "2026-07-10T03:01:00.000Z");
assert.equal(claim?.status, "claimed");
assert.equal(await repository.claim(next.id, "worker-b", "2026-07-10T03:01:01.000Z"), null, "only one worker may claim a candidate");

await repository.markDelivered(next.id, "provider-message-1", "2026-07-10T03:02:00.000Z");
const delivered = await repository.get(next.id);
assert.equal(delivered?.status, "delivered");
assert.equal(delivered?.providerMessageId, "provider-message-1");
assert.equal((await repository.listPending()).length, 0);

const retryable = await repository.enqueue({ ...candidate, stableMatchKey: "retryable|store-44|inventory" });
await repository.claim(retryable.id, "worker-a", "2026-07-10T03:03:00.000Z");
await repository.markFailed(retryable.id, "provider_timeout", "2026-07-10T03:04:00.000Z", "2026-07-10T03:05:00.000Z");
assert.equal((await repository.get(retryable.id))?.status, "pending", "retryable failures return to the durable queue");

const staleClaim = await repository.enqueue({ ...candidate, channel: "email", stableMatchKey: "stale-claim|store-44|inventory" });
await repository.claim(staleClaim.id, "dead-worker", "2026-07-10T02:00:00.000Z");
const staleSmsClaim = await repository.enqueue({ ...candidate, stableMatchKey: "stale-sms-claim|store-44|inventory" });
await repository.claim(staleSmsClaim.id, "dead-sms-worker", "2026-07-10T02:00:00.000Z");
assert.equal(await repository.recoverStaleClaims("2026-07-10T02:30:00.000Z"), 1);
assert.equal((await repository.get(staleClaim.id))?.status, "pending");
assert.equal((await repository.get(staleSmsClaim.id))?.status, "claimed", "ambiguous SMS claims must never be auto-retried into duplicate texts");

const batchInput = (stableMatchKeys: string[]) => ({
  snapshotId: "snapshot-1",
  userId: "batch-user",
  channel: "email" as const,
  locationKey: "store-44",
  alertWindow: "stable-v2",
  createdAt: "2026-07-10T04:00:00.000Z",
  children: stableMatchKeys.map((stableMatchKey) => ({ stableMatchKey, payload: { stableMatchKey } })),
});

const overlappingRepository = new InMemoryAlertQueueRepository();
const [ab, ac] = await Promise.all([
  overlappingRepository.reserveBatch(batchInput(["A", "B"]), "worker-ab", "2026-07-10T04:00:00.000Z", true),
  overlappingRepository.reserveBatch(batchInput(["A", "C"]), "worker-ac", "2026-07-10T04:00:00.000Z", true),
]);
assert.deepEqual(ab.map((row) => row.stableMatchKey), ["A", "B"]);
assert.deepEqual(ac.map((row) => row.stableMatchKey), ["C"], "overlapping batches must never both claim A");

await overlappingRepository.markBatchDelivered(ab.map((row) => row.id), "provider-group-1", "2026-07-10T04:01:00.000Z");
assert.ok((await Promise.all(ab.map((row) => overlappingRepository.get(row.id)))).every((row) => row?.status === "delivered"));
await assert.rejects(
  overlappingRepository.markBatchDelivered([ac[0]!.id, "missing-id"], "provider-group-2", "2026-07-10T04:02:00.000Z"),
  /claimed/i,
  "batch transitions must reject the whole set when any child is not claimed",
);
assert.equal((await overlappingRepository.get(ac[0]!.id))?.status, "claimed", "failed batch validation must not partially transition rows");

const baselinedBatchRepository = new InMemoryAlertQueueRepository();
await baselinedBatchRepository.baseline({ userId: "batch-user", channel: "email", stableMatchKey: "A", createdAt: candidate.createdAt });
const onlyB = await baselinedBatchRepository.reserveBatch(batchInput(["A", "B"]), "worker-baseline", "2026-07-10T04:00:00.000Z", true);
assert.deepEqual(onlyB.map((row) => row.stableMatchKey), ["B"], "batch reservation must honor alert_baselines");

const leaseRepository = new InMemoryAlertQueueRepository();
assert.equal(await leaseRepository.acquireLease("member:user-1", "worker-a", "2026-07-10T04:00:00.000Z", "2026-07-10T04:10:00.000Z"), true);
assert.equal(await leaseRepository.acquireLease("member:user-1", "worker-b", "2026-07-10T04:01:00.000Z", "2026-07-10T04:11:00.000Z"), false, "overlapping workers must not concurrently mutate one member inbox");
await leaseRepository.releaseLease("member:user-1", "worker-b");
assert.equal(await leaseRepository.acquireLease("member:user-1", "worker-b", "2026-07-10T04:02:00.000Z", "2026-07-10T04:12:00.000Z"), false, "a non-owner cannot release the member lease");
await leaseRepository.releaseLease("member:user-1", "worker-a");
assert.equal(await leaseRepository.acquireLease("member:user-1", "worker-b", "2026-07-10T04:02:00.000Z", "2026-07-10T04:12:00.000Z"), true);

console.log("Alert queue repository contract tests passed.");
