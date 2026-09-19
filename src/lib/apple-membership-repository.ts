import { createRuntimeNeonClient } from "./neon-runtime.ts";
import {
  appleMembershipStatusPriority,
  type AppleMembershipApplyOutcome,
  type AppleMembershipEnvironment,
  type AppleMembershipOfferState,
  type AppleMembershipProductId,
  type AppleMembershipRecord,
  type AppleMembershipRepository,
  type AppleMembershipSnapshot,
  type AppleMembershipStatus,
} from "./apple-membership.ts";

type Row = Record<string, unknown>;
type QueryExecutor = { query(sql: string, params?: unknown[]): Promise<Row[]> };

function text(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function nullableText(value: unknown) {
  const result = text(value).trim();
  return result || null;
}

function toRecord(row: Row): AppleMembershipRecord {
  return {
    clerkUserId: text(row.clerk_user_id),
    environment: text(row.environment) as AppleMembershipEnvironment,
    productId: text(row.product_id) as AppleMembershipProductId,
    originalTransactionId: text(row.original_transaction_id),
    status: text(row.entitlement_status) as AppleMembershipStatus,
    expiresAt: nullableText(row.expires_at),
    offerState: text(row.offer_state) as AppleMembershipOfferState,
    orderedEventAt: text(row.ordered_event_at),
    lastProviderEventId: nullableText(row.last_provider_event_id),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    lastReconciledAt: text(row.last_reconciled_at),
    projectedAt: nullableText(row.projected_at),
  };
}

const APPLY_TRANSITION_SQL = `
WITH incoming AS (
  SELECT
    $1::text AS clerk_user_id,
    $2::text AS provider_event_id,
    $3::text AS environment,
    $4::text AS product_id,
    $5::text AS original_transaction_id,
    $6::text AS entitlement_status,
    $7::timestamptz AS expires_at,
    $8::text AS offer_state,
    $9::timestamptz AS ordered_event_at,
    $10::integer AS status_priority,
    $11::timestamptz AS received_at
),
existing_membership AS (
  SELECT membership.*
  FROM apple_memberships membership, incoming value
  WHERE membership.original_transaction_id = value.original_transaction_id
),
event_claim AS (
  INSERT INTO apple_membership_events (
    provider_event_id, clerk_user_id, original_transaction_id, environment,
    product_id, entitlement_status, expires_at, offer_state, ordered_event_at, received_at
  )
  SELECT
    value.provider_event_id, value.clerk_user_id, value.original_transaction_id, value.environment,
    value.product_id, value.entitlement_status, value.expires_at, value.offer_state,
    value.ordered_event_at, value.received_at
  FROM incoming value
  WHERE value.provider_event_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM existing_membership current
      WHERE current.clerk_user_id <> value.clerk_user_id
    )
  ON CONFLICT (provider_event_id) DO UPDATE
    SET provider_event_id = apple_membership_events.provider_event_id
  RETURNING provider_event_id, clerk_user_id, original_transaction_id, (xmax = 0) AS event_created
),
event_membership AS (
  SELECT membership.*
  FROM apple_memberships membership
  JOIN event_claim event
    ON event.original_transaction_id = membership.original_transaction_id
),
upserted AS (
  INSERT INTO apple_memberships (
    clerk_user_id, environment, product_id, original_transaction_id,
    entitlement_status, expires_at, offer_state, ordered_event_at,
    status_priority, last_provider_event_id, created_at, updated_at, last_reconciled_at
  )
  SELECT
    value.clerk_user_id, value.environment, value.product_id, value.original_transaction_id,
    value.entitlement_status, value.expires_at, value.offer_state, value.ordered_event_at,
    value.status_priority, value.provider_event_id, value.received_at, value.received_at, value.received_at
  FROM incoming value
  WHERE NOT EXISTS (
      SELECT 1 FROM existing_membership current
      WHERE current.clerk_user_id <> value.clerk_user_id
    )
    AND (
      value.provider_event_id IS NULL
      OR EXISTS (
        SELECT 1 FROM event_claim event
        WHERE event.clerk_user_id = value.clerk_user_id
          AND event.original_transaction_id = value.original_transaction_id
          AND event.event_created
      )
    )
  ON CONFLICT (original_transaction_id) DO UPDATE SET
    environment = EXCLUDED.environment,
    product_id = EXCLUDED.product_id,
    entitlement_status = EXCLUDED.entitlement_status,
    expires_at = EXCLUDED.expires_at,
    offer_state = EXCLUDED.offer_state,
    ordered_event_at = EXCLUDED.ordered_event_at,
    status_priority = EXCLUDED.status_priority,
    last_provider_event_id = EXCLUDED.last_provider_event_id,
    updated_at = EXCLUDED.updated_at,
    last_reconciled_at = EXCLUDED.last_reconciled_at,
    projected_at = NULL
  WHERE apple_memberships.clerk_user_id = EXCLUDED.clerk_user_id
    AND (
      EXCLUDED.ordered_event_at > apple_memberships.ordered_event_at
      OR (
        EXCLUDED.ordered_event_at = apple_memberships.ordered_event_at
        AND EXCLUDED.status_priority > apple_memberships.status_priority
      )
    )
  RETURNING *
),
current_membership AS (
  SELECT * FROM upserted
  UNION ALL
  SELECT current.* FROM existing_membership current
  WHERE NOT EXISTS (SELECT 1 FROM upserted)
  UNION ALL
  SELECT current.* FROM event_membership current
  WHERE NOT EXISTS (SELECT 1 FROM upserted)
    AND NOT EXISTS (SELECT 1 FROM existing_membership)
)
SELECT current.*,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM existing_membership prior, incoming value
      WHERE prior.clerk_user_id <> value.clerk_user_id
    ) THEN 'ownership_mismatch'
    WHEN EXISTS (
      SELECT 1 FROM event_claim event, incoming value
      WHERE event.clerk_user_id <> value.clerk_user_id
         OR event.original_transaction_id <> value.original_transaction_id
    ) THEN 'event_conflict'
    WHEN EXISTS (
      SELECT 1 FROM incoming value
      WHERE value.provider_event_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM event_claim)
    ) THEN 'event_conflict'
    WHEN EXISTS (SELECT 1 FROM event_claim WHERE NOT event_created) THEN 'duplicate'
    WHEN EXISTS (SELECT 1 FROM upserted) THEN 'applied'
    ELSE 'stale'
  END AS apply_outcome
FROM current_membership current
LIMIT 1`;

export class PostgresAppleMembershipRepository implements AppleMembershipRepository {
  constructor(private readonly database: QueryExecutor) {}

  async applyTransition(input: AppleMembershipSnapshot & { providerEventId: string | null; receivedAt: string }) {
    const rows = await this.database.query(APPLY_TRANSITION_SQL, [
      input.clerkUserId,
      input.providerEventId,
      input.environment,
      input.productId,
      input.originalTransactionId,
      input.status,
      input.expiresAt,
      input.offerState,
      input.orderedEventAt,
      appleMembershipStatusPriority(input.status),
      input.receivedAt,
    ]);
    let row = rows[0];
    if (!row && input.providerEventId) {
      const reserved = await this.database.query(
        `SELECT membership.*,
                event.clerk_user_id AS event_clerk_user_id,
                event.original_transaction_id AS event_original_transaction_id
         FROM apple_membership_events event
         JOIN apple_memberships membership
           ON membership.original_transaction_id=event.original_transaction_id
         WHERE event.provider_event_id=$1
         LIMIT 1`,
        [input.providerEventId],
      );
      const reservedRow = reserved[0];
      if (reservedRow) {
        const sameOwner = text(reservedRow.event_clerk_user_id) === input.clerkUserId;
        const sameTransaction = text(reservedRow.event_original_transaction_id) === input.originalTransactionId;
        return {
          outcome: sameOwner && sameTransaction ? "duplicate" as const : "event_conflict" as const,
          record: toRecord(reservedRow),
        };
      }
    }
    if (!row) throw new Error("Apple membership transition did not return durable state.");
    return {
      outcome: text(row.apply_outcome) as AppleMembershipApplyOutcome,
      record: toRecord(row),
    };
  }

  async markProjected(originalTransactionId: string, clerkUserId: string, projectedAt: string) {
    await this.database.query(
      `UPDATE apple_memberships
       SET projected_at=$3::timestamptz, updated_at=GREATEST(updated_at,$3::timestamptz)
       WHERE original_transaction_id=$1 AND clerk_user_id=$2`,
      [originalTransactionId, clerkUserId, projectedAt],
    );
  }

  async readCurrentForUser(clerkUserId: string) {
    const rows = await this.database.query(
      `SELECT * FROM apple_memberships
       WHERE clerk_user_id=$1
       ORDER BY ordered_event_at DESC, status_priority DESC
       LIMIT 1`,
      [clerkUserId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async readByOriginalTransactionId(originalTransactionId: string) {
    const rows = await this.database.query(
      `SELECT * FROM apple_memberships
       WHERE original_transaction_id=$1
       LIMIT 1`,
      [originalTransactionId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
}

let repository: PostgresAppleMembershipRepository | null = null;

export function getAppleMembershipRepository() {
  if (repository) return repository;
  repository = new PostgresAppleMembershipRepository(createRuntimeNeonClient() as unknown as QueryExecutor);
  return repository;
}
