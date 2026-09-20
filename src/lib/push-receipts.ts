import { randomUUID } from "node:crypto";
import { createProductionAlertQueueSqlExecutor } from "./alert-queue/runtime";
import type { SqlExecutor } from "./alert-queue/postgres-repository";

const EXPO_PUSH_RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";
const MAX_RECEIPT_ATTEMPTS = 5;
const MAX_RECEIPT_BATCH = 300;
const KNOWN_REASON_CLASSES = new Set([
  "device_not_registered",
  "receipt_ok",
  "receipt_rejected",
  "provider_transient",
  "receipt_retry_exhausted",
  "malformed_receipt_response",
  "partial_receipt_response",
  "unknown_receipt_ids",
  "account_deleted_after_acceptance",
]);

export interface ClaimedPushTicket {
  ticketId: string;
  outboxId: string;
  userId: string;
  tokenHash: string;
  installationHash: string;
  bindingId: string;
  acceptedAt: string;
  attempts: number;
}

export type PushReceiptOutcome = {
  ticketId: string;
  status: "delivered" | "rejected" | "unknown";
  reason: string;
};

export interface PushDeliveryHealth {
  pendingTickets: number;
  maxReceiptLagSeconds: number;
  delivered: number;
  rejected: number;
  unknown: number;
  staleDevices: number;
  invalidDevices: number;
  reasonClasses: Record<string, number>;
}

export interface PushReceiptRepository {
  claimDue(owner: string, now: string, limit: number): Promise<ClaimedPushTicket[]>;
  resolve(owner: string, outcomes: PushReceiptOutcome[], now: string): Promise<void>;
  retry(owner: string, ids: string[], nextAttemptAt: string, reason: string, now: string): Promise<void>;
  health(now: string): Promise<PushDeliveryHealth>;
}

