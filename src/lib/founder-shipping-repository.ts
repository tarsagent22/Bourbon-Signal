import { neon } from "@neondatabase/serverless";
import type { FounderShippingStatus, FounderShippingSubmission } from "@/lib/founder-shipping";

export interface FounderShippingRecord extends FounderShippingSubmission {
  userId: string;
  founderNumber: number | null;
  accountEmail: string;
  status: FounderShippingStatus;
  carrier: string | null;
  trackingNumber: string | null;
  submittedAt: string;
  updatedAt: string;
  shippedAt: string | null;
  shipmentNotificationSentAt: string | null;
  shipmentNotificationMessageId: string | null;
  shipmentNotificationClaimedAt: string | null;
  shipmentNotificationClaimToken: string | null;
  shipmentNotificationIdempotencyKey: string | null;
}

interface FounderShippingRow {
  user_id?: unknown;
  founder_number?: unknown;
  account_email?: unknown;
  recipient_name?: unknown;
  address_line1?: unknown;
  address_line2?: unknown;
  city?: unknown;
  state_code?: unknown;
  postal_code?: unknown;
  country_code?: unknown;
  phone?: unknown;
  status?: unknown;
  carrier?: unknown;
  tracking_number?: unknown;
  submitted_at?: unknown;
  updated_at?: unknown;
  shipped_at?: unknown;
  shipment_notification_sent_at?: unknown;
  shipment_notification_message_id?: unknown;
  shipment_notification_claimed_at?: unknown;
  shipment_notification_claim_token?: unknown;
  shipment_notification_idempotency_key?: unknown;
}

function text(value: unknown) {
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value || "");
}

function nullableText(value: unknown) {
  const normalized = text(value).trim();
  return normalized || null;
}

function rowToRecord(row: FounderShippingRow): FounderShippingRecord {
  return {
    userId: text(row.user_id),
    founderNumber: Number.isInteger(Number(row.founder_number)) && Number(row.founder_number) > 0
      ? Number(row.founder_number)
      : null,
    accountEmail: text(row.account_email),
    recipientName: text(row.recipient_name),
    addressLine1: text(row.address_line1),
    addressLine2: nullableText(row.address_line2),
    city: text(row.city),
    stateCode: text(row.state_code),
    postalCode: text(row.postal_code),
    countryCode: "US",
    phone: text(row.phone),
    status: row.status === "confirmed" || row.status === "packed" || row.status === "shipped" ? row.status : "submitted",
    carrier: nullableText(row.carrier),
    trackingNumber: nullableText(row.tracking_number),
    submittedAt: text(row.submitted_at),
    updatedAt: text(row.updated_at),
    shippedAt: nullableText(row.shipped_at),
    shipmentNotificationSentAt: nullableText(row.shipment_notification_sent_at),
    shipmentNotificationMessageId: nullableText(row.shipment_notification_message_id),
    shipmentNotificationClaimedAt: nullableText(row.shipment_notification_claimed_at),
    shipmentNotificationClaimToken: nullableText(row.shipment_notification_claim_token),
    shipmentNotificationIdempotencyKey: nullableText(row.shipment_notification_idempotency_key),
  };
}

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.BOURBON_QUEUE_DATABASE_URL
    || env.DATABASE_URL
    || null;
}

export class FounderShippingLockedError extends Error {
  constructor() {
    super("This shipping record is already packed or shipped.");
    this.name = "FounderShippingLockedError";
  }
}

export class FounderShippingNotificationInFlightError extends Error {
  constructor() {
    super("A shipment email is currently being finalized. Wait a moment and save again.");
    this.name = "FounderShippingNotificationInFlightError";
  }
}

export class FounderShippingRepository {
  private readonly query;

  constructor(url: string) {
    this.query = neon(url);
  }

