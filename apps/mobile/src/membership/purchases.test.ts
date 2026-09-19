import assert from "node:assert/strict";
import test from "node:test";
import type { AppleMembershipSummary, MemberProfile } from "../api/types";
import {
  APPLE_PRODUCT_IDS,
  PurchaseProviderError,
  createPurchaseCoordinator,
  isAppleProductId,
  mapDefaultOfferingPackages,
  type AppleMembershipApi,
  type PurchaseAdapter,
  type PurchaseStorePackage,
} from "./purchases";

const products: PurchaseStorePackage[] = [
  { productId: APPLE_PRODUCT_IDS.standard.monthly, packageIdentifier: "standard-monthly", localizedPrice: "$3.00", localizedPeriod: "month", hasIntroductoryOffer: false },
  { productId: APPLE_PRODUCT_IDS.standard.annual, packageIdentifier: "standard-annual", localizedPrice: "$30.00", localizedPeriod: "year", hasIntroductoryOffer: false },
  { productId: APPLE_PRODUCT_IDS.barrel.monthly, packageIdentifier: "barrel-monthly", localizedPrice: "$6.00", localizedPeriod: "month", hasIntroductoryOffer: false },
  { productId: APPLE_PRODUCT_IDS.barrel.annual, packageIdentifier: "barrel-annual", localizedPrice: "$60.00", localizedPeriod: "year", hasIntroductoryOffer: false },
];

function profile(tier: "free" | "standard" | "barrel" | "bottled-in-bond" = "free"): MemberProfile {
  return {
    contractVersion: "bourbon-signal/mobile-api@1",
    profile: {
      identity: null,
      displayName: "Member",
      customDisplayName: null,
      feedAreas: { states: [] },
      membership: { tier, label: tier, paid: tier !== "free", hasBetaAccess: false },
      entitlements: { fullFeed: tier !== "free", canSubmitSignals: true },
    },
  };
}

function harness(overrides: {
  packages?: PurchaseStorePackage[];
  readinessAvailable?: boolean;
  readinessError?: Error;
  purchaseError?: PurchaseProviderError;
  reconcileError?: Error;
  refreshedTier?: "free" | "standard" | "barrel" | "bottled-in-bond";
  appleMembership?: AppleMembershipSummary | null;
} = {}) {
  const events: string[] = [];
  const adapter: PurchaseAdapter = {
    async configure(input) { events.push(`configure:${input.appUserId}:${input.apiKey}`); },
    async clearSession() { events.push("clear-session"); },
    async loadDefaultOffering() { events.push("offering"); return overrides.packages ?? products; },
    async purchase(productId) {
      events.push(`purchase:${productId}`);
      if (overrides.purchaseError) throw overrides.purchaseError;
    },
    async restore() { events.push("restore"); },
  };
  let profileReads = 0;
  const api: AppleMembershipApi = {
    async getMemberProfile() {
      profileReads += 1;
      events.push(`profile:${profileReads}`);
      return profile(profileReads > 1 ? (overrides.refreshedTier ?? "standard") : "free");
    },
    async getAppleMembershipReadiness() {
      events.push("readiness");
      if (overrides.readinessError) throw overrides.readinessError;
      return {
        contractVersion: "bourbon-signal/mobile-api@1",
        available: overrides.readinessAvailable ?? true,
        reason: overrides.readinessAvailable === false ? "backend_not_configured" : "ready",
        eligibleProductIds: products.map((item) => item.productId).filter(isAppleProductId),
        restoreAvailable: true,
        membership: overrides.appleMembership ?? null,
      };
    },
    async reconcileAppleMembership(input) {
      events.push(`reconcile:${input.action}:${input.productId ?? "none"}`);
      if (overrides.reconcileError) throw overrides.reconcileError;
      return {
        contractVersion: "bourbon-signal/mobile-api@1",
        status: "reconciled",
        effectiveTier: input.productId?.includes("barrel") ? "barrel" : (overrides.refreshedTier ?? "standard"),
        membership: overrides.appleMembership ?? {
          productId: APPLE_PRODUCT_IDS.standard.monthly,
          status: "active",
          environment: "sandbox",
          expiresAt: "2026-10-13T20:00:00.000Z",
          offerState: "none",
          updatedAt: "2026-09-13T20:00:00.000Z",
        },
      };
    },
  };
  return { adapter, api, events };
}

test("Apple product mapping is immutable, complete, and ignores unapproved products", () => {
  assert.deepEqual(APPLE_PRODUCT_IDS, {
    standard: {
      monthly: "com.bourbonsignal.app.standard.monthly",
      annual: "com.bourbonsignal.app.standard.annual",
    },
    barrel: {
      monthly: "com.bourbonsignal.app.barrel.monthly",
      annual: "com.bourbonsignal.app.barrel.annual",
    },
  });
  const mapped = mapDefaultOfferingPackages([
    ...products,
    { productId: "com.bourbonsignal.app.founder.lifetime", packageIdentifier: "founder", localizedPrice: "$50.00", localizedPeriod: "lifetime", hasIntroductoryOffer: false },
  ]);
  assert.equal(mapped.complete, true);
  assert.deepEqual(mapped.products.map((item) => item.productId), products.map((item) => item.productId));
  assert.deepEqual(mapped.products.map((item) => [item.localizedPrice, item.localizedPeriod]), [["$3.00", "month"], ["$30.00", "year"], ["$6.00", "month"], ["$60.00", "year"]]);
});

