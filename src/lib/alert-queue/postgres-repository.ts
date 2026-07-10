import { randomUUID } from "node:crypto";
import type {
  AlertBaselineInput,
  AlertCandidateInput,
  AlertCandidateRecord,
  AlertLifecycleEvaluation,
  AlertLifecycleInput,
  AlertQueueRepository,
  EngineSnapshotInput,
} from "./repository";

export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? undefined : String(value);
}

function record(row: Record<string, unknown>): AlertCandidateRecord {
  return {
    id: String(row.id),
    snapshotId: String(row.snapshot_id),
    userId: String(row.user_id),
    channel: String(row.channel) as AlertCandidateRecord["channel"],
    stableMatchKey: String(row.stable_match_key),
    alertWindow: String(row.alert_window),
    createdAt: new Date(String(row.created_at)).toISOString(),
    status: String(row.status) as AlertCandidateRecord["status"],
    claimedBy: text(row.claimed_by),
    claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).toISOString() : undefined,
    deliveredAt: row.delivered_at ? new Date(String(row.delivered_at)).toISOString() : undefined,
    providerMessageId: text(row.provider_message_id),
    attemptCount: Number(row.attempt_count || 0),
    nextAttemptAt: row.next_attempt_at ? new Date(String(row.next_attempt_at)).toISOString() : undefined,
    lastErrorCode: text(row.last_error_code),
    payload: row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {},
  };
}

export class PostgresAlertQueueRepository implements AlertQueueRepository {
  private readonly sql: SqlExecutor;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  async registerSnapshot(input: EngineSnapshotInput) {
    await this.sql.query(`
      insert into engine_snapshots (
        snapshot_id, app_commit, engine_commit, collection_run_id,
        generated_at, activated_at, manifest
      ) values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::jsonb)
      on conflict (snapshot_id) do update set
        activated_at = coalesce(excluded.activated_at, engine_snapshots.activated_at),
        manifest = excluded.manifest
    `, [
      input.snapshotId,
      input.appCommit,
      input.engineCommit,
      input.collectionRunId,
      input.generatedAt,
      input.activatedAt || null,
      JSON.stringify(input.manifest),
    ]);
  }

  async enqueue(input: AlertCandidateInput) {
    const result = await this.sql.query(`
      insert into alert_candidates (
        id, snapshot_id, user_id, channel, stable_match_key, alert_window, status, created_at, payload
      ) values (
        $1, $2, $3, $4, $5, $6,
        case when exists (
          select 1 from alert_baselines
          where user_id = $3 and channel = $4 and stable_match_key = $5
        ) then 'suppressed' else 'pending' end,
        $7::timestamptz,
        $8::jsonb
      )
      on conflict (user_id, channel, stable_match_key, alert_window)
      do update set snapshot_id = alert_candidates.snapshot_id
      returning *
    `, [randomUUID(), input.snapshotId, input.userId, input.channel, input.stableMatchKey, input.alertWindow, input.createdAt, JSON.stringify(input.payload || {})]);
    if (!result.rows[0]) throw new Error("Alert candidate enqueue returned no record");
    return record(result.rows[0]);
  }

  async baseline(input: AlertBaselineInput) {
    await this.sql.query(`
      with inserted as (
        insert into alert_baselines (user_id, channel, stable_match_key, created_at)
        values ($1, $2, $3, $4::timestamptz)
        on conflict (user_id, channel, stable_match_key) do nothing
      )
      update alert_candidates
      set status = 'suppressed'
      where user_id = $1 and channel = $2 and stable_match_key = $3 and status = 'pending'
    `, [input.userId, input.channel, input.stableMatchKey, input.createdAt]);
  }

