export type AlertChannel = "onSite" | "email" | "sms";
export type AlertCandidateStatus = "pending" | "claimed" | "delivered" | "suppressed" | "failed";

export interface AlertCandidateInput {
  snapshotId: string;
  userId: string;
  channel: AlertChannel;
  stableMatchKey: string;
  alertWindow: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface AlertCandidateRecord extends AlertCandidateInput {
  id: string;
  status: AlertCandidateStatus;
  claimedBy?: string;
  claimedAt?: string;
  deliveredAt?: string;
  providerMessageId?: string;
  attemptCount?: number;
  nextAttemptAt?: string;
  lastErrorCode?: string;
}

export interface AlertCandidateBatchChild {
  stableMatchKey: string;
  payload?: Record<string, unknown>;
}

export interface AlertCandidateBatchInput {
  snapshotId: string;
  userId: string;
  channel: AlertChannel;
  locationKey: string;
  alertWindow: string;
  createdAt: string;
  children: AlertCandidateBatchChild[];
}

export interface AlertBaselineInput {
  userId: string;
  channel: AlertChannel;
  stableMatchKey: string;
  createdAt: string;
}

export interface EngineSnapshotInput {
  snapshotId: string;
  appCommit: string;
  engineCommit: string;
  collectionRunId: string;
  generatedAt: string;
  activatedAt?: string;
  manifest: Record<string, unknown>;
}

export interface AlertQueueRepository {
  registerSnapshot(input: EngineSnapshotInput): Promise<void>;
  enqueue(input: AlertCandidateInput): Promise<AlertCandidateRecord>;
  reserveBatch(input: AlertCandidateBatchInput, workerId: string, claimedAt: string, claim: boolean): Promise<AlertCandidateRecord[]>;
  baseline(input: AlertBaselineInput): Promise<void>;
  claim(id: string, workerId: string, claimedAt: string): Promise<AlertCandidateRecord | null>;
  markDelivered(id: string, providerMessageId: string, deliveredAt: string): Promise<void>;
  markBatchDelivered(ids: string[], providerMessageId: string, deliveredAt: string): Promise<void>;
  markFailed(id: string, errorCode: string, failedAt: string, retryAt?: string): Promise<void>;
  markBatchFailed(ids: string[], errorCode: string, failedAt: string, retryAt?: string): Promise<void>;
  acquireLease(leaseKey: string, owner: string, acquiredAt: string, expiresAt: string): Promise<boolean>;
  releaseLease(leaseKey: string, owner: string): Promise<void>;
  recoverStaleClaims(claimedBefore: string): Promise<number>;
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
  private readonly leases = new Map<string, { owner: string; expiresAt: string }>();
  private nextId = 1;

  async registerSnapshot(_input: EngineSnapshotInput) {}

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

  async reserveBatch(input: AlertCandidateBatchInput, workerId: string, claimedAt: string, claim: boolean) {
    const claimed: AlertCandidateRecord[] = [];
    const seen = new Set<string>();
    for (const child of input.children) {
      const stableMatchKey = child.stableMatchKey.trim();
      if (!stableMatchKey || seen.has(stableMatchKey)) continue;
      seen.add(stableMatchKey);
      const candidateInput: AlertCandidateInput = {
        snapshotId: input.snapshotId,
        userId: input.userId,
        channel: input.channel,
        stableMatchKey,
        alertWindow: input.alertWindow,
        createdAt: input.createdAt,
        payload: child.payload,
      };
      const uniqueKey = candidateUniqueKey(candidateInput);
      let record: AlertCandidateRecord;
      const existingId = this.idsByUniqueKey.get(uniqueKey);
      if (existingId) {
        record = this.candidates.get(existingId)!;
      } else {
        const id = `candidate-${this.nextId++}`;
        record = {
          ...candidateInput,
          id,
          status: this.baselines.has(baselineUniqueKey(candidateInput)) ? "suppressed" : "pending",
        };
        this.candidates.set(id, record);
        this.idsByUniqueKey.set(uniqueKey, id);
      }
      if (claim && record.status === "pending" && (!record.nextAttemptAt || record.nextAttemptAt <= claimedAt)) {
        record.status = "claimed";
        record.claimedBy = workerId;
        record.claimedAt = claimedAt;
        claimed.push(clone(record));
      }
    }
    return claimed;
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
    if (record.nextAttemptAt && record.nextAttemptAt > claimedAt) return null;
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

  async markBatchDelivered(ids: string[], providerMessageId: string, deliveredAt: string) {
    const uniqueIds = Array.from(new Set(ids));
    const records = uniqueIds.map((id) => this.candidates.get(id));
    if (records.some((record) => !record || record.status !== "claimed")) {
      throw new Error("Cannot mark alert batch with unclaimed candidates as delivered");
    }
    for (const record of records as AlertCandidateRecord[]) {
      record.status = "delivered";
      record.providerMessageId = providerMessageId;
      record.deliveredAt = deliveredAt;
    }
  }

  async markFailed(id: string, errorCode: string, _failedAt: string, retryAt?: string) {
    const record = this.candidates.get(id);
    if (!record || record.status !== "claimed") throw new Error(`Cannot fail unclaimed alert candidate ${id}`);
    record.status = retryAt ? "pending" : "failed";
    record.lastErrorCode = errorCode;
    record.attemptCount = (record.attemptCount || 0) + 1;
    record.nextAttemptAt = retryAt;
    delete record.claimedBy;
    delete record.claimedAt;
  }

  async markBatchFailed(ids: string[], errorCode: string, _failedAt: string, retryAt?: string) {
    const uniqueIds = Array.from(new Set(ids));
    const records = uniqueIds.map((id) => this.candidates.get(id));
    if (records.some((record) => !record || record.status !== "claimed")) {
      throw new Error("Cannot fail alert batch with unclaimed candidates");
    }
    for (const record of records as AlertCandidateRecord[]) {
      record.status = retryAt ? "pending" : "failed";
      record.lastErrorCode = errorCode;
      record.attemptCount = (record.attemptCount || 0) + 1;
      record.nextAttemptAt = retryAt;
      delete record.claimedBy;
      delete record.claimedAt;
    }
  }

  async acquireLease(leaseKey: string, owner: string, acquiredAt: string, expiresAt: string) {
    const existing = this.leases.get(leaseKey);
    if (existing && existing.owner !== owner && existing.expiresAt > acquiredAt) return false;
    this.leases.set(leaseKey, { owner, expiresAt });
    return true;
  }

  async releaseLease(leaseKey: string, owner: string) {
    if (this.leases.get(leaseKey)?.owner === owner) this.leases.delete(leaseKey);
  }

  async recoverStaleClaims(claimedBefore: string) {
    let recovered = 0;
    for (const record of this.candidates.values()) {
      if (record.status === "claimed" && record.channel !== "sms" && record.claimedAt && record.claimedAt < claimedBefore) {
        record.status = "pending";
        delete record.claimedBy;
        delete record.claimedAt;
        recovered += 1;
      }
    }
    return recovered;
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