test("configuration runs only for an exact authenticated iOS Clerk user without anonymous provider identities", async () => {
  const { adapter, api, events } = harness();
  const coordinator = createPurchaseCoordinator({ adapter, api, publicIosApiKey: "appl_public", platform: "ios" });
  await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  assert.equal(coordinator.getState().status, "ready");
  await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_B" });
  await coordinator.syncSession({ isLoaded: true, isSignedIn: false, userId: null });
  assert.deepEqual(events.filter((event) => event.startsWith("configure") || event === "clear-session"), [
    "configure:user_A:appl_public",
    "clear-session",
    "configure:user_B:appl_public",
    "clear-session",
  ]);

  const android = harness();
  const unsupported = createPurchaseCoordinator({ adapter: android.adapter, api: android.api, publicIosApiKey: "appl_public", platform: "android" });
  await unsupported.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  assert.equal(unsupported.getState().status, "unsupported");
  assert.deepEqual(android.events, []);
});

test("same-tick account switches configure only the newest Clerk identity", async () => {
  const switched = harness();
  const coordinator = createPurchaseCoordinator({ adapter: switched.adapter, api: switched.api, publicIosApiKey: "appl_public", platform: "ios" });
  const stale = coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  const current = coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_B" });
  await Promise.all([stale, current]);
  assert.deepEqual(switched.events.filter((event) => event.startsWith("configure") || event === "clear-session"), [
    "configure:user_B:appl_public",
  ]);
  assert.equal(coordinator.getState().status, "ready");

  const signedOut = harness();
  const signedOutCoordinator = createPurchaseCoordinator({ adapter: signedOut.adapter, api: signedOut.api, publicIosApiKey: "appl_public", platform: "ios" });
  const staleSignIn = signedOutCoordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  const currentSignOut = signedOutCoordinator.syncSession({ isLoaded: true, isSignedIn: false, userId: null });
  await Promise.all([staleSignIn, currentSignOut]);
  assert.deepEqual(signedOut.events, []);
  assert.equal(signedOutCoordinator.getState().status, "signed_out");
});

test("an in-flight stale configuration is logged out before the newest Clerk identity configures", async () => {
  const base = harness();
  let releaseFirst: (() => void) | undefined;
  const firstConfigure = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const adapter: PurchaseAdapter = {
    ...base.adapter,
    async configure(input) {
      base.events.push(`configure-start:${input.appUserId}`);
      if (input.appUserId === "user_A") await firstConfigure;
      base.events.push(`configure-end:${input.appUserId}`);
    },
  };
  const coordinator = createPurchaseCoordinator({ adapter, api: base.api, publicIosApiKey: "appl_public", platform: "ios" });
  const stale = coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  await Promise.resolve();
  const current = coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_B" });
  releaseFirst?.();
  await Promise.all([stale, current]);
  assert.deepEqual(base.events.filter((event) => event.startsWith("configure-") || event === "clear-session"), [
    "configure-start:user_A",
    "configure-end:user_A",
    "clear-session",
    "configure-start:user_B",
    "configure-end:user_B",
  ]);
  assert.equal(coordinator.getState().status, "ready");
});

test("a stale purchase cannot reconcile or overwrite the newly signed-out state", async () => {
  const base = harness();
  let releasePurchase: (() => void) | undefined;
  const purchaseGate = new Promise<void>((resolve) => { releasePurchase = resolve; });
  base.adapter.purchase = async (productId) => {
    base.events.push(`purchase:${productId}`);
    await purchaseGate;
  };
  const coordinator = createPurchaseCoordinator({ adapter: base.adapter, api: base.api, publicIosApiKey: "appl_public", platform: "ios" });
  await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  const stalePurchase = coordinator.purchase(APPLE_PRODUCT_IDS.standard.monthly);
  await Promise.resolve();
  await coordinator.syncSession({ isLoaded: true, isSignedIn: false, userId: null });
  releasePurchase?.();
  await assert.rejects(stalePurchase, /account changed/i);
  assert.equal(base.events.some((event) => event.startsWith("reconcile:")), false);
  assert.equal(coordinator.getState().status, "signed_out");
});

