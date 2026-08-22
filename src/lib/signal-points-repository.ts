import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { MembershipTier } from "@/lib/entitlements";
import type { SignalRedemptionState } from "@/lib/signal-points";

export interface SignalPointsQuery { query(text: string, params?: unknown[]): Promise<unknown[]> }

export const SIGNAL_POINTS_CLERK_METADATA_V1_REQUIRED = "signal_points_clerk_metadata_v1_required";
export const SIGNAL_POINTS_CLERK_METADATA_V1_VERIFIED_COMPLETE = "signal_points_clerk_metadata_v1_verified_complete";
export const SIGNAL_POINTS_MEMBERSHIP_CREDIT_V3_READY = "signal_points_membership_credit_v3_ready";
const CLERK_REWARD_SOURCE_PREFIX = "signal_points_clerk_metadata_v1";

const text = (value: unknown) => typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value || "");
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const json = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};

const CURRENT_REWARD_CATALOG = [
  { key: "sticker_pack", version: 1, name: "Bourbon Signal sticker pack", points: 75, fulfillmentType: "physical", options: { usShippingIncluded: true } },
  { key: "standard_membership_credit_month", version: 3, name: "One month on us — Standard Proof", points: 150, fulfillmentType: "digital", options: { automaticFulfillment: true, membershipCredit: true, eligibleTier: "standard", creditCents: 300, rollingLimitDays: 365 } },
  { key: "barrel_membership_credit_month", version: 3, name: "One month on us — Barrel Proof", points: 250, fulfillmentType: "digital", options: { automaticFulfillment: true, membershipCredit: true, eligibleTier: "barrel", creditCents: 600, rollingLimitDays: 365 } },
  { key: "rocks_glass", version: 1, name: "Bourbon Signal rocks glass", points: 400, fulfillmentType: "physical", options: { usShippingIncluded: true, glassQuantity: 1, engravingPointsPerGlass: 125 } },
  { key: "glencairn", version: 1, name: "Bourbon Signal Glencairn", points: 450, fulfillmentType: "physical", options: { usShippingIncluded: true, glassQuantity: 1, engravingPointsPerGlass: 125 } },
  { key: "bourbon_shipping_gift_card_100", version: 2, name: "$100 Caskers gift card", points: 2600, fulfillmentType: "digital", options: { ownerFulfillment: true, requiresAge21Attestation: true, denominationUsd: 100, partner: "Caskers" } },
] as const;

export async function syncCurrentSignalRewardCatalog(query: SignalPointsQuery) {
  const values = CURRENT_REWARD_CATALOG.map((_, index) => {
    const start = index * 6;
    return `($${start + 1}::text,$${start + 2}::integer,$${start + 3}::text,$${start + 4}::integer,$${start + 5}::text,$${start + 6}::jsonb)`;
  }).join(",");
  const params = CURRENT_REWARD_CATALOG.flatMap((item) => [
    item.key, item.version, item.name, item.points, item.fulfillmentType, JSON.stringify(item.options),
  ]);
  await query.query(`INSERT INTO signal_reward_catalog (item_key,catalog_version,name,points_cost,fulfillment_type,option_snapshot)
    SELECT pending.* FROM (VALUES ${values}) AS pending(item_key,catalog_version,name,points_cost,fulfillment_type,option_snapshot)
    WHERE pending.item_key NOT IN ('standard_membership_credit_month','barrel_membership_credit_month')
      OR EXISTS (SELECT 1 FROM signal_point_migrations WHERE migration_key='signal_points_membership_credit_v3_ready')
    ON CONFLICT (item_key) DO UPDATE SET
      catalog_version=EXCLUDED.catalog_version,name=EXCLUDED.name,points_cost=EXCLUDED.points_cost,
      fulfillment_type=EXCLUDED.fulfillment_type,option_snapshot=EXCLUDED.option_snapshot,updated_at=NOW()
    WHERE signal_reward_catalog.catalog_version < EXCLUDED.catalog_version`, params);
}

export function createSignalRewardCatalogSyncMemo() {
  let sync: Promise<void> | null = null;
  return (query: SignalPointsQuery) => {
    if (!sync) sync = syncCurrentSignalRewardCatalog(query).catch((error) => {
      sync = null;
      throw error;
    });
    return sync;
  };
}

const syncRuntimeCatalog = createSignalRewardCatalogSyncMemo();

