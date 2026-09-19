import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import {
  APPLE_MEMBERSHIP_PRODUCT_IDS,
  AppleMembershipError,
  appleMembershipAccessTier,
  appleMembershipPlanForProduct,
  createAppleMembershipProjector,
  createAppleMembershipRepair,
  createAppleMembershipReconciler,
  decideAppleMembershipTransition,
  projectAppleMembershipMetadata,
  type AppleMembershipRecord,
  type AppleMembershipRepository,
  type AppleMembershipSnapshot,
} from "../src/lib/apple-membership.ts";
import { PostgresAppleMembershipRepository } from "../src/lib/apple-membership-repository.ts";
import { resolveEffectiveMembershipTier } from "../src/lib/entitlements.ts";
import {
  createRevenueCatWebhookHandler,
  normalizeRevenueCatSubscriber,
  revenueCatConfiguration,
} from "../src/lib/revenuecat.ts";

const USER_A = "user_owner_a";
const USER_B = "user_owner_b";
const ORIGINAL = "original_transaction_private_value";
const EVENT = "provider_event_private_value";
const BASE_TIME = "2026-09-13T20:00:00.000Z";

function snapshot(overrides: Partial<AppleMembershipSnapshot> = {}): AppleMembershipSnapshot {
  return {
    clerkUserId: USER_A,
    environment: "sandbox",
    productId: "com.bourbonsignal.app.standard.monthly",
    originalTransactionId: ORIGINAL,
    status: "active",
    expiresAt: "2026-10-13T20:00:00.000Z",
    offerState: "none",
    orderedEventAt: BASE_TIME,
    ...overrides,
  };
}

function recordFrom(input: AppleMembershipSnapshot, now = input.orderedEventAt): AppleMembershipRecord {
  return {
    ...input,
    lastProviderEventId: null,
    createdAt: now,
    updatedAt: now,
    lastReconciledAt: now,
    projectedAt: null,
  };
}

class MemoryRepository implements AppleMembershipRepository {
  readonly records = new Map<string, AppleMembershipRecord>();
  readonly events = new Map<string, { owner: string; original: string }>();
  readonly calls: string[];

  constructor(calls: string[] = []) { this.calls = calls; }

  async applyTransition(input: AppleMembershipSnapshot & { providerEventId: string | null; receivedAt: string }) {
    this.calls.push("database");
    if (input.providerEventId) {
      const priorEvent = this.events.get(input.providerEventId);
      if (priorEvent) {
        const current = this.records.get(priorEvent.original)!;
        return { outcome: priorEvent.owner === input.clerkUserId ? "duplicate" as const : "event_conflict" as const, record: current };
      }
    }
    const existing = this.records.get(input.originalTransactionId) || null;
    if (existing && existing.clerkUserId !== input.clerkUserId) {
      return { outcome: "ownership_mismatch" as const, record: existing };
    }
    const decision = decideAppleMembershipTransition(existing, input);
    const next = decision === "apply"
      ? {
          ...recordFrom(input, input.receivedAt),
          createdAt: existing?.createdAt || input.receivedAt,
          lastProviderEventId: input.providerEventId,
        }
      : existing!;
    if (decision === "apply") this.records.set(input.originalTransactionId, next);
    if (input.providerEventId) this.events.set(input.providerEventId, { owner: input.clerkUserId, original: input.originalTransactionId });
    return { outcome: decision === "apply" ? "applied" as const : "stale" as const, record: next };
  }

  async markProjected(originalTransactionId: string, owner: string, projectedAt: string) {
    this.calls.push("projection_audit");
    const current = this.records.get(originalTransactionId);
    if (current?.clerkUserId === owner) this.records.set(originalTransactionId, { ...current, projectedAt });
  }

  async readCurrentForUser(userId: string) {
    return [...this.records.values()]
      .filter((item) => item.clerkUserId === userId)
      .sort((a, b) => b.orderedEventAt.localeCompare(a.orderedEventAt))[0] || null;
  }

  async readByOriginalTransactionId(originalTransactionId: string) {
    return this.records.get(originalTransactionId) || null;
  }
}

test("Apple product authority is exactly the four Standard and Barrel products", () => {
  assert.deepEqual([...APPLE_MEMBERSHIP_PRODUCT_IDS], [
    "com.bourbonsignal.app.standard.monthly",
    "com.bourbonsignal.app.standard.annual",
    "com.bourbonsignal.app.barrel.monthly",
    "com.bourbonsignal.app.barrel.annual",
  ]);
  assert.equal(appleMembershipPlanForProduct("com.bourbonsignal.app.barrel.annual"), "barrel_annual");
  assert.equal(appleMembershipPlanForProduct("com.bourbonsignal.app.founder.lifetime"), null);
});

