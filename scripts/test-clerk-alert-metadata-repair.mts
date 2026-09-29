import assert from "node:assert/strict";
import test from "node:test";
import * as repairModule from "../src/lib/alert-queue/clerk-alert-repair.ts";

const {
  buildClerkAlertMetadataRepair,
  metadataHash,
  publicRepairMatchesPlan,
  repairRollbackIsSafe,
} = ((repairModule as { default?: unknown }).default || repairModule) as typeof import("../src/lib/alert-queue/clerk-alert-repair.ts");

function hugeDelivery() {
  return {
    recent: Array.from({ length: 80 }, (_, index) => ({
      dedupeKey: `group-${index}-${"x".repeat(80)}`,
      underlyingStableKeys: Array.from({ length: 4 }, (_, child) => `child-${index}-${child}-${"y".repeat(40)}`),
      deliveredAt: new Date(Date.UTC(2026, 8, 28, 12, index % 60)).toISOString(),
      channel: index % 2 ? "sms" : "email",
      messageId: `provider-${index}`,
    })),
    emailBaselineDedupeKeys: Array.from({ length: 400 }, (_, index) => `email-${index}`),
    smsBaselineDedupeKeys: Array.from({ length: 400 }, (_, index) => `sms-${index}`),
  };
}

test("plans a private alertDelivery-only compaction and preserves unrelated metadata", () => {
  const privateMetadata = {
    alertDelivery: hugeDelivery(),
    alertInbox: { recent: [{ id: "keep-me" }] },
    activation: { paidAt: "2026-09-28T00:00:00.000Z" },
  };
  const plan = buildClerkAlertMetadataRepair(privateMetadata, { tier: "standard" });
  assert.equal(plan.eligible, true);
  assert.equal(plan.privatePatchRequired, true);
  assert.equal(plan.nextPrivateMetadata.alertInbox, privateMetadata.alertInbox);
  assert.equal(plan.nextPrivateMetadata.activation, privateMetadata.activation);
  assert.equal((plan.nextPrivateMetadata.alertDelivery as Record<string, unknown>).dedupeIdentityVersion, 2);
  assert.equal("emailBaselineDedupeKeys" in (plan.nextPrivateMetadata.alertDelivery as Record<string, unknown>), false);
  assert.equal(plan.unrelatedPrivateHashBefore, plan.unrelatedPrivateHashAfter);
  assert.ok(plan.privateBytesAfter < plan.privateBytesBefore);
});

test("removes only a redundant explicit monitoring scope copy when public metadata is near capacity", () => {
  const stores = Array.from({ length: 50 }, (_, index) => `store-${index}`);
  const monitoringScopes = stores.map((store) => ({ type: "store", id: `store:PA:${store}`, state: "PA", label: store }));
  const publicMetadata = {
    tier: "standard",
    areaPreferences: { states: ["PA"], paStores: stores },
    monitoringScopes,
    bottleAlertPreferences: { bottleKeys: Array.from({ length: 150 }, (_, index) => `bottle-${index}-${"z".repeat(25)}`) },
  };
  const privateMetadata = { alertDelivery: hugeDelivery() };
  const plan = buildClerkAlertMetadataRepair(privateMetadata, publicMetadata);
  assert.equal(plan.eligible, true);
  assert.equal(plan.publicPatchRequired, true);
  assert.deepEqual(plan.publicPatch, { monitoringScopes: null });
  assert.equal(plan.effectivePublicScopesBeforeHash, plan.effectivePublicScopesAfterHash);
  assert.ok(plan.publicBytesAfter < plan.publicBytesBefore);
  const reloaded = buildClerkAlertMetadataRepair(plan.nextPrivateMetadata, plan.nextPublicMetadata);
  assert.equal(reloaded.effectivePublicScopesBeforeHash, plan.effectivePublicScopesBeforeHash);
});

test("compacts nonredundant explicit monitoring scopes without changing effective scope identity", () => {
  const publicMetadata = {
    tier: "standard",
    areaPreferences: { states: ["NY"] },
    monitoringScopes: [{ type: "county", id: "county:36061", state: "NY", label: "New York County", extra: "x".repeat(2000) }],
    padding: "x".repeat(6500),
  };
  const plan = buildClerkAlertMetadataRepair({ alertDelivery: hugeDelivery() }, publicMetadata);
  assert.equal(plan.eligible, true);
  assert.equal(plan.blockedReason, "");
  assert.equal(plan.publicPatchRequired, true);
  assert.ok(Array.isArray(plan.publicPatch.monitoringScopes));
  assert.ok((plan.publicPatch.monitoringScopes as unknown[]).every((scope) => typeof scope === "string"));
  assert.notDeepEqual(plan.publicPatch.monitoringScopes, publicMetadata.monitoringScopes);
  assert.equal(plan.effectivePublicScopesBeforeHash, plan.effectivePublicScopesAfterHash);
  assert.ok(plan.publicBytesAfter < plan.publicBytesBefore);
  const reloaded = buildClerkAlertMetadataRepair(plan.nextPrivateMetadata, plan.nextPublicMetadata);
  assert.equal(reloaded.effectivePublicScopesBeforeHash, plan.effectivePublicScopesBeforeHash);
});

test("metadata hashes are stable across object key order", () => {
  assert.equal(metadataHash({ b: 2, a: 1 }), metadataHash({ a: 1, b: 2 }));
});

test("plans a public-only capacity repair without inventing a private alertDelivery patch", () => {
  const stores = Array.from({ length: 50 }, (_, index) => `store-${index}`);
  const publicMetadata = {
    areaPreferences: { states: ["PA"], paStores: stores },
    monitoringScopes: stores.map((store) => ({ type: "store", id: `store:PA:${store}`, state: "PA", label: store })),
    padding: "x".repeat(5500),
  };
  const plan = buildClerkAlertMetadataRepair({ lifecycleTimeZone: "America/New_York" }, publicMetadata);
  assert.equal(plan.eligible, true);
  assert.equal(plan.privatePatchRequired, false);
  assert.equal(plan.publicPatchRequired, true);
  assert.deepEqual(plan.nextPrivateMetadata, { lifecycleTimeZone: "America/New_York" });
  assert.equal(publicRepairMatchesPlan(publicMetadata, plan), false, "unchanged near-limit public metadata is not a successful repair");
  assert.equal(publicRepairMatchesPlan(plan.nextPublicMetadata, plan), true);
});

test("rollback compare-and-swap permits unrelated changes but rejects mutated repair fields", () => {
  const expectedPrivatePatch = { alertDelivery: { dedupeIdentityVersion: 2, recent: [] } };
  const expectedPublicPatch = { monitoringScopes: ["state:VA"] };
  assert.equal(repairRollbackIsSafe({
    currentPrivateMetadata: { ...expectedPrivatePatch, lifecycleTimeZone: "America/New_York" },
    currentPublicMetadata: { ...expectedPublicPatch, tier: "standard" },
    expectedPrivatePatch,
    expectedPublicPatch,
  }), true);
  assert.equal(repairRollbackIsSafe({
    currentPrivateMetadata: { alertDelivery: { dedupeIdentityVersion: 2, recent: [{ dedupeKey: "new" }] } },
    currentPublicMetadata: expectedPublicPatch,
    expectedPrivatePatch,
    expectedPublicPatch,
  }), false);
  assert.equal(repairRollbackIsSafe({
    currentPrivateMetadata: expectedPrivatePatch,
    currentPublicMetadata: { monitoringScopes: ["state:NC"] },
    expectedPrivatePatch,
    expectedPublicPatch,
  }), false);
});
