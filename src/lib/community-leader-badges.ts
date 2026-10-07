import { neon } from "@neondatabase/serverless";
import { communityLeaderBadge } from "../../shared/community-leader-badges.ts";
import type { MemberBadgeAward } from "./sighting-rewards";
import type { MemberSighting } from "./sightings";

export interface LeaderBadgeQuery { query(text: string, params?: unknown[]): Promise<unknown[]> }

export async function readCommunityLeaderAwards(query: LeaderBadgeQuery, userId: string): Promise<MemberBadgeAward[]> {
  const ready = await query.query("SELECT to_regclass('community_leader_badge_awards') IS NOT NULL AS ready") as Array<{ ready: boolean }>;
  if (!ready[0]?.ready) return [];
  const rows = await query.query(`SELECT a.badge_id,a.earned_at FROM community_leader_badge_awards a
    WHERE a.user_id=$1 AND a.revoked_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM community_contributor_moderation m WHERE m.reporter_user_id=a.user_id AND (m.restored_at IS NULL OR m.restored_at<m.restricted_at))
      AND NOT EXISTS (SELECT 1 FROM community_sightings s WHERE s.id=ANY(a.supporting_sighting_ids) AND COALESCE(s.payload->'rewardState'->>'rejectedAt','')<>'')
    ORDER BY a.earned_at DESC,a.badge_id`, [userId]) as Array<{ badge_id: string; earned_at: Date | string }>;
  return rows.flatMap(row => {
    const definition = communityLeaderBadge(row.badge_id);
    if (!definition) return [];
    return [{ id: row.badge_id, label: definition.label, earnedAt: row.earned_at instanceof Date ? row.earned_at.toISOString() : row.earned_at, pointsAwarded: 0 }];
  });
}

export function createCommunityLeaderBadgeQuery(env: NodeJS.ProcessEnv = process.env) {
  const url = env.BOURBON_QUEUE_DATABASE_URL || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) throw new Error("Community award storage is unavailable.");
  return neon(url) as unknown as LeaderBadgeQuery;
}

export async function validatePublicLeaderBadges(query: LeaderBadgeQuery, sightings: MemberSighting[]) {
  const leaderLabel = (label: string) => /^(Most Active|Top Contributor) · /.test(label);
  const users = [...new Set(sightings.filter(s => s.reporterBadges?.some(leaderLabel)).map(s => s.reporterUserId).filter(Boolean))];
  if (!users.length) return sightings;
  const ready = await query.query("SELECT to_regclass('community_leader_badge_awards') IS NOT NULL AS ready") as Array<{ ready: boolean }>;
  const valid = new Map<string, Set<string>>();
  if (ready[0]?.ready) {
    const rows = await query.query(`SELECT a.user_id,a.badge_id FROM community_leader_badge_awards a
      WHERE a.user_id=ANY($1::text[]) AND a.revoked_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM community_contributor_moderation m WHERE m.reporter_user_id=a.user_id AND (m.restored_at IS NULL OR m.restored_at<m.restricted_at))
        AND NOT EXISTS (SELECT 1 FROM community_sightings s WHERE s.id=ANY(a.supporting_sighting_ids) AND COALESCE(s.payload->'rewardState'->>'rejectedAt','')<>'')`, [users]) as Array<{ user_id: string; badge_id: string }>;
    for (const row of rows) {
      const definition = communityLeaderBadge(row.badge_id);
      if (!definition) continue;
      const labels = valid.get(row.user_id) || new Set<string>();
      labels.add(definition.label); valid.set(row.user_id, labels);
    }
  }
  return sightings.map(s => ({ ...s, reporterBadges: s.reporterBadges?.filter(label => !leaderLabel(label) || valid.get(s.reporterUserId || "")?.has(label)) }));
}