const text = (value: unknown) => typeof value === "string" ? value : "";
const count = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export class PostgresPushReceiptRepository implements PushReceiptRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async claimDue(owner: string, now: string, limit: number) {
    const bounded = Math.max(1, Math.min(MAX_RECEIPT_BATCH, Math.trunc(limit)));
    const result = await this.sql.query(`with due as materialized (
        select provider_ticket_id from alert_push_tickets
        where status='pending' and next_receipt_at<=$2::timestamptz
          and (poll_lease_expires_at is null or poll_lease_expires_at<=$2::timestamptz)
        order by next_receipt_at,provider_ticket_id limit $3 for update skip locked
      ) update alert_push_tickets ticket set poll_owner=$1,poll_lease_expires_at=$2::timestamptz+interval '5 minutes',
          receipt_attempt_count=least(receipt_attempt_count+1,5),updated_at=$2::timestamptz
        from due where ticket.provider_ticket_id=due.provider_ticket_id
        returning ticket.provider_ticket_id,ticket.outbox_id,ticket.user_id,ticket.token_hash,ticket.installation_hash,
          ticket.binding_id,ticket.accepted_at,ticket.receipt_attempt_count`, [owner, now, bounded]);
    return result.rows.map((row) => ({
      ticketId: text(row.provider_ticket_id),
      outboxId: text(row.outbox_id),
      userId: text(row.user_id),
      tokenHash: text(row.token_hash),
      installationHash: text(row.installation_hash),
      bindingId: text(row.binding_id),
      acceptedAt: new Date(String(row.accepted_at)).toISOString(),
      attempts: Number(row.receipt_attempt_count),
    }));
  }

  async resolve(owner: string, outcomes: PushReceiptOutcome[], now: string) {
    if (!outcomes.length) return;
    const payload = JSON.stringify(outcomes.map((outcome) => ({
      provider_ticket_id: outcome.ticketId,
      status: outcome.status,
      reason: KNOWN_REASON_CLASSES.has(outcome.reason) ? outcome.reason : "receipt_rejected",
    })));
    await this.sql.query(`with incoming as materialized (
        select * from jsonb_to_recordset($2::jsonb) as outcome(provider_ticket_id text,status text,reason text)
      ), targets as materialized (
        select ticket.* from alert_push_tickets ticket join incoming using(provider_ticket_id)
        where ticket.status='pending' and ticket.poll_owner=$1
      ), revoked as (
        update member_push_ownership ownership set expires_at=least(ownership.expires_at,$3::timestamptz),updated_at=$3::timestamptz
        from targets ticket join incoming using(provider_ticket_id)
        where incoming.reason='device_not_registered' and ownership.user_id=ticket.user_id
          and ownership.binding_id=ticket.binding_id
          and ownership.resource_hash in (ticket.token_hash,ticket.installation_hash)
        returning ownership.resource_hash
      ), updated as (
        update alert_push_tickets ticket set status=incoming.status,reason=incoming.reason,resolved_at=$3::timestamptz,
          poll_owner=null,poll_lease_expires_at=null,updated_at=$3::timestamptz
        from incoming where ticket.provider_ticket_id=incoming.provider_ticket_id
          and ticket.status='pending' and ticket.poll_owner=$1
        returning ticket.outbox_id,ticket.provider_ticket_id,ticket.status
      ), states as materialized (
        select outbox_id,provider_ticket_id,status from updated
        union all
        select ticket.outbox_id,ticket.provider_ticket_id,ticket.status from alert_push_tickets ticket
        where ticket.outbox_id in (select outbox_id from updated)
          and not exists(select 1 from updated where updated.provider_ticket_id=ticket.provider_ticket_id)
      ), aggregate as materialized (
        select outbox_id,count(*) filter(where status='pending') pending,
          count(*) filter(where status='unknown') unknown,
          count(*) filter(where status='rejected') rejected
        from states group by outbox_id
      ) update alert_push_outbox outbox set
        status=case when aggregate.pending>0 then 'accepted' when aggregate.unknown>0 then 'unknown'
          when aggregate.rejected>0 then 'rejected' else 'delivered' end,
        reason=case when aggregate.pending>0 then 'provider_accepted_receipt_pending'
          when aggregate.unknown>0 then 'receipt_manual_review'
          when aggregate.rejected>0 then 'receipt_rejected' else 'receipt_ok' end,
        updated_at=$3::timestamptz
      from aggregate where outbox.id=aggregate.outbox_id and outbox.status='accepted'`, [owner, payload, now]);
  }

  async retry(owner: string, ids: string[], nextAttemptAt: string, reason: string, now: string) {
    if (!ids.length) return;
    await this.sql.query(`update alert_push_tickets set next_receipt_at=$3::timestamptz,reason=$4,
      poll_owner=null,poll_lease_expires_at=null,updated_at=$5::timestamptz
      where provider_ticket_id=any($2::text[]) and status='pending' and poll_owner=$1`,
    [owner, ids, nextAttemptAt, KNOWN_REASON_CLASSES.has(reason) ? reason : "provider_transient", now]);
  }

  async health(now: string): Promise<PushDeliveryHealth> {
    const result = await this.sql.query(`select
        count(*) filter(where status='pending') pending_tickets,
        coalesce(greatest(0,extract(epoch from ($1::timestamptz-min(accepted_at) filter(where status='pending')))),0)::bigint max_receipt_lag_seconds,
        count(*) filter(where status='delivered') delivered,
        count(*) filter(where status='rejected') rejected,
        count(*) filter(where status='unknown') unknown,
        (select count(distinct binding_id) from member_push_ownership where expires_at<=$1::timestamptz) stale_devices,
        count(distinct installation_hash) filter(where reason='device_not_registered') invalid_devices
      from alert_push_tickets`, [now]);
    const reasons = await this.sql.query(`select reason,count(*)::bigint count from alert_push_tickets
      where reason is not null group by reason order by reason limit 20`);
    const row = result.rows[0] || {};
    const reasonClasses: Record<string, number> = {};
    for (const reason of reasons.rows) {
      const name = text(reason.reason);
      if (KNOWN_REASON_CLASSES.has(name)) reasonClasses[name] = count(reason.count);
    }
    return {
      pendingTickets: count(row.pending_tickets),
      maxReceiptLagSeconds: count(row.max_receipt_lag_seconds),
      delivered: count(row.delivered),
      rejected: count(row.rejected),
      unknown: count(row.unknown),
      staleDevices: count(row.stale_devices),
      invalidDevices: count(row.invalid_devices),
      reasonClasses,
    };
  }
}

