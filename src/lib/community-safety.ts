import { createProductionAlertQueueSqlExecutor } from './alert-queue/runtime';
import type { SqlExecutor } from './alert-queue/postgres-repository';
export const COMMUNITY_REPORT_REASONS = ['spam','misleading','harassment','inappropriate','other'] as const;
export type CommunityReportReason = typeof COMMUNITY_REPORT_REASONS[number];
export function communityReportReason(value: unknown): CommunityReportReason | null {
  return typeof value === 'string' && COMMUNITY_REPORT_REASONS.includes(value as CommunityReportReason) ? value as CommunityReportReason : null;
}
export function communitySightingVisible(sighting: {id:string;reporterUserId?:string;rewardState?:{removedAt?:string;rejectedAt?:string}}, blocked: Set<string>, reported: Set<string>) {
  return !sighting.rewardState?.removedAt && !sighting.rewardState?.rejectedAt && !blocked.has(sighting.reporterUserId || '') && !reported.has(sighting.id);
}
export class CommunitySafetyRepository {
  static candidateVisible(candidate:Record<string,unknown>, hidden:{blocked:Set<string>;reported:Set<string>}) {
    return candidate.sourceType !== 'community' || (!hidden.blocked.has(String(candidate.reporterUserId || '')) && !hidden.reported.has(String(candidate.id || '').replace(/^community:/,'')));
  }
  constructor(private readonly sql: SqlExecutor = createProductionAlertQueueSqlExecutor()) {}
  async hiddenFor(userId: string) {
    const [blocks,reports] = await Promise.all([
      this.sql.query('SELECT blocked_user_id FROM community_member_blocks WHERE user_id=$1',[userId]),
      this.sql.query('SELECT sighting_id FROM community_abuse_reports WHERE user_id=$1',[userId]),
    ]);
    return {blocked:new Set(blocks.rows.map(r=>String(r.blocked_user_id))),reported:new Set(reports.rows.map(r=>String(r.sighting_id)))};
  }
  async block(userId:string,blockedUserId:string) {
    if(!blockedUserId || userId===blockedUserId) throw new Error('Cannot block your own account.');
    await this.sql.query('INSERT INTO community_member_blocks(user_id,blocked_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[userId,blockedUserId]);
  }
  async unblock(userId:string,blockedUserId:string) {
    await this.sql.query('DELETE FROM community_member_blocks WHERE user_id=$1 AND blocked_user_id=$2',[userId,blockedUserId]);
  }
  async report(userId:string,sightingId:string,reason:CommunityReportReason) {
    const result=await this.sql.query(`INSERT INTO community_abuse_reports(user_id,sighting_id,reason)
      SELECT $1,$2,$3 WHERE (SELECT count(*) FROM community_abuse_reports WHERE user_id=$1 AND created_at>now()-interval '24 hours')<100
      ON CONFLICT(user_id,sighting_id) DO UPDATE SET reason=excluded.reason
      RETURNING sighting_id`,[userId,sightingId,reason]);
    return result.rows.length>0;
  }
  async listBlocks(userId:string) {
    return (await this.sql.query(`SELECT b.blocked_user_id AS id,b.created_at,
      (SELECT COALESCE(s.payload->'reporterPublicIdentity'->>'label','Member') FROM community_sightings s WHERE s.reporter_user_id=b.blocked_user_id ORDER BY s.created_at DESC LIMIT 1) AS label
      FROM community_member_blocks b WHERE b.user_id=$1 ORDER BY b.created_at DESC`,[userId])).rows.map(r=>({id:String(r.id),label:String(r.label||'Member'),createdAt:String(r.created_at)}));
  }
  async pending() {
    return (await this.sql.query(`SELECT r.sighting_id AS "sightingId",r.reason,r.created_at AS "createdAt",s.payload AS sighting
      FROM community_abuse_reports r LEFT JOIN community_sightings s ON s.id=r.sighting_id
      WHERE r.status='pending' ORDER BY r.created_at LIMIT 200`)).rows;
  }
  async resolve(sightingId:string,reviewerId:string) {
    await this.sql.query("UPDATE community_abuse_reports SET status='resolved',reviewed_at=now(),reviewed_by=$2 WHERE sighting_id=$1 AND status='pending'",[sightingId,reviewerId]);
  }
}
