import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { runtimeNeonConnectionString } from './neon-runtime.ts';
import type { MemberCollectionDatabase } from './member-collection-repository.ts';
import type { CollectionValue } from './collection-value.ts';
import { summarizeCollectionValue, type CollectionHistory, type CollectionHistoryPoint } from '../../shared/collection-history.ts';

export class CollectionHistoryRepository {
  private readonly database: MemberCollectionDatabase;
  constructor(database: MemberCollectionDatabase) { this.database = database; }

  /** A delayed reader cannot attach a value to inventory that changed during pricing. */
  async observe(userId: string, version: number, value: CollectionValue | null): Promise<boolean> {
    if (!userId || !value) return false;
    const summary = summarizeCollectionValue(value)!;
    const fingerprint = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const [, , result] = await this.database.transaction(tx => [
      tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]),
      tx.query('INSERT INTO member_collection_state (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]),
      tx.query(`
        WITH current_state AS (SELECT version FROM member_collection_state WHERE user_id=$1 AND version=$2),
        current_inventory AS (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'bottleId', bottle_id, 'name', bottle_name, 'sealed', payload->'sealedQuantity', 'open', payload->'openedQuantity'
        ) ORDER BY canonical_key), '[]'::jsonb) AS payload FROM member_collection_bottles WHERE user_id=$1),
        recorded AS (
          INSERT INTO member_collection_history (user_id, collection_version, kind, inventory, value, fingerprint)
          SELECT $1, version, 'valuation', current_inventory.payload, $3::jsonb, $4
          FROM current_state CROSS JOIN current_inventory
          WHERE NOT EXISTS (SELECT 1 FROM (SELECT inventory, value, observed_at FROM member_collection_history WHERE user_id=$1 ORDER BY observed_at DESC, id DESC LIMIT 1) AS previous
            WHERE previous.inventory=current_inventory.payload AND previous.value=$3::jsonb
              AND (previous.observed_at AT TIME ZONE 'UTC')::date=(NOW() AT TIME ZONE 'UTC')::date)
          RETURNING 1
        ) SELECT EXISTS(SELECT 1 FROM current_state) AS matched
      `, [userId, version, JSON.stringify(summary), fingerprint]),
    ], { isolationLevel: 'ReadCommitted' });
    return (result as Array<{ matched: boolean }>)[0]?.matched === true;
  }

  async list(userId: string): Promise<CollectionHistory> {
    if (!userId) return { points: [], firstRecordedAt: null, hasMore: false };
    const rows = await this.database.query(`
      SELECT id::text, collection_version, observed_at, kind, value,
        (SELECT MIN(observed_at) FROM member_collection_history WHERE user_id=$1 AND value IS NOT NULL) AS first_recorded_at
      FROM member_collection_history WHERE user_id=$1 AND value IS NOT NULL
      ORDER BY observed_at DESC, id DESC LIMIT 201
    `, [userId]) as Array<{ id: string; collection_version: string | number; observed_at: string | Date; kind: CollectionHistoryPoint['kind']; value: CollectionHistoryPoint['value']; first_recorded_at: string | Date }>;
    const iso = (value: string | Date) => new Date(value).toISOString();
    return { points: rows.slice(0, 200).reverse().map(row => ({ id: row.id, observedAt: iso(row.observed_at), collectionVersion: Number(row.collection_version), kind: row.kind, value: row.value })),
      firstRecordedAt: rows[0] ? iso(rows[0].first_recorded_at) : null, hasMore: rows.length > 200 };
  }
}

let repository: CollectionHistoryRepository | undefined;
export function getCollectionHistoryRepository() {
  if (repository) return repository;
  const connection = runtimeNeonConnectionString(process.env);
  if (!connection) throw new Error('Collection history storage is not configured.');
  repository = new CollectionHistoryRepository(neon(connection) as unknown as MemberCollectionDatabase);
  return repository;
}