test("monotonic ordering rejects stale state and gives equal-timestamp cancellation and revocation precedence", () => {
  const active = recordFrom(snapshot());
  assert.equal(decideAppleMembershipTransition(active, snapshot({ orderedEventAt: "2026-09-13T19:59:59.000Z", status: "revoked" })), "stale");
  assert.equal(decideAppleMembershipTransition(active, snapshot({ status: "canceled_period_end" })), "apply");
  assert.equal(decideAppleMembershipTransition(recordFrom(snapshot({ status: "canceled_period_end" })), snapshot({ status: "active" })), "stale");
  assert.equal(decideAppleMembershipTransition(recordFrom(snapshot({ status: "refunded" })), snapshot({ status: "revoked" })), "apply");
  assert.equal(decideAppleMembershipTransition(recordFrom(snapshot({ status: "revoked" })), snapshot({ status: "refunded" })), "stale");
});

test("initial purchase, trial, renewal, product changes, cancellation, grace, billing issue, expiration, refund, and revocation converge", async () => {
  const repository = new MemoryRepository();
  const trialClaims: string[] = [];
  const snapshots = [
    snapshot({ status: "trialing", offerState: "introductory_trial", orderedEventAt: "2026-09-13T20:01:00.000Z" }),
    snapshot({ status: "active", orderedEventAt: "2026-09-20T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.barrel.monthly", status: "active", orderedEventAt: "2026-09-21T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "active", orderedEventAt: "2026-09-22T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "canceled_period_end", orderedEventAt: "2026-09-23T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "grace_period", orderedEventAt: "2026-10-13T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "billing_issue", orderedEventAt: "2026-10-14T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "active", orderedEventAt: "2026-10-15T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "expired", orderedEventAt: "2027-09-22T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "refunded", orderedEventAt: "2027-09-23T20:01:00.000Z" }),
    snapshot({ productId: "com.bourbonsignal.app.standard.annual", status: "revoked", orderedEventAt: "2027-09-23T20:01:00.000Z" }),
  ];
  let index = 0;
  const reconciler = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber: async () => snapshots[index++],
    claimAuthoritativeTrial: async (input) => { trialClaims.push(input.productId); return { accepted: true }; },
    projectMembership: async (stored) => appleMembershipAccessTier(stored, new Date("2026-09-24T00:00:00.000Z")),
    now: () => "2026-09-24T00:00:00.000Z",
  });
  const expected = ["standard", "standard", "barrel", "standard", "standard", "standard", "free", "standard", "free", "free", "free"];
  for (let i = 0; i < snapshots.length; i += 1) {
    const result = await reconciler.reconcile({ clerkUserId: USER_A, providerEventId: `event_${i}` });
    assert.equal(result.effectiveTier, expected[i]);
  }
  assert.deepEqual(trialClaims, ["com.bourbonsignal.app.standard.monthly"]);
  assert.equal(repository.records.get(ORIGINAL)?.status, "revoked");
});

test("duplicate and out-of-order events are idempotent and reproject the durable current record", async () => {
  const repository = new MemoryRepository();
  let fetched = snapshot({ orderedEventAt: "2026-09-14T00:00:00.000Z", productId: "com.bourbonsignal.app.barrel.monthly" });
  const projected: string[] = [];
  const reconciler = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber: async () => fetched,
    claimAuthoritativeTrial: async () => ({ accepted: true }),
    projectMembership: async (stored) => { projected.push(stored.productId); return appleMembershipAccessTier(stored); },
    now: () => "2026-09-14T01:00:00.000Z",
  });
  await reconciler.reconcile({ clerkUserId: USER_A, providerEventId: EVENT });
  fetched = snapshot({ orderedEventAt: "2026-09-13T00:00:00.000Z" });
  const duplicate = await reconciler.reconcile({ clerkUserId: USER_A, providerEventId: EVENT });
  const stale = await reconciler.reconcile({ clerkUserId: USER_A, providerEventId: "event_stale" });
  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(stale.outcome, "stale");
  assert.equal(repository.records.get(ORIGINAL)?.productId, "com.bourbonsignal.app.barrel.monthly");
  assert.deepEqual(projected, Array(3).fill("com.bourbonsignal.app.barrel.monthly"));
});

