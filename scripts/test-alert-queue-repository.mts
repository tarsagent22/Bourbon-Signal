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

const lifecycleInput = {
  userId: "user-1",
  channel: "sms" as const,
  lifecycleKey: "alert-lifecycle:store-44-weller-12",
  quantity: 8,
  observedAt: "2026-07-10T12:00:00.000Z",
  legacyBottle: "Weller 12 Year",
  legacyLocation: "Store 44",
};
const initialLifecycle = await repository.evaluateLifecycle(lifecycleInput);
assert.equal(initialLifecycle.shouldOpenDelivery, true);
assert.equal(initialLifecycle.alertWindow, "lifecycle-v1");
const lowerLifecycle = await repository.evaluateLifecycle({ ...lifecycleInput, quantity: 5, observedAt: "2026-07-10T13:00:00.000Z" });
assert.equal(lowerLifecycle.shouldOpenDelivery, false, "lower inventory must not reopen delivery");
assert.equal(lowerLifecycle.alertWindow, "lifecycle-v1");
const restockLifecycle = await repository.evaluateLifecycle({ ...lifecycleInput, quantity: 14, observedAt: "2026-07-12T12:01:00.000Z" });
assert.equal(restockLifecycle.shouldOpenDelivery, true, "material restock after cooldown must reopen delivery");
assert.equal(restockLifecycle.alertVersion, 2, "material restock should advance the durable alert version");

const lifecycleBaseline = await repository.enqueue({
  snapshotId: "snapshot-2",
  userId: "user-1",
  channel: "email",
  stableMatchKey: "semantic-bottle-store",
  alertWindow: "lifecycle-v1",
  payload: { lifecycleBaseline: true },
  createdAt: "2026-07-01T12:00:00.000Z",
});
await repository.markLifecycleBaselineDelivered(lifecycleBaseline.id, `lifecycle-baseline:${lifecycleBaseline.id}`, "2026-07-01T12:00:00.000Z");
assert.equal((await repository.get(lifecycleBaseline.id))?.status, "delivered", "legacy semantic baselines must be durable across later runs");

console.log("Alert queue repository contract tests passed.");
