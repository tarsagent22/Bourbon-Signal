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

const USER_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))";
const REQUEST_STATUSES = new Set<CoverageRequestStatus>(["requested", "on_radar", "improved", "closed"]);

function asString(value: unknown) {
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value || "");
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
    const [, result] = await this.database.transaction((transaction) => [
      transaction.query(USER_LOCK_SQL, [userId]),
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
            updated_at = EXCLUDED.updated_at
          RETURNING *
        )
        SELECT 'upserted' AS outcome, to_jsonb(upserted) AS request FROM upserted
        UNION ALL
        SELECT 'rate_limited' AS outcome, NULL::jsonb AS request
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