test("restore cannot transfer an original transaction to another Clerk owner", async () => {
  const repository = new MemoryRepository();
  repository.records.set(ORIGINAL, recordFrom(snapshot()));
  const reconciler = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber: async () => snapshot({ clerkUserId: USER_B }),
    claimAuthoritativeTrial: async () => ({ accepted: true }),
    projectMembership: async () => "free",
    now: () => BASE_TIME,
  });
  await assert.rejects(
    reconciler.reconcile({ clerkUserId: USER_B, providerEventId: "restore_event" }),
    (error: unknown) => error instanceof AppleMembershipError && error.code === "PURCHASE_OWNED_BY_ANOTHER_ACCOUNT",
  );
});

test("provider fetch and product validation fail before database or Clerk mutation", async () => {
  const calls: string[] = [];
  const repository = new MemoryRepository(calls);
  const failing = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber: async () => { calls.push("provider"); throw new Error("provider down"); },
    claimAuthoritativeTrial: async () => ({ accepted: true }),
    projectMembership: async () => { calls.push("clerk"); return "free"; },
    now: () => BASE_TIME,
  });
  await assert.rejects(failing.reconcile({ clerkUserId: USER_A, providerEventId: EVENT }));
  assert.deepEqual(calls, ["provider"]);

  const disallowed = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber: async () => ({ ...snapshot(), productId: "com.bourbonsignal.app.founder.lifetime" as never }),
    claimAuthoritativeTrial: async () => ({ accepted: true }),
    projectMembership: async () => { calls.push("clerk"); return "free"; },
    now: () => BASE_TIME,
  });
  await assert.rejects(disallowed.reconcile({ clerkUserId: USER_A, providerEventId: "bad_product" }), /product/i);
  assert.deepEqual(calls, ["provider"]);
});

test("durable transition and trial claim precede Clerk projection", async () => {
  const calls: string[] = [];
  const repository = new MemoryRepository(calls);
  const reconciler = createAppleMembershipReconciler({
    repository,
    fetchCurrentSubscriber: async () => { calls.push("provider"); return snapshot({ status: "trialing", offerState: "introductory_trial" }); },
    claimAuthoritativeTrial: async () => { calls.push("trial"); return { accepted: true }; },
    projectMembership: async () => { calls.push("clerk"); return "standard"; },
    now: () => BASE_TIME,
  });
  await reconciler.reconcile({ clerkUserId: USER_A, providerEventId: EVENT });
  assert.deepEqual(calls, ["provider", "database", "trial", "clerk", "projection_audit"]);
});