test("missing key, incomplete products, or missing backend fail closed before purchase and restore", async () => {
  for (const setup of [
    { key: "", options: {} },
    { key: "appl_public", options: { packages: products.slice(0, 3) } },
    { key: "appl_public", options: { readinessError: new Error("404") } },
    { key: "appl_public", options: { readinessAvailable: false } },
  ] as const) {
    const { adapter, api, events } = harness(setup.options);
    const coordinator = createPurchaseCoordinator({ adapter, api, publicIosApiKey: setup.key, platform: "ios" });
    await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
    assert.equal(coordinator.getState().status, "unavailable");
    assert.match(coordinator.getState().message, /not available|could not be loaded/i);
    await assert.rejects(() => coordinator.purchase(APPLE_PRODUCT_IDS.standard.monthly), /not available/i);
    await assert.rejects(() => coordinator.restore(), /not available/i);
    assert.equal(events.some((event) => event.startsWith("purchase:") || event === "restore"), false);
  }
});

test("backend-unavailable state keeps authoritative profile and localized prices visible while actions stay disabled", async () => {
  const { adapter, api, events } = harness({ readinessAvailable: false });
  const coordinator = createPurchaseCoordinator({ adapter, api, publicIosApiKey: "appl_public", platform: "ios" });
  await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  const state = coordinator.getState();
  assert.equal(state.status, "unavailable");
  assert.equal(state.profile?.membership.tier, "free");
  assert.deepEqual(state.products.map((product) => product.localizedPrice), ["$3.00", "$30.00", "$6.00", "$60.00"]);
  await assert.rejects(() => coordinator.purchase(APPLE_PRODUCT_IDS.standard.monthly), /not available/i);
  assert.equal(events.some((event) => event.startsWith("purchase:")), false);
});

test("coordinator carries the server-authoritative Apple lifecycle into mobile state", async () => {
  const membership: AppleMembershipSummary = {
    productId: APPLE_PRODUCT_IDS.standard.annual,
    status: "grace_period",
    environment: "sandbox",
    expiresAt: "2026-10-13T20:00:00.000Z",
    offerState: "none",
    updatedAt: "2026-09-13T20:00:00.000Z",
  };
  const { adapter, api } = harness({ appleMembership: membership });
  const coordinator = createPurchaseCoordinator({ adapter, api, publicIosApiKey: "appl_public", platform: "ios" });
  await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  assert.deepEqual(coordinator.getState().membership, membership);
});

test("purchase waits for reconciliation and a refreshed authoritative profile before reporting paid access", async () => {
  const { adapter, api, events } = harness({ refreshedTier: "standard" });
  const coordinator = createPurchaseCoordinator({ adapter, api, publicIosApiKey: "appl_public", platform: "ios" });
  await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  const result = await coordinator.purchase(APPLE_PRODUCT_IDS.standard.monthly);
  assert.equal(result.profile?.membership.tier, "standard");
  assert.equal(result.status, "ready");
  assert.ok(events.indexOf(`purchase:${APPLE_PRODUCT_IDS.standard.monthly}`) < events.indexOf(`reconcile:purchase:${APPLE_PRODUCT_IDS.standard.monthly}`));
  assert.ok(events.indexOf(`reconcile:purchase:${APPLE_PRODUCT_IDS.standard.monthly}`) < events.lastIndexOf("profile:2"));

  const failed = harness({ reconcileError: new Error("backend missing") });
  const blocked = createPurchaseCoordinator({ adapter: failed.adapter, api: failed.api, publicIosApiKey: "appl_public", platform: "ios" });
  await blocked.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  await assert.rejects(() => blocked.purchase(APPLE_PRODUCT_IDS.standard.monthly), /confirm.*server/i);
  assert.equal(blocked.getState().profile?.membership.tier, "free");
  assert.equal(blocked.getState().status, "error");
});

test("purchase cancellation and pending transactions are truthful non-entitlement states", async () => {
  for (const [code, status] of [["cancelled", "cancelled"], ["pending", "pending"]] as const) {
    const { adapter, api } = harness({ purchaseError: new PurchaseProviderError(code, code) });
    const coordinator = createPurchaseCoordinator({ adapter, api, publicIosApiKey: "appl_public", platform: "ios" });
    await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
    await coordinator.purchase(APPLE_PRODUCT_IDS.standard.monthly);
    assert.equal(coordinator.getState().status, status);
    assert.equal(coordinator.getState().profile?.membership.tier, "free");
  }
});

test("restore also requires backend reconciliation and refreshed profile", async () => {
  const { adapter, api, events } = harness({ refreshedTier: "barrel" });
  const coordinator = createPurchaseCoordinator({ adapter, api, publicIosApiKey: "appl_public", platform: "ios" });
  await coordinator.syncSession({ isLoaded: true, isSignedIn: true, userId: "user_A" });
  const result = await coordinator.restore();
  assert.equal(result.profile?.membership.tier, "barrel");
  assert.ok(events.indexOf("restore") < events.indexOf("reconcile:restore:none"));
  assert.ok(events.indexOf("reconcile:restore:none") < events.lastIndexOf("profile:2"));
});
