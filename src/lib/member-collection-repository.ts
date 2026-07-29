import { neon } from "@neondatabase/serverless";
import { runtimeNeonConnectionString } from "./neon-runtime";
import {
  normalizeCollectionBottles,
  type CollectionBottlePreference,
  type MemberCollection,
} from "./member-collection";

export interface MemberCollectionQueryExecutor {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

export interface MemberCollectionDatabase extends MemberCollectionQueryExecutor {
  transaction(
    queries: (transaction: MemberCollectionQueryExecutor) => Array<Promise<unknown>>,
    options?: { isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable"; readOnly?: boolean; deferrable?: boolean },
  ): Promise<unknown[]>;
}

const USER_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))";

export class MemberCollectionConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super("Your collection changed on another device. Refresh and try again.");
    this.name = "MemberCollectionConflictError";
    this.currentVersion = currentVersion;
  }
}

export class MemberCollectionRepository {
  private readonly database: MemberCollectionDatabase;

  constructor(database: string | MemberCollectionDatabase) {
    this.database = typeof database === "string"
      ? neon(database) as unknown as MemberCollectionDatabase
      : database;
  }

  async getForUser(userId: string): Promise<MemberCollection> {
    if (!userId) return { version: 0, bottles: [] };
    const rows = await this.database.query(`
      SELECT state.version, bottles.payload
      FROM member_collection_state AS state
      LEFT JOIN member_collection_bottles AS bottles ON bottles.user_id = state.user_id
      WHERE state.user_id = $1
      ORDER BY bottles.rating DESC NULLS LAST, bottles.bottle_name ASC
    `, [userId]) as Array<{ version?: unknown; payload?: unknown }>;
    return {
      version: Number(rows[0]?.version || 0),
      bottles: normalizeCollectionBottles(rows.flatMap((row) => row.payload ? [row.payload] : [])),
    };
  }

  async getCollectionsForUsers(userIds: readonly string[]): Promise<Map<string, MemberCollection>> {
    const ids = [...new Set(userIds.map((value) => value.trim()).filter(Boolean))].slice(0, 20_000);
    if (!ids.length) return new Map();
    const rows = await this.database.query(`
      SELECT state.user_id, state.version, bottles.payload
      FROM member_collection_state AS state
      LEFT JOIN member_collection_bottles AS bottles ON bottles.user_id = state.user_id
      WHERE state.user_id = ANY($1::text[])
      ORDER BY state.user_id ASC, bottles.rating DESC NULLS LAST, bottles.bottle_name ASC
    `, [ids]) as Array<{ user_id?: unknown; version?: unknown; payload?: unknown }>;
    const grouped = new Map<string, MemberCollection>();
    for (const row of rows) {
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      if (!userId) continue;
      const current = grouped.get(userId) || { version: Number(row.version || 0), bottles: [] };
      if (row.payload) current.bottles = normalizeCollectionBottles([...current.bottles, row.payload]);
      grouped.set(userId, current);
    }
    return grouped;
  }

  async getLegacyRetirementEvidence(userId: string) {
    const rows = await this.database.query(`
      SELECT state.legacy_migrated_at, state.legacy_cleared_at,
        backup.payload AS backup_payload, backup.backed_up_at
      FROM member_collection_state AS state
      LEFT JOIN member_collection_legacy_backups AS backup ON backup.user_id = state.user_id
      WHERE state.user_id = $1
    `, [userId]) as Array<{
      legacy_migrated_at?: unknown;
      legacy_cleared_at?: unknown;
      backup_payload?: unknown;
      backed_up_at?: unknown;
    }>;
    const row = rows[0];
    const timestamp = (value: unknown) => value instanceof Date
      ? value.toISOString()
      : typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
    return {
      legacyMigratedAt: timestamp(row?.legacy_migrated_at),
      legacyClearedAt: timestamp(row?.legacy_cleared_at),
      backup: row?.backup_payload ?? null,
      backedUpAt: timestamp(row?.backed_up_at),
    };
  }