test("Clerk projection uses a provider-specific overlay and never overwrites Founder, gift, or Stripe authority", () => {
  const appleBarrel = recordFrom(snapshot({ productId: "com.bourbonsignal.app.barrel.monthly" }));
  const founder = projectAppleMembershipMetadata({
    membership: appleBarrel,
    publicMetadata: { tier: "bottled-in-bond", plan: "bib_lifetime", membershipStatus: "lifetime", founderNumber: 7 },
    privateMetadata: { stripeSubscriptionId: "stripe_private" },
    now: BASE_TIME,
  });
  assert.equal(founder.publicMetadata.appleMembershipTier, "barrel");
  assert.equal(founder.publicMetadata.tier, undefined);
  assert.equal(founder.publicMetadata.plan, undefined);
  assert.equal(founder.publicMetadata.membershipStatus, undefined);
  assert.equal(founder.privateMetadata.stripeSubscriptionId, undefined);
  assert.equal(founder.privateMetadata.appleMembershipStatus, "active");

  const gift = projectAppleMembershipMetadata({
    membership: appleBarrel,
    publicMetadata: { tier: "standard", plan: "gift_standard_annual", membershipStatus: "active", giftOrderId: "gift_private", giftAccessExpiresAt: "2027-01-01T00:00:00.000Z" },
    privateMetadata: {},
    now: BASE_TIME,
  });
  assert.equal((gift.publicMetadata as Record<string, unknown>).giftPreviousMembership, undefined);
  assert.equal((gift.publicMetadata as Record<string, unknown>).appleMembershipTier, "barrel");
  assert.equal(gift.effectiveTier, "standard");

  const expiredApple = recordFrom(snapshot({ status: "expired", expiresAt: "2026-09-01T00:00:00.000Z" }));
  const stripe = projectAppleMembershipMetadata({
    membership: expiredApple,
    publicMetadata: { tier: "barrel", plan: "barrel_monthly", membershipStatus: "active", membershipUpdatedAt: "2026-09-13T20:05:00.000Z" },
    privateMetadata: { appleMembershipProductId: "com.bourbonsignal.app.barrel.monthly", appleMembershipProjectedAt: "2026-09-13T20:00:00.000Z" },
    now: BASE_TIME,
  });
  assert.equal((stripe.publicMetadata as Record<string, unknown>).appleMembershipTier, "free");
  assert.equal((stripe.publicMetadata as Record<string, unknown>).tier, undefined, "Apple must not overwrite public Stripe authority");
  assert.equal(stripe.effectiveTier, "barrel");
  assert.equal(stripe.privateMetadata.stripeSubscriptionId, undefined);

  const appleOnly = projectAppleMembershipMetadata({
    membership: appleBarrel,
    publicMetadata: { tier: "free", plan: "free", membershipStatus: "free" },
    privateMetadata: {},
    now: BASE_TIME,
  });
  assert.equal(appleOnly.publicMetadata.appleMembershipTier, "barrel");
  assert.equal(appleOnly.effectiveTier, "barrel");

  assert.equal(resolveEffectiveMembershipTier({
    tier: "free",
    plan: "free",
    membershipStatus: "free",
    appleMembershipTier: "standard",
    appleMembershipPlan: "standard_monthly",
    appleMembershipStatus: "active",
    appleMembershipExpiresAt: "2026-10-13T20:00:00.000Z",
  }, new Date(BASE_TIME)), "standard");
  assert.equal(resolveEffectiveMembershipTier({
    tier: "free",
    plan: "free",
    membershipStatus: "free",
    appleMembershipTier: "standard",
    appleMembershipPlan: "standard_monthly",
    appleMembershipStatus: "expired",
    appleMembershipExpiresAt: "2026-09-01T00:00:00.000Z",
  }, new Date(BASE_TIME)), "free");
});

test("Clerk projection retries when Founder, gift, or Stripe authority changes during its read/write window", async () => {
  const reads = [
    { publicMetadata: { tier: "free", plan: "free", membershipStatus: "free" }, privateMetadata: {} },
    { publicMetadata: { tier: "bottled-in-bond", plan: "bib_lifetime", membershipStatus: "lifetime", founderNumber: 9 }, privateMetadata: {} },
  ];
  const writes: Array<{ publicMetadata?: Record<string, unknown>; privateMetadata?: Record<string, unknown> }> = [];
  const projector = createAppleMembershipProjector({
    getUser: async () => reads.shift() || { publicMetadata: { tier: "bottled-in-bond", plan: "bib_lifetime", membershipStatus: "lifetime", founderNumber: 9 }, privateMetadata: {} },
    updateUserMetadata: async (_userId, metadata) => { writes.push(metadata); },
    now: () => BASE_TIME,
  });
  assert.equal(await projector(recordFrom(snapshot())), "bottled-in-bond");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].publicMetadata?.tier, undefined, "Apple must never write the generic Founder/Stripe/gift authority keys");
  assert.equal(writes[0].publicMetadata?.appleMembershipTier, "standard");
});

test("configuration is dormant without all server credentials, exact products, and the no-intro-offer attestation", () => {
  assert.deepEqual(revenueCatConfiguration({}), { ready: false, blocker: "server_credentials_missing" });
  assert.deepEqual(revenueCatConfiguration({ REVENUECAT_SERVER_API_KEY: "configured", REVENUECAT_WEBHOOK_SECRET: "configured" }), { ready: false, blocker: "products_not_configured" });
  const products = APPLE_MEMBERSHIP_PRODUCT_IDS.join(",");
  assert.deepEqual(revenueCatConfiguration({ REVENUECAT_SERVER_API_KEY: "configured", REVENUECAT_WEBHOOK_SECRET: "configured", REVENUECAT_APPLE_PRODUCT_IDS: products }), { ready: false, blocker: "storekit_trial_policy_unconfirmed" });
  assert.equal(revenueCatConfiguration({ REVENUECAT_SERVER_API_KEY: "configured", REVENUECAT_WEBHOOK_SECRET: "configured", REVENUECAT_APPLE_PRODUCT_IDS: products, REVENUECAT_APPLE_TRIAL_POLICY: "intro_offers_disabled" }).ready, true);
});

