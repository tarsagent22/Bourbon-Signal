import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildExpoPushMessages, disablePushDevice, disablePushTokens, enabledPushTokens, normalizePushDevices, pushPreferenceProjectionAllowsDelivery, reconcileExpoPushReceipts, registerPushDevice, sendExpoPushMessages, validExpoPushToken } from "../src/lib/push-devices.ts";

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
assert.equal(messages[0]?.title, "Bourbon Signal");
assert.equal(messages[0]?.body, "Open Radar to check your latest matches.");
assert.deepEqual(messages[0]?.data, { screen: "radar", alertId: "alert-1" });
for (const privateValue of ["Stagg", "Example Spirits", "Raleigh, NC"]) assert.equal(JSON.stringify(messages).includes(privateValue), false);
assert.equal(messages[0]?.dedupeKey, "alert-1", "server-side alert identity still distinguishes episodes before serialization");
assert.equal(messages[0]?.priority, "high");
assert.equal(messages[0]?.sound, "default");
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
for (const privateValue of ["Stagg", "Example Spirits", "Raleigh, NC", "dedupeKey"]) assert.equal(JSON.stringify(captured).includes(privateValue), false);
assert.deepEqual(captured, [tokenA, tokenB].map(to => ({ to, sound: "default", title: "Bourbon Signal", body: "Open Radar to check your latest matches.", data: { screen: "radar", alertId: "alert-1" }, priority: "high" })));
let otherCaptured: unknown;
await sendExpoPushMessages(buildExpoPushMessages([tokenA, tokenB], { id: "other-user-alert", bottleName: "Other bottle", storeLabel: "Other store", matchedArea: "Other area" }), (async (_input, init) => {
  otherCaptured = JSON.parse(String(init?.body));
  return Response.json({ data: [{ status: "ok", id: "other-ticket-a" }, { status: "ok", id: "other-ticket-b" }] });
}) as typeof fetch);
assert.equal(JSON.stringify(otherCaptured).includes("Other bottle"), false);
assert.equal((otherCaptured as Array<{ data: { alertId: string } }>)[0]?.data.alertId, "other-user-alert", "the opaque alert token resolves only against the current authenticated member's alert inbox");

let requests = 0;
const many = Array.from({ length: 205 }, () => messages[0]!);
const chunked = await sendExpoPushMessages(many, (async (_input, init) => {
  requests += 1;
  const chunk = JSON.parse(String(init?.body)) as unknown[];
  return new Response(JSON.stringify({ data: chunk.map((_, index) => ({ status: "ok", id: `chunk-${requests}-${index}` })) }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch);
assert.equal(requests, 3);
assert.equal(chunked.accepted, 205);
assert.equal(chunked.rejected, 0);

await assert.rejects(
  sendExpoPushMessages(messages.slice(0, 1), (async () => Response.json({ data: [{ status: "ok" }] })) as typeof fetch),
  /acceptance unknown.*ticket/i,
  "an accepted provider response without a durable ticket id is ambiguous and must never become replayable",
);

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

const exactDisable = disablePushTokens(receiptDevices, [tokenA], "2026-08-24T12:21:00.000Z");
assert.equal(exactDisable.find((device) => device.deviceId === "phone-a")?.enabled, false);
assert.equal(exactDisable.find((device) => device.deviceId === "phone-b")?.enabled, true);

const alertDelivery = readFileSync(new URL("../src/lib/alert-delivery.ts", import.meta.url), "utf8");
assert.match(alertDelivery, /durablePushTicketBindings\(/, "accepted Expo ticket ids must move to the durable receipt ledger");
assert.match(alertDelivery, /createProductionPushOutbox\(/, "the member delivery lease must retain the durable outbox boundary");
assert.match(alertDelivery, /disablePushTokens\(/, "immediate invalid-token failures must deactivate only matching devices");
assert.doesNotMatch(alertDelivery, /reconcileExpoPushReceipts|pushDeliveryReceipts:\s*\{\s*pending:/, "receipt polling must remain separate from member alert delivery and Clerk metadata");

console.log("Push device and immediate-delivery contract passed.");
