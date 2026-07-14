import { neon } from "@neondatabase/serverless";
import type {
  RetailerApplication,
  RetailerSubmission,
  RetailerSubmissionStatus,
  RetailerVerificationStatus,
} from "@/lib/retailer-portal";

export interface RetailerApplicationRecord extends RetailerApplication {
  userId: string;
  email: string;
  firstName: string;
  status: Exclude<RetailerVerificationStatus, "not_started">;
  createdAt: string;
  updatedAt: string;
  verificationMethod?: string | null;
  verificationContact?: string | null;
  notificationSentAt?: string;
  notificationMessageId?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
  decisionNotifiedStatus?: "verified" | "rejected";
  decisionNotificationSentAt?: string;
  decisionNotificationMessageId?: string;
}

export interface RetailerSubmissionRecord extends RetailerSubmission {
  id: string;
  userId: string;
  storeName: string;
  storeAddress: string;
  createdAt: string;
  reviewedAt?: string;
}

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.BOURBON_QUEUE_DATABASE_URL || env.DATABASE_URL || null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function toIsoDate(value: unknown) {
  const parsed = value instanceof Date ? value : new Date(typeof value === "string" || typeof value === "number" ? value : "");
  if (Number.isNaN(parsed.getTime())) throw new RangeError("Invalid retailer timestamp");
  return parsed.toISOString();
}

function applicationFromRow(row: Record<string, unknown>): RetailerApplicationRecord {
  return {
    userId: asString(row.user_id),
    email: asString(row.account_email),
    firstName: asString(row.first_name),
    storeName: asString(row.store_name),
    storeAddress: asString(row.store_address),
    website: asString(row.website),
    listedPhone: asString(row.listed_phone),
    applicantRole: asString(row.applicant_role),
    status: asString(row.status) as RetailerApplicationRecord["status"],
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
    verificationMethod: asString(row.verification_method) || null,
    verificationContact: asString(row.verification_contact) || null,
    notificationSentAt: row.notification_sent_at ? toIsoDate(row.notification_sent_at) : undefined,
    notificationMessageId: asString(row.notification_message_id) || undefined,
    termsAcceptedAt: row.terms_accepted_at ? toIsoDate(row.terms_accepted_at) : undefined,
    termsVersion: asString(row.terms_version) || undefined,
    decisionNotifiedStatus: (asString(row.decision_notified_status) || undefined) as RetailerApplicationRecord["decisionNotifiedStatus"],
    decisionNotificationSentAt: row.decision_notification_sent_at ? toIsoDate(row.decision_notification_sent_at) : undefined,
    decisionNotificationMessageId: asString(row.decision_notification_message_id) || undefined,
  };
}

function submissionFromRow(row: Record<string, unknown>): RetailerSubmissionRecord {
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    storeName: asString(row.store_name),
    storeAddress: asString(row.store_address),
    kind: asString(payload.kind) as RetailerSubmissionRecord["kind"],
    bottleId: asString(payload.bottleId),
    title: asString(payload.title),
    locationDetails: asString(payload.locationDetails),
    price: asString(payload.price),
    availability: asString(payload.availability),
    availabilityTiming: asString(payload.availabilityTiming) as RetailerSubmissionRecord["availabilityTiming"],
    startsAt: asString(payload.startsAt),
    soldOutAt: asString(payload.soldOutAt),
    timeZone: asString(payload.timeZone) as RetailerSubmissionRecord["timeZone"],
    notes: asString(payload.notes),
    expiresAt: asString(payload.expiresAt),
    status: asString(row.status) as RetailerSubmissionStatus,
    createdAt: toIsoDate(row.created_at),
    reviewedAt: row.reviewed_at ? toIsoDate(row.reviewed_at) : undefined,
  };
}

export class RetailerRepository {
  private readonly query;
  private schemaReady: Promise<void> | null = null;

  constructor(url: string) {
    this.query = neon(url);
  }