test("RevenueCat subscriber normalization uses exact fetched owner and current subscription state", () => {
  const normalized = normalizeRevenueCatSubscriber(USER_A, {
    subscriber: {
      original_app_user_id: USER_A,
      subscriptions: {
        "com.bourbonsignal.app.standard.monthly": {
          original_transaction_id: ORIGINAL,
          is_sandbox: true,
          period_type: "trial",
          purchase_date: "2026-09-13T20:00:00Z",
          expires_date: "2026-09-20T20:00:00Z",
        },
      },
    },
  });
  assert.equal(normalized.status, "trialing");
  assert.equal(normalized.offerState, "introductory_trial");
  assert.equal(normalized.clerkUserId, USER_A);
  assert.throws(() => normalizeRevenueCatSubscriber(USER_B, { subscriber: { original_app_user_id: USER_A, subscriptions: {} } }), /owner/i);
  assert.throws(() => normalizeRevenueCatSubscriber(USER_A, { subscriber: { original_app_user_id: USER_A, subscriptions: { "com.bourbonsignal.app.founder.lifetime": {} } } }), /product/i);
});

test("RevenueCat webhook rejects missing configuration, bad authorization, malformed bodies, and provider failures", async () => {
  const unavailable = createRevenueCatWebhookHandler({ secret: null, reconcile: async () => ({ outcome: "applied", effectiveTier: "standard" }) });
  assert.equal((await unavailable(new Request("https://example.invalid/api", { method: "POST" }))).status, 503);

  let calls = 0;
  const handler = createRevenueCatWebhookHandler({ secret: "dedicated-secret", reconcile: async () => { calls += 1; throw new Error("provider unavailable"); } });
  assert.equal((await handler(new Request("https://example.invalid/api", { method: "POST", headers: { authorization: "wrong" }, body: "{}" }))).status, 401);
  assert.equal((await handler(new Request("https://example.invalid/api", { method: "POST", headers: { authorization: "dedicated-secret" }, body: "{}" }))).status, 400);
  const valid = new Request("https://example.invalid/api", {
    method: "POST",
    headers: { authorization: "dedicated-secret", "content-type": "application/json" },
    body: JSON.stringify({ event: { id: EVENT, app_user_id: USER_A, type: "RENEWAL", event_timestamp_ms: 1789330000000 } }),
  });
  assert.equal((await handler(valid)).status, 503);
  assert.equal(calls, 1);
});

test("Postgres repository uses positional parameters and never interpolates transaction identifiers", async () => {
  const seen: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const repository = new PostgresAppleMembershipRepository({
    query: async (sql: string, params?: unknown[]) => {
      seen.push({ sql, params });
      return [{ apply_outcome: "applied", ...{
        clerk_user_id: USER_A,
        environment: "sandbox",
        product_id: "com.bourbonsignal.app.standard.monthly",
        original_transaction_id: ORIGINAL,
        entitlement_status: "active",
        expires_at: "2026-10-13T20:00:00.000Z",
        offer_state: "none",
        ordered_event_at: BASE_TIME,
        last_provider_event_id: EVENT,
        created_at: BASE_TIME,
        updated_at: BASE_TIME,
        last_reconciled_at: BASE_TIME,
        projected_at: null,
      } }];
    },
  });
  await repository.applyTransition({ ...snapshot(), providerEventId: EVENT, receivedAt: BASE_TIME });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].params?.includes(ORIGINAL));
  assert.ok(seen[0].params?.includes(EVENT));
  assert.doesNotMatch(seen[0].sql, new RegExp(ORIGINAL));
  assert.doesNotMatch(seen[0].sql, new RegExp(EVENT));
  assert.match(seen[0].sql, /\$1/);
});

