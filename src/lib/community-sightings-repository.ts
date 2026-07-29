import { neon } from "@neondatabase/serverless";
import type { MemberSighting, SightingVoteKind } from "@/lib/sightings";

export interface DurableSightingVote {
  sightingId: string;
  userId: string;
  kind: SightingVoteKind;
  createdAt: string;
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

  async insertSighting(sighting: MemberSighting): Promise<MemberSighting> {
    const rows = await this.query.query(
      `INSERT INTO community_sightings (id, reporter_user_id, payload, created_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz)
       RETURNING payload`,
      [sighting.id, sighting.reporterUserId, JSON.stringify(sighting), sighting.createdAt],
    ) as Array<{ payload: MemberSighting }>;
    if (!rows[0]) throw new Error("Unable to persist member sighting.");
    return rows[0].payload;
  }

  async insertSightingIfAbsent(sighting: MemberSighting): Promise<MemberSighting> {
    const rows = await this.query.query(
      `INSERT INTO community_sightings (id, reporter_user_id, payload, created_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz)
       ON CONFLICT (id) DO NOTHING
       RETURNING payload`,
      [sighting.id, sighting.reporterUserId, JSON.stringify(sighting), sighting.createdAt],
    ) as Array<{ payload: MemberSighting }>;
    const stored = rows[0]?.payload || await this.getSighting(sighting.id);
    if (!stored || stored.reporterUserId !== sighting.reporterUserId) throw new Error("Sighting ownership conflict.");
    return stored;
  }

  async updateSighting(sighting: MemberSighting): Promise<MemberSighting> {
    const rows = await this.query.query(
      `WITH locked AS (SELECT pg_advisory_xact_lock(hashtext($1)))
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
       FROM locked WHERE id = $1 RETURNING community_sightings.payload`,
      [sighting.id, JSON.stringify(sighting)],
    ) as Array<{ payload: MemberSighting }>;
    if (!rows[0]) throw new Error("Member sighting not found.");
    return rows[0].payload;
  }

  async replacePhotoProof(sightingId: string, ownerUserId: string, expectedPreviousUrl: string | null, photoProof: NonNullable<NonNullable<MemberSighting["rewardState"]>["photoProof"]>): Promise<MemberSighting | null> {
    const rows = await this.query.query(
      `UPDATE community_sightings
       SET payload = jsonb_set(payload, '{rewardState,photoProof}', $4::jsonb, true), updated_at = NOW()
       WHERE id = $1 AND reporter_user_id = $2
         AND (payload#>>'{rewardState,photoProof,url}') IS NOT DISTINCT FROM $3
       RETURNING payload`,
      [sightingId, ownerUserId, expectedPreviousUrl, JSON.stringify(photoProof)],
    ) as Array<{ payload: MemberSighting }>;
    return rows[0]?.payload || null;
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

  async toggleVote(sightingId: string, userId: string, kind: SightingVoteKind): Promise<{ kind: SightingVoteKind | null; upCount: number; downCount: number; sighting: MemberSighting }> {
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
         RETURNING payload, outcome.next_kind, outcome.up_count, outcome.down_count
       ) SELECT payload, next_kind, up_count, down_count FROM updated`,
      [sightingId, userId, kind],
      ),
    ], { isolationLevel: "ReadCommitted" });
    const rows = voteRows as Array<{ payload: MemberSighting; next_kind: SightingVoteKind | null; up_count: number; down_count: number }>;
    const row = rows[0];
    if (!row) throw new Error("Sighting not found");
    return { kind: row.next_kind, upCount: Number(row.up_count), downCount: Number(row.down_count), sighting: row.payload };
  }
}

export function createCommunitySightingsRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env);
  if (!url) throw new Error("Durable community sightings storage is not configured.");
  return new CommunitySightingsRepository(url);
}
