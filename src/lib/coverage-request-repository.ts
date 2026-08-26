import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type {
  CoverageRequestStatus,
  MemberCoverageRequest,
  NormalizedCoverageRequestTarget,
} from "./coverage-request.ts";

export interface CoverageRequestQueryExecutor {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

export interface CoverageRequestDatabase extends CoverageRequestQueryExecutor {
  transaction(
    queries: (transaction: CoverageRequestQueryExecutor) => Array<Promise<unknown>>,
    options?: { isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable"; readOnly?: boolean; deferrable?: boolean },
  ): Promise<unknown[]>;
}

interface CoverageRequestRow {
  id?: unknown;
  user_id?: unknown;
  target_type?: unknown;
  state_code?: unknown;
  area_key?: unknown;
  area_label?: unknown;
  store_id?: unknown;
  store_name?: unknown;
  store_address?: unknown;
  canonical_target_key?: unknown;
  status?: unknown;
  notification_enabled?: unknown;
  requested_at?: unknown;
  updated_at?: unknown;
  baseline_coverage_fingerprint?: unknown;
}

export interface OwnerCoverageRequestRow extends MemberCoverageRequest {
  userId: string;
}

export interface ActiveCoverageBriefRow {
  targetType: MemberCoverageRequest["targetType"];
  stateCode: string;
  areaLabel: string | null;
  storeName: string | null;
  status: "requested" | "on_radar";
  requestedAt: string;
  updatedAt: string;
}

export interface CoverageAutomationJob {
  jobKey: string;
  coverageRequestId: string;
  requestVersion: string;
  targetType: MemberCoverageRequest["targetType"];
  stateCode: string;
  areaKey: string | null;
  storeId: string | null;
  canonicalTargetKey: string;
  baselineCoverageFingerprint: string;
  status: string;
  taskId: string | null;
  owned?: boolean;
  terminalResult?: unknown;
  deliveryUncertain?: boolean;
}

interface CoverageAutomationJobRow {
  job_key?: unknown;
  coverage_request_id?: unknown;
  request_version?: unknown;
  target_type?: unknown;
  state_code?: unknown;
  area_key?: unknown;
  store_id?: unknown;
  canonical_target_key?: unknown;
  baseline_coverage_fingerprint?: unknown;
  status?: unknown;
  task_id?: unknown;
  terminal_result?: unknown;
  owned?: unknown;
  delivery_uncertain?: unknown;
}

function rowToAutomationJob(row: CoverageAutomationJobRow): CoverageAutomationJob {
  return {
    jobKey: asString(row.job_key),
    coverageRequestId: asString(row.coverage_request_id),
    requestVersion: asString(row.request_version),
    targetType: asString(row.target_type) as MemberCoverageRequest["targetType"],
    stateCode: asString(row.state_code),
    areaKey: nullableString(row.area_key),
    storeId: nullableString(row.store_id),
    canonicalTargetKey: asString(row.canonical_target_key),
    baselineCoverageFingerprint: asString(row.baseline_coverage_fingerprint),
    status: asString(row.status),
    taskId: nullableString(row.task_id),
    owned: Boolean(row.owned),
    terminalResult: row.terminal_result,
    deliveryUncertain: Boolean(row.delivery_uncertain),
  };
}

const USER_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))";
const AUTOMATION_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended('coverage-request-automation', 0))";
const REQUEST_STATUSES = new Set<CoverageRequestStatus>(["requested", "on_radar", "improved", "closed"]);

function asString(value: unknown) {
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value || "");
}

function nullableString(value: unknown) {
  return value === null || value === undefined || value === "" ? null : asString(value);
}

