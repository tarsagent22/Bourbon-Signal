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
           shipped_at = CASE WHEN $2 = 'shipped' THEN COALESCE(shipped_at, NOW()) ELSE NULL END,
           updated_at = NOW(),
           updated_by = $5
       WHERE user_id = $1 AND founder_number IS NOT NULL
       RETURNING *`,
      [input.userId, input.status, input.carrier, input.trackingNumber, input.updatedBy],
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
