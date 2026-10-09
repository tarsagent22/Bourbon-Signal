import { createProductionAlertQueueSqlExecutor } from './alert-queue/runtime';
import type { SqlExecutor } from './alert-queue/postgres-repository';
import { mobileActivityRecords, type MobileActivityRecord } from './mobile-activity';

export class MobileActivityRepository {
  constructor(private readonly sql: SqlExecutor = createProductionAlertQueueSqlExecutor()) {}

  async readMany(userIds: string[]): Promise<Record<string, MobileActivityRecord[]>> {
    if (!userIds.length) return {};
    const { rows } = await this.sql.query(`SELECT user_id, jsonb_build_object(
      'platform',platform,'appVersion',app_version,'updateId',update_id::text,
      'firstSeenAt',first_seen_at,'lastSeenAt',last_seen_at) AS activity
      FROM member_mobile_activity WHERE user_id=ANY($1::text[])`, [userIds]);
    const grouped: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      const activity = row.activity as MobileActivityRecord;
      (grouped[String(row.user_id)] ||= {})[activity.platform] = activity;
    }
    return Object.fromEntries(Object.entries(grouped).map(([id, records]) => [id, mobileActivityRecords(records)]));
  }

  async read(userId: string) {
    const records = (await this.readMany([userId]))[userId] || [];
    return Object.fromEntries(records.map(record => [record.platform, record]));
  }

  // The caller holds the same durable member lease used by account deletion.
  async save(userId: string, record: MobileActivityRecord) {
    const { rows } = await this.sql.query(`INSERT INTO member_mobile_activity
      (user_id,platform,app_version,update_id,first_seen_at,last_seen_at)
      SELECT $1,$2,$3,$4::uuid,$5::timestamptz,$6::timestamptz
      WHERE NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=$1)
      ON CONFLICT(user_id,platform) DO UPDATE SET
        first_seen_at=LEAST(member_mobile_activity.first_seen_at,EXCLUDED.first_seen_at),
        last_seen_at=GREATEST(member_mobile_activity.last_seen_at,EXCLUDED.last_seen_at),
        app_version=CASE WHEN EXCLUDED.last_seen_at >= member_mobile_activity.last_seen_at THEN EXCLUDED.app_version ELSE member_mobile_activity.app_version END,
        update_id=CASE WHEN EXCLUDED.last_seen_at >= member_mobile_activity.last_seen_at THEN EXCLUDED.update_id ELSE member_mobile_activity.update_id END
      WHERE NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=$1)
      RETURNING platform`, [userId,record.platform,record.appVersion,record.updateId,record.firstSeenAt,record.lastSeenAt]);
    if (!rows.length) throw new Error('Account activity unavailable.');
  }
}
