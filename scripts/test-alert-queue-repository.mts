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

console.log("Alert queue repository contract tests passed.");
