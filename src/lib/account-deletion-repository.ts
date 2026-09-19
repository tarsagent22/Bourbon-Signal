import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import { createRuntimeNeonClient } from "./neon-runtime.ts";
import type { AccountDeletionRepository } from "./account-deletion.ts";

interface QueryExecutor {
  query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
}

interface TransactionalQuery extends QueryExecutor {
  transaction(
    queries: Array<Promise<unknown>>,
    options?: { isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable" },
  ): Promise<unknown[]>;
}

const INITIAL_REMAINING_CLEANUP = [
  "application_data_cleanup_pending",
  "identity_metadata_cleanup_pending",
  "session_revocation_pending",
  "identity_ban_pending",
  "identity_deletion_pending",
];

export class PostgresAccountDeletionRepository implements AccountDeletionRepository {
  constructor(private readonly database: TransactionalQuery) {}

  async begin(userId: string, now: string) {
    const requestId = `account_delete_${randomUUID()}`;
    const subjectToken = `deleted:${randomUUID()}`;
    const rows = await this.database.query(
      `INSERT INTO account_deletion_requests
        (user_id,request_id,subject_token,status,remaining_cleanup,requested_at,updated_at)
       VALUES($1,$2,$3,'requested',$4::jsonb,$5::timestamptz,$5::timestamptz)
       ON CONFLICT(user_id) DO UPDATE SET updated_at=EXCLUDED.updated_at
       RETURNING request_id`,
      [userId, requestId, subjectToken, JSON.stringify(INITIAL_REMAINING_CLEANUP), now],
    );
    const persistedRequestId = typeof rows[0]?.request_id === "string" ? rows[0].request_id : "";
    if (!persistedRequestId) throw new Error("Account deletion request could not be persisted.");
    return { requestId: persistedRequestId };
  }

  async eraseOwnedProductDataAndDisableDelivery(userId: string, requestId: string, now: string) {
    const lockRows = await this.database.query(
      `SELECT subject_token FROM account_deletion_requests WHERE user_id=$1 AND request_id=$2`,
      [userId, requestId],
    );
    const subjectToken = typeof lockRows[0]?.subject_token === "string" ? lockRows[0].subject_token : "";
    if (!subjectToken) throw new Error("Account deletion tombstone is unavailable.");

    const proofRows = await this.database.query(
      `SELECT DISTINCT payload #>> '{rewardState,photoProof,url}' AS proof_url
       FROM community_sightings
       WHERE reporter_user_id=$1 AND COALESCE(payload #>> '{rewardState,photoProof,url}','')<>''`,
      [userId],
    );
    const proofUrls = proofRows
      .map((row) => typeof row.proof_url === "string" ? row.proof_url : "")
      .filter(Boolean);
    if (proofUrls.length > 0) await del(proofUrls);
    const deletedEmail = `${subjectToken.replace(/[^a-zA-Z0-9]/g, "-")}@deleted.invalid`;

    await this.database.transaction([
      this.database.query(`DELETE FROM member_push_ownership WHERE user_id=$1`, [userId]),
      this.database.query(
        `UPDATE alert_push_tickets
         SET user_id=$2,status=CASE WHEN status='pending' THEN 'unknown' ELSE status END,
             reason=CASE WHEN status='pending' THEN 'account_deleted_after_acceptance' ELSE reason END,
             poll_owner=NULL,poll_lease_expires_at=NULL,resolved_at=CASE WHEN status='pending' THEN $3::timestamptz ELSE resolved_at END,
             updated_at=$3::timestamptz
         WHERE user_id=$1`,
        [userId, subjectToken, now],
      ),
      this.database.query(
        `UPDATE alert_push_outbox
         SET user_id=$2,status=CASE WHEN status IN ('pending','unknown','accepted') THEN 'suppressed' ELSE status END,
             reason=CASE WHEN status IN ('pending','unknown','accepted') THEN 'account_deleted' ELSE reason END,updated_at=$3::timestamptz
         WHERE user_id=$1`,
        [userId, subjectToken, now],
      ),
      this.database.query(
        `DELETE FROM alert_candidates WHERE user_id=$1 AND status IN ('pending','claimed','failed')`,
        [userId],
      ),
      this.database.query(`UPDATE alert_candidates SET user_id=$2 WHERE user_id=$1`, [userId, subjectToken]),
      this.database.query(`DELETE FROM alert_baselines WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM clerk_alert_metadata_backups WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM member_collection_state WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM member_collection_legacy_backups WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM bourbon_recommendation_feedback WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM bourbon_recommendation_feedback_state WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM hunt_outcomes WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM welcome_signal_previews WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM community_sighting_votes WHERE user_id=$1`, [userId]),
      this.database.query(`DELETE FROM community_sighting_idempotency WHERE reporter_user_id=$1`, [userId]),
      this.database.query(`DELETE FROM community_sightings WHERE reporter_user_id=$1`, [userId]),
      this.database.query(`DELETE FROM community_contributor_moderation WHERE reporter_user_id=$1`, [userId]),

      this.database.query(`DELETE FROM founder_glass_shipping WHERE user_id=$1`, [userId]),
      this.database.query(`UPDATE coverage_requests SET user_id=$2 WHERE user_id=$1`, [userId, subjectToken]),
      this.database.query(`DELETE FROM retailer_applications WHERE user_id=$1`, [userId]),
      this.database.query(`UPDATE membership_trial_claims SET user_id=$2 WHERE user_id=$1`, [userId, subjectToken]),
      this.database.query(`UPDATE apple_membership_events SET clerk_user_id=$2 WHERE clerk_user_id=$1`, [userId, subjectToken]),
      this.database.query(`UPDATE apple_memberships SET clerk_user_id=$2 WHERE clerk_user_id=$1`, [userId, subjectToken]),
      this.database.query(`SELECT anonymize_referral_member($1,$2)`, [userId, subjectToken]),
      this.database.query(`SELECT anonymize_gift_member($1,$2,$3,$4)`, [userId, subjectToken, deletedEmail, requestId]),
      this.database.query(`UPDATE founder_spot_reservations SET user_id=$2 WHERE user_id=$1`, [userId, subjectToken]),
      this.database.query(`UPDATE direct_founder_checkout_reservations SET user_id=$2 WHERE user_id=$1`, [userId, subjectToken]),
      this.database.query(`SELECT anonymize_signal_points_member($1,$2,$3,$4)`, [userId, subjectToken, deletedEmail, requestId]),
    ], { isolationLevel: "Serializable" });

    return [
      "push_devices",
      "queued_alerts",
      "alert_baselines",
      "member_collection",
      "recommendation_feedback",
      "hunt_outcomes",
      "welcome_preview",
      "community_sightings_and_votes",
      "uploaded_sighting_proof_blobs",
      "shipping_and_retailer_records",
      "coverage_requests_anonymized",
      "membership_and_billing_records_anonymized",
      "referral_and_reward_records",
    ];
  }

