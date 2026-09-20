import { randomUUID } from "node:crypto";
import { alertQueueDatabaseConfigured, createProductionAlertQueueRepository } from "./runtime";

export async function withMemberAlertLease<T>(
  userId: string,
  operation: (assertHeld: () => Promise<void>) => Promise<T>,
  options: { requireDurable?: boolean; heartbeatMs?: number } = {},
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  if (!alertQueueDatabaseConfigured()) {
    if (options.requireDurable) throw new Error("durable_member_lease_unavailable");
    // No in-memory or unlocked production substitute for a cross-server lease.
    return { acquired: false };
  }

  const repository = createProductionAlertQueueRepository();
  const owner = `member-api:${randomUUID()}`;
  const acquiredAt = new Date().toISOString();
  const acquired = await repository.acquireLease(
    `member:${userId}`,
    owner,
    acquiredAt,
    new Date(Date.parse(acquiredAt) + 60_000).toISOString(),
  );
  if (!acquired) return { acquired: false };

  let lost = false;
  let renewal = Promise.resolve();
  const renew = async () => {
    if (lost) return;
    try {
      if (!(await repository.renewLease(`member:${userId}`, owner))) lost = true;
    } catch {
      lost = true;
    }
  };
  const heartbeatMs = options.heartbeatMs && options.heartbeatMs > 0 ? options.heartbeatMs : 20_000;
  const queueRenewal = () => { renewal = renewal.then(renew); };
  const heartbeat = setInterval(queueRenewal, heartbeatMs);
  heartbeat.unref?.();
  const assertHeld = async () => {
    queueRenewal();
    await renewal;
    if (lost) throw new Error("member_lease_lost");
  };
  try {
    const result = await operation(assertHeld);
    await renewal;
    if (lost) throw new Error("member_lease_lost");
    return { acquired: true, result };
  } finally {
    clearInterval(heartbeat);
    await renewal;
    await repository.releaseLease(`member:${userId}`, owner);
  }
}