function rowToMemberRequest(row: CoverageRequestRow): MemberCoverageRequest {
  const targetType = row.target_type === "county" || row.target_type === "city" || row.target_type === "store" ? row.target_type : "state";
  const status = REQUEST_STATUSES.has(row.status as CoverageRequestStatus) ? row.status as CoverageRequestStatus : "requested";
  return {
    id: asString(row.id),
    targetType,
    stateCode: asString(row.state_code),
    areaKey: row.area_key ? asString(row.area_key) : null,
    areaLabel: asString(row.area_label),
    storeId: row.store_id ? asString(row.store_id) : null,
    storeName: row.store_name ? asString(row.store_name) : null,
    storeAddress: row.store_address ? asString(row.store_address) : null,
    canonicalTargetKey: asString(row.canonical_target_key),
    status,
    notificationEnabled: row.notification_enabled === true,
    baselineCoverageFingerprint: asString(row.baseline_coverage_fingerprint),
    requestedAt: asString(row.requested_at),
    updatedAt: asString(row.updated_at),
  };
}

export class CoverageRequestRateLimitError extends Error {
  constructor() {
    super("Coverage request limit reached. Try again after the current 24-hour window.");
    this.name = "CoverageRequestRateLimitError";
  }
}

export class CoverageRequestRepository {
  private readonly database: CoverageRequestDatabase;

  constructor(database: string | CoverageRequestDatabase) {
    this.database = typeof database === "string"
      ? neon(database) as unknown as CoverageRequestDatabase
      : database;
  }

  async listForUser(userId: string): Promise<MemberCoverageRequest[]> {
    if (!userId) return [];
    const rows = await this.database.query(`
      SELECT
        id, target_type, state_code, area_key, area_label, store_id, store_name,
        store_address, canonical_target_key, status, notification_enabled,
        requested_at, updated_at, baseline_coverage_fingerprint
      FROM coverage_requests
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 200
    `, [userId]) as CoverageRequestRow[];
    return rows.map(rowToMemberRequest);
  }