export function normalizedClerkRewardPoints(input: unknown) {
  const profile = json(input);
  const ledger = Array.isArray(profile.ledger) ? profile.ledger.map(json).filter((entry) => !entry.revokedAt) : [];
  const normalizedReason = /(?:sighting_base_v4|badge_v3|streak_maintained_v3)$/u;
  const legacyReason = /(?:sighting_base_v[1-3]|badge(?:_v2)?|streak_maintained(?:_v2)?)$/u;
  const hasNormalizedEntries = ledger.some((entry) => normalizedReason.test(text(entry.reason)));
  const hasLegacyEntries = ledger.some((entry) => legacyReason.test(text(entry.reason)));
  const activeTotal = ledger.reduce((sum, entry) => {
    const points = number(entry.points);
    return sum + (legacyReason.test(text(entry.reason)) ? points * 10 : points);
  }, 0);
  const profileTotal = Math.max(0, Math.trunc(number(profile.points)));
  if (hasNormalizedEntries && hasLegacyEntries) return Math.max(0, Math.trunc(activeTotal));
  if (hasNormalizedEntries) return profileTotal || Math.max(0, Math.trunc(activeTotal));
  return Math.max(0, Math.trunc((profileTotal || activeTotal) * 10));
}

export type ClerkRewardSourceTarget = {
  sourceKey: string;
  targetPoints: number;
  metadata: Record<string, unknown>;
};

