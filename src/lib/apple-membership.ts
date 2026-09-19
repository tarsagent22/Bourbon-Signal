import {
  BILLING_PLAN_TO_TIER,
  isMembershipAccessActive,
  normalizeBillingPlan,
  normalizeMembershipTier,
  type BillingPlanId,
  type MembershipTier,
} from "./entitlements.ts";
import { hasActiveGiftMembership } from "./membership-trial.ts";

export const APPLE_MEMBERSHIP_PRODUCT_IDS = [
  "com.bourbonsignal.app.standard.monthly",
  "com.bourbonsignal.app.standard.annual",
  "com.bourbonsignal.app.barrel.monthly",
  "com.bourbonsignal.app.barrel.annual",
] as const;

export type AppleMembershipProductId = typeof APPLE_MEMBERSHIP_PRODUCT_IDS[number];
export type AppleMembershipEnvironment = "sandbox" | "production";
export type AppleMembershipStatus =
  | "trialing"
  | "active"
  | "canceled_period_end"
  | "grace_period"
  | "billing_issue"
  | "expired"
  | "refunded"
  | "revoked";
export type AppleMembershipOfferState = "none" | "introductory_trial" | "introductory_offer" | "promotional_offer" | "unknown";

export type AppleMembershipSnapshot = {
  clerkUserId: string;
  environment: AppleMembershipEnvironment;
  productId: AppleMembershipProductId;
  originalTransactionId: string;
  status: AppleMembershipStatus;
  expiresAt: string | null;
  offerState: AppleMembershipOfferState;
  orderedEventAt: string;
};

export type AppleMembershipRecord = AppleMembershipSnapshot & {
  lastProviderEventId: string | null;
  createdAt: string;
  updatedAt: string;
  lastReconciledAt: string;
  projectedAt: string | null;
};

export type AppleMembershipApplyOutcome = "applied" | "duplicate" | "stale" | "ownership_mismatch" | "event_conflict";

export interface AppleMembershipRepository {
  applyTransition(input: AppleMembershipSnapshot & { providerEventId: string | null; receivedAt: string }): Promise<{
    outcome: AppleMembershipApplyOutcome;
    record: AppleMembershipRecord;
  }>;
  markProjected(originalTransactionId: string, clerkUserId: string, projectedAt: string): Promise<void>;
  readCurrentForUser(clerkUserId: string): Promise<AppleMembershipRecord | null>;
  readByOriginalTransactionId(originalTransactionId: string): Promise<AppleMembershipRecord | null>;
}

export type AppleMembershipErrorCode =
  | "BACKEND_NOT_CONFIGURED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_RESPONSE_INVALID"
  | "PRODUCT_NOT_ALLOWED"
  | "PURCHASE_OWNED_BY_ANOTHER_ACCOUNT"
  | "PROVIDER_EVENT_CONFLICT"
  | "MEMBERSHIP_AUTHORITY_CHANGED"
  | "TRIAL_ALREADY_USED"
  | "NO_APPLE_SUBSCRIPTION";

export class AppleMembershipError extends Error {
  constructor(readonly code: AppleMembershipErrorCode, message: string) {
    super(message);
    this.name = "AppleMembershipError";
  }
}

const PRODUCT_TO_PLAN: Record<AppleMembershipProductId, Exclude<BillingPlanId, "bib_lifetime">> = {
  "com.bourbonsignal.app.standard.monthly": "standard_monthly",
  "com.bourbonsignal.app.standard.annual": "standard_annual",
  "com.bourbonsignal.app.barrel.monthly": "barrel_monthly",
  "com.bourbonsignal.app.barrel.annual": "barrel_annual",
};

const STATUS_PRIORITY: Record<AppleMembershipStatus, number> = {
  trialing: 20,
  active: 30,
  grace_period: 40,
  canceled_period_end: 50,
  billing_issue: 60,
  expired: 70,
  refunded: 90,
  revoked: 100,
};

const TIER_PRIORITY: Record<MembershipTier, number> = { free: 0, standard: 1, barrel: 2, "bottled-in-bond": 3 };
const PRODUCT_SET = new Set<string>(APPLE_MEMBERSHIP_PRODUCT_IDS);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validTimestamp(value: string | null) {
  return value === null || Number.isFinite(Date.parse(value));
}