  async upsertForUser(
    userId: string,
    target: NormalizedCoverageRequestTarget,
    updatedAt = new Date().toISOString(),
  ): Promise<MemberCoverageRequest> {
    if (!userId) throw new Error("A user id is required to request coverage.");
    const id = randomUUID();
    const [, , result] = await this.database.transaction((transaction) => [
      transaction.query(USER_LOCK_SQL, [userId]),
      transaction.query(AUTOMATION_LOCK_SQL),
      transaction.query(`
        WITH recent_requests AS (
          SELECT COUNT(*)::int AS request_count
          FROM coverage_requests
          WHERE user_id = $2
            AND requested_at >= $13::timestamptz - INTERVAL '24 hours'
        ), eligibility AS (
          SELECT (
            EXISTS (
              SELECT 1 FROM coverage_requests
              WHERE user_id = $2 AND canonical_target_key = $10
            )
            OR (SELECT request_count FROM recent_requests) < 8
          ) AS allowed
        ), upserted AS (
          INSERT INTO coverage_requests (
            id, user_id, target_type, state_code, area_key, area_label,
            store_id, store_name, store_address, canonical_target_key,
            notification_enabled, baseline_coverage_fingerprint, requested_at, updated_at
          )
          SELECT
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13::timestamptz, $13::timestamptz
          FROM eligibility
          WHERE allowed
          ON CONFLICT (user_id, canonical_target_key)
          DO UPDATE SET
            target_type = EXCLUDED.target_type,
            state_code = EXCLUDED.state_code,
            area_key = EXCLUDED.area_key,
            area_label = EXCLUDED.area_label,
            store_id = EXCLUDED.store_id,
            store_name = EXCLUDED.store_name,
            store_address = EXCLUDED.store_address,
            notification_enabled = EXCLUDED.notification_enabled,
            baseline_coverage_fingerprint = CASE
              WHEN coverage_requests.status = 'closed' THEN EXCLUDED.baseline_coverage_fingerprint
              ELSE coverage_requests.baseline_coverage_fingerprint
            END,
            status = CASE WHEN coverage_requests.status = 'closed' THEN 'requested' ELSE coverage_requests.status END,
            updated_at = CASE
              WHEN coverage_requests.status = 'closed' THEN EXCLUDED.updated_at
              ELSE coverage_requests.updated_at
            END
          RETURNING *
        ), queued AS (
          INSERT INTO coverage_request_automation_jobs (
            job_key, coverage_request_id, request_version, target_type, state_code,
            area_key, store_id, canonical_target_key, baseline_coverage_fingerprint,
            status, created_at, updated_at
          )
          SELECT
            'coverage-request:' || id::text || ':' || SUBSTRING(MD5(baseline_coverage_fingerprint) FROM 1 FOR 16),
            id, updated_at, target_type, state_code,
            area_key, store_id, canonical_target_key, baseline_coverage_fingerprint,
            'queued', requested_at, updated_at
          FROM upserted
          WHERE status = 'requested'
          ON CONFLICT (coverage_request_id, baseline_coverage_fingerprint)
          DO UPDATE SET
            request_version = EXCLUDED.request_version,
            target_type = EXCLUDED.target_type,
            state_code = EXCLUDED.state_code,
            area_key = EXCLUDED.area_key,
            store_id = EXCLUDED.store_id,
            canonical_target_key = EXCLUDED.canonical_target_key,
            status = 'queued',
            lease_token = NULL,
            lease_expires_at = NULL,
            task_id = NULL,
            terminal_result = NULL,
            outcome = NULL,
            notification_token = NULL,
            notification_attempted_at = NULL,
            notification_platform_message_id = NULL,
            retry_history = COALESCE(coverage_request_automation_jobs.retry_history, '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object(
                'event', 'reopened_by_member',
                'previousStatus', coverage_request_automation_jobs.status,
                'previousOutcome', coverage_request_automation_jobs.outcome,
                'reopenedAt', EXCLUDED.updated_at
              )),
            updated_at = EXCLUDED.updated_at
          WHERE coverage_request_automation_jobs.status = 'failed'
            AND coverage_request_automation_jobs.outcome = 'blocked'
          RETURNING job_key
        )
        SELECT 'upserted' AS outcome, to_jsonb(upserted) AS request,
          (SELECT COUNT(*)::int FROM queued) AS jobs_queued
        FROM upserted
        UNION ALL
        SELECT 'rate_limited' AS outcome, NULL::jsonb AS request, 0::int AS jobs_queued
        WHERE NOT EXISTS (SELECT 1 FROM upserted)
        LIMIT 1
      `, [
        id,
        userId,
        target.targetType,
        target.stateCode,
        target.areaKey,
        target.areaLabel,
        target.storeId,
        target.storeName,
        target.storeAddress,
        target.canonicalTargetKey,
        target.notificationEnabled,
        target.baselineCoverageFingerprint,
        updatedAt,
      ]),
    ], { isolationLevel: "ReadCommitted" });
    const rows = result as Array<{ outcome?: unknown; request?: CoverageRequestRow | null } & CoverageRequestRow>;
    if (rows[0]?.outcome === "rate_limited") throw new CoverageRequestRateLimitError();
    const row = rows[0]?.request || rows[0];
    if (!row) throw new Error("Coverage request could not be saved.");
    return rowToMemberRequest(row);
  }

  async claimAutomationJob(
    leaseToken: string,
    now = new Date().toISOString(),
    leaseExpiresAt = new Date(Date.parse(now) + 5 * 60_000).toISOString(),
  ): Promise<CoverageAutomationJob | null> {
    const rows = await this.database.query(`
      WITH writer_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended('coverage-request-automation', 0))
      ), active AS (
        SELECT job.*, (job.status = 'claimed' AND job.lease_token = $1) AS owned
        FROM coverage_request_automation_jobs AS job, writer_lock
        WHERE job.status = 'running'
          OR (job.status = 'claimed' AND job.lease_expires_at > $2::timestamptz)
        ORDER BY job.created_at ASC
        LIMIT 1
      ), candidate AS (
        SELECT job.job_key
        FROM coverage_request_automation_jobs AS job, writer_lock
        WHERE (
          job.status = 'queued'
          OR (job.status = 'claimed' AND job.lease_expires_at <= $2::timestamptz)
        )
          AND job.task_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM active)
        ORDER BY job.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      ), claimed AS (
        UPDATE coverage_request_automation_jobs AS job
        SET status = 'claimed', lease_token = $1, lease_expires_at = $3::timestamptz, updated_at = $2::timestamptz
        FROM candidate
        WHERE job.job_key = candidate.job_key
        RETURNING job.*, TRUE AS owned
      )
      SELECT * FROM active
      UNION ALL
      SELECT * FROM claimed
      LIMIT 1
    `, [leaseToken, now, leaseExpiresAt]) as CoverageAutomationJobRow[];
    return rows[0] ? rowToAutomationJob(rows[0]) : null;
  }

