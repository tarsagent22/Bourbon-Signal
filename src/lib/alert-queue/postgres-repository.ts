import { randomUUID } from "node:crypto";
import type {
  AlertBaselineInput,
  AlertCandidateInput,
  AlertCandidateBatchInput,
  AlertCandidateRecord,
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

  async readRecipientCursor(): Promise<number> {
    const result = await this.sql.query(`select next_offset from alert_recipient_cursor where id = 'live'`);
    const offset = Number(result.rows[0]?.next_offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid durable recipient cursor");
    return offset;
  }

  async writeRecipientCursor(offset: number, owner: string): Promise<void> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid recipient cursor offset");
    const result = await this.sql.query(`
      with owned as materialized (
        select lease_key from alert_delivery_leases
        where lease_key = 'recipient-scan:v1' and owner = $2 and expires_at > now()
        for update
      )
      insert into alert_recipient_cursor (id, next_offset, updated_at)
      select 'live', $1, now() from owned
      on conflict (id) do update set next_offset = excluded.next_offset, updated_at = excluded.updated_at
      returning id
    `, [offset, owner]);
    if (!result.rows.length) throw new Error("Recipient scan lease expired or ownership lost");
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

  async reserveBatch(input: AlertCandidateBatchInput, workerId: string, claimedAt: string, claim: boolean) {
    const children = Array.from(new Map(input.children
      .map((child) => [child.stableMatchKey.trim(), child] as const)
      .filter(([stableMatchKey]) => Boolean(stableMatchKey))).values())
      .map((child) => ({
        id: randomUUID(),
        stableMatchKey: child.stableMatchKey.trim(),
        payload: child.payload || {},
      }));
    if (!children.length) return [];
    const result = await this.sql.query(`
      with locked as materialized (
        select pg_advisory_xact_lock(hashtextextended($1 || chr(31) || $2 || chr(31) || $3, 0))
      ), batch as materialized (
        select child.id, child.stable_match_key, child.payload,
          exists (
            select 1 from alert_baselines
            where user_id = $1 and channel = $2 and stable_match_key = child.stable_match_key
          ) as baselined
        from locked
        cross join jsonb_to_recordset($4::jsonb) as child(id text, stable_match_key text, payload jsonb)
      ), reserved as (
        insert into alert_candidates (
          id, snapshot_id, user_id, channel, stable_match_key, alert_window, status, created_at, payload,
          claimed_by, claimed_at
        )
        select batch.id, $5, $1, $2, batch.stable_match_key, $6,
          case when batch.baselined then 'suppressed' when $10::boolean then 'claimed' else 'pending' end,
          $7::timestamptz, coalesce(batch.payload, '{}'::jsonb),
          case when not batch.baselined and $10::boolean then $8 else null end,
          case when not batch.baselined and $10::boolean then $9::timestamptz else null end
        from batch
        on conflict (user_id, channel, stable_match_key, alert_window)
        do update set
          status = case
            when excluded.status = 'suppressed' and alert_candidates.status = 'pending' then 'suppressed'
            when $10::boolean
              and excluded.status <> 'suppressed'
              and alert_candidates.status = 'pending'
              and (alert_candidates.next_attempt_at is null or alert_candidates.next_attempt_at <= $9::timestamptz)
            then 'claimed'
            else alert_candidates.status
          end,
          claimed_by = case
            when $10::boolean
              and excluded.status <> 'suppressed'
              and alert_candidates.status = 'pending'
              and (alert_candidates.next_attempt_at is null or alert_candidates.next_attempt_at <= $9::timestamptz)
            then $8
            else alert_candidates.claimed_by
          end,
          claimed_at = case
            when $10::boolean
              and excluded.status <> 'suppressed'
              and alert_candidates.status = 'pending'
              and (alert_candidates.next_attempt_at is null or alert_candidates.next_attempt_at <= $9::timestamptz)
            then $9::timestamptz
            else alert_candidates.claimed_at
          end
        returning *
      )
      select * from reserved where claimed_by = $8 and claimed_at = $9::timestamptz
    `, [
      input.userId,
      input.channel,
      input.locationKey,
      JSON.stringify(children.map((child) => ({ id: child.id, stable_match_key: child.stableMatchKey, payload: child.payload }))),
      input.snapshotId,
      input.alertWindow,
      input.createdAt,
      workerId,
      claimedAt,
      claim,
    ]);
    return result.rows.map(record);
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

  async markBatchDelivered(ids: string[], providerMessageId: string, deliveredAt: string) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return;
    const result = await this.sql.query(`
      with requested as materialized (
        select distinct unnest($1::text[]) as id
      ), claimed as materialized (
        select candidate.id
        from alert_candidates as candidate
        join requested using (id)
        where candidate.status = 'claimed'
        for update
      ), valid_batch as materialized (
        select (select count(*) from requested) = (select count(*) from claimed) as valid
      ), delivery as (
        insert into alert_deliveries (
          candidate_id, attempt_number, provider_message_id, status, attempted_at, completed_at
        )
        select claimed.id,
          coalesce((select max(attempt_number) + 1 from alert_deliveries where candidate_id = claimed.id), 1),
          $2, 'delivered', $3::timestamptz, $3::timestamptz
        from claimed cross join valid_batch
        where valid_batch.valid
        returning candidate_id
      )
      update alert_candidates
      set status = 'delivered', delivered_at = $3::timestamptz, provider_message_id = $2
      where id in (select candidate_id from delivery)
      returning id
    `, [uniqueIds, providerMessageId, deliveredAt]);
    if (result.rows.length !== uniqueIds.length) throw new Error("Cannot mark alert batch with unclaimed candidates as delivered");
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

  async markBatchFailed(ids: string[], errorCode: string, failedAt: string, retryAt?: string) {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) return;
    const result = await this.sql.query(`
      with requested as materialized (
        select distinct unnest($1::text[]) as id
      ), claimed as materialized (
        select candidate.id
        from alert_candidates as candidate
        join requested using (id)
        where candidate.status = 'claimed'
        for update
      ), valid_batch as materialized (
        select (select count(*) from requested) = (select count(*) from claimed) as valid
      ), delivery as (
        insert into alert_deliveries (
          candidate_id, attempt_number, status, attempted_at, completed_at, error_code
        )
        select claimed.id,
          coalesce((select max(attempt_number) + 1 from alert_deliveries where candidate_id = claimed.id), 1),
          'failed', $3::timestamptz, $3::timestamptz, $2
        from claimed cross join valid_batch
        where valid_batch.valid
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
    `, [uniqueIds, errorCode, failedAt, retryAt || null]);
    if (result.rows.length !== uniqueIds.length) throw new Error("Cannot fail alert batch with unclaimed candidates");
  }

  async acquireLease(leaseKey: string, owner: string, acquiredAt: string, expiresAt: string) {
    await this.sql.query(`
      create table if not exists alert_delivery_leases (
        lease_key text primary key,
        owner text not null,
        acquired_at timestamptz not null,
        expires_at timestamptz not null
      )
    `);
    const result = await this.sql.query(`
      insert into alert_delivery_leases (lease_key, owner, acquired_at, expires_at)
      values ($1, $2, $3::timestamptz, $4::timestamptz)
      on conflict (lease_key) do update set
        owner = excluded.owner,
        acquired_at = excluded.acquired_at,
        expires_at = excluded.expires_at
      where alert_delivery_leases.expires_at <= excluded.acquired_at
         or alert_delivery_leases.owner = excluded.owner
      returning lease_key
    `, [leaseKey, owner, acquiredAt, expiresAt]);
    return Boolean(result.rows[0]);
  }

  // Unlike acquireLease this cannot insert/reacquire a missing or expired lease.
  // An operation that stalled across takeover must discard its metadata snapshot.
  async renewLease(leaseKey: string, owner: string, seconds = 60) {
    const result = await this.sql.query(`update alert_delivery_leases
      set expires_at = clock_timestamp() + ($3::integer * interval '1 second')
      where lease_key = $1 and owner = $2 and expires_at > clock_timestamp()
      returning lease_key`, [leaseKey, owner, seconds]);
    return Boolean(result.rows[0]);
  }

  async releaseLease(leaseKey: string, owner: string) {
    await this.sql.query(
      "delete from alert_delivery_leases where lease_key = $1 and owner = $2",
      [leaseKey, owner],
    );
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
