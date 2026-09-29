import assert from "node:assert/strict";
import test from "node:test";
import * as metadataModule from "../src/lib/alert-queue/clerk-alert-metadata.ts";

const {
  CLERK_ALERT_DELIVERY_TARGET_BYTES,
  compactClerkAlertDelivery,
  jsonUtf8Bytes,
} = ((metadataModule as { default?: unknown }).default || metadataModule) as typeof import("../src/lib/alert-queue/clerk-alert-metadata.ts");

function deliveryRecord(index: number) {
  return {
    dedupeKey: `location-group-${index}-${"x".repeat(90)}`,
    underlyingStableKeys: Array.from({ length: 20 }, (_, child) => `stable-${index}-${child}-${"y".repeat(50)}`),
    deliveredAt: new Date(Date.UTC(2026, 8, 28, 12, index)).toISOString(),
    channel: index % 2 ? "sms" : "email",
    messageId: `provider-${index}-${"z".repeat(60)}`,
    status: "accepted",
  };
}

test("compacts Clerk alert delivery to a bounded operational tail", () => {
  const compacted = compactClerkAlertDelivery({
    dedupeIdentityVersion: 2,
    recent: Array.from({ length: 250 }, (_, index) => deliveryRecord(index)),
    onSiteBaselineDedupeKeys: Array.from({ length: 1500 }, (_, index) => `on-site-${index}`),
    emailBaselineDedupeKeys: Array.from({ length: 1500 }, (_, index) => `email-${index}`),
    smsBaselineDedupeKeys: Array.from({ length: 1500 }, (_, index) => `sms-${index}`),
    lastOnSiteBaselineAt: "2026-09-28T12:00:00.000Z",
    lastEmailBaselineAt: "2026-09-28T12:01:00.000Z",
    lastSmsBaselineAt: "2026-09-28T12:02:00.000Z",
    lastRunAt: "2026-09-28T12:03:00.000Z",
  });

  assert.equal(compacted.dedupeIdentityVersion, 2);
  assert.equal(compacted.onSiteBaselineDedupeKeys, null);
  assert.equal(compacted.emailBaselineDedupeKeys, null);
  assert.equal(compacted.smsBaselineDedupeKeys, null);
  assert.ok(Array.isArray(compacted.recent));
  assert.ok((compacted.recent as unknown[]).length > 0);
  assert.equal((compacted.recent as Array<{ dedupeKey: string }>)[0].dedupeKey, deliveryRecord(0).dedupeKey);
  assert.ok(jsonUtf8Bytes(compacted) <= CLERK_ALERT_DELIVERY_TARGET_BYTES);
  assert.equal(compacted.lastRunAt, "2026-09-28T12:03:00.000Z");
});

test("returns a minimal v2 marker when history cannot fit the target", () => {
  const compacted = compactClerkAlertDelivery({
    recent: [{ ...deliveryRecord(1), dedupeKey: "x".repeat(10_000) }],
  });
  assert.deepEqual(compacted, {
    dedupeIdentityVersion: 2,
    durableBaselineVersion: 1,
    onSiteBaselineDedupeKeys: null,
    emailBaselineDedupeKeys: null,
    smsBaselineDedupeKeys: null,
  });
  assert.ok(jsonUtf8Bytes(compacted) <= CLERK_ALERT_DELIVERY_TARGET_BYTES);
});

test("keeps newest unique channel records and normalizes malformed input", () => {
  const newest = deliveryRecord(1);
  const compacted = compactClerkAlertDelivery({
    recent: [
      newest,
      { ...newest, messageId: "older-duplicate" },
      { dedupeKey: "", deliveredAt: "bad" },
      deliveryRecord(2),
    ],
  });
  const recent = compacted.recent as Array<{ dedupeKey: string; messageId: string }>;
  assert.equal(recent.length, 2);
  assert.equal(recent[0].messageId, newest.messageId);
});