  async attachAutomationTask(
    jobKey: string,
    leaseToken: string,
    taskId: string,
    now = new Date().toISOString(),
  ): Promise<CoverageAutomationJob | null> {
    const rows = await this.database.query(`
      UPDATE coverage_request_automation_jobs AS job
      SET status = 'running', task_id = $3, lease_token = NULL, lease_expires_at = NULL, updated_at = $4::timestamptz
      FROM coverage_requests AS request
      WHERE job.job_key = $1
        AND job.status = 'claimed'
        AND job.lease_token = $2
        AND request.id = job.coverage_request_id
        AND request.status = 'requested'
        AND request.updated_at = job.request_version
        AND request.baseline_coverage_fingerprint = job.baseline_coverage_fingerprint
      RETURNING job.*, TRUE AS owned
    `, [jobKey, leaseToken, taskId, now]) as CoverageAutomationJobRow[];
    return rows[0] ? rowToAutomationJob(rows[0]) : null;
  }

  async completeAutomationTask<TerminalResult extends { outcome: unknown }>(
    jobKey: string,
    taskId: string,
    terminalResult: TerminalResult,
    now = new Date().toISOString(),
  ): Promise<CoverageAutomationJob | null> {
    const outcome = String(terminalResult.outcome || "");
    const rows = await this.database.query(`
      WITH writer_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended('coverage-request-automation', 0))
      ), completed AS (
        UPDATE coverage_request_automation_jobs AS job
        SET
          status = 'notification_pending',
          terminal_result = $3::jsonb,
          outcome = $4,
          updated_at = $5::timestamptz
        FROM coverage_requests AS request, writer_lock
        WHERE job.job_key = $1
          AND job.task_id = $2
          AND job.status = 'running'
          AND request.id = job.coverage_request_id
          AND request.status = 'requested'
          AND request.updated_at = job.request_version
          AND request.baseline_coverage_fingerprint = job.baseline_coverage_fingerprint
        RETURNING job.*
      ), request_updated AS (
        UPDATE coverage_requests AS request
        SET
          status = CASE
            WHEN $4 = 'improved' AND COALESCE($3::jsonb->'requesterNotification'->>'ready', 'false') = 'true' THEN 'improved'
            ELSE 'on_radar'
          END,
          improved_at = CASE
            WHEN $4 = 'improved' AND COALESCE($3::jsonb->'requesterNotification'->>'ready', 'false') = 'true' THEN $5::timestamptz
            ELSE request.improved_at
          END,
          improved_coverage_fingerprint = CASE
            WHEN $4 = 'improved' AND COALESCE($3::jsonb->'requesterNotification'->>'ready', 'false') = 'true'
              THEN NULLIF($3::jsonb->>'productionFingerprint', '')
            ELSE request.improved_coverage_fingerprint
          END,
          review_notes = LEFT(
            COALESCE($3::jsonb->>'headline', 'Coverage automation completed.')
            || ' Requester notification: '
            || COALESCE($3::jsonb->'requesterNotification'->>'reasonCode', 'not_ready'),
            1000
          ),
          updated_at = $5::timestamptz
        FROM completed
        WHERE request.id = completed.coverage_request_id
        RETURNING request.id
      )
      SELECT completed.*, FALSE AS owned, FALSE AS delivery_uncertain
      FROM completed, request_updated
    `, [jobKey, taskId, JSON.stringify(terminalResult), outcome, now]) as CoverageAutomationJobRow[];
    return rows[0] ? rowToAutomationJob(rows[0]) : null;
  }