function assertSnapshot(input: AppleMembershipSnapshot) {
  if (!input.clerkUserId.trim() || !input.originalTransactionId.trim()) {
    throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat returned incomplete purchase ownership.");
  }
  if (!PRODUCT_SET.has(input.productId)) {
    throw new AppleMembershipError("PRODUCT_NOT_ALLOWED", "RevenueCat returned a product that is not enabled for Apple membership.");
  }
  if (!validTimestamp(input.expiresAt) || !validTimestamp(input.orderedEventAt)) {
    throw new AppleMembershipError("PROVIDER_RESPONSE_INVALID", "RevenueCat returned invalid subscription timing.");
  }
  if (input.offerState === "introductory_trial" && !input.productId.endsWith(".monthly")) {
    throw new AppleMembershipError("PRODUCT_NOT_ALLOWED", "An annual Apple membership cannot carry a trial.");
  }
}

export function isAppleMembershipProductId(value: unknown): value is AppleMembershipProductId {
  return typeof value === "string" && PRODUCT_SET.has(value);
}

export function appleMembershipPlanForProduct(value: unknown) {
  return isAppleMembershipProductId(value) ? PRODUCT_TO_PLAN[value] : null;
}

export function appleMembershipStatusPriority(status: AppleMembershipStatus) {
  return STATUS_PRIORITY[status];
}

export function decideAppleMembershipTransition(existing: AppleMembershipRecord | null, incoming: AppleMembershipSnapshot): "apply" | "stale" {
  assertSnapshot(incoming);
  if (!existing) return "apply";
  const incomingTime = Date.parse(incoming.orderedEventAt);
  const existingTime = Date.parse(existing.orderedEventAt);
  if (incomingTime > existingTime) return "apply";
  if (incomingTime < existingTime) return "stale";
  return STATUS_PRIORITY[incoming.status] > STATUS_PRIORITY[existing.status] ? "apply" : "stale";
}

function isAppleStatusAccessActive(record: AppleMembershipRecord, now: Date) {
  if (!["trialing", "active", "canceled_period_end", "grace_period"].includes(record.status)) return false;
  if (!record.expiresAt) return false;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry > now.getTime();
}

export function appleMembershipAccessTier(record: AppleMembershipRecord, now = new Date()): MembershipTier {
  if (!isAppleStatusAccessActive(record, now)) return "free";
  const plan = appleMembershipPlanForProduct(record.productId);
  return plan ? BILLING_PLAN_TO_TIER[plan] : "free";
}

function activeStripeMembership(publicMetadata: Record<string, unknown>, privateMetadata: Record<string, unknown>) {
  const privatePlan = normalizeBillingPlan(privateMetadata.stripePlan);
  const privateStatus = stringValue(privateMetadata.stripeMembershipStatus);
  if (privatePlan && privatePlan !== "bib_lifetime"
    && isMembershipAccessActive(BILLING_PLAN_TO_TIER[privatePlan], privateStatus, privatePlan)) {
    return { tier: BILLING_PLAN_TO_TIER[privatePlan], plan: privatePlan, status: privateStatus };
  }
  const publicPlan = normalizeBillingPlan(publicMetadata.plan || publicMetadata.billingPlan);
  const publicStatus = stringValue(publicMetadata.membershipStatus);
  if (!publicPlan || publicPlan === "bib_lifetime"
    || !isMembershipAccessActive(BILLING_PLAN_TO_TIER[publicPlan], publicStatus, publicPlan)) return null;
  return { tier: BILLING_PLAN_TO_TIER[publicPlan], plan: publicPlan, status: publicStatus };
}

function publicStatusForApple(record: AppleMembershipRecord) {
  return record.status === "trialing" ? "trialing" : "active";
}