class ReceiptProviderError extends Error {
  constructor(readonly transient: boolean) { super("Expo receipt provider unavailable"); }
}

function expoHeaders() {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return headers;
}

async function fetchReceiptData(ids: string[], fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(EXPO_PUSH_RECEIPTS_ENDPOINT, {
      method: "POST",
      headers: expoHeaders(),
      body: JSON.stringify({ ids }),
    });
  } catch {
    throw new ReceiptProviderError(true);
  }
  if (!response.ok) throw new ReceiptProviderError(response.status === 408 || response.status === 429 || response.status >= 500);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ReceiptProviderError(false);
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ReceiptProviderError(false);
  return data as Record<string, unknown>;
}

const providerErrorReason = (value: unknown) => {
  const receipt = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const details = receipt?.details && typeof receipt.details === "object" && !Array.isArray(receipt.details) ? receipt.details as Record<string, unknown> : null;
  return details?.error === "DeviceNotRegistered" ? "device_not_registered" : "receipt_rejected";
};

export async function runPushReceiptReconciliation(options: {
  repository?: PushReceiptRepository;
  workerId?: string;
  now?: () => string;
  fetcher?: typeof fetch;
  limit?: number;
} = {}) {
  const repository = options.repository || new PostgresPushReceiptRepository(createProductionAlertQueueSqlExecutor());
  const workerId = options.workerId || `push-receipts-${randomUUID()}`;
  const now = options.now || (() => new Date().toISOString());
  const at = now();
  const tickets = await repository.claimDue(workerId, at, options.limit || MAX_RECEIPT_BATCH);
  const summary = { claimed: tickets.length, delivered: 0, rejected: 0, unknown: 0, retried: 0 };
  if (!tickets.length) return summary;

  let data: Record<string, unknown>;
  try {
    data = await fetchReceiptData(tickets.map((ticket) => ticket.ticketId), options.fetcher || fetch);
  } catch (error) {
    const transient = error instanceof ReceiptProviderError && error.transient;
    const retryable = tickets.filter((ticket) => transient && ticket.attempts < MAX_RECEIPT_ATTEMPTS);
    const exhausted = tickets.filter((ticket) => !transient || ticket.attempts >= MAX_RECEIPT_ATTEMPTS);
    if (retryable.length) {
      const maxAttempts = Math.max(...retryable.map((ticket) => ticket.attempts));
      const delayMinutes = Math.min(60, 5 * (2 ** maxAttempts));
      const nextAttemptAt = new Date(Date.parse(at) + delayMinutes * 60_000).toISOString();
      await repository.retry(workerId, retryable.map((ticket) => ticket.ticketId), nextAttemptAt, "provider_transient", at);
      summary.retried += retryable.length;
    }
    if (exhausted.length) {
      const reason = transient ? "receipt_retry_exhausted" : "malformed_receipt_response";
      await repository.resolve(workerId, exhausted.map((ticket) => ({ ticketId: ticket.ticketId, status: "unknown", reason })), at);
      summary.unknown += exhausted.length;
    }
    return summary;
  }

  const requested = new Set(tickets.map((ticket) => ticket.ticketId));
  const hasUnknownIds = Object.keys(data).some((id) => !requested.has(id));
  const outcomes: PushReceiptOutcome[] = tickets.map((ticket) => {
    if (hasUnknownIds) return { ticketId: ticket.ticketId, status: "unknown", reason: "unknown_receipt_ids" };
    const raw = data[ticket.ticketId];
    if (raw === undefined) return { ticketId: ticket.ticketId, status: "unknown", reason: "partial_receipt_response" };
    const receipt = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    if (receipt?.status === "ok") return { ticketId: ticket.ticketId, status: "delivered", reason: "receipt_ok" };
    if (receipt?.status === "error") return { ticketId: ticket.ticketId, status: "rejected", reason: providerErrorReason(receipt) };
    return { ticketId: ticket.ticketId, status: "unknown", reason: "malformed_receipt_response" };
  });
  await repository.resolve(workerId, outcomes, at);
  for (const outcome of outcomes) summary[outcome.status] += 1;
  return summary;
}

export async function readPushDeliveryHealth(now = new Date().toISOString()) {
  return new PostgresPushReceiptRepository(createProductionAlertQueueSqlExecutor()).health(now);
}