  async migrateLegacyForUser(userId: string, entries: CollectionBottlePreference[], migrationAt = new Date().toISOString()) {
    if (!userId) throw new Error("A user id is required to migrate a collection.");
    const bottles = normalizeCollectionBottles(entries);
    const [, , result] = await this.database.transaction((transaction) => [
      transaction.query(USER_LOCK_SQL, [userId]),
      transaction.query(
        `INSERT INTO member_collection_legacy_backups (user_id, payload)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, JSON.stringify({ bottles })],
      ),
      transaction.query(`
        WITH current_state AS (
          SELECT legacy_migrated_at FROM member_collection_state WHERE user_id = $1
        ), claimed AS (
          INSERT INTO member_collection_state (user_id, version, legacy_migrated_at, updated_at)
          VALUES ($1, 1, $2::timestamptz, $2::timestamptz)
          ON CONFLICT (user_id) DO UPDATE SET
            version = member_collection_state.version + 1,
            legacy_migrated_at = EXCLUDED.legacy_migrated_at,
            updated_at = EXCLUDED.updated_at
          WHERE member_collection_state.legacy_migrated_at IS NULL
            AND member_collection_state.version = 0
            AND NOT EXISTS (
              SELECT 1 FROM member_collection_bottles AS existing WHERE existing.user_id = $1
            )
          RETURNING user_id
        ), removed AS (
          DELETE FROM member_collection_bottles
          WHERE user_id = $1 AND EXISTS (SELECT 1 FROM claimed)
        ), legacy_entries AS (
          SELECT item FROM claimed, jsonb_array_elements($3::jsonb) AS item
        ), inserted AS (
          INSERT INTO member_collection_bottles (
            user_id, canonical_key, bottle_id, bottle_name, rating, taste_tags,
            would_buy_again, notes, pending_canonical_match, bottle_contribution_id,
            payload, added_at, updated_at
          )
          SELECT $1, item->>'canonicalKey', item->>'bottleId', item->>'bottleName',
            (item->>'rating')::int, COALESCE(item->'tasteTags', '[]'::jsonb),
            COALESCE((item->>'wouldBuyAgain')::boolean, false), COALESCE(item->>'notes', ''),
            COALESCE((item->>'pendingCanonicalMatch')::boolean, false), item->>'bottleContributionId',
            item, (item->>'addedAt')::timestamptz, (item->>'updatedAt')::timestamptz
          FROM legacy_entries
          ON CONFLICT (user_id, canonical_key) DO NOTHING
          RETURNING 1
        )
        SELECT EXISTS(SELECT 1 FROM claimed) AS should_migrate,
          (SELECT COUNT(*)::int FROM inserted) AS entry_count
      `, [userId, migrationAt, JSON.stringify(bottles)]),
    ], { isolationLevel: "ReadCommitted" });
    const rows = result as Array<{ should_migrate?: unknown; entry_count?: unknown }>;
    return rows[0]?.should_migrate === true && Number(rows[0]?.entry_count || 0) === bottles.length;
  }

  async replaceForUser(userId: string, entries: CollectionBottlePreference[], expectedVersion: number): Promise<MemberCollection> {
    if (!userId) throw new Error("A user id is required to save a collection.");
    const bottles = normalizeCollectionBottles(entries);
    const [, , result] = await this.database.transaction((transaction) => [
      transaction.query(USER_LOCK_SQL, [userId]),
      transaction.query(`INSERT INTO member_collection_state (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]),
      transaction.query(`
        WITH current_state AS MATERIALIZED (
          SELECT version FROM member_collection_state WHERE user_id = $1
        ), accepted AS (
          SELECT version FROM current_state WHERE version = $2::bigint
        ), next_version AS (
          UPDATE member_collection_state
          SET version = member_collection_state.version + 1, updated_at = NOW()
          WHERE user_id = $1 AND EXISTS (SELECT 1 FROM accepted)
          RETURNING version
        ), incoming AS (
          SELECT item FROM next_version, jsonb_array_elements($3::jsonb) AS item
        ), removed AS (
          DELETE FROM member_collection_bottles AS bottles
          WHERE bottles.user_id = $1 AND EXISTS (SELECT 1 FROM next_version)
            AND NOT EXISTS (SELECT 1 FROM incoming WHERE item->>'canonicalKey' = bottles.canonical_key)
        ), upserted AS (
          INSERT INTO member_collection_bottles (
            user_id, canonical_key, bottle_id, bottle_name, rating, taste_tags,
            would_buy_again, notes, pending_canonical_match, bottle_contribution_id,
            payload, added_at, updated_at
          )
          SELECT $1, item->>'canonicalKey', item->>'bottleId', item->>'bottleName',
            (item->>'rating')::int, COALESCE(item->'tasteTags', '[]'::jsonb),
            COALESCE((item->>'wouldBuyAgain')::boolean, false), COALESCE(item->>'notes', ''),
            COALESCE((item->>'pendingCanonicalMatch')::boolean, false), item->>'bottleContributionId',
            item, (item->>'addedAt')::timestamptz, (item->>'updatedAt')::timestamptz
          FROM incoming
          ON CONFLICT (user_id, canonical_key) DO UPDATE SET
            bottle_id = EXCLUDED.bottle_id,
            bottle_name = EXCLUDED.bottle_name,
            rating = EXCLUDED.rating,
            taste_tags = EXCLUDED.taste_tags,
            would_buy_again = EXCLUDED.would_buy_again,
            notes = EXCLUDED.notes,
            pending_canonical_match = EXCLUDED.pending_canonical_match,
            bottle_contribution_id = EXCLUDED.bottle_contribution_id,
            payload = EXCLUDED.payload,
            added_at = LEAST(member_collection_bottles.added_at, EXCLUDED.added_at),
            updated_at = EXCLUDED.updated_at
          RETURNING 1
        )
        SELECT CASE WHEN EXISTS(SELECT 1 FROM next_version) THEN 'saved' ELSE 'conflict' END AS outcome,
          COALESCE((SELECT version FROM next_version), (SELECT version FROM current_state), 0) AS version
      `, [userId, expectedVersion, JSON.stringify(bottles)]),
    ], { isolationLevel: "ReadCommitted" });
    const row = (result as Array<{ outcome?: unknown; version?: unknown }>)[0];
    const version = Number(row?.version || 0);
    if (row?.outcome !== "saved") throw new MemberCollectionConflictError(version);
    return { version, bottles };
  }