  async retryAutomationJob(
    jobKey: string,
    taskId: string,
    now = new Date().toISOString(),
  ): Promise<CoverageAutomationJob | null> {
    const rows = await this.database.query(`
      WITH writer_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended('coverage-request-automation', 0))
      ), candidate AS (
        SELECT job.job_key, job.coverage_request_id, job.task_id,
               job.terminal_result, job.notification_platform_message_id
        FROM coverage_request_automation_jobs AS job
        JOIN coverage_requests AS request ON request.id = job.coverage_request_id
        CROSS JOIN writer_lock
        WHERE job.job_key = $1
          AND job.task_id = $2
          AND job.status IN ('notification_pending', 'notified', 'failed')
          AND job.outcome = 'blocked'
          AND job.terminal_result->>'blockerCode' IN ('automation_terminal_contract_failure', 'automation_task_missing')
          AND request.status IN ('requested', 'on_radar')
          AND request.baseline_coverage_fingerprint = job.baseline_coverage_fingerprint
        FOR UPDATE OF job, request
      ), request_reset AS (
        UPDATE coverage_requests AS request
        SET
          status = 'requested',
          updated_at = CASE WHEN request.status = 'requested' THEN request.updated_at ELSE $3::timestamptz END,
          review_notes = LEFT('Retrying after a fail-closed automation infrastructure error.', 1000)
        FROM candidate
        WHERE request.id = candidate.coverage_request_id
        RETURNING request.id, request.updated_at
      )
      UPDATE coverage_request_automation_jobs AS job
      SET
        status = 'queued',
        request_version = request_reset.updated_at,
        lease_token = NULL,
        lease_expires_at = NULL,
        task_id = NULL,
        terminal_result = NULL,
        outcome = NULL,
        notification_token = NULL,
        notification_attempted_at = NULL,
        notification_platform_message_id = NULL,
        retry_history = COALESCE(job.retry_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'taskId', candidate.task_id,
          'terminalResult', candidate.terminal_result,
          'platformMessageId', candidate.notification_platform_message_id,
          'retriedAt', $3::timestamptz
        )),
        updated_at = $3::timestamptz
      FROM candidate, request_reset
      WHERE job.job_key = candidate.job_key
        AND request_reset.id = candidate.coverage_request_id
      RETURNING job.*, FALSE AS owned, FALSE AS delivery_uncertain
    `, [jobKey, taskId, now]) as CoverageAutomationJobRow[];
    return rows[0] ? rowToAutomationJob(rows[0]) : null;
  }

  async claimAutomationNotification(
    notificationToken: string,
    now = new Date().toISOString(),
  ): Promise<CoverageAutomationJob | null> {
    const rows = await this.database.query(`
      WITH writer_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended('coverage-request-automation-notification', 0))
      ), uncertain AS (
        UPDATE coverage_request_automation_jobs AS job
        SET status = 'delivery_uncertain', updated_at = $2::timestamptz
        FROM writer_lock
        WHERE job.status = 'notification_sending'
          AND job.notification_attempted_at <= $2::timestamptz - INTERVAL '10 minutes'
        RETURNING job.*, TRUE AS delivery_uncertain
      ), candidate AS (
        SELECT job.job_key
        FROM coverage_request_automation_jobs AS job, writer_lock
        WHERE job.status = 'notification_pending'
          AND NOT EXISTS (SELECT 1 FROM uncertain)
        ORDER BY job.updated_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      ), claimed AS (
        UPDATE coverage_request_automation_jobs AS job
        SET
          status = 'notification_sending',
          notification_token = $1,
          notification_attempted_at = $2::timestamptz,
          updated_at = $2::timestamptz
        FROM candidate
        WHERE job.job_key = candidate.job_key
        RETURNING job.*, FALSE AS delivery_uncertain
      )
      SELECT * FROM uncertain
      UNION ALL
      SELECT * FROM claimed
      LIMIT 1
    `, [notificationToken, now]) as CoverageAutomationJobRow[];
    return rows[0] ? rowToAutomationJob(rows[0]) : null;
  }

