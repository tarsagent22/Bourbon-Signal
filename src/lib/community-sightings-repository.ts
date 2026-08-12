import { neon } from "@neondatabase/serverless";
import type { MemberSighting, SightingVoteKind } from "@/lib/sightings";

export interface DurableSightingVote {
  sightingId: string;
  userId: string;
  kind: SightingVoteKind;
  createdAt: string;
}

export interface SightingMutationResult {
  sighting: MemberSighting;
  rewardGeneration: number;
}

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.DATABASE_URL || null;
}

export class CommunitySightingsRepository {
  private readonly query;

  constructor(url: string) {
    this.query = neon(url);
  }

  async listSightings(limit = 1000): Promise<MemberSighting[]> {
    const rows = await this.query.query(
      `SELECT payload FROM community_sightings ORDER BY created_at DESC LIMIT $1`,
      [Math.max(1, Math.min(limit, 5000))],
    ) as Array<{ payload: MemberSighting }>;
    return rows.map((row) => row.payload);
  }

  async listSightingsFeed(currentUserId: string, limit = 60): Promise<{ sightings: MemberSighting[]; totalSightings: number }> {
    void currentUserId;
    const rows = await this.query.query(
      `WITH recent AS MATERIALIZED (
         SELECT payload, created_at
         FROM community_sightings
         ORDER BY created_at DESC
         LIMIT $1
       ), totals AS (
         SELECT COUNT(*)::int AS total_count FROM community_sightings
       )
       SELECT recent.payload, totals.total_count
       FROM recent CROSS JOIN totals
       ORDER BY recent.created_at DESC`,
      [Math.max(1, Math.min(limit, 1000))],
    ) as Array<{ payload: MemberSighting; total_count: number }>;
    return {
      sightings: rows.map((row) => row.payload),
      totalSightings: Number(rows[0]?.total_count) || 0,
    };
  }

