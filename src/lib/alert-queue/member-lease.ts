import { randomUUID } from "node:crypto";
import { alertQueueDatabaseConfigured, createProductionAlertQueueRepository } from "./runtime";

export async function withMemberAlertLease<T>(
  userId: string,
  operation: (assertHeld: () => Promise<void>) => Promise<T>,
  options: { requireDurable?: boolean } = {},
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

  const assertHeld = async () => {
    if (!(await repository.renewLease(`member:${userId}`, owner))) throw new Error("member_lease_lost");
  };
  try {
    return { acquired: true, result: await operation(assertHeld) };
  } finally {
    await repository.releaseLease(`member:${userId}`, owner);
  }
}