  async claimCleanupBatch(now: string, limit: number) {
    const rows = await this.database.query(
      `WITH candidates AS (
         SELECT user_id FROM account_deletion_requests
         WHERE status<>'completed'
           AND (cleanup_lease_expires_at IS NULL OR cleanup_lease_expires_at<$1::timestamptz)
         ORDER BY updated_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE account_deletion_requests requests
       SET cleanup_lease_expires_at=$1::timestamptz + INTERVAL '10 minutes',updated_at=$1::timestamptz
       FROM candidates
       WHERE requests.user_id=candidates.user_id
       RETURNING user_id,request_id`,
      [now, limit],
    );
    return rows.flatMap((row) => typeof row.user_id === "string" && typeof row.request_id === "string"
      ? [{ userId: row.user_id, requestId: row.request_id }]
      : []);
  }

  async terminalize(userId: string, requestId: string, now: string, completedSteps: string[]) {
    const rows = await this.database.query(
      `UPDATE account_deletion_requests
       SET user_id=subject_token,status='completed',access_revoked=TRUE,identity_deleted=TRUE,
           completed_steps=$4::jsonb,remaining_cleanup='[]'::jsonb,cleanup_lease_expires_at=NULL,updated_at=$3::timestamptz
       WHERE user_id=$1 AND request_id=$2
       RETURNING request_id`,
      [userId, requestId, now, JSON.stringify(completedSteps)],
    );
    if (rows.length !== 1) throw new Error("Account deletion tombstone could not be terminalized.");
  }

  async recordOutcome(userId: string, outcome: {
    accessRevoked: boolean;
    identityDeleted: boolean;
    completedSteps: string[];
    remainingCleanup: string[];
    now: string;
  }) {
    await this.database.query(
      `UPDATE account_deletion_requests
       SET status=CASE WHEN cardinality($4::text[])=0 THEN 'completed' ELSE 'cleanup_queued' END,
           access_revoked=$2,identity_deleted=$3,completed_steps=$5::jsonb,remaining_cleanup=$6::jsonb,updated_at=$7::timestamptz
       WHERE user_id=$1`,
      [
        userId,
        outcome.accessRevoked,
        outcome.identityDeleted,
        outcome.remainingCleanup,
        JSON.stringify(outcome.completedSteps),
        JSON.stringify(outcome.remainingCleanup),
        outcome.now,
      ],
    );
  }
}

export function createAccountDeletionRepository() {
  return new PostgresAccountDeletionRepository(createRuntimeNeonClient() as unknown as TransactionalQuery);
}