  async acknowledgeAutomationNotification(
    jobKey: string,
    notificationToken: string,
    platformMessageId: string,
    now = new Date().toISOString(),
  ): Promise<boolean> {
    const rows = await this.database.query(`
      UPDATE coverage_request_automation_jobs
      SET
        status = 'notified',
        notification_platform_message_id = $3,
        notification_token = NULL,
        updated_at = $4::timestamptz
      WHERE job_key = $1
        AND status = 'notification_sending'
        AND notification_token = $2
      RETURNING job_key
    `, [jobKey, notificationToken, platformMessageId, now]) as Array<{ job_key?: unknown }>;
    return Boolean(rows[0]?.job_key);
  }

  async verifyAutomationAuthority(jobKey: string, taskId: string): Promise<boolean> {
    const rows = await this.database.query(`
      SELECT job.job_key
      FROM coverage_request_automation_jobs AS job
      JOIN coverage_requests AS request ON request.id = job.coverage_request_id
      WHERE job.job_key = $1
        AND job.task_id = $2
        AND job.status = 'running'
        AND request.status = 'requested'
        AND request.updated_at = job.request_version
        AND request.baseline_coverage_fingerprint = job.baseline_coverage_fingerprint
      LIMIT 1
    `, [jobKey, taskId]) as Array<{ job_key?: unknown }>;
    return Boolean(rows[0]?.job_key);
  }

