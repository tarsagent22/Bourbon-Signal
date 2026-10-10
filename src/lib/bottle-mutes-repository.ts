import { createProductionAlertQueueSqlExecutor } from "./alert-queue/runtime";
import type { SqlExecutor } from "./alert-queue/postgres-repository";
import { normalizeBottleMutes, BottleMuteError, type BottleMuteState } from "./bottle-mutes";

export class BottleMutesRepository {
  constructor(private readonly sql: SqlExecutor) {}
  async read(userId: string): Promise<BottleMuteState> {
    const { rows } = await this.sql.query("SELECT bottles, version FROM member_bottle_mutes WHERE user_id=$1", [userId]);
    return normalizeBottleMutes(rows[0] ? { bottles: rows[0].bottles, version: Number(rows[0].version) } : null);
  }
  async save(userId: string, next: BottleMuteState, expectedVersion: number) {
    const { rows } = await this.sql.query(`INSERT INTO member_bottle_mutes(user_id,bottles,version)
      SELECT $1,$2::jsonb,$3 WHERE $4::bigint=0 OR EXISTS(SELECT 1 FROM member_bottle_mutes WHERE user_id=$1 AND version=$4)
      ON CONFLICT(user_id) DO UPDATE SET bottles=EXCLUDED.bottles,version=EXCLUDED.version,updated_at=NOW()
      WHERE member_bottle_mutes.version=$4
      RETURNING user_id`, [userId, JSON.stringify(next.bottles), next.version, expectedVersion]);
    if (!rows.length) throw new BottleMuteError("bottle_mute_conflict", 409, "Your muted bottles changed elsewhere. Refresh and try again.");
  }
}
export const readBottleMutes = (userId: string) => new BottleMutesRepository(createProductionAlertQueueSqlExecutor()).read(userId);
export const saveBottleMutes = (userId: string, next: BottleMuteState, expectedVersion: number) => new BottleMutesRepository(createProductionAlertQueueSqlExecutor()).save(userId, next, expectedVersion);
