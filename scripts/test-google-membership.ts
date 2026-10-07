import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  GOOGLE_MEMBERSHIP_PRODUCT_IDS,
  normalizeGoogleRevenueCatSubscriber,
  googlePurchaseAccountBlocker,
  googleMembershipConfiguration,
  createGoogleSubscriberFetcher,
} from "../src/lib/google-membership";
import { PostgresAppleMembershipRepository } from "../src/lib/apple-membership-repository";
import {
  projectAppleMembershipMetadata,
  applePurchaseAccountBlocker,
} from "../src/lib/apple-membership";
import { resolveEffectiveMembershipTier } from "../src/lib/entitlements";
import { createAppleMembershipApiHandlers } from "../src/lib/apple-membership-api";
const now = new Date("2026-10-07T20:00:00Z"),
  expiry = "2026-11-07T20:00:00Z",
  sku = GOOGLE_MEMBERSHIP_PRODUCT_IDS[0];
function subscriber(overrides: Record<string, unknown> = {}) {
  return {
    subscriber: {
      original_app_user_id: "member-A",
      subscriptions: {
        [`${sku}:monthly`]: {
          store: "play_store",
          store_transaction_id: "GPA.1234-1234-1234-12345..3",
          base_plan_id: "monthly",
          is_sandbox: false,
          purchase_date: "2026-10-07T19:00:00Z",
          expires_date: expiry,
          period_type: "normal",
          ...overrides,
        },
      },
    },
  };
}
const options = { now };
test("Google verification requires the exact owner, Google store, monthly catalog and order authority", () => {
  const receipt = normalizeGoogleRevenueCatSubscriber(
    "member-A",
    subscriber(),
    options,
  );
  assert.equal(receipt.productId, sku);
  assert.equal(receipt.originalTransactionId, "GPA.1234-1234-1234-12345");
  assert.equal(receipt.status, "active");
  for (const change of [
    { store: "amazon" },
    { base_plan_id: "annual" },
    { store_transaction_id: "forged" },
    { expires_date: "invalid" },
  ])
    assert.throws(() =>
      normalizeGoogleRevenueCatSubscriber(
        "member-A",
        subscriber(change),
        options,
      ),
    );
  assert.throws(
    () =>
      normalizeGoogleRevenueCatSubscriber("member-B", subscriber(), options),
    /another account/,
  );
  assert.throws(
    () =>
      normalizeGoogleRevenueCatSubscriber(
        "member-A",
        subscriber({ is_sandbox: true }),
        options,
      ),
    /configured test/,
  );
  assert.equal(
    normalizeGoogleRevenueCatSubscriber(
      "member-A",
      subscriber({ is_sandbox: true }),
      { ...options, allowSandbox: true },
    ).environment,
    "sandbox",
  );
});
test("Google lifecycle honors paid-through cancellation and grace but expires, revokes and refunds access", () => {
  for (const [extra, status] of [
    [
      { unsubscribe_detected_at: "2026-10-07T19:30:00Z" },
      "canceled_period_end",
    ],
    [
      {
        billing_issues_detected_at: "2026-10-07T19:30:00Z",
        grace_period_expires_date: expiry,
      },
      "grace_period",
    ],
    [{ billing_issues_detected_at: "2026-10-07T19:30:00Z" }, "billing_issue"],
    [{ expires_date: "2026-10-01T00:00:00Z" }, "expired"],
    [{ refunded_at: "2026-10-07T19:30:00Z" }, "refunded"],
    [{ revoked_at: "2026-10-07T19:30:00Z" }, "revoked"],
  ] as const) {
    assert.equal(
      normalizeGoogleRevenueCatSubscriber(
        "member-A",
        subscriber(extra),
        options,
      ).status,
      status,
    );
  }
});
test("provider configuration is independent of Apple and fail-closed until launch or named testers", () => {
  const env = {
    REVENUECAT_SERVER_API_KEY: "server",
    REVENUECAT_WEBHOOK_SECRET: "webhook",
    REVENUECAT_GOOGLE_PRODUCT_IDS: GOOGLE_MEMBERSHIP_PRODUCT_IDS.join(","),
    REVENUECAT_GOOGLE_TRIAL_POLICY: "intro_offers_disabled",
    GOOGLE_PLAY_SANDBOX_USER_IDS: "member-A",
  };
  assert.equal(googleMembershipConfiguration(env, "member-A").ready, true);
  assert.equal(googleMembershipConfiguration(env, "member-B").ready, false);
  assert.equal(
    googleMembershipConfiguration(
      { ...env, GOOGLE_PLAY_BILLING_ENABLED: "true" },
      "member-B",
    ).ready,
    true,
  );
  assert.equal(
    googleMembershipConfiguration(
      { ...env, REVENUECAT_GOOGLE_TRIAL_POLICY: "enabled" },
      "member-A",
    ).ready,
    false,
  );
});
test("verification fetches only the authenticated subscriber from RevenueCat and fails on outage", async () => {
  const fetcher = createGoogleSubscriberFetcher({
    apiKey: "private-server",
    now: () => now,
    fetchImpl: (async (url, init) => {
      assert.equal(
        String(url),
        "https://api.revenuecat.com/v1/subscribers/member-A",
      );
      assert.equal(init?.cache, "no-store");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer private-server",
      );
      return Response.json(subscriber());
    }) as typeof fetch,
  });
  assert.equal((await fetcher("member-A")).status, "active");
  const offline = createGoogleSubscriberFetcher({
    apiKey: "private-server",
    fetchImpl: (async () =>
      new Response(null, { status: 503 })) as typeof fetch,
  });
  await assert.rejects(() => offline("member-A"), /unavailable/);
});
test("store projections preserve Founder/gift/earned and concurrent Apple/Stripe authority", () => {
  const snapshot = normalizeGoogleRevenueCatSubscriber(
      "member-A",
      subscriber(),
      options,
    ),
    record = {
      ...snapshot,
      lastProviderEventId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastReconciledAt: now.toISOString(),
      projectedAt: null,
    };
  const projected = projectAppleMembershipMetadata({
    membership: record,
    publicMetadata: { tier: "free" },
    privateMetadata: {},
    now: now.toISOString(),
    store: "google",
  });
  assert.equal(projected.publicMetadata.googleMembershipTier, "standard");
  assert.equal(projected.publicMetadata.appleMembershipTier, undefined);
  assert.equal(
    resolveEffectiveMembershipTier(
      { ...projected.publicMetadata, tier: "free" },
      now,
    ),
    "standard",
  );
  const google = { ...projected.publicMetadata, tier: "free" };
  assert.equal(
    applePurchaseAccountBlocker(google, {}),
    "active_google_subscription",
  );
  assert.equal(googlePurchaseAccountBlocker(google, {}), null);
  assert.equal(
    googlePurchaseAccountBlocker(
      {
        tier: "free",
        appleMembershipTier: "barrel",
        appleMembershipPlan: "barrel_monthly",
        appleMembershipStatus: "active",
        appleMembershipExpiresAt: expiry,
      },
      {},
    ),
    "active_apple_subscription",
  );
  for (const base of [
    { tier: "bottled-in-bond", plan: "bib_lifetime", founderNumber: 1 },
    {
      tier: "barrel",
      plan: "gift_barrel_annual",
      membershipStatus: "active",
      giftAccessExpiresAt: expiry,
    },
  ]) {
    const p = projectAppleMembershipMetadata({
      membership: {
        ...record,
        status: "expired",
        expiresAt: now.toISOString(),
      },
      publicMetadata: base,
      privateMetadata: {},
      now: now.toISOString(),
      store: "google",
    });
    assert.equal(p.effectiveTier, base.tier);
    assert.equal(p.publicMetadata.tier, undefined);
  }
  const apple = {
    tier: "free",
    appleMembershipTier: "barrel",
    appleMembershipPlan: "barrel_monthly",
    appleMembershipStatus: "active",
    appleMembershipExpiresAt: expiry,
  };
  assert.equal(
    projectAppleMembershipMetadata({
      membership: {
        ...record,
        status: "expired",
        expiresAt: now.toISOString(),
      },
      publicMetadata: apple,
      privateMetadata: {},
      now: now.toISOString(),
      store: "google",
    }).effectiveTier,
    "barrel",
  );
});
test("Google ledger atomically prevents transfer, conflicting replay and stale renewals", async () => {
  const db = new PGlite();
  await db.exec(
    readFileSync(
      new URL("../src/lib/google-membership-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  const repo = new PostgresAppleMembershipRepository(
    {
      query: async (sql, params) =>
        (await db.query(sql, params)).rows as Record<string, unknown>[],
    },
    "google",
  );
  const receipt = normalizeGoogleRevenueCatSubscriber(
      "member-A",
      subscriber(),
      options,
    ),
    input = {
      ...receipt,
      providerEventId: "google-event-1",
      receivedAt: now.toISOString(),
    };
  assert.equal((await repo.applyTransition(input)).outcome, "applied");
  assert.equal((await repo.applyTransition(input)).outcome, "duplicate");
  assert.equal(
    (
      await repo.applyTransition({
        ...input,
        clerkUserId: "member-B",
        providerEventId: "google-event-2",
      })
    ).outcome,
    "ownership_mismatch",
  );
  assert.equal(
    (
      await repo.applyTransition({
        ...input,
        orderedEventAt: "2026-10-01T00:00:00Z",
        providerEventId: "google-event-old",
      })
    ).outcome,
    "stale",
  );
  assert.equal((await repo.readCurrentForUser("member-A"))?.productId, sku);
  await db.close();
});
test("Google API rejects client-selected annual products and existing external subscriptions", async () => {
  let calls = 0;
  const receipt = normalizeGoogleRevenueCatSubscriber(
      "member-A",
      subscriber(),
      options,
    ),
    record = {
      ...receipt,
      lastProviderEventId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastReconciledAt: now.toISOString(),
      projectedAt: null,
    };
  const api = createAppleMembershipApiHandlers(
    {
      configuration: () => ({
        ready: true,
        apiKey: "server",
        webhookSecret: "secret",
      }),
      getAccount: async () => ({
        publicMetadata: { tier: "free" },
        privateMetadata: {
          stripePlan: "standard_monthly",
          stripeMembershipStatus: "active",
        },
      }),
      readCurrent: async () => null,
      reconcile: async () => {
        calls++;
        return {
          outcome: "applied",
          effectiveTier: "standard",
          membership: record,
        };
      },
    },
    {
      store: "google",
      accountBlocker: googlePurchaseAccountBlocker,
      productIds: GOOGLE_MEMBERSHIP_PRODUCT_IDS,
    },
  );
  assert.equal(
    (await (await api.readiness("member-A")).json()).available,
    false,
  );
  assert.equal(
    (
      await api.reconcile(
        new Request("https://example.test", {
          method: "POST",
          body: JSON.stringify({ action: "purchase", productId: sku }),
        }),
        "member-A",
      )
    ).status,
    409,
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await api.reconcile(
        new Request("https://example.test", {
          method: "POST",
          body: JSON.stringify({
            action: "purchase",
            productId: "com.bourbonsignal.app.standard.annual",
          }),
        }),
        "member-A",
      )
    ).status,
    422,
  );
});

test("RevenueCat webhook authenticates before dispatch and routes only supported stores", async () => {
  const { createRevenueCatWebhookHandler } =
    await import("../src/lib/revenuecat");
  const seen: unknown[] = [];
  const handler = createRevenueCatWebhookHandler({
    secret: "Bearer test-webhook-secret",
    reconcile: async (input) => {
      seen.push(input);
      return { outcome: "applied", effectiveTier: "standard" };
    },
  });
  const event = (store: string, authorized = true) =>
    new Request("https://example.test/webhook", {
      method: "POST",
      headers: {
        authorization: authorized
          ? "Bearer test-webhook-secret"
          : "Bearer wrong",
      },
      body: JSON.stringify({
        event: {
          id: "event-" + store,
          app_user_id: "member-A",
          store,
          type: "RENEWAL",
        },
      }),
    });
  assert.equal((await handler(event("PLAY_STORE", false))).status, 401);
  assert.equal(seen.length, 0);
  assert.equal((await handler(event("PLAY_STORE"))).status, 200);
  assert.deepEqual(seen[0], {
    clerkUserId: "member-A",
    providerEventId: "event-PLAY_STORE",
    store: "PLAY_STORE",
  });
  assert.equal((await handler(event("APP_STORE"))).status, 200);
  assert.equal((await handler(event("STRIPE"))).status, 409);
  assert.equal(seen.length, 2);
});

test("Google expiration cannot block a later Apple purchase or downgrade unrelated active access", () => {
  const active = {
    tier: "free",
    googleMembershipTier: "standard",
    googleMembershipPlan: "standard_monthly",
    googleMembershipStatus: "active",
    googleMembershipExpiresAt: "2099-01-01T00:00:00Z",
  };
  assert.equal(
    applePurchaseAccountBlocker(active, {}),
    "active_google_subscription",
  );
  assert.equal(
    applePurchaseAccountBlocker(
      { ...active, googleMembershipStatus: "refunded" },
      {},
    ),
    null,
  );
  assert.equal(
    applePurchaseAccountBlocker(
      { ...active, googleMembershipExpiresAt: "2020-01-01T00:00:00Z" },
      {},
    ),
    null,
  );
  assert.equal(
    resolveEffectiveMembershipTier(
      { ...active, googleMembershipExpiresAt: "2020-01-01T00:00:00Z" },
      now,
    ),
    "free",
  );
});