  async updateStatusForOwner(
    requestId: string,
    status: CoverageRequestStatus,
    changedBy: string,
    now = new Date().toISOString(),
  ): Promise<{
    requestId: string;
    previousStatus: CoverageRequestStatus;
    status: CoverageRequestStatus;
    changed: boolean;
    jobsStopped: number;
    jobsQueued: number;
  } | null> {
    if (!requestId || requestId.length > 200 || !REQUEST_STATUSES.has(status) || !changedBy || changedBy.length > 320) return null;
    const rows = await this.database.query(`
      WITH automation_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended('coverage-request-automation', 0))
      ), notification_lock AS (
        SELECT pg_advisory_xact_lock(hashtextextended('coverage-request-automation-notification', 0))
        FROM automation_lock
      ), owner_status_change AS (
        SELECT
          request.id,
          request.status AS previous_status,
          request.target_type,
          request.state_code,
          request.area_key,
          request.store_id,
          request.canonical_target_key,
          request.baseline_coverage_fingerprint,
          'Status changed from ' || request.status || ' to ' || $2::text || ' by ' || $3::text || '.' AS audit_note
        FROM coverage_requests AS request, automation_lock, notification_lock
        WHERE request.id = $1
      ), stopped_jobs AS (
        UPDATE coverage_request_automation_jobs AS job
        SET
          status = 'failed',
          outcome = 'blocked',
          lease_token = NULL,
          lease_expires_at = NULL,
          notification_token = NULL,
          retry_history = COALESCE(job.retry_history, '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object(
              'event', 'status_changed_by_owner',
              'changedBy', $3::text,
              'changedAt', $4::timestamptz,
              'previousRequestStatus', owner_status_change.previous_status,
              'nextRequestStatus', $2::text,
              'previousJobStatus', job.status,
              'taskId', job.task_id,
              'terminalResult', job.terminal_result
            )),
          updated_at = $4::timestamptz
        FROM owner_status_change
        WHERE job.coverage_request_id = owner_status_change.id
          AND $2::text <> 'requested'
          AND $2::text IS DISTINCT FROM owner_status_change.previous_status
          AND job.status IN ('queued', 'claimed', 'running', 'notification_pending')
        RETURNING job.job_key
      ), requeued_jobs AS (
        INSERT INTO coverage_request_automation_jobs (
          job_key,
          coverage_request_id,
          request_version,
          target_type,
          state_code,
          area_key,
          store_id,
          canonical_target_key,
          baseline_coverage_fingerprint,
          status,
          retry_history,
          created_at,
          updated_at
        )
        SELECT
          'coverage-request:' || owner_status_change.id || ':'
            || SUBSTRING(MD5(owner_status_change.baseline_coverage_fingerprint) FROM 1 FOR 16),
          owner_status_change.id,
          $4::timestamptz,
          owner_status_change.target_type,
          owner_status_change.state_code,
          owner_status_change.area_key,
          owner_status_change.store_id,
          owner_status_change.canonical_target_key,
          owner_status_change.baseline_coverage_fingerprint,
          'queued',
          jsonb_build_array(jsonb_build_object(
            'event', 'reopened_by_owner',
            'changedBy', $3::text,
            'reopenedAt', $4::timestamptz,
            'previousRequestStatus', owner_status_change.previous_status
          )),
          $4::timestamptz,
          $4::timestamptz
        FROM owner_status_change
        WHERE $2::text = 'requested'
          AND $2::text IS DISTINCT FROM owner_status_change.previous_status
        ON CONFLICT (coverage_request_id, baseline_coverage_fingerprint) DO UPDATE
        SET
          request_version = EXCLUDED.request_version,
          target_type = EXCLUDED.target_type,
          state_code = EXCLUDED.state_code,
          area_key = EXCLUDED.area_key,
          store_id = EXCLUDED.store_id,
          canonical_target_key = EXCLUDED.canonical_target_key,
          status = 'queued',
          lease_token = NULL,
          lease_expires_at = NULL,
          task_id = NULL,
          terminal_result = NULL,
          outcome = NULL,
          notification_token = NULL,
          notification_attempted_at = NULL,
          notification_platform_message_id = NULL,
          retry_history = COALESCE(coverage_request_automation_jobs.retry_history, '[]'::jsonb)
            || EXCLUDED.retry_history,
          updated_at = EXCLUDED.updated_at
        WHERE coverage_request_automation_jobs.status IN ('failed', 'notified')
        RETURNING job_key
      ), current_active_jobs AS (
        SELECT job.job_key
        FROM coverage_request_automation_jobs AS job
        JOIN owner_status_change ON owner_status_change.id = job.coverage_request_id
        WHERE $2::text = 'requested'
          AND $2::text IS DISTINCT FROM owner_status_change.previous_status
          AND job.baseline_coverage_fingerprint = owner_status_change.baseline_coverage_fingerprint
          AND job.status IN ('queued', 'claimed', 'running')
      ), updated_request AS (
        UPDATE coverage_requests AS request
        SET
          status = $2::text,
          review_notes = CASE
            WHEN $2::text = owner_status_change.previous_status THEN request.review_notes
            WHEN NULLIF(request.review_notes, '') IS NULL THEN owner_status_change.audit_note
            WHEN char_length(request.review_notes) + char_length(owner_status_change.audit_note) + 1 <= 1000
              THEN request.review_notes || E'\n' || owner_status_change.audit_note
            ELSE request.review_notes
          END,
          updated_at = CASE
            WHEN $2::text = owner_status_change.previous_status THEN request.updated_at
            ELSE $4::timestamptz
          END
        FROM owner_status_change
        CROSS JOIN (SELECT COUNT(*)::int AS jobs_stopped FROM stopped_jobs) AS stopped
        CROSS JOIN (SELECT COUNT(*)::int AS jobs_queued FROM requeued_jobs) AS queued
        CROSS JOIN (SELECT COUNT(*)::int AS active_jobs FROM current_active_jobs) AS active
        WHERE request.id = owner_status_change.id
          AND (
            $2::text <> 'requested'
            OR $2::text = owner_status_change.previous_status
            OR queued.jobs_queued > 0
            OR active.active_jobs > 0
          )
        RETURNING request.id, request.status
      )
      SELECT
        updated_request.id AS request_id,
        owner_status_change.previous_status,
        updated_request.status,
        (owner_status_change.previous_status IS DISTINCT FROM updated_request.status) AS changed,
        (SELECT COUNT(*)::int FROM stopped_jobs) AS jobs_stopped,
        (SELECT COUNT(*)::int FROM requeued_jobs) AS jobs_queued
      FROM updated_request
      JOIN owner_status_change ON owner_status_change.id = updated_request.id
    `, [requestId, status, changedBy, now]) as Array<{
      request_id?: unknown;
      previous_status?: unknown;
      status?: unknown;
      changed?: unknown;
      jobs_stopped?: unknown;
      jobs_queued?: unknown;
    }>;
    const row = rows[0];
    if (!row?.request_id || !REQUEST_STATUSES.has(row.status as CoverageRequestStatus)) return null;
    const previousStatus = REQUEST_STATUSES.has(row.previous_status as CoverageRequestStatus)
      ? row.previous_status as CoverageRequestStatus
      : row.status as CoverageRequestStatus;
    return {
      requestId: asString(row.request_id),
      previousStatus,
      status: row.status as CoverageRequestStatus,
      changed: Boolean(row.changed),
      jobsStopped: Number(row.jobs_stopped || 0),
      jobsQueued: Number(row.jobs_queued || 0),
    };
  }

