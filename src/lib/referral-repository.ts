import { createHmac, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { MembershipTier } from "@/lib/entitlements";
import { normalizeReferralCode } from "./referrals";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface ReferralQuery {
  query(text: string, params?: unknown[]): Promise<unknown[]>;
}

export interface ReferralSummary {
  code: string;
  referralPoints: number;
  freePointsAwarded: number;
  totalReferrals: number;
  freeReferrals: number;
  standardReferrals: number;
  barrelReferrals: number;
  founderReferrals: number;
  founderGlassesEarned: number;
  founderGlassesAwaitingAddress: number;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : String(value || "");
}

export function generateReferralCode(bytes = randomBytes(10)) {
  let code = "";
  for (let index = 0; index < 10; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return code;
}

export function hashReferralEmail(email: string, secret: string) {
  return createHmac("sha256", secret)
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export function referralHashSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.REFERRAL_HASH_SECRET?.trim();
  if (!secret) throw new Error("Referral security is not configured.");
  return secret;
}

export class ReferralRepository {
  private readonly query: ReferralQuery;

  constructor(input: string | ReferralQuery) {
    this.query = typeof input === "string" ? neon(input) as unknown as ReferralQuery : input;
  }

  async ensureCode(input: { referrerUserId: string; emailHash: string }) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateReferralCode();
      try {
        const rows = await this.query.query(
          `INSERT INTO member_referral_codes (referrer_user_id, code, email_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (referrer_user_id) DO UPDATE SET
             email_hash = EXCLUDED.email_hash,
             updated_at = NOW()
           RETURNING code`,
          [input.referrerUserId, candidate, input.emailHash],
        ) as Array<Record<string, unknown>>;
        const code = normalizeReferralCode(rows[0]?.code);
        if (!code) throw new Error("Referral storage returned an invalid code.");
        return code;
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (code !== "23505" || attempt === 4) throw error;
      }
    }
    throw new Error("Unable to allocate a unique referral code.");
  }

  async claimReferral(input: { referredUserId: string; code: string; referredEmailHash: string }) {
    const code = normalizeReferralCode(input.code);
    if (!code) return { status: "invalid_code", pointsAwarded: 0 };
    const rows = await this.query.query(
      `SELECT * FROM claim_member_referral($1, $2, $3)`,
      [input.referredUserId, code, input.referredEmailHash],
    ) as Array<Record<string, unknown>>;
    return {
      status: stringValue(rows[0]?.claim_status) || "invalid_code",
      pointsAwarded: numberValue(rows[0]?.points_awarded),
    };
  }

  async reconcileTier(input: { referredUserId: string; tier: MembershipTier; sourceEventId?: string | null }) {
    const rows = await this.query.query(
      `SELECT * FROM reconcile_member_referral_reward($1, $2, $3)`,
      [input.referredUserId, input.tier, input.sourceEventId || null],
    ) as Array<Record<string, unknown>>;
    return {
      pointsAwarded: numberValue(rows[0]?.points_awarded),
      targetPoints: numberValue(rows[0]?.target_points),
      founderGlassEarned: rows[0]?.founder_glass_earned === true,
    };
  }

  async hasGlassRewards(referrerUserId: string): Promise<boolean> {
    const rows = await this.query.query(
      `SELECT EXISTS(SELECT 1 FROM member_referral_glass_rewards WHERE referrer_user_id = $1) AS has_glass`,
      [referrerUserId],
    ) as Array<Record<string, unknown>>;
    return rows[0]?.has_glass === true;
  }

  async confirmGlassAddress(referrerUserId: string): Promise<number> {
    const rows = await this.query.query(
      `UPDATE member_referral_glass_rewards
       SET status = 'address_confirmed', address_confirmed_at = NOW(), updated_at = NOW()
       WHERE referrer_user_id = $1 AND status = 'address_required'
       RETURNING referred_user_id`,
      [referrerUserId],
    ) as Array<Record<string, unknown>>;
    return rows.length;
  }

  async updateGlassFulfillment(referrerUserId: string, status: 'address_confirmed' | 'packed' | 'shipped'): Promise<number> {
    const rows = await this.query.query(
      `UPDATE member_referral_glass_rewards
       SET status = $2,
           shipped_at = CASE WHEN $2 = 'shipped' THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
           updated_at = NOW()
       WHERE referrer_user_id = $1 AND status IN ('address_confirmed', 'packed')
       RETURNING referred_user_id`,
      [referrerUserId, status],
    ) as Array<Record<string, unknown>>;
    return rows.length;
  }

  async readSummary(referrerUserId: string): Promise<ReferralSummary | null> {
    const rows = await this.query.query(
      `SELECT
         codes.code,
         COALESCE((SELECT SUM(points) FROM member_referral_point_ledger ledger WHERE ledger.referrer_user_id = codes.referrer_user_id), 0) AS referral_points,
         COALESCE((SELECT SUM(points) FROM member_referral_point_ledger ledger WHERE ledger.referrer_user_id = codes.referrer_user_id AND ledger.reason = 'referral_free'), 0) AS free_points_awarded,
         (SELECT COUNT(*) FROM member_referrals referrals WHERE referrals.referrer_user_id = codes.referrer_user_id) AS total_referrals,
         (SELECT COUNT(*) FROM member_referrals referrals WHERE referrals.referrer_user_id = codes.referrer_user_id AND referrals.highest_tier = 'free') AS free_referrals,
         (SELECT COUNT(*) FROM member_referrals referrals WHERE referrals.referrer_user_id = codes.referrer_user_id AND referrals.highest_tier = 'standard') AS standard_referrals,
         (SELECT COUNT(*) FROM member_referrals referrals WHERE referrals.referrer_user_id = codes.referrer_user_id AND referrals.highest_tier = 'barrel') AS barrel_referrals,
         (SELECT COUNT(*) FROM member_referrals referrals WHERE referrals.referrer_user_id = codes.referrer_user_id AND referrals.highest_tier = 'bottled-in-bond') AS founder_referrals,
         (SELECT COUNT(*) FROM member_referral_glass_rewards glasses WHERE glasses.referrer_user_id = codes.referrer_user_id) AS founder_glasses_earned,
         (SELECT COUNT(*) FROM member_referral_glass_rewards glasses WHERE glasses.referrer_user_id = codes.referrer_user_id AND glasses.status = 'address_required') AS founder_glasses_awaiting_address
       FROM member_referral_codes codes
       WHERE codes.referrer_user_id = $1
       LIMIT 1`,
      [referrerUserId],
    ) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) return null;
    return {
      code: stringValue(row.code),
      referralPoints: numberValue(row.referral_points),
      freePointsAwarded: numberValue(row.free_points_awarded),
      totalReferrals: numberValue(row.total_referrals),
      freeReferrals: numberValue(row.free_referrals),
      standardReferrals: numberValue(row.standard_referrals),
      barrelReferrals: numberValue(row.barrel_referrals),
      founderReferrals: numberValue(row.founder_referrals),
      founderGlassesEarned: numberValue(row.founder_glasses_earned),
      founderGlassesAwaitingAddress: numberValue(row.founder_glasses_awaiting_address),
    };
  }
}

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL
    || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.DATABASE_URL
    || null;
}

export function getReferralRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env);
  if (!url) throw new Error("Referral storage is not configured.");
  return new ReferralRepository(url);
}
