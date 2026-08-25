import { randomUUID } from "node:crypto";
import { alertQueueDatabaseConfigured, createProductionAlertQueueRepository } from "./runtime";

export async function withMemberAlertLease<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  if (!alertQueueDatabaseConfigured()) {
    return { acquired: true, result: await operation() };
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

  try {
    return { acquired: true, result: await operation() };
  } finally {
    await repository.releaseLease(`member:${userId}`, owner);
  }
}