  async listVotesForSightings(sightingIds: string[]): Promise<DurableSightingVote[]> {
    const uniqueIds = [...new Set(sightingIds.filter(Boolean))];
    if (!uniqueIds.length) return [];
    const rows = await this.query.query(
      `SELECT sighting_id, user_id, kind, created_at
       FROM community_sighting_votes
       WHERE sighting_id = ANY($1::text[])`,
      [uniqueIds],
    ) as Array<{ sighting_id: string; user_id: string; kind: SightingVoteKind; created_at: string | Date }>;
    return rows.map((row) => ({
      sightingId: row.sighting_id,
      userId: row.user_id,
      kind: row.kind,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async countSightingsByIds(ids: string[]): Promise<number> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return 0;
    const rows = await this.query.query(
      `SELECT COUNT(*)::int AS count FROM community_sightings WHERE id = ANY($1::text[])`,
      [uniqueIds],
    ) as Array<{ count: number }>;
    return Number(rows[0]?.count) || 0;
  }

  async listSightingsForReporter(reporterUserId: string): Promise<MemberSighting[]> {
    const rows = await this.query.query(
      `SELECT payload FROM community_sightings WHERE reporter_user_id = $1 ORDER BY created_at DESC`,
      [reporterUserId],
    ) as Array<{ payload: MemberSighting }>;
    return rows.map((row) => row.payload);
  }

  async getSighting(id: string): Promise<MemberSighting | null> {
    const rows = await this.query.query(`SELECT payload FROM community_sightings WHERE id = $1 LIMIT 1`, [id]) as Array<{ payload: MemberSighting }>;
    return rows[0]?.payload || null;
  }

  async insertSighting(sighting: MemberSighting): Promise<SightingMutationResult> {
    const rows = await this.query.query(
      `WITH inserted AS MATERIALIZED (
         INSERT INTO community_sightings (id, reporter_user_id, payload, created_at)
         VALUES ($1, $2, $3::jsonb, $4::timestamptz)
         RETURNING payload,reporter_user_id
       ), generation AS MATERIALIZED (
         SELECT next_community_sighting_reward_generation(reporter_user_id) AS reward_generation FROM inserted
       )
       SELECT inserted.payload,generation.reward_generation FROM inserted CROSS JOIN generation`,
      [sighting.id, sighting.reporterUserId, JSON.stringify(sighting), sighting.createdAt],
    ) as Array<{ payload: MemberSighting; reward_generation: string | number }>;
    if (!rows[0]) throw new Error("Unable to persist member sighting.");
    return { sighting: rows[0].payload, rewardGeneration: Number(rows[0].reward_generation) };
  }

  async insertSightingIfAbsent(sighting: MemberSighting): Promise<SightingMutationResult> {
    const rows = await this.query.query(
      `WITH inserted AS MATERIALIZED (
         INSERT INTO community_sightings (id, reporter_user_id, payload, created_at)
         VALUES ($1, $2, $3::jsonb, $4::timestamptz)
         ON CONFLICT (id) DO NOTHING
         RETURNING payload,reporter_user_id
       ), bumped AS MATERIALIZED (
         SELECT next_community_sighting_reward_generation(reporter_user_id) AS reward_generation FROM inserted
       ), selected AS (
         SELECT inserted.payload,bumped.reward_generation FROM inserted CROSS JOIN bumped
         UNION ALL
         SELECT stored.payload,COALESCE(generations.generation,0) AS reward_generation
         FROM community_sightings stored
         LEFT JOIN signal_point_reward_generations generations ON generations.user_id=stored.reporter_user_id
         WHERE stored.id=$1 AND NOT EXISTS (SELECT 1 FROM inserted)
       ) SELECT payload,reward_generation FROM selected LIMIT 1`,
      [sighting.id, sighting.reporterUserId, JSON.stringify(sighting), sighting.createdAt],
    ) as Array<{ payload: MemberSighting; reward_generation: string | number }>;
    const stored = rows[0];
    if (!stored || stored.payload.reporterUserId !== sighting.reporterUserId) throw new Error("Sighting ownership conflict.");
    return { sighting: stored.payload, rewardGeneration: Number(stored.reward_generation) };
  }

  async updateSighting(sighting: MemberSighting): Promise<SightingMutationResult> {
    const rows = await this.query.query(
      `WITH locked AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext($1))), updated AS MATERIALIZED (
         UPDATE community_sightings
         SET payload = jsonb_set(
           jsonb_set(
             jsonb_set($2::jsonb, '{upCount}', COALESCE(payload->'upCount', '0'::jsonb), true),
             '{downCount}', COALESCE(payload->'downCount', '0'::jsonb), true
           ),
           '{rewardState,helpfulAt}',
           COALESCE(payload#>'{rewardState,helpfulAt}', 'null'::jsonb),
           true
         ), updated_at = NOW()
         FROM locked WHERE id = $1 RETURNING community_sightings.payload,community_sightings.reporter_user_id
       ), generation AS MATERIALIZED (
         SELECT next_community_sighting_reward_generation(reporter_user_id) AS reward_generation FROM updated
       ) SELECT updated.payload,generation.reward_generation FROM updated CROSS JOIN generation`,
      [sighting.id, JSON.stringify(sighting)],
    ) as Array<{ payload: MemberSighting; reward_generation: string | number }>;
    if (!rows[0]) throw new Error("Member sighting not found.");
    return { sighting: rows[0].payload, rewardGeneration: Number(rows[0].reward_generation) };
  }

  async replacePhotoProof(sightingId: string, ownerUserId: string, expectedPreviousUrl: string | null, photoProof: NonNullable<NonNullable<MemberSighting["rewardState"]>["photoProof"]>): Promise<SightingMutationResult | null> {
    const rows = await this.query.query(
      `WITH updated AS MATERIALIZED (
         UPDATE community_sightings
         SET payload = jsonb_set(payload, '{rewardState,photoProof}', $4::jsonb, true), updated_at = NOW()
         WHERE id = $1 AND reporter_user_id = $2
           AND (payload#>>'{rewardState,photoProof,url}') IS NOT DISTINCT FROM $3
         RETURNING payload,reporter_user_id
       ), generation AS MATERIALIZED (
         SELECT next_community_sighting_reward_generation(reporter_user_id) AS reward_generation FROM updated
       ) SELECT updated.payload,generation.reward_generation FROM updated CROSS JOIN generation`,
      [sightingId, ownerUserId, expectedPreviousUrl, JSON.stringify(photoProof)],
    ) as Array<{ payload: MemberSighting; reward_generation: string | number }>;
    return rows[0] ? { sighting: rows[0].payload, rewardGeneration: Number(rows[0].reward_generation) } : null;
  }

  async listVotes(): Promise<DurableSightingVote[]> {
    const rows = await this.query.query(
      `SELECT sighting_id, user_id, kind, created_at FROM community_sighting_votes`,
    ) as Array<{ sighting_id: string; user_id: string; kind: SightingVoteKind; created_at: string | Date }>;
    return rows.map((row) => ({
      sightingId: row.sighting_id,
      userId: row.user_id,
      kind: row.kind,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async getVote(sightingId: string, userId: string): Promise<SightingVoteKind | null> {
    const rows = await this.query.query(
      `SELECT kind FROM community_sighting_votes WHERE sighting_id = $1 AND user_id = $2 LIMIT 1`,
      [sightingId, userId],
    ) as Array<{ kind: SightingVoteKind }>;
    return rows[0]?.kind || null;
  }

  async setVote(sightingId: string, userId: string, kind: SightingVoteKind): Promise<void> {
    await this.query.query(
      `INSERT INTO community_sighting_votes (sighting_id, user_id, kind) VALUES ($1, $2, $3)
       ON CONFLICT (sighting_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = NOW()`,
      [sightingId, userId, kind],
    );
  }

  async toggleVote(sightingId: string, userId: string, kind: SightingVoteKind): Promise<{ kind: SightingVoteKind | null; upCount: number; downCount: number; sighting: MemberSighting; rewardGeneration: number }> {
    const [, voteRows] = await this.query.transaction((tx) => [
      tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [sightingId]),
      tx.query(
      `WITH locked AS MATERIALIZED (
         SELECT pg_advisory_xact_lock(hashtextextended($1, 0))
       ), prior AS MATERIALIZED (
         SELECT v.kind FROM community_sighting_votes v, locked
         WHERE v.sighting_id = $1 AND v.user_id = $2
       ), before_counts AS MATERIALIZED (
         SELECT COUNT(*) FILTER (WHERE v.kind = 'up')::int AS up_count,
                COUNT(*) FILTER (WHERE v.kind = 'down')::int AS down_count
         FROM community_sighting_votes v, locked WHERE v.sighting_id = $1
       ), removed AS (
         DELETE FROM community_sighting_votes v
         WHERE v.sighting_id = $1 AND v.user_id = $2
           AND EXISTS (SELECT 1 FROM prior WHERE kind = $3)
         RETURNING v.kind
       ), saved AS (
         INSERT INTO community_sighting_votes (sighting_id, user_id, kind)
         SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM prior WHERE kind = $3)
         ON CONFLICT (sighting_id, user_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = NOW()
         RETURNING kind
       ), outcome AS MATERIALIZED (
         SELECT (SELECT kind FROM saved LIMIT 1) AS next_kind,
           GREATEST(0, before_counts.up_count - CASE WHEN (SELECT kind FROM prior) = 'up' THEN 1 ELSE 0 END + CASE WHEN (SELECT kind FROM saved) = 'up' THEN 1 ELSE 0 END)::int AS up_count,
           GREATEST(0, before_counts.down_count - CASE WHEN (SELECT kind FROM prior) = 'down' THEN 1 ELSE 0 END + CASE WHEN (SELECT kind FROM saved) = 'down' THEN 1 ELSE 0 END)::int AS down_count
         FROM before_counts
       ), updated AS (
         UPDATE community_sightings SET
           payload = jsonb_set(jsonb_set(jsonb_set(
             payload, '{rewardState}',
             CASE WHEN outcome.up_count >= 3 AND outcome.up_count - outcome.down_count >= 3
               THEN jsonb_set(COALESCE(payload->'rewardState', '{}'::jsonb), '{helpfulAt}', to_jsonb(COALESCE(payload->'rewardState'->>'helpfulAt', NOW()::text)), true)
               ELSE COALESCE(payload->'rewardState', '{}'::jsonb) - 'helpfulAt' END, true),
             '{upCount}', to_jsonb(outcome.up_count), true),
             '{downCount}', to_jsonb(outcome.down_count), true)
             || jsonb_build_object('communityVerified', outcome.up_count >= 3 AND outcome.up_count - outcome.down_count >= 3),
           updated_at = NOW()
         FROM outcome WHERE id = $1
         RETURNING payload,reporter_user_id,outcome.next_kind,outcome.up_count,outcome.down_count
       ), generation AS MATERIALIZED (
         SELECT next_community_sighting_reward_generation(reporter_user_id) AS reward_generation FROM updated
       ) SELECT payload,next_kind,up_count,down_count,reward_generation FROM updated CROSS JOIN generation`,
      [sightingId, userId, kind],
      ),
    ], { isolationLevel: "ReadCommitted" });
    const rows = voteRows as Array<{ payload: MemberSighting; next_kind: SightingVoteKind | null; up_count: number; down_count: number; reward_generation: string | number }>;
    const row = rows[0];
    if (!row) throw new Error("Sighting not found");
    return { kind: row.next_kind, upCount: Number(row.up_count), downCount: Number(row.down_count), sighting: row.payload, rewardGeneration: Number(row.reward_generation) };
  }
}

export function createCommunitySightingsRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env);
  if (!url) throw new Error("Durable community sightings storage is not configured.");
  return new CommunitySightingsRepository(url);
}