  async markLegacyCleared(userId: string, clearedAt = new Date().toISOString()) {
    await this.database.query(`
      UPDATE member_collection_state SET legacy_cleared_at = COALESCE(legacy_cleared_at, $2::timestamptz), updated_at = NOW()
      WHERE user_id = $1
    `, [userId, clearedAt]);
  }

  async listPendingLegacyClearAuditUserIds() {
    const rows = await this.database.query(`
      SELECT state.user_id
      FROM member_collection_state AS state
      INNER JOIN member_collection_legacy_backups AS backup ON backup.user_id = state.user_id
      WHERE state.legacy_migrated_at IS NOT NULL AND state.legacy_cleared_at IS NULL
      ORDER BY state.user_id
    `) as Array<{ user_id?: unknown }>;
    return rows.map((row) => String(row.user_id || "")).filter(Boolean);
  }

  async canReconcileStagedLegacy(userId: string) {
    const rows = await this.database.query(`
      SELECT (
        legacy_migrated_at IS NOT NULL
        AND legacy_cleared_at IS NULL
        AND updated_at <= legacy_migrated_at
      ) AS allowed
      FROM member_collection_state
      WHERE user_id = $1
    `, [userId]) as Array<{ allowed?: unknown }>;
    return rows[0]?.allowed === true;
  }

  async getTasteAggregate(canonicalKeys: string[]) {
    const keys = Array.from(new Set(canonicalKeys.map((key) => key.trim()).filter(Boolean))).slice(0, 20);
    if (!keys.length) return null;
    const rows = await this.database.query(`
      WITH per_member AS (
        SELECT user_id, MAX(rating)::float AS rating
        FROM member_collection_bottles
        WHERE canonical_key = ANY($1::text[]) AND rating > 0
        GROUP BY user_id
      )
      SELECT AVG(rating)::float AS average, COUNT(*)::int AS count
      FROM per_member
    `, [keys]) as Array<{ average?: unknown; count?: unknown }>;
    const count = Number(rows[0]?.count || 0);
    if (!count) return null;
    return { average: Math.round(Number(rows[0]?.average || 0) * 10) / 10, count };
  }
}

let repository: MemberCollectionRepository | null = null;

export function getMemberCollectionRepository(env: NodeJS.ProcessEnv = process.env) {
  if (repository) return repository;
  const connectionString = runtimeNeonConnectionString(env);
  if (!connectionString) throw new Error("Member collection storage is not configured.");
  repository = new MemberCollectionRepository(connectionString);
  return repository;
}