export function clerkRewardSourceTargets(input: unknown): ClerkRewardSourceTarget[] {
  const profile = json(input);
  const ledger = Array.isArray(profile.ledger) ? profile.ledger.map(json).filter((entry) => text(entry.id)) : [];
  const legacyReason = /(?:sighting_base_v[1-3]|badge(?:_v2)?|streak_maintained(?:_v2)?)$/u;
  const bySource = new Map<string, ClerkRewardSourceTarget>();
  for (const entry of ledger) {
    const entryId = text(entry.id);
    const reason = text(entry.reason);
    const targetPoints = entry.revokedAt ? 0 : Math.max(0, Math.trunc(number(entry.points) * (legacyReason.test(reason) ? 10 : 1)));
    const digest = createHash("sha256").update(entryId).digest("hex").slice(0, 32);
    const sourceKey = `${CLERK_REWARD_SOURCE_PREFIX}:entry:${digest}`;
    bySource.set(sourceKey, {
      sourceKey,
      targetPoints,
      metadata: {
        rewardEntryId: entryId,
        reason,
        ...(text(entry.sightingId) ? { sightingId: text(entry.sightingId) } : {}),
        ...(text(entry.badgeId) ? { badgeId: text(entry.badgeId) } : {}),
      },
    });
  }
  const total = normalizedClerkRewardPoints(profile);
  const activeEntryPoints = [...bySource.values()].reduce((sum, source) => sum + source.targetPoints, 0);
  bySource.set(CLERK_REWARD_SOURCE_PREFIX, {
    sourceKey: CLERK_REWARD_SOURCE_PREFIX,
    targetPoints: 0,
    metadata: { reason: "retired_absolute_profile_total" },
  });
  bySource.set(`${CLERK_REWARD_SOURCE_PREFIX}:remainder`, {
    sourceKey: `${CLERK_REWARD_SOURCE_PREFIX}:remainder`,
    targetPoints: Math.max(0, total - activeEntryPoints),
    metadata: { reason: "profile_total_remainder" },
  });
  return [...bySource.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function allowUnverifiedCutover(env: NodeJS.ProcessEnv) {
  const requested = env.SIGNAL_POINTS_ALLOW_UNVERIFIED_CUTOVER === "1";
  if (requested && env.NODE_ENV === "production") throw new Error("Signal Points cutover override is forbidden in production.");
  return requested;
}

export class SignalPointsRepository {
  private readonly query: SignalPointsQuery;
  private readonly bypassCutover: boolean;
  private readonly useRuntimeCatalogCache: boolean;
  private readonly syncCatalog = createSignalRewardCatalogSyncMemo();
  constructor(input: string | SignalPointsQuery, options: { allowUnverifiedCutover?: boolean } = {}) {
    this.query = typeof input === "string" ? neon(input) as unknown as SignalPointsQuery : input;
    this.bypassCutover = options.allowUnverifiedCutover === true;
    this.useRuntimeCatalogCache = typeof input === "string";
  }

  private ensureCatalog() {
    return this.useRuntimeCatalogCache ? syncRuntimeCatalog(this.query) : this.syncCatalog(this.query);
  }

  async assertCutoverVerified() {
    if (this.bypassCutover) return;
    const rows = await this.query.query(
      "SELECT 1 AS verified FROM signal_point_migrations WHERE migration_key=$1 LIMIT 1",
      [SIGNAL_POINTS_CLERK_METADATA_V1_VERIFIED_COMPLETE],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new Error("Signal Points cutover is not verified complete.");
  }

  async assertMembershipCreditReady() {
    const rows = await this.query.query(
      `SELECT 1 AS ready FROM signal_point_migrations
       WHERE migration_key=$1
         AND to_regprocedure('prepare_signal_membership_credit_fulfillment(text,text,jsonb)') IS NOT NULL
         AND to_regprocedure('complete_signal_membership_credit_fulfillment(text,text,text,jsonb)') IS NOT NULL
       LIMIT 1`,
      [SIGNAL_POINTS_MEMBERSHIP_CREDIT_V3_READY],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new Error("Membership credit fulfillment is not ready.");
  }

  async nextRewardGeneration(userId: string) {
    const rows = await this.query.query(
      "SELECT next_community_sighting_reward_generation($1) AS generation",
      [userId],
    ) as Array<Record<string, unknown>>;
    const generation = number(rows[0]?.generation);
    if (!Number.isSafeInteger(generation) || generation < 1) throw new Error("Unable to allocate Signal Points reward generation.");
    return generation;
  }

  async readRewardGeneration(userId: string) {
    const rows = await this.query.query(
      "SELECT generation FROM signal_point_reward_generations WHERE user_id=$1",
      [userId],
    ) as Array<Record<string, unknown>>;
    const generation = rows[0] ? number(rows[0].generation) : 0;
    if (!Number.isSafeInteger(generation) || generation < 0) throw new Error("Invalid stored Signal Points reward generation.");
    return generation;
  }

  async reconcileClerkRewards(userId: string, memberRewards: unknown, rewardGeneration: number) {
    const generation = rewardGeneration;
    if (!Number.isSafeInteger(generation) || generation < 0) throw new Error("Invalid Signal Points reward generation.");
    const hash = createHash("sha256").update(JSON.stringify(memberRewards || {})).digest("hex").slice(0, 32);
    const targets = clerkRewardSourceTargets(memberRewards).map((source) => ({
      ...source,
      metadata: { ...source.metadata, targetPoints: source.targetPoints },
    }));
    const rows = await this.query.query(
      "SELECT * FROM reconcile_signal_point_source_set($1,$2,$3,$4::jsonb,$5,$6::jsonb)",
      [userId, CLERK_REWARD_SOURCE_PREFIX, generation, JSON.stringify(targets), `clerk-rewards:${hash}`, JSON.stringify({ snapshotHash: hash })],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new Error("Signal Points source-set reconciliation did not complete.");
    return number(rows[0].balance);
  }

  async readClerkRewardSource(userId: string) {
    const rows = await this.query.query(
      `SELECT accounts.balance,accounts.debt,COALESCE(SUM(sources.points),0)::integer AS points
       FROM signal_point_accounts accounts
       LEFT JOIN signal_point_source_balances sources
         ON sources.user_id=accounts.user_id AND LEFT(sources.source_key,LENGTH($2)+1)=$2||':'
       WHERE accounts.user_id=$1
       GROUP BY accounts.user_id,accounts.balance,accounts.debt`,
      [userId, CLERK_REWARD_SOURCE_PREFIX],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) return null;
    return { balance: number(rows[0].balance), debt: number(rows[0].debt), sourcePoints: rows[0].points == null ? null : number(rows[0].points) };
  }

  async markClerkRewardBackfillVerifiedComplete(details: Record<string, unknown>) {
    const rows = await this.query.query(
      `INSERT INTO signal_point_migrations(migration_key,completed_at,details)
       SELECT $1,NOW(),$2::jsonb
       WHERE EXISTS (SELECT 1 FROM signal_point_migrations WHERE migration_key=$3)
       ON CONFLICT(migration_key) DO NOTHING
       RETURNING migration_key`,
      [SIGNAL_POINTS_CLERK_METADATA_V1_VERIFIED_COMPLETE, JSON.stringify({ ...details, mode: "verified-complete-clerk-member-backfill" }), SIGNAL_POINTS_CLERK_METADATA_V1_REQUIRED],
    ) as Array<Record<string, unknown>>;
    if (!rows[0]) {
      const existing = await this.query.query("SELECT 1 FROM signal_point_migrations WHERE migration_key=$1", [SIGNAL_POINTS_CLERK_METADATA_V1_VERIFIED_COMPLETE]);
      if (!existing[0]) throw new Error("Signal Points required cutover marker is missing.");
    }
  }

  async readMember(userId: string) {
    await this.assertCutoverVerified();
    await this.ensureCatalog();
    await this.query.query("INSERT INTO signal_point_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [userId]);
    const [accountRows, catalogRows, redemptionRows] = await Promise.all([
      this.query.query("SELECT balance,debt FROM signal_point_accounts WHERE user_id=$1", [userId]),
      this.query.query(`SELECT * FROM signal_reward_catalog WHERE active=TRUE
        AND (item_key NOT IN ('standard_membership_credit_month','barrel_membership_credit_month')
          OR EXISTS (SELECT 1 FROM signal_point_migrations WHERE migration_key='signal_points_membership_credit_v3_ready'))
        ORDER BY points_cost,item_key`),
      this.query.query("SELECT id,item_key,item_snapshot,details,points_spent,status,created_at,updated_at FROM signal_reward_redemptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [userId]),
    ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>];
    if (!accountRows[0]) throw new Error("Signal Points account is unavailable.");
    return {
      balance: number(accountRows[0].balance),
      debt: number(accountRows[0].debt),
      catalog: catalogRows.map((row) => ({
        key: text(row.item_key), name: text(row.name), points: number(row.points_cost), catalogVersion: number(row.catalog_version),
        fulfillmentType: text(row.fulfillment_type), inventoryRemaining: row.inventory_remaining == null ? null : number(row.inventory_remaining), options: json(row.option_snapshot),
      })),
      redemptions: redemptionRows.map((row) => ({
        id: text(row.id), itemKey: text(row.item_key), itemSnapshot: json(row.item_snapshot), details: json(row.details),
        pointsSpent: number(row.points_spent), status: text(row.status), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
      })),
    };
  }

  async reserve(input: { id: string; userId: string; tier: MembershipTier; itemKey: string; idempotencyKey: string; details: Record<string, unknown>; accountEmail: string; shippingConfirmed: boolean }) {
    await this.assertCutoverVerified();
    await this.ensureCatalog();
    const rows = await this.query.query("SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", [
      input.id, input.userId, input.tier, input.itemKey, input.idempotencyKey, JSON.stringify(input.details), input.accountEmail, input.shippingConfirmed,
    ]) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new Error("Reward reservation did not complete.");
    return { redemptionId: text(rows[0].redemption_id), status: text(rows[0].redemption_status), balance: number(rows[0].balance) };
  }

  async prepareMembershipCreditFulfillment(input: { redemptionId: string; actorId: string; metadata?: Record<string, unknown> }) {
    const rows = await this.query.query("SELECT * FROM prepare_signal_membership_credit_fulfillment($1,$2,$3::jsonb)", [
      input.redemptionId, input.actorId, JSON.stringify(input.metadata || {}),
    ]) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new Error("Membership credit fulfillment preparation did not complete.");
    return { redemptionId: text(rows[0].redemption_id), status: text(rows[0].redemption_status), balance: number(rows[0].balance) };
  }

  async completeMembershipCreditFulfillment(input: { redemptionId: string; actorId: string; providerReference: string; metadata?: Record<string, unknown> }) {
    const rows = await this.query.query("SELECT * FROM complete_signal_membership_credit_fulfillment($1,$2,$3,$4::jsonb)", [
      input.redemptionId, input.actorId, input.providerReference, JSON.stringify(input.metadata || {}),
    ]) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new Error("Membership credit fulfillment completion did not complete.");
    return { redemptionId: text(rows[0].redemption_id), status: text(rows[0].redemption_status), balance: number(rows[0].balance) };
  }

  async transition(input: { redemptionId: string; actorId: string; nextStatus: SignalRedemptionState; actorRole: "member" | "owner" | "system"; metadata?: Record<string, unknown> }) {
    await this.assertCutoverVerified();
    const rows = await this.query.query("SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", [
      input.redemptionId, input.actorId, input.nextStatus, input.actorRole, JSON.stringify(input.metadata || {}),
    ]) as Array<Record<string, unknown>>;
    if (!rows[0]) throw new Error("Reward transition did not complete.");
    return { redemptionId: text(rows[0].redemption_id), status: text(rows[0].redemption_status), balance: number(rows[0].balance) };
  }

  async listOwnerMemberBalances() {
    await this.assertCutoverVerified();
    const rows = await this.query.query(`SELECT accounts.user_id,accounts.balance,accounts.debt,
      COUNT(redemptions.id)::integer AS redemption_count,MAX(redemptions.created_at) AS last_redemption_at
      FROM signal_point_accounts accounts
      LEFT JOIN signal_reward_redemptions redemptions ON redemptions.user_id=accounts.user_id
      GROUP BY accounts.user_id,accounts.balance,accounts.debt
      ORDER BY accounts.balance DESC,accounts.user_id ASC`) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      userId: text(row.user_id), balance: number(row.balance), debt: number(row.debt),
      redemptionCount: number(row.redemption_count), lastRedemptionAt: text(row.last_redemption_at) || null,
    }));
  }

  async listOwnerRedemptions() {
    await this.assertCutoverVerified();
    await this.ensureCatalog();
    const rows = await this.query.query(`SELECT redemptions.id,redemptions.user_id,redemptions.account_email,redemptions.item_key,
      redemptions.item_snapshot,redemptions.details,redemptions.points_spent,redemptions.status,redemptions.created_at,redemptions.updated_at,
      fulfillments.fulfillment_type,fulfillments.shipping_profile_user_id,fulfillments.shipping_address,fulfillments.carrier,fulfillments.tracking_number
      FROM signal_reward_redemptions redemptions
      LEFT JOIN signal_reward_fulfillments fulfillments ON fulfillments.redemption_id=redemptions.id
      ORDER BY redemptions.created_at DESC`) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: text(row.id), userId: text(row.user_id), accountEmail: text(row.account_email), itemKey: text(row.item_key),
      itemSnapshot: json(row.item_snapshot), details: json(row.details), pointsSpent: number(row.points_spent), status: text(row.status),
      createdAt: text(row.created_at), updatedAt: text(row.updated_at), fulfillmentType: text(row.fulfillment_type),
      shippingProfileUserId: text(row.shipping_profile_user_id) || null, carrier: text(row.carrier) || null,
      trackingNumber: text(row.tracking_number) || null,
      shippingAddress: row.shipping_address && typeof row.shipping_address === "object" ? json(row.shipping_address) : null,
    }));
  }

  async listOwnerQueue() {
    await this.ensureCatalog();
    const rows = await this.query.query(`SELECT redemptions.id,redemptions.user_id,redemptions.account_email,redemptions.item_key,
      redemptions.item_snapshot,redemptions.details,redemptions.points_spent,redemptions.status,redemptions.created_at,
      fulfillments.fulfillment_type,fulfillments.shipping_profile_user_id,fulfillments.shipping_address,fulfillments.carrier,fulfillments.tracking_number
      FROM signal_reward_redemptions redemptions JOIN signal_reward_fulfillments fulfillments ON fulfillments.redemption_id=redemptions.id
      WHERE redemptions.status NOT IN ('delivered','canceled') ORDER BY redemptions.created_at ASC LIMIT 250`) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: text(row.id), userId: text(row.user_id), accountEmail: text(row.account_email), itemKey: text(row.item_key),
      itemSnapshot: json(row.item_snapshot), details: json(row.details), pointsSpent: number(row.points_spent), status: text(row.status),
      createdAt: text(row.created_at), fulfillmentType: text(row.fulfillment_type), shippingProfileUserId: text(row.shipping_profile_user_id) || null,
      carrier: text(row.carrier) || null, trackingNumber: text(row.tracking_number) || null,
      shippingAddress: row.shipping_address && typeof row.shipping_address === "object" ? json(row.shipping_address) : null,
    }));
  }
}

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.BOURBON_QUEUE_DATABASE_URL || env.DATABASE_URL || null;
}
export function createSignalPointsRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env); if (!url) throw new Error("Signal Points storage is not configured.");
  return new SignalPointsRepository(url, { allowUnverifiedCutover: allowUnverifiedCutover(env) });
}
