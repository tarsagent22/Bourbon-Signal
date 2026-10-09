import { candidateToMemberAlert, groupCandidatesByLocation, normalizeAlertInboxMetadata, readAlertCandidates } from "../alert-delivery";
import { enumerateUnderlyingAlertChildren, stableUnderlyingAlertKey } from "../alert-dedupe";
import { alertQueueDatabaseConfigured, createProductionAlertQueueSqlExecutor } from "./runtime";
import type { SqlExecutor } from "./postgres-repository";

// Notifications outlive the bounded Clerk inbox. Resolve only a push belonging
// to the authenticated member; no notification payload supplies private details.
export async function readRequestedMemberAlert(userId: string, alertId: string, options: {
  sql?: SqlExecutor;
  candidates?: typeof readAlertCandidates;
} = {}) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(alertId)) return null;
  if (!options.sql && !alertQueueDatabaseConfigured()) return null;
  const sql = options.sql || createProductionAlertQueueSqlExecutor();
  const result = await sql.query(`select outbox.alert_id, outbox.stable_keys, outbox.created_at,
    (select candidate.payload->'memberAlert' from alert_candidates candidate
      where candidate.user_id=outbox.user_id and candidate.channel='onSite'
        and candidate.status='delivered' and candidate.provider_message_id=$3
        and candidate.payload ? 'memberAlert' limit 1) as member_alert,
    (select jsonb_agg(candidate.payload) from alert_candidates candidate
      where candidate.user_id=outbox.user_id and candidate.channel='onSite'
        and candidate.status='delivered' and candidate.provider_message_id=$3) as legacy_candidates
    from alert_push_outbox outbox where outbox.user_id=$1 and outbox.alert_id=$2 limit 1`,
    [userId, alertId, `clerk:${userId}:${alertId}`]);
  const row = result.rows[0];
  if (!row) return null;
  const saved = normalizeAlertInboxMetadata({ recent: [row.member_alert] }).recent[0];
  if (saved?.id === alertId && saved.userId === userId) return saved;
  // Compatibility for pushes accepted before durable alert snapshots were saved.
  const wanted = new Set(Array.isArray(row.stable_keys) ? row.stable_keys.map(String) : []);
  if (!wanted.size) return null;
  // Older queue rows retain the exact sent bottle/location summary even when
  // their inventory signal has expired. Show that report without inventing a
  // current Signal id or treating historical inventory as current availability.
  const legacy = (Array.isArray(row.legacy_candidates) ? row.legacy_candidates : [])
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
  if (legacy.length) {
    const names = [...new Set(legacy.map(value => typeof value.bottle === "string" ? value.bottle : "").filter(Boolean))];
    const locations = [...new Set(legacy.map(value => typeof value.location === "string" ? value.location : "").filter(Boolean))];
    if (names.length && locations.length === 1) {
      return normalizeAlertInboxMetadata({ recent: [{
        id: alertId, userId, dedupeKey: `notification:${alertId}`, bottleName: names.join(", "), bottleNames: names,
        storeLabel: locations[0], matchedArea: legacy[0].state, state: legacy[0].state,
        sourceType: [...wanted].some(key => /community|member:/.test(key)) ? "community" : "engine",
        eventType: legacy[0].eventType, createdAt: new Date(String(row.created_at)).toISOString(),
        underlyingStableKeys: [...wanted],
      }] }).recent[0] || null;
    }
  }
  const children = (await (options.candidates || readAlertCandidates)())
    .flatMap(enumerateUnderlyingAlertChildren)
    .filter(child => wanted.has(stableUnderlyingAlertKey(child)));
  if (new Set(children.map(stableUnderlyingAlertKey)).size !== wanted.size) return null;
  const groups = groupCandidatesByLocation(children);
  if (groups.length !== 1) return null;
  const createdAt = new Date(String(row.created_at)).toISOString();
  return { ...candidateToMemberAlert(userId, groups[0], createdAt), id: alertId };
}
