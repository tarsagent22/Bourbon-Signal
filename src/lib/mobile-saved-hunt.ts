import { readSavedBottle, type SavedBottle } from '../../shared/local-discovery';
import { createProductionAlertQueueSqlExecutor } from './alert-queue/runtime';

export async function loadSavedHunt(userId: string, sql = createProductionAlertQueueSqlExecutor()) {
  const { rows } = await sql.query(`SELECT saved,preview_key FROM mobile_saved_hunts WHERE user_id=$1
    AND NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=$1)`, [userId]);
  return { saved: readSavedBottle(rows[0]?.saved), previewKey: typeof rows[0]?.preview_key === 'string' ? rows[0].preview_key : null };
}

export async function saveHunt(userId: string, saved: SavedBottle | null, sql = createProductionAlertQueueSqlExecutor()) {
  if (!saved) {
    await sql.query('UPDATE mobile_saved_hunts SET saved=NULL WHERE user_id=$1', [userId]);
    return null;
  }
  const { rows } = await sql.query(`INSERT INTO mobile_saved_hunts (user_id,saved)
    SELECT $1,$2::jsonb WHERE NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=$1)
    ON CONFLICT (user_id) DO UPDATE SET saved=CASE
      WHEN (mobile_saved_hunts.saved-'savedAt')=(EXCLUDED.saved-'savedAt') THEN mobile_saved_hunts.saved
      ELSE EXCLUDED.saved END
    RETURNING saved`, [userId, JSON.stringify(saved)]);
  if (!rows.length) throw new Error('Saved bottle is unavailable.');
  return readSavedBottle(rows[0].saved);
}

export async function claimHuntPreview(userId: string, saved: SavedBottle, key: string, sql = createProductionAlertQueueSqlExecutor()) {
  const { rows } = await sql.query(`UPDATE mobile_saved_hunts SET preview_key=$3
    WHERE user_id=$1 AND saved=$2::jsonb AND (preview_key IS NULL OR preview_key=$3)
      AND NOT EXISTS (SELECT 1 FROM account_deletion_requests WHERE user_id=$1)
    RETURNING preview_key`, [userId, JSON.stringify(saved), key]);
  return rows.length > 0;
}