  async readForUser(userId: string): Promise<FounderShippingRecord | null> {
    const rows = await this.query.query(
      `SELECT * FROM founder_glass_shipping WHERE user_id = $1 LIMIT 1`,
      [userId],
    ) as FounderShippingRow[];
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async attachFounderNumber(userId: string, founderNumber: number): Promise<FounderShippingRecord | null> {
    const rows = await this.query.query(
      `UPDATE founder_glass_shipping SET founder_number = $2, updated_at = NOW()
       WHERE user_id = $1 AND founder_number IS NULL
       RETURNING *`,
      [userId, founderNumber],
    ) as FounderShippingRow[];
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async listForOwner(): Promise<FounderShippingRecord[]> {
    const rows = await this.query.query(
      `SELECT * FROM founder_glass_shipping WHERE founder_number IS NOT NULL ORDER BY founder_number ASC LIMIT 1000`,
    ) as FounderShippingRow[];
    return rows.map(rowToRecord);
  }

  async upsertSubmission(input: {
    userId: string;
    founderNumber: number | null;
    accountEmail: string;
    submission: FounderShippingSubmission;
  }): Promise<FounderShippingRecord> {
    const { submission } = input;
    const rows = await this.query.query(
      `INSERT INTO founder_glass_shipping (
         user_id, founder_number, account_email, recipient_name, address_line1, address_line2,
         city, state_code, postal_code, country_code, phone, status, submitted_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'US', $10, 'submitted', NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         founder_number = COALESCE(EXCLUDED.founder_number, founder_glass_shipping.founder_number),
         account_email = EXCLUDED.account_email,
         recipient_name = EXCLUDED.recipient_name,
         address_line1 = EXCLUDED.address_line1,
         address_line2 = EXCLUDED.address_line2,
         city = EXCLUDED.city,
         state_code = EXCLUDED.state_code,
         postal_code = EXCLUDED.postal_code,
         country_code = 'US',
         phone = EXCLUDED.phone,
         status = 'submitted',
         carrier = NULL,
         tracking_number = NULL,
         shipped_at = NULL,
         shipment_notification_sent_at = NULL,
         shipment_notification_message_id = NULL,
         shipment_notification_claimed_at = NULL,
         shipment_notification_claim_token = NULL,
         shipment_notification_idempotency_key = NULL,
         updated_at = NOW(),
         updated_by = NULL
       WHERE founder_glass_shipping.status NOT IN ('packed', 'shipped')
       RETURNING *`,
      [
        input.userId,
        input.founderNumber,
        input.accountEmail,
        submission.recipientName,
        submission.addressLine1,
        submission.addressLine2,
        submission.city,
        submission.stateCode,
        submission.postalCode,
        submission.phone,
      ],
    ) as FounderShippingRow[];
    if (rows[0]) return rowToRecord(rows[0]);
    throw new FounderShippingLockedError();
  }

  async updateFulfillment(input: {
    userId: string;
    status: FounderShippingStatus;
    carrier: string | null;
    trackingNumber: string | null;
    updatedBy: string;
  }): Promise<FounderShippingRecord | null> {
    const rows = await this.query.query(
      `UPDATE founder_glass_shipping
       SET status = $2,
           carrier = $3,
           tracking_number = $4,
           shipped_at = CASE
             WHEN $2 <> 'shipped' THEN NULL
             WHEN status <> 'shipped' OR carrier IS DISTINCT FROM $3 OR tracking_number IS DISTINCT FROM $4 THEN date_trunc('milliseconds', NOW())
             ELSE COALESCE(shipped_at, date_trunc('milliseconds', NOW()))
           END,
           shipment_notification_sent_at = CASE
             WHEN $2 = 'shipped' AND status = 'shipped' AND carrier IS NOT DISTINCT FROM $3 AND tracking_number IS NOT DISTINCT FROM $4
               THEN shipment_notification_sent_at ELSE NULL
           END,
           shipment_notification_message_id = CASE
             WHEN $2 = 'shipped' AND status = 'shipped' AND carrier IS NOT DISTINCT FROM $3 AND tracking_number IS NOT DISTINCT FROM $4
               THEN shipment_notification_message_id ELSE NULL
           END,
           shipment_notification_claimed_at = CASE
             WHEN $2 = 'shipped' AND status = 'shipped' AND carrier IS NOT DISTINCT FROM $3 AND tracking_number IS NOT DISTINCT FROM $4
               THEN shipment_notification_claimed_at ELSE NULL
           END,
           shipment_notification_claim_token = CASE
             WHEN $2 = 'shipped' AND status = 'shipped' AND carrier IS NOT DISTINCT FROM $3 AND tracking_number IS NOT DISTINCT FROM $4
               THEN shipment_notification_claim_token ELSE NULL
           END,
           shipment_notification_idempotency_key = CASE
             WHEN $2 = 'shipped' AND status = 'shipped' AND carrier IS NOT DISTINCT FROM $3 AND tracking_number IS NOT DISTINCT FROM $4
               THEN shipment_notification_idempotency_key ELSE NULL
           END,
           updated_at = NOW(),
           updated_by = $5
       WHERE user_id = $1 AND founder_number IS NOT NULL
         AND (
           shipment_notification_claimed_at IS NULL
           OR shipment_notification_claimed_at < NOW() - INTERVAL '15 minutes'
           OR ($2 = 'shipped' AND status = 'shipped' AND carrier IS NOT DISTINCT FROM $3 AND tracking_number IS NOT DISTINCT FROM $4)
         )
       RETURNING *`,
      [input.userId, input.status, input.carrier, input.trackingNumber, input.updatedBy],
    ) as FounderShippingRow[];
    if (rows[0]) return rowToRecord(rows[0]);
    const current = await this.readForUser(input.userId);
    const claimedAtMs = current?.shipmentNotificationClaimedAt ? Date.parse(current.shipmentNotificationClaimedAt) : NaN;
    if (Number.isFinite(claimedAtMs) && Date.now() - claimedAtMs < 15 * 60_000) {
      throw new FounderShippingNotificationInFlightError();
    }
    return null;
  }

  async claimShipmentNotification(input: {
    userId: string;
    shippedAt: string;
    carrier: string;
    trackingNumber: string;
    claimToken: string;
    idempotencyKey: string;
  }): Promise<FounderShippingRecord | null> {
    const rows = await this.query.query(
      `UPDATE founder_glass_shipping
       SET shipment_notification_claimed_at = NOW(),
           shipment_notification_claim_token = $5,
           shipment_notification_idempotency_key = COALESCE(shipment_notification_idempotency_key, $6)
       WHERE user_id = $1
         AND status = 'shipped'
         AND date_trunc('milliseconds', shipped_at) = date_trunc('milliseconds', $2::timestamptz)
         AND carrier = $3
         AND tracking_number = $4
         AND shipment_notification_sent_at IS NULL
         AND (shipment_notification_claimed_at IS NULL OR shipment_notification_claimed_at < NOW() - INTERVAL '15 minutes')
         AND (shipment_notification_idempotency_key IS NULL OR shipment_notification_idempotency_key = $6)
       RETURNING *`,
      [input.userId, input.shippedAt, input.carrier, input.trackingNumber, input.claimToken, input.idempotencyKey],
    ) as FounderShippingRow[];
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async releaseShipmentNotification(userId: string, claimToken: string): Promise<FounderShippingRecord | null> {
    const rows = await this.query.query(
      `UPDATE founder_glass_shipping
       SET shipment_notification_claimed_at = NULL, shipment_notification_claim_token = NULL
       WHERE user_id = $1 AND shipment_notification_claim_token = $2 AND shipment_notification_sent_at IS NULL
       RETURNING *`,
      [userId, claimToken],
    ) as FounderShippingRow[];
    return rows[0] ? rowToRecord(rows[0]) : null;
  }

  async markShipmentNotificationSent(userId: string, claimToken: string, messageId: string): Promise<FounderShippingRecord | null> {
    const rows = await this.query.query(
      `UPDATE founder_glass_shipping
       SET shipment_notification_sent_at = NOW(),
           shipment_notification_message_id = $3,
           shipment_notification_claimed_at = NULL,
           shipment_notification_claim_token = NULL,
           updated_at = NOW()
       WHERE user_id = $1
         AND status = 'shipped'
         AND shipment_notification_claim_token = $2
         AND shipment_notification_sent_at IS NULL
       RETURNING *`,
      [userId, claimToken, messageId],
    ) as FounderShippingRow[];
    return rows[0] ? rowToRecord(rows[0]) : null;
  }
}

export function createFounderShippingRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env);
  if (!url) throw new Error("Founder shipping storage is not configured.");
  return new FounderShippingRepository(url);
}

export async function readFounderShippingForUser(userId: string) {
  return createFounderShippingRepository().readForUser(userId);
}

export async function attachFounderNumberToShippingProfile(userId: string, founderNumber: number) {
  return createFounderShippingRepository().attachFounderNumber(userId, founderNumber);
}

export async function listFounderShippingForOwner() {
  return createFounderShippingRepository().listForOwner();
}

export async function saveFounderShippingSubmission(input: Parameters<FounderShippingRepository["upsertSubmission"]>[0]) {
  return createFounderShippingRepository().upsertSubmission(input);
}

export async function updateFounderShippingFulfillment(input: Parameters<FounderShippingRepository["updateFulfillment"]>[0]) {
  return createFounderShippingRepository().updateFulfillment(input);
}

export async function claimFounderShipmentNotification(input: Parameters<FounderShippingRepository["claimShipmentNotification"]>[0]) {
  return createFounderShippingRepository().claimShipmentNotification(input);
}

export async function releaseFounderShipmentNotification(userId: string, claimToken: string) {
  return createFounderShippingRepository().releaseShipmentNotification(userId, claimToken);
}

export async function markFounderShipmentNotificationSent(userId: string, claimToken: string, messageId: string) {
  return createFounderShippingRepository().markShipmentNotificationSent(userId, claimToken, messageId);
}
