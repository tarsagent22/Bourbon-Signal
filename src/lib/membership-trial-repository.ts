import "server-only";
import { createRuntimeNeonClient } from "@/lib/neon-runtime";
import type { BillingPlanId } from "@/lib/entitlements";

type TrialPlan = Extract<BillingPlanId, "standard_monthly" | "barrel_monthly">;
type Row = Record<string, unknown>;
type Query = { query: (text: string, params?: unknown[]) => Promise<Row[]> };

export type MembershipTrialClaim = {
  userId: string;
  subscriptionId: string;
  plan: TrialPlan;
  status: "started" | "converted" | "canceled";
  startedAt: string;
  convertedAt: string | null;
  canceledAt: string | null;
};

function text(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value || "");
}

function nullableText(value: unknown) {
  const normalized = text(value).trim();
  return normalized || null;
}

function toClaim(row: Row): MembershipTrialClaim {
  return {
    userId: text(row.user_id),
    subscriptionId: text(row.subscription_id),
    plan: text(row.plan) as TrialPlan,
    status: text(row.status) as MembershipTrialClaim["status"],
    startedAt: text(row.started_at),
    convertedAt: nullableText(row.converted_at),
    canceledAt: nullableText(row.canceled_at),
  };
}

export class MembershipTrialRepository {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly database: Query) {}

  private async ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        await this.database.query(
          `CREATE TABLE IF NOT EXISTS membership_trial_claims (
             user_id TEXT PRIMARY KEY,
             subscription_id TEXT NOT NULL UNIQUE,
             plan TEXT NOT NULL CHECK (plan IN ('standard_monthly', 'barrel_monthly')),
          source TEXT NOT NULL DEFAULT 'membership_checkout',
          checkout_session_id TEXT UNIQUE,
          trial_ends_at TIMESTAMPTZ,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
             status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'converted', 'canceled')),
             started_at TIMESTAMPTZ NOT NULL,
             converted_at TIMESTAMPTZ,
             canceled_at TIMESTAMPTZ,
             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
             updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
           )`,
        );
        await this.database.query(
          `CREATE INDEX IF NOT EXISTS membership_trial_claims_status_idx
           ON membership_trial_claims (status, updated_at DESC)`,
        );
      })().catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }
    await this.schemaReady;
  }

  async findByUserId(userId: string) {
    await this.ensureSchema();
    const rows = await this.database.query(
      `SELECT * FROM membership_trial_claims WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return rows[0] ? toClaim(rows[0]) : null;
  }

  async claimStart(input: { userId: string; subscriptionId: string; plan: TrialPlan; startedAt: string }) {
    await this.ensureSchema();
    const rows = await this.database.query(
      `INSERT INTO membership_trial_claims (user_id, subscription_id, plan, status, started_at, updated_at)
       VALUES ($1, $2, $3, 'started', $4::timestamptz, NOW())
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [input.userId, input.subscriptionId, input.plan, input.startedAt],
    );
    if (rows[0]) return { accepted: true, claim: toClaim(rows[0]) };
    const existing = await this.findByUserId(input.userId);
    return {
      accepted: existing?.subscriptionId === input.subscriptionId,
      claim: existing,
    };
  }

  async markConverted(subscriptionId: string, convertedAt: string) {
    await this.ensureSchema();
    const rows = await this.database.query(
      `UPDATE membership_trial_claims
       SET status = 'converted', converted_at = COALESCE(converted_at, $2::timestamptz), updated_at = NOW()
       WHERE subscription_id = $1
       RETURNING *`,
      [subscriptionId, convertedAt],
    );
    return rows[0] ? toClaim(rows[0]) : null;
  }

  async markCanceled(subscriptionId: string, canceledAt: string) {
    await this.ensureSchema();
    const rows = await this.database.query(
      `UPDATE membership_trial_claims
       SET status = CASE WHEN converted_at IS NULL THEN 'canceled' ELSE status END,
           canceled_at = CASE WHEN converted_at IS NULL THEN COALESCE(canceled_at, $2::timestamptz) ELSE canceled_at END,
           updated_at = NOW()
       WHERE subscription_id = $1
       RETURNING *`,
      [subscriptionId, canceledAt],
    );
    return rows[0] ? toClaim(rows[0]) : null;
  }
}

let repository: MembershipTrialRepository | null = null;

export function getMembershipTrialRepository() {
  if (repository) return repository;
  const client = createRuntimeNeonClient() as unknown as Query;
  repository = new MembershipTrialRepository(client);
  return repository;
}