export function projectAppleMembershipMetadata(input: {
  membership: AppleMembershipRecord;
  publicMetadata: Record<string, unknown>;
  privateMetadata: Record<string, unknown>;
  now: string;
}) {
  const { membership, publicMetadata, privateMetadata, now } = input;
  assertSnapshot(membership);
  const appleTier = appleMembershipAccessTier(membership, new Date(now));
  const applePlan = appleMembershipPlanForProduct(membership.productId)!;
  const appleCandidate = appleTier === "free" ? null : { tier: appleTier, plan: applePlan, status: publicStatusForApple(membership) };
  const stripeCandidate = activeStripeMembership(publicMetadata, privateMetadata);
  const underlying = [appleCandidate, stripeCandidate]
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => TIER_PRIORITY[b.tier] - TIER_PRIORITY[a.tier])[0] || { tier: "free" as const, plan: "free" as const, status: "canceled" as const };

  const publicPatch: Record<string, unknown> = {
    appleMembershipTier: appleTier,
    appleMembershipPlan: applePlan,
    appleMembershipStatus: membership.status,
    appleMembershipExpiresAt: membership.expiresAt,
    appleMembershipUpdatedAt: now,
  };
  const privatePatch: Record<string, unknown> = {
    appleMembershipProductId: membership.productId,
    appleMembershipStatus: membership.status,
    appleMembershipEnvironment: membership.environment,
    appleMembershipExpiresAt: membership.expiresAt,
    appleMembershipOfferState: membership.offerState,
    appleMembershipUpdatedAt: membership.updatedAt,
    appleMembershipProjectedAt: now,
  };

  const rawTier = normalizeMembershipTier(publicMetadata.tier || publicMetadata.membershipTier);
  const rawPlan = stringValue(publicMetadata.plan) || stringValue(publicMetadata.billingPlan);
  const founder = rawTier === "bottled-in-bond" || rawPlan === "bib_lifetime" || Boolean(publicMetadata.directFounderCheckoutAttemptId) || Boolean(publicMetadata.founderNumber);
  if (founder) return { publicMetadata: publicPatch, privateMetadata: privatePatch, effectiveTier: "bottled-in-bond" as const };

  if (hasActiveGiftMembership(publicMetadata, new Date(now))) {
    return {
      publicMetadata: publicPatch,
      privateMetadata: privatePatch,
      effectiveTier: rawTier,
    };
  }

  return {
    publicMetadata: publicPatch,
    privateMetadata: privatePatch,
    effectiveTier: underlying.tier,
  };
}

export function applePurchaseAccountBlocker(publicMetadata: Record<string, unknown>, privateMetadata: Record<string, unknown>) {
  const tier = normalizeMembershipTier(publicMetadata.tier || publicMetadata.membershipTier);
  const plan = stringValue(publicMetadata.plan) || stringValue(publicMetadata.billingPlan);
  if (tier === "bottled-in-bond" || plan === "bib_lifetime" || publicMetadata.founderNumber) return "active_founder" as const;
  if (hasActiveGiftMembership(publicMetadata)) return "active_gift" as const;
  if (activeStripeMembership(publicMetadata, privateMetadata)) return "active_stripe_subscription" as const;
  return null;
}

export function createAppleMembershipReconciler(dependencies: {
  repository: AppleMembershipRepository;
  fetchCurrentSubscriber: (clerkUserId: string) => Promise<AppleMembershipSnapshot | null>;
  claimAuthoritativeTrial: (input: {
    userId: string;
    originalTransactionId: string;
    productId: AppleMembershipProductId;
    startedAt: string;
    expiresAt: string | null;
  }) => Promise<{ accepted: boolean }>;
  projectMembership: (record: AppleMembershipRecord) => Promise<MembershipTier>;
  now?: () => string;
}) {
  const now = dependencies.now || (() => new Date().toISOString());
  return {
    async reconcile(input: { clerkUserId: string; providerEventId: string | null }) {
      let current: AppleMembershipSnapshot | null;
      try {
        current = await dependencies.fetchCurrentSubscriber(input.clerkUserId);
      } catch (error) {
        if (error instanceof AppleMembershipError) throw error;
        throw new AppleMembershipError("PROVIDER_UNAVAILABLE", "RevenueCat subscription verification is temporarily unavailable.");
      }
      if (!current) throw new AppleMembershipError("NO_APPLE_SUBSCRIPTION", "No Apple membership was found for this account.");
      if (current.clerkUserId !== input.clerkUserId) {
        throw new AppleMembershipError("PURCHASE_OWNED_BY_ANOTHER_ACCOUNT", "This Apple purchase belongs to a different Bourbon Signal account.");
      }
      assertSnapshot(current);
      const receivedAt = now();
      const persisted = await dependencies.repository.applyTransition({ ...current, providerEventId: input.providerEventId, receivedAt });
      if (persisted.outcome === "ownership_mismatch") {
        throw new AppleMembershipError("PURCHASE_OWNED_BY_ANOTHER_ACCOUNT", "This Apple purchase belongs to a different Bourbon Signal account.");
      }
      if (persisted.outcome === "event_conflict") {
        throw new AppleMembershipError("PROVIDER_EVENT_CONFLICT", "RevenueCat event ownership conflicted with a prior event.");
      }
      if (persisted.record.status === "trialing" && persisted.record.offerState === "introductory_trial") {
        const trial = await dependencies.claimAuthoritativeTrial({
          userId: persisted.record.clerkUserId,
          originalTransactionId: persisted.record.originalTransactionId,
          productId: persisted.record.productId,
          startedAt: persisted.record.orderedEventAt,
          expiresAt: persisted.record.expiresAt,
        });
        if (!trial.accepted) {
          throw new AppleMembershipError("TRIAL_ALREADY_USED", "This Bourbon Signal account has already used its membership trial.");
        }
      }
      const effectiveTier = await dependencies.projectMembership(persisted.record);
      await dependencies.repository.markProjected(persisted.record.originalTransactionId, persisted.record.clerkUserId, receivedAt);
      return { outcome: persisted.outcome, effectiveTier, membership: persisted.record };
    },
  };
}