  async ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        await this.query.query(`
          CREATE TABLE IF NOT EXISTS retailer_applications (
            user_id TEXT PRIMARY KEY,
            account_email TEXT NOT NULL,
            first_name TEXT NOT NULL DEFAULT '',
            store_name TEXT NOT NULL,
            store_address TEXT NOT NULL,
            website TEXT NOT NULL DEFAULT '',
            listed_phone TEXT NOT NULL,
            applicant_role TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
            verification_method TEXT,
            verification_contact TEXT,
            verified_by TEXT,
            notification_sent_at TIMESTAMPTZ,
            notification_message_id TEXT,
            terms_accepted_at TIMESTAMPTZ,
            terms_version TEXT,
            decision_notified_status TEXT CHECK (decision_notified_status IN ('verified', 'rejected')),
            decision_notification_sent_at TIMESTAMPTZ,
            decision_notification_message_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await this.query.query(`ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ`);
        await this.query.query(`ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS notification_message_id TEXT`);
        await this.query.query(`ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ`);
        await this.query.query(`ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS terms_version TEXT`);
        await this.query.query(`ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS decision_notified_status TEXT`);
        await this.query.query(`ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS decision_notification_sent_at TIMESTAMPTZ`);
        await this.query.query(`ALTER TABLE retailer_applications ADD COLUMN IF NOT EXISTS decision_notification_message_id TEXT`);
        await this.query.query(`CREATE INDEX IF NOT EXISTS retailer_applications_status_idx ON retailer_applications (status, created_at DESC)`);
        await this.query.query(`
          CREATE TABLE IF NOT EXISTS retailer_submissions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES retailer_applications(user_id) ON DELETE CASCADE,
            store_name TEXT NOT NULL,
            store_address TEXT NOT NULL,
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'reviewed' CHECK (status IN ('pending_review', 'reviewed', 'rejected')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_at TIMESTAMPTZ,
            reviewed_by TEXT
          )
        `);
        await this.query.query(`ALTER TABLE retailer_submissions ALTER COLUMN status SET DEFAULT 'reviewed'`);
        await this.query.query(`CREATE INDEX IF NOT EXISTS retailer_submissions_user_created_idx ON retailer_submissions (user_id, created_at DESC)`);
        await this.query.query(`CREATE INDEX IF NOT EXISTS retailer_submissions_status_created_idx ON retailer_submissions (status, created_at DESC)`);
        await this.query.query(`
          UPDATE retailer_submissions
          SET status = 'reviewed',
              payload = jsonb_set(payload, '{status}', '"reviewed"'::jsonb, true),
              reviewed_at = COALESCE(reviewed_at, created_at),
              reviewed_by = COALESCE(reviewed_by, 'retailer_direct')
          WHERE status = 'pending_review'
        `);
      })().catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }
    await this.schemaReady;
  }

  async upsertPendingApplication(input: {
    userId: string;
    email: string;
    firstName?: string | null;
    application: RetailerApplication;
    termsVersion?: string;
  }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      INSERT INTO retailer_applications (
        user_id, account_email, first_name, store_name, store_address, website, listed_phone, applicant_role, terms_accepted_at, terms_version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9::text <> '' THEN NOW() ELSE NULL END, NULLIF($9, ''))
      ON CONFLICT (user_id) DO UPDATE SET
        account_email = EXCLUDED.account_email,
        first_name = EXCLUDED.first_name,
        store_name = CASE WHEN retailer_applications.status = 'pending' THEN EXCLUDED.store_name ELSE retailer_applications.store_name END,
        store_address = CASE WHEN retailer_applications.status = 'pending' THEN EXCLUDED.store_address ELSE retailer_applications.store_address END,
        website = CASE WHEN retailer_applications.status = 'pending' THEN EXCLUDED.website ELSE retailer_applications.website END,
        listed_phone = CASE WHEN retailer_applications.status = 'pending' THEN EXCLUDED.listed_phone ELSE retailer_applications.listed_phone END,
        applicant_role = CASE WHEN retailer_applications.status = 'pending' THEN EXCLUDED.applicant_role ELSE retailer_applications.applicant_role END,
        terms_accepted_at = COALESCE(retailer_applications.terms_accepted_at, EXCLUDED.terms_accepted_at),
        terms_version = COALESCE(retailer_applications.terms_version, EXCLUDED.terms_version),
        updated_at = NOW()
      RETURNING *
    `, [input.userId, input.email, input.firstName || "", input.application.storeName, input.application.storeAddress, input.application.website, input.application.listedPhone, input.application.applicantRole, input.termsVersion || ""]);
    return applicationFromRow(rows[0] as Record<string, unknown>);
  }

  async markNotificationSent(userId: string, messageId?: string | null) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      UPDATE retailer_applications
      SET notification_sent_at = COALESCE(notification_sent_at, NOW()),
          notification_message_id = COALESCE(notification_message_id, $2),
          updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `, [userId, messageId || null]);
    return rows[0] ? applicationFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async getApplication(userId: string) {
    await this.ensureSchema();
    const rows = await this.query.query(`SELECT * FROM retailer_applications WHERE user_id = $1 LIMIT 1`, [userId]);
    return rows[0] ? applicationFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async listApplications(limit = 100, offset = 0) {
    await this.ensureSchema();
    const rows = await this.query.query(`SELECT * FROM retailer_applications ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [Math.min(Math.max(limit, 1), 200), Math.max(offset, 0)]);
    return rows.map((row) => applicationFromRow(row as Record<string, unknown>));
  }

  async updateApplicationProfile(input: { userId: string; application: RetailerApplication }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      UPDATE retailer_applications SET
        status = CASE
          WHEN status = 'verified' AND (
            store_name IS DISTINCT FROM $2 OR
            store_address IS DISTINCT FROM $3 OR
            listed_phone IS DISTINCT FROM $5
          ) THEN 'pending'
          ELSE status
        END,
        verification_method = CASE
          WHEN store_name IS DISTINCT FROM $2 OR store_address IS DISTINCT FROM $3 OR listed_phone IS DISTINCT FROM $5 THEN NULL
          ELSE verification_method
        END,
        verification_contact = CASE
          WHEN store_name IS DISTINCT FROM $2 OR store_address IS DISTINCT FROM $3 OR listed_phone IS DISTINCT FROM $5 THEN NULL
          ELSE verification_contact
        END,
        verified_by = CASE
          WHEN store_name IS DISTINCT FROM $2 OR store_address IS DISTINCT FROM $3 OR listed_phone IS DISTINCT FROM $5 THEN NULL
          ELSE verified_by
        END,
        decision_notified_status = CASE
          WHEN store_name IS DISTINCT FROM $2 OR store_address IS DISTINCT FROM $3 OR listed_phone IS DISTINCT FROM $5 THEN NULL
          ELSE decision_notified_status
        END,
        decision_notification_sent_at = CASE
          WHEN store_name IS DISTINCT FROM $2 OR store_address IS DISTINCT FROM $3 OR listed_phone IS DISTINCT FROM $5 THEN NULL
          ELSE decision_notification_sent_at
        END,
        decision_notification_message_id = CASE
          WHEN store_name IS DISTINCT FROM $2 OR store_address IS DISTINCT FROM $3 OR listed_phone IS DISTINCT FROM $5 THEN NULL
          ELSE decision_notification_message_id
        END,
        store_name = $2,
        store_address = $3,
        website = $4,
        listed_phone = $5,
        applicant_role = $6,
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `, [input.userId, input.application.storeName, input.application.storeAddress, input.application.website, input.application.listedPhone, input.application.applicantRole]);
    return rows[0] ? applicationFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async markDecisionNotificationSent(input: { userId: string; status: "verified" | "rejected"; messageId?: string | null }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      UPDATE retailer_applications
      SET decision_notified_status = $2,
          decision_notification_sent_at = NOW(),
          decision_notification_message_id = $3,
          updated_at = NOW()
      WHERE user_id = $1 AND status = $2
      RETURNING *
    `, [input.userId, input.status, input.messageId || null]);
    return rows[0] ? applicationFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async updateApplicationStatus(input: {
    userId: string;
    status: Exclude<RetailerVerificationStatus, "not_started">;
    reviewedBy: string;
    verificationMethod?: string | null;
    verificationContact?: string | null;
  }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      UPDATE retailer_applications SET
        status = $2,
        verification_method = CASE WHEN $2 = 'verified' THEN $3 ELSE NULL END,
        verification_contact = CASE WHEN $2 = 'verified' THEN $4 ELSE NULL END,
        verified_by = $5,
        decision_notified_status = NULL,
        decision_notification_sent_at = NULL,
        decision_notification_message_id = NULL,
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *
    `, [input.userId, input.status, input.verificationMethod || null, input.verificationContact || null, input.reviewedBy]);
    return rows[0] ? applicationFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async createSubmission(input: {
    id: string;
    userId: string;
    submission: RetailerSubmission;
  }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      INSERT INTO retailer_submissions (id, user_id, store_name, store_address, payload, status, reviewed_at, reviewed_by)
      SELECT $1, user_id, store_name, store_address, $3::jsonb, 'reviewed', NOW(), 'retailer_direct'
      FROM retailer_applications
      WHERE user_id = $2 AND status = 'verified'
      RETURNING *
    `, [input.id, input.userId, JSON.stringify(input.submission)]);
    return rows[0] ? submissionFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async listSubmissions(userId?: string) {
    await this.ensureSchema();
    const rows = userId
      ? await this.query.query(`SELECT * FROM retailer_submissions WHERE user_id = $1 ORDER BY created_at DESC`, [userId])
      : await this.query.query(`SELECT * FROM retailer_submissions ORDER BY created_at DESC`);
    return rows.map((row) => submissionFromRow(row as Record<string, unknown>));
  }

  async listPublicSubmissions() {
    await this.ensureSchema();
    const rows = await this.query.query(`
      SELECT submissions.*
      FROM retailer_submissions submissions
      INNER JOIN retailer_applications applications ON applications.user_id = submissions.user_id
      WHERE submissions.status = 'reviewed'
        AND applications.status = 'verified'
        AND submissions.payload->>'kind' IN ('bottle_drop', 'barrel_pick', 'tasting', 'lottery')
      ORDER BY submissions.created_at DESC
    `);
    return rows.map((row) => submissionFromRow(row as Record<string, unknown>));
  }

  async markSubmissionSoldOut(input: { id: string; userId: string; soldOutAt: string }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      UPDATE retailer_submissions
      SET payload = jsonb_set(payload, '{soldOutAt}', to_jsonb($3::text), true)
      WHERE id = $1
        AND user_id = $2
        AND status = 'reviewed'
        AND payload->>'kind' IN ('bottle_drop', 'barrel_pick')
        AND COALESCE(payload->>'soldOutAt', '') = ''
      RETURNING *
    `, [input.id, input.userId, input.soldOutAt]);
    return rows[0] ? submissionFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async deleteSubmission(input: { id: string; userId: string }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      DELETE FROM retailer_submissions WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [input.id, input.userId]);
    return rows[0] ? submissionFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async deleteApplication(userId: string) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      DELETE FROM retailer_applications WHERE user_id = $1
      RETURNING *
    `, [userId]);
    return rows[0] ? applicationFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async reviewSubmission(input: { id: string; userId: string; status: "reviewed" | "rejected"; reviewedBy: string }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      UPDATE retailer_submissions SET status = $3, reviewed_at = NOW(), reviewed_by = $4
      WHERE id = $1 AND user_id = $2 AND status = 'pending_review'
      RETURNING *
    `, [input.id, input.userId, input.status, input.reviewedBy]);
    return rows[0] ? submissionFromRow(rows[0] as Record<string, unknown>) : null;
  }
}

let repository: RetailerRepository | null = null;

export function getRetailerRepository(env: NodeJS.ProcessEnv = process.env) {
  if (!repository) {
    const url = connectionString(env);
    if (!url) throw new Error("Retailer portal database is not configured.");
    repository = new RetailerRepository(url);
  }
  return repository;
}