test("PostgreSQL schema and atomic transition query enforce event and transaction ownership", async () => {
  const database = new PGlite();
  try {
    await database.exec(await readFile(new URL("../src/lib/apple-membership-schema.sql", import.meta.url), "utf8"));
    const repository = new PostgresAppleMembershipRepository({
      query: async (sql, params = []) => (await database.query(sql, params)).rows as Array<Record<string, unknown>>,
    });
    const first = await repository.applyTransition({ ...snapshot(), providerEventId: EVENT, receivedAt: BASE_TIME });
    assert.equal(first.outcome, "applied");
    assert.equal((await repository.applyTransition({ ...snapshot(), providerEventId: EVENT, receivedAt: BASE_TIME })).outcome, "duplicate");
    assert.equal((await repository.applyTransition({ ...snapshot({ orderedEventAt: "2026-09-13T19:00:00.000Z", status: "revoked" }), providerEventId: "stale_event", receivedAt: BASE_TIME })).outcome, "stale");
    assert.equal((await repository.applyTransition({ ...snapshot({ status: "canceled_period_end" }), providerEventId: "cancel_event", receivedAt: BASE_TIME })).outcome, "applied");
    assert.equal((await repository.applyTransition({ ...snapshot({ clerkUserId: USER_B }), providerEventId: "restore_event", receivedAt: BASE_TIME })).outcome, "ownership_mismatch");
    const eventConflict = await repository.applyTransition({
      ...snapshot({ clerkUserId: USER_B, originalTransactionId: "other_original_transaction" }),
      providerEventId: EVENT,
      receivedAt: BASE_TIME,
    });
    assert.equal(eventConflict.outcome, "event_conflict");

    const parallelDatabase = new PGlite();
    try {
      await parallelDatabase.exec(await readFile(new URL("../src/lib/apple-membership-schema.sql", import.meta.url), "utf8"));
      const parallelRepository = new PostgresAppleMembershipRepository({
        query: async (sql, params = []) => (await parallelDatabase.query(sql, params)).rows as Array<Record<string, unknown>>,
      });
      const results = await Promise.allSettled([
        parallelRepository.applyTransition({ ...snapshot({ originalTransactionId: "parallel_original_a" }), providerEventId: "parallel_event", receivedAt: BASE_TIME }),
        parallelRepository.applyTransition({ ...snapshot({ clerkUserId: USER_B, originalTransactionId: "parallel_original_b" }), providerEventId: "parallel_event", receivedAt: BASE_TIME }),
      ]);
      const outcomes = results.map((result) => result.status === "fulfilled" ? result.value.outcome : "rejected").sort();
      assert.deepEqual(outcomes, ["applied", "event_conflict"]);
      const count = await parallelDatabase.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM apple_memberships");
      assert.equal(count.rows[0].count, 1, "one provider event can create only one durable membership");
    } finally {
      await parallelDatabase.close();
    }
  } finally {
    await database.close();
  }
});

test("repository resolves a concurrent event reservation from a fresh snapshot", async () => {
  const current = recordFrom(snapshot({ clerkUserId: USER_A, originalTransactionId: ORIGINAL }));
  const durable = {
    clerk_user_id: current.clerkUserId,
    environment: current.environment,
    product_id: current.productId,
    original_transaction_id: current.originalTransactionId,
    entitlement_status: current.status,
    expires_at: current.expiresAt,
    offer_state: current.offerState,
    ordered_event_at: current.orderedEventAt,
    last_provider_event_id: current.lastProviderEventId,
    created_at: current.createdAt,
    updated_at: current.updatedAt,
    last_reconciled_at: current.lastReconciledAt,
    projected_at: current.projectedAt,
  };
  let calls = 0;
  const repository = new PostgresAppleMembershipRepository({
    query: async (_sql: string, _params?: unknown[]) => {
      calls += 1;
      if (calls === 1) return [];
      return [{ ...durable, event_clerk_user_id: USER_A, event_original_transaction_id: ORIGINAL }];
    },
  });
  const conflict = await repository.applyTransition({
    ...snapshot({ clerkUserId: USER_B, originalTransactionId: "different_transaction" }),
    providerEventId: EVENT,
    receivedAt: BASE_TIME,
  });
  assert.equal(conflict.outcome, "event_conflict");
  assert.equal(conflict.record.clerkUserId, USER_A);
  assert.equal(calls, 2);
});

test("repair dry-run reports ownership mismatch without mutating", async () => {
  const repository = new MemoryRepository();
  repository.records.set(ORIGINAL, recordFrom(snapshot()));
  let reconciled = false;
  const repair = createAppleMembershipRepair({
    repository: repository as never,
    fetchCurrentSubscriber: async () => snapshot({ clerkUserId: USER_B }),
    reconciler: { reconcile: async () => { reconciled = true; throw new Error("must not run"); } } as never,
  });
  const result = await repair({ clerkUserId: USER_B });
  assert.equal("dryRun" in result && result.dryRun, true);
  assert.equal("action" in result ? result.action : null, "ownership_mismatch");
  assert.equal(reconciled, false);
});