  async closeForOwner(
    requestId: string,
    closedBy: string,
    now = new Date().toISOString(),
  ): Promise<{ requestId: string; jobsStopped: number } | null> {
    const result = await this.updateStatusForOwner(requestId, "closed", closedBy, now);
    return result ? { requestId: result.requestId, jobsStopped: result.jobsStopped } : null;
  }

  async summarizeActiveAutomationStatusesForOwner(): Promise<Record<string, number>> {
    const rows = await this.database.query(`
      SELECT status, COUNT(*)::int AS count
      FROM coverage_request_automation_jobs
      WHERE status NOT IN ('notified', 'failed')
      GROUP BY status
      ORDER BY status
    `) as Array<{ status?: unknown; count?: unknown }>;
    return Object.fromEntries(rows.map((row) => [asString(row.status), Number(row.count || 0)]));
  }

  async listActiveForBrief(limit = 200): Promise<ActiveCoverageBriefRow[]> {
    const rows = await this.database.query(`
      SELECT target_type, state_code, area_label, store_name, status, requested_at, updated_at
      FROM coverage_requests
      WHERE status IN ('requested', 'on_radar')
      ORDER BY updated_at DESC
      LIMIT $1
    `, [Math.max(1, Math.min(200, Math.floor(limit)))]) as CoverageRequestRow[];
    return rows.map((row) => {
      const targetType = asString(row.target_type);
      const status = asString(row.status);
      if (!["state", "county", "city", "store"].includes(targetType) || !["requested", "on_radar"].includes(status)) {
        throw new Error("Active coverage brief row violated its database contract.");
      }
      return {
        targetType: targetType as MemberCoverageRequest["targetType"],
        stateCode: asString(row.state_code),
        areaLabel: nullableString(row.area_label),
        storeName: nullableString(row.store_name),
        status: status as "requested" | "on_radar",
        requestedAt: asString(row.requested_at),
        updatedAt: asString(row.updated_at),
      };
    });
  }

  async listDemandForOwner(limit = 10_000): Promise<OwnerCoverageRequestRow[]> {
    const rows = await this.database.query(`
      SELECT
        id, user_id, target_type, state_code, area_key, area_label, store_id, store_name,
        store_address, canonical_target_key, status, notification_enabled,
        requested_at, updated_at, baseline_coverage_fingerprint
      FROM (
        (
          SELECT *
          FROM coverage_requests
          WHERE status IN ('requested', 'on_radar')
          ORDER BY updated_at DESC
          LIMIT $1
        )
        UNION ALL
        (
          SELECT *
          FROM coverage_requests
          WHERE status IN ('improved', 'closed')
          ORDER BY updated_at DESC
          LIMIT 40
        )
      ) AS owner_coverage_requests
      ORDER BY updated_at DESC
    `, [Math.max(1, Math.min(10_000, Math.floor(limit)))]) as CoverageRequestRow[];
    return rows.map((row) => ({ ...rowToMemberRequest(row), userId: asString(row.user_id) }));
  }
}

let coverageRequestRepository: CoverageRequestRepository | null = null;

export function getCoverageRequestRepository(env: NodeJS.ProcessEnv = process.env) {
  if (coverageRequestRepository) return coverageRequestRepository;
  const connectionString = env.BOURBON_QUEUE_DATABASE_URL
    || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.DATABASE_URL;
  if (!connectionString) throw new Error("Coverage request storage is not configured.");
  coverageRequestRepository = new CoverageRequestRepository(connectionString);
  return coverageRequestRepository;
}
