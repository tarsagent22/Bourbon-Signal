import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildExpoPushMessages, disablePushDevice, enabledPushTokens, normalizePushDevices, pushPreferenceProjectionAllowsDelivery, reconcileExpoPushReceipts, registerPushDevice, sendExpoPushMessages, validExpoPushToken } from "../src/lib/push-devices.ts";

const tokenA = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa]";
const tokenB = "ExpoPushToken[bbbbbbbbbbbbbbbbbbbb]";
assert.equal(validExpoPushToken(tokenA), true);
assert.equal(validExpoPushToken("not-a-token"), false);
assert.equal(pushPreferenceProjectionAllowsDelivery(undefined), true);
assert.equal(pushPreferenceProjectionAllowsDelivery({ status: "saved" }), true);
assert.equal(pushPreferenceProjectionAllowsDelivery({ status: "pending" }), false);

const registered = registerPushDevice([], { deviceId: "phone-1", expoPushToken: tokenA, platform: "ios" }, "2026-08-24T12:00:00.000Z");
assert.equal(registered.length, 1);
assert.deepEqual(enabledPushTokens(registered), [tokenA]);

const refreshed = registerPushDevice(registered, { deviceId: "phone-1", expoPushToken: tokenB, platform: "ios" }, "2026-08-24T12:01:00.000Z");
assert.equal(refreshed.length, 1);
assert.equal(refreshed[0]?.expoPushToken, tokenB);
assert.equal(normalizePushDevices([...refreshed, { ...refreshed[0], updatedAt: "invalid" }]).length, 1);

const disabled = disablePushDevice(refreshed, "phone-1", "2026-08-24T12:02:00.000Z");
assert.deepEqual(enabledPushTokens(disabled), []);

const messages = buildExpoPushMessages([tokenA, tokenA, tokenB], { id: "alert-1", bottleName: "Stagg", storeLabel: "Example Spirits", matchedArea: "Raleigh, NC" });
assert.equal(messages.length, 2);
assert.equal(messages[0]?.title, "Stagg");
assert.match(messages[0]?.body || "", /Example Spirits/);
assert.deepEqual(messages[0]?.data, { screen: "radar", alertId: "alert-1" });
assert.equal(JSON.stringify(messages).includes("digest"), false);

let captured: unknown = null;
const sent = await sendExpoPushMessages(messages, (async (_input, init) => {
  captured = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-a" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch);
assert.equal(sent.accepted, 1);
assert.equal(sent.rejected, 1);
assert.deepEqual(sent.tickets, [{ id: "ticket-a", token: tokenA }]);
assert.deepEqual(sent.invalidTokens, [tokenB]);
assert.equal(Array.isArray(captured), true);

let requests = 0;
const many = Array.from({ length: 205 }, () => messages[0]!);
const chunked = await sendExpoPushMessages(many, (async (_input, init) => {
  requests += 1;
  const chunk = JSON.parse(String(init?.body)) as unknown[];
  return new Response(JSON.stringify({ data: chunk.map(() => ({ status: "ok" })) }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch);
assert.equal(requests, 3);
assert.equal(chunked.accepted, 205);
assert.equal(chunked.rejected, 0);

const receiptDevices = registerPushDevice(
  registerPushDevice([], { deviceId: "phone-a", expoPushToken: tokenA, platform: "ios" }, "2026-08-24T12:00:00.000Z"),
  { deviceId: "phone-b", expoPushToken: tokenB, platform: "android" },
  "2026-08-24T12:00:00.000Z",
);
const reconciled = await reconcileExpoPushReceipts([
  { id: "ticket-a", token: tokenA, createdAt: "2026-08-24T12:00:00.000Z" },
  { id: "ticket-b", token: tokenB, createdAt: "2026-08-24T12:00:00.000Z" },
  { id: "ticket-pending", token: tokenB, createdAt: "2026-08-24T12:00:00.000Z" },
], receiptDevices, (async () => new Response(JSON.stringify({ data: {
  "ticket-a": { status: "error", details: { error: "DeviceNotRegistered" } },
  "ticket-b": { status: "ok" },
} }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch, "2026-08-24T12:20:00.000Z");
assert.deepEqual(enabledPushTokens(reconciled.devices), [tokenB]);
assert.deepEqual(reconciled.pending, [{ id: "ticket-pending", token: tokenB, createdAt: "2026-08-24T12:00:00.000Z" }]);
assert.equal(reconciled.accepted, 1);
assert.equal(reconciled.rejected, 1);

const alertDelivery = readFileSync(new URL("../src/lib/alert-delivery.ts", import.meta.url), "utf8");
assert.match(alertDelivery, /reconcileExpoPushReceipts\(/, "the alert worker must process durable Expo receipts");
assert.match(alertDelivery, /pushDeliveryReceipts:\s*\{ pending:/, "unresolved ticket ids must survive for a later receipt pass");
assert.match(alertDelivery, /disablePushTokens\(/, "immediate invalid-token failures must deactivate devices");
assert.match(alertDelivery, /\.tickets\.map/, "new Expo ticket ids must be persisted with their device token");

console.log("Push device and immediate-delivery contract passed.");
