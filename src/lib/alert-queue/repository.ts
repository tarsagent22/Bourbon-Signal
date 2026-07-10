export type AlertChannel = "onSite" | "email" | "sms";
export type AlertCandidateStatus = "pending" | "claimed" | "delivered" | "suppressed" | "failed";

export interface AlertCandidateInput {
  snapshotId: string;
  userId: string;
  channel: AlertChannel;
  stableMatchKey: string;
  alertWindow: string;
  createdAt: string;
}

export interface AlertCandidateRecord extends AlertCandidateInput {
  id: string;
  status: AlertCandidateStatus;
  claimedBy?: string;
  claimedAt?: string;
  deliveredAt?: string;
  providerMessageId?: string;
}

export interface AlertBaselineInput {
  userId: string;
  channel: AlertChannel;
  stableMatchKey: string;
  createdAt: string;
}

export interface AlertQueueRepository {
  enqueue(input: AlertCandidateInput): Promise<AlertCandidateRecord>;
  baseline(input: AlertBaselineInput): Promise<void>;
  claim(id: string, workerId: string, claimedAt: string): Promise<AlertCandidateRecord | null>;
  markDelivered(id: string, providerMessageId: string, deliveredAt: string): Promise<void>;
  get(id: string): Promise<AlertCandidateRecord | null>;
  listPending(limit?: number): Promise<AlertCandidateRecord[]>;
}

function candidateUniqueKey(input: AlertCandidateInput) {
  return [input.userId, input.channel, input.stableMatchKey, input.alertWindow].join("\u001f");
}

function baselineUniqueKey(input: Pick<AlertBaselineInput, "userId" | "channel" | "stableMatchKey">) {
  return [input.userId, input.channel, input.stableMatchKey].join("\u001f");
}

function clone(record: AlertCandidateRecord) {
  return { ...record };
}

/**
 * Conformance adapter for repository tests and monitor-only shadow evaluation.
 * Production delivery must use a transactional adapter with a database unique constraint.
 */
export class InMemoryAlertQueueRepository implements AlertQueueRepository {
  private readonly candidates = new Map<string, AlertCandidateRecord>();
  private readonly idsByUniqueKey = new Map<string, string>();
  private readonly baselines = new Set<string>();
  private nextId = 1;

  async enqueue(input: AlertCandidateInput) {
    const uniqueKey = candidateUniqueKey(input);
    const existingId = this.idsByUniqueKey.get(uniqueKey);
    if (existingId) return clone(this.candidates.get(existingId)!);

    const id = `candidate-${this.nextId++}`;
    const isBaselined = this.baselines.has(baselineUniqueKey(input));
    const record: AlertCandidateRecord = {
      ...input,
      id,
      status: isBaselined ? "suppressed" : "pending",
    };
    this.candidates.set(id, record);
    this.idsByUniqueKey.set(uniqueKey, id);
    return clone(record);
  }

  async baseline(input: AlertBaselineInput) {
    const key = baselineUniqueKey(input);
    this.baselines.add(key);
    for (const record of this.candidates.values()) {
      if (baselineUniqueKey(record) === key && record.status === "pending") {
        record.status = "suppressed";
      }
    }
  }

  async claim(id: string, workerId: string, claimedAt: string) {
    const record = this.candidates.get(id);
    if (!record || record.status !== "pending") return null;
    record.status = "claimed";
    record.claimedBy = workerId;
    record.claimedAt = claimedAt;
    return clone(record);
  }

  async markDelivered(id: string, providerMessageId: string, deliveredAt: string) {
    const record = this.candidates.get(id);
    if (!record || record.status !== "claimed") {
      throw new Error(`Cannot mark unclaimed alert candidate ${id} as delivered`);
    }
    record.status = "delivered";
    record.providerMessageId = providerMessageId;
    record.deliveredAt = deliveredAt;
  }

  async get(id: string) {
    const record = this.candidates.get(id);
    return record ? clone(record) : null;
  }

  async listPending(limit = 100) {
    return Array.from(this.candidates.values())
      .filter((record) => record.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .slice(0, Math.max(0, limit))
      .map(clone);
  }
}
