import { neon } from "@neondatabase/serverless";
import {
  normalizeRecommendationFeedbackEntries,
  type RecommendationFeedbackEntry,
} from "./bourbon-recommendations.ts";

export interface RecommendationFeedbackQueryExecutor {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

export interface RecommendationFeedbackDatabase extends RecommendationFeedbackQueryExecutor {
  transaction(
    queries: (transaction: RecommendationFeedbackQueryExecutor) => Array<Promise<unknown>>,
    options?: { isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable"; readOnly?: boolean; deferrable?: boolean },
  ): Promise<unknown[]>;
}

const USER_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))";

export class RecommendationFeedbackRepository {
  private readonly database: RecommendationFeedbackDatabase;

  constructor(database: string | RecommendationFeedbackDatabase) {
    this.database = typeof database === "string"
      ? neon(database) as unknown as RecommendationFeedbackDatabase
      : database;
  }

  async listForUser(userId: string): Promise<RecommendationFeedbackEntry[]> {
    if (!userId) return [];
    const rows = await this.database.query(`
      SELECT payload FROM bourbon_recommendation_feedback
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 200
    `, [userId]) as Array<{ payload: unknown }>;
    return normalizeRecommendationFeedbackEntries({ entries: rows.map((row) => row.payload) });
  }

  async upsertForUser(userId: string, entry: RecommendationFeedbackEntry) {
    if (!userId) throw new Error("A user id is required to save recommendation feedback.");
    const normalized = normalizeRecommendationFeedbackEntries({ entries: [entry] })[0];
    if (!normalized?.canonicalKey) throw new Error("Invalid recommendation feedback entry.");
    const [, result] = await this.database.transaction((transaction) => [
      transaction.query(USER_LOCK_SQL, [userId]),
      transaction.query(`
        WITH feedback_state AS (
          SELECT reset_at
          FROM bourbon_recommendation_feedback_state
          WHERE user_id = $1
        ), upserted AS (
          INSERT INTO bourbon_recommendation_feedback (user_id, canonical_key, payload, updated_at)
          SELECT $1, $2, $3::jsonb, $4::timestamptz
          WHERE NOT EXISTS (
            SELECT 1 FROM feedback_state WHERE reset_at IS NOT NULL AND reset_at >= $4::timestamptz
          )
          ON CONFLICT (user_id, canonical_key)
          DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
          WHERE bourbon_recommendation_feedback.updated_at < EXCLUDED.updated_at
          RETURNING payload
        )
        SELECT payload FROM upserted
        UNION ALL
        SELECT payload FROM bourbon_recommendation_feedback
        WHERE user_id = $1 AND canonical_key = $2 AND NOT EXISTS (SELECT 1 FROM upserted)
        LIMIT 1
      `, [userId, normalized.canonicalKey, JSON.stringify(normalized), normalized.createdAt]),
    ], { isolationLevel: "ReadCommitted" });
    const rows = result as Array<{ payload: unknown }>;
    return normalizeRecommendationFeedbackEntries({ entries: rows.map((row) => row.payload) })[0] || null;
  }

  async migrateLegacyForUser(userId: string, entries: RecommendationFeedbackEntry[], migrationAt = new Date().toISOString()) {
    if (!userId) throw new Error("A user id is required to migrate recommendation feedback.");
    const normalized = normalizeRecommendationFeedbackEntries({ entries });
    if (normalized.length === 0) return false;
    const [, result] = await this.database.transaction((transaction) => [
      transaction.query(USER_LOCK_SQL, [userId]),
      transaction.query(`
        WITH previous_state AS (
          SELECT legacy_migrated_at
          FROM bourbon_recommendation_feedback_state
          WHERE user_id = $1
        ), claimed AS (
          INSERT INTO bourbon_recommendation_feedback_state (user_id, legacy_migrated_at)
          VALUES ($1, $2::timestamptz)
          ON CONFLICT (user_id) DO UPDATE
          SET legacy_migrated_at = COALESCE(
            bourbon_recommendation_feedback_state.legacy_migrated_at,
            EXCLUDED.legacy_migrated_at
          )
          WHERE bourbon_recommendation_feedback_state.legacy_migrated_at IS NULL
          RETURNING legacy_migrated_at
        ), legacy_entries AS (
          SELECT item
          FROM claimed, jsonb_array_elements($3::jsonb) AS item
          WHERE NOT EXISTS (
            SELECT 1 FROM previous_state WHERE legacy_migrated_at IS NOT NULL
          )
        ), upserted AS (
          INSERT INTO bourbon_recommendation_feedback (user_id, canonical_key, payload, updated_at)
          SELECT $1, item->>'canonicalKey', item, (item->>'createdAt')::timestamptz
          FROM legacy_entries
          ON CONFLICT (user_id, canonical_key)
          DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
          WHERE bourbon_recommendation_feedback.updated_at < EXCLUDED.updated_at
          RETURNING 1
        )
        SELECT
          NOT EXISTS (SELECT 1 FROM previous_state WHERE legacy_migrated_at IS NOT NULL) AS should_migrate,
          (SELECT COUNT(*)::int FROM legacy_entries) AS entry_count,
          (SELECT COUNT(*)::int FROM upserted) AS changed_count
        FROM claimed
      `, [userId, migrationAt, JSON.stringify(normalized)]),
    ], { isolationLevel: "ReadCommitted" });
    const rows = result as Array<{ should_migrate?: boolean; entry_count?: number }>;
    return Boolean(rows[0]?.should_migrate) && Number(rows[0]?.entry_count || 0) === normalized.length;
  }

  async resetForUser(userId: string, resetAt = new Date().toISOString()) {
    if (!userId) throw new Error("A user id is required to reset recommendation feedback.");
    const [, result] = await this.database.transaction((transaction) => [
      transaction.query(USER_LOCK_SQL, [userId]),
      transaction.query(`
        WITH reset_state AS (
          INSERT INTO bourbon_recommendation_feedback_state (user_id, reset_at, legacy_migrated_at)
          VALUES ($1, $2::timestamptz, $2::timestamptz)
          ON CONFLICT (user_id) DO UPDATE SET
            reset_at = GREATEST(
              COALESCE(bourbon_recommendation_feedback_state.reset_at, '-infinity'::timestamptz),
              EXCLUDED.reset_at
            ),
            legacy_migrated_at = COALESCE(
              bourbon_recommendation_feedback_state.legacy_migrated_at,
              EXCLUDED.legacy_migrated_at
            )
          RETURNING reset_at
        ), deleted AS (
          DELETE FROM bourbon_recommendation_feedback AS feedback
          USING reset_state
          WHERE feedback.user_id = $1 AND feedback.updated_at <= reset_state.reset_at
          RETURNING 1
        )
        SELECT COUNT(*)::int AS deleted_count FROM deleted
      `, [userId, resetAt]),
    ], { isolationLevel: "ReadCommitted" });
    const rows = result as Array<{ deleted_count?: number }>;
    return Number(rows[0]?.deleted_count || 0);
  }
}

let repository: RecommendationFeedbackRepository | null = null;

export function getRecommendationFeedbackRepository(env: NodeJS.ProcessEnv = process.env) {
  if (repository) return repository;
  const connectionString = env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.BOURBON_QUEUE_DATABASE_URL
    || env.DATABASE_URL;
  if (!connectionString) throw new Error("Recommendation feedback storage is not configured.");
  repository = new RecommendationFeedbackRepository(connectionString);
  return repository;
}