  async evaluateLifecycle(input: AlertLifecycleInput): Promise<AlertLifecycleEvaluation> {
    const result = await this.sql.query(`
      with legacy as (
        select max(delivered_at) as delivered_at
        from alert_candidates
        where user_id = $1
          and channel = $2
          and status = 'delivered'
          and lower(coalesce(payload->>'bottle', '')) = lower($6)
          and lower(coalesce(payload->>'location', '')) = lower($7)
      )
      insert into alert_lifecycle_states (
        user_id, channel, lifecycle_key,
        last_observed_quantity, last_observed_at,
        last_alerted_quantity, last_alerted_at,
        alert_version, last_decision_reason, unavailable_since
      )
      select $1, $2, $3, $4::numeric, $5::timestamptz, $4::numeric,
        coalesce(legacy.delivered_at, $5::timestamptz), 1,
        case when legacy.delivered_at is null then 'new_availability' else 'legacy_delivery_baseline' end,
        case when $4::numeric <= 0 then $5::timestamptz else null end
      from legacy
      on conflict (user_id, channel, lifecycle_key) do update set
        last_decision_reason = case
          when excluded.last_observed_quantity <= 0 then
            case when excluded.last_observed_quantity = alert_lifecycle_states.last_observed_quantity then 'unchanged' else 'inventory_decrease' end
          when alert_lifecycle_states.last_observed_quantity <= 0 and alert_lifecycle_states.unavailable_since is not null then
            case when excluded.last_observed_at - alert_lifecycle_states.unavailable_since >= interval '12 hours' then 'available_again' else 'availability_reset_cooldown' end
          when excluded.last_observed_quantity = alert_lifecycle_states.last_observed_quantity then 'unchanged'
          when excluded.last_observed_quantity < alert_lifecycle_states.last_observed_quantity then 'inventory_decrease'
          when excluded.last_observed_quantity - alert_lifecycle_states.last_alerted_quantity >= greatest(3, ceil(alert_lifecycle_states.last_alerted_quantity * 0.5))
            and excluded.last_observed_at - alert_lifecycle_states.last_alerted_at >= interval '48 hours' then 'material_restock'
          when excluded.last_observed_quantity - alert_lifecycle_states.last_alerted_quantity >= greatest(3, ceil(alert_lifecycle_states.last_alerted_quantity * 0.5)) then 'restock_cooldown'
          else 'increase_not_material'
        end,
        alert_version = alert_lifecycle_states.alert_version + case
          when alert_lifecycle_states.last_observed_quantity <= 0 and alert_lifecycle_states.unavailable_since is not null
            and excluded.last_observed_at - alert_lifecycle_states.unavailable_since >= interval '12 hours' then 1
          when excluded.last_observed_quantity > alert_lifecycle_states.last_observed_quantity
            and excluded.last_observed_quantity - alert_lifecycle_states.last_alerted_quantity >= greatest(3, ceil(alert_lifecycle_states.last_alerted_quantity * 0.5))
            and excluded.last_observed_at - alert_lifecycle_states.last_alerted_at >= interval '48 hours' then 1
          else 0 end,
        last_alerted_quantity = case
          when alert_lifecycle_states.last_observed_quantity <= 0 and alert_lifecycle_states.unavailable_since is not null
            and excluded.last_observed_at - alert_lifecycle_states.unavailable_since >= interval '12 hours' then excluded.last_observed_quantity
          when excluded.last_observed_quantity > alert_lifecycle_states.last_observed_quantity
            and excluded.last_observed_quantity - alert_lifecycle_states.last_alerted_quantity >= greatest(3, ceil(alert_lifecycle_states.last_alerted_quantity * 0.5))
            and excluded.last_observed_at - alert_lifecycle_states.last_alerted_at >= interval '48 hours' then excluded.last_observed_quantity
          else alert_lifecycle_states.last_alerted_quantity end,
        last_alerted_at = case
          when alert_lifecycle_states.last_observed_quantity <= 0 and alert_lifecycle_states.unavailable_since is not null
            and excluded.last_observed_at - alert_lifecycle_states.unavailable_since >= interval '12 hours' then excluded.last_observed_at
          when excluded.last_observed_quantity > alert_lifecycle_states.last_observed_quantity
            and excluded.last_observed_quantity - alert_lifecycle_states.last_alerted_quantity >= greatest(3, ceil(alert_lifecycle_states.last_alerted_quantity * 0.5))
            and excluded.last_observed_at - alert_lifecycle_states.last_alerted_at >= interval '48 hours' then excluded.last_observed_at
          else alert_lifecycle_states.last_alerted_at end,
        last_observed_quantity = excluded.last_observed_quantity,
        last_observed_at = excluded.last_observed_at,
        unavailable_since = case
          when excluded.last_observed_quantity <= 0 then coalesce(alert_lifecycle_states.unavailable_since, excluded.last_observed_at)
          else null end
      returning alert_version, last_decision_reason
    `, [
      input.userId,
      input.channel,
      input.lifecycleKey,
      Math.max(0, Number.isFinite(input.quantity) ? input.quantity : 0),
      input.observedAt,
      input.legacyBottle || "",
      input.legacyLocation || "",
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("Alert lifecycle evaluation returned no state");
    const alertVersion = Number(row.alert_version || 1);
    const reason = String(row.last_decision_reason || "unchanged") as AlertLifecycleEvaluation["reason"];
    return {
      shouldOpenDelivery: reason === "new_availability" || reason === "material_restock" || reason === "available_again",
      reason,
      alertVersion,
      alertWindow: `lifecycle-v${alertVersion}`,
    };
  }

  async claim(id: string, workerId: string, claimedAt: string) {
    const result = await this.sql.query(`
      update alert_candidates
      set status = 'claimed', claimed_by = $2, claimed_at = $3::timestamptz
      where id = $1 and status = 'pending' and (next_attempt_at is null or next_attempt_at <= $3::timestamptz)
      returning *
    `, [id, workerId, claimedAt]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async markDelivered(id: string, providerMessageId: string, deliveredAt: string) {
    const result = await this.sql.query(`
      with claimed as (
        select id from alert_candidates where id = $1 and status = 'claimed' for update
      ), delivery as (
        insert into alert_deliveries (
          candidate_id, attempt_number, provider_message_id, status, attempted_at, completed_at
        )
        select claimed.id,
          coalesce((select max(attempt_number) + 1 from alert_deliveries where candidate_id = claimed.id), 1),
          $2, 'delivered', $3::timestamptz, $3::timestamptz
        from claimed
        returning candidate_id
      )
      update alert_candidates
      set status = 'delivered', delivered_at = $3::timestamptz, provider_message_id = $2
      where id in (select candidate_id from delivery)
      returning id
    `, [id, providerMessageId, deliveredAt]);
    if (!result.rows[0]) throw new Error(`Cannot mark unclaimed alert candidate ${id} as delivered`);
  }

  async markLifecycleBaselineDelivered(id: string, providerMessageId: string, deliveredAt: string) {
    const result = await this.sql.query(`
      with baseline as (
        select id, status from alert_candidates
        where id = $1
          and status in ('pending', 'claimed', 'delivered')
          and coalesce(payload->>'lifecycleBaseline', 'false') = 'true'
        for update
      ), delivery as (
        insert into alert_deliveries (
          candidate_id, attempt_number, provider_message_id, status, attempted_at, completed_at
        )
        select baseline.id,
          coalesce((select max(attempt_number) + 1 from alert_deliveries where candidate_id = baseline.id), 1),
          $2, 'delivered', $3::timestamptz, $3::timestamptz
        from baseline
        where baseline.status <> 'delivered'
        on conflict do nothing
      )
      update alert_candidates
      set status = 'delivered', delivered_at = $3::timestamptz, provider_message_id = $2,
          claimed_by = null, claimed_at = null
      where id in (select id from baseline)
      returning id
    `, [id, providerMessageId, deliveredAt]);
    if (!result.rows[0]) throw new Error(`Cannot mark non-baseline alert candidate ${id} as delivered`);
  }

  async markFailed(id: string, errorCode: string, failedAt: string, retryAt?: string) {
    const result = await this.sql.query(`
      with claimed as (
        select id from alert_candidates where id = $1 and status = 'claimed' for update
      ), delivery as (
        insert into alert_deliveries (
          candidate_id, attempt_number, status, attempted_at, completed_at, error_code
        )
        select claimed.id,
          coalesce((select max(attempt_number) + 1 from alert_deliveries where candidate_id = claimed.id), 1),
          'failed', $3::timestamptz, $3::timestamptz, $2
        from claimed
        returning candidate_id
      )
      update alert_candidates
      set status = case when $4::timestamptz is null then 'failed' else 'pending' end,
          claimed_by = null,
          claimed_at = null,
          attempt_count = attempt_count + 1,
          next_attempt_at = $4::timestamptz,
          last_error_code = $2
      where id in (select candidate_id from delivery)
      returning id
    `, [id, errorCode, failedAt, retryAt || null]);
    if (!result.rows[0]) throw new Error(`Cannot fail unclaimed alert candidate ${id}`);
  }

  async recoverStaleClaims(claimedBefore: string) {
    const result = await this.sql.query(`
      update alert_candidates
      set status = 'pending', claimed_by = null, claimed_at = null
      where status = 'claimed' and channel <> 'sms' and claimed_at < $1::timestamptz
      returning id
    `, [claimedBefore]);
    return result.rows.length;
  }

  async get(id: string) {
    const result = await this.sql.query("select * from alert_candidates where id = $1", [id]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async listPending(limit = 100) {
    const result = await this.sql.query(`
      select * from alert_candidates
      where status = 'pending' and (next_attempt_at is null or next_attempt_at <= now())
      order by created_at, id
      limit $1
    `, [Math.max(0, limit)]);
    return result.rows.map(record);
  }
}