export function createAppleMembershipProjector(dependencies: {
  getUser: (userId: string) => Promise<{ publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown> }>;
  updateUserMetadata: (userId: string, input: { publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown> }) => Promise<unknown>;
  now?: () => string;
}) {
  const now = dependencies.now || (() => new Date().toISOString());
  return async function projectMembership(record: AppleMembershipRecord) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user = await dependencies.getUser(record.clerkUserId);
      const projectionNow = now();
      const projection = projectAppleMembershipMetadata({
        membership: record,
        publicMetadata: user.publicMetadata || {},
        privateMetadata: user.privateMetadata || {},
        now: projectionNow,
      });
      const confirmation = await dependencies.getUser(record.clerkUserId);
      if (membershipAuthorityFingerprint(user) !== membershipAuthorityFingerprint(confirmation)) continue;
      await dependencies.updateUserMetadata(record.clerkUserId, {
        ...(Object.keys(projection.publicMetadata).length ? { publicMetadata: projection.publicMetadata } : {}),
        privateMetadata: projection.privateMetadata,
      });
      return projection.effectiveTier;
    }
    throw new AppleMembershipError("MEMBERSHIP_AUTHORITY_CHANGED", "Membership authority changed while Apple access was being reconciled. Retry safely.");
  };
}

function membershipAuthorityFingerprint(user: { publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown> }) {
  const publicMetadata = user.publicMetadata || {};
  const privateMetadata = user.privateMetadata || {};
  return JSON.stringify([
    publicMetadata.tier,
    publicMetadata.membershipTier,
    publicMetadata.plan,
    publicMetadata.billingPlan,
    publicMetadata.membershipStatus,
    publicMetadata.membershipUpdatedAt,
    publicMetadata.founderNumber,
    publicMetadata.directFounderCheckoutAttemptId,
    publicMetadata.giftOrderId,
    publicMetadata.giftAccessExpiresAt,
    privateMetadata.stripePlan,
    privateMetadata.stripeMembershipStatus,
    privateMetadata.appleMembershipProductId,
    privateMetadata.appleMembershipProjectedAt,
  ]);
}

export function createAppleMembershipRepair(dependencies: {
  repository: AppleMembershipRepository;
  fetchCurrentSubscriber: (clerkUserId: string) => Promise<AppleMembershipSnapshot | null>;
  reconciler: ReturnType<typeof createAppleMembershipReconciler>;
}) {
  return async function repair(input: { clerkUserId: string; dryRun?: boolean }) {
    const dryRun = input.dryRun !== false;
    if (!dryRun) return dependencies.reconciler.reconcile({ clerkUserId: input.clerkUserId, providerEventId: null });
    const fetched = await dependencies.fetchCurrentSubscriber(input.clerkUserId);
    if (!fetched) return { dryRun: true as const, action: "none" as const };
    const owner = await dependencies.repository.readByOriginalTransactionId(fetched.originalTransactionId);
    if (owner && owner.clerkUserId !== input.clerkUserId) {
      return {
        dryRun: true as const,
        action: "ownership_mismatch" as const,
        status: fetched.status,
        productId: fetched.productId,
        environment: fetched.environment,
      };
    }
    const existing = await dependencies.repository.readCurrentForUser(input.clerkUserId);
    const action = existing && existing.originalTransactionId !== fetched.originalTransactionId
      ? "new_transaction"
      : decideAppleMembershipTransition(existing, fetched);
    return {
      dryRun: true as const,
      action,
      status: fetched.status,
      productId: fetched.productId,
      environment: fetched.environment,
    };
  };
}
