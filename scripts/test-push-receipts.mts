import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as receiptImport from "../src/lib/push-receipts.ts";
import type { ClaimedPushTicket, PushReceiptRepository } from "../src/lib/push-receipts.ts";

const receipts = (receiptImport.default || receiptImport) as typeof receiptImport;
const { runPushReceiptReconciliation } = receipts;

const NOW = "2026-09-14T01:00:00.000Z";
const ticket = (id: string, attempts = 1): ClaimedPushTicket => ({
  ticketId: id,
  outboxId: `outbox-${id}`,
  userId: "member-private",
  tokenHash: "a".repeat(64),
  installationHash: "b".repeat(64),
  bindingId: `binding-${id}`,
  acceptedAt: "2026-09-14T00:40:00.000Z",
  attempts,
});

function repositoryFixture(rows: ClaimedPushTicket[]) {
  const resolved: Array<{ ticketId: string; status: string; reason: string }> = [];
  const retries: Array<{ ids: string[]; nextAttemptAt: string; reason: string }> = [];
  let claimed = false;
  const repository: PushReceiptRepository = {
    claimDue: async () => claimed ? [] : (claimed = true, rows),
    resolve: async (_owner, outcomes) => { resolved.push(...outcomes); },
    retry: async (_owner, ids, nextAttemptAt, reason) => { retries.push({ ids, nextAttemptAt, reason }); },
    health: async () => ({ pendingTickets: 0, maxReceiptLagSeconds: 0, delivered: 0, rejected: 0, unknown: 0, staleDevices: 0, invalidDevices: 0, reasonClasses: {} }),
  };
  return { repository, resolved, retries };
}

test("authoritative receipts deliver, reject exact invalid devices, and quarantine partial results", async () => {
  const fixture = repositoryFixture([ticket("ticket-ok"), ticket("ticket-invalid"), ticket("ticket-missing")]);
  const result = await runPushReceiptReconciliation({
    repository: fixture.repository,
    workerId: "receipt-worker",
    now: () => NOW,
    fetcher: async () => Response.json({ data: {
      "ticket-ok": { status: "ok" },
      "ticket-invalid": { status: "error", details: { error: "DeviceNotRegistered" } },
    } }),
  });
  assert.deepEqual(result, { claimed: 3, delivered: 1, rejected: 1, unknown: 1, retried: 0 });
  assert.deepEqual(fixture.resolved.map(({ ticketId, status, reason }) => ({ ticketId, status, reason })), [
    { ticketId: "ticket-ok", status: "delivered", reason: "receipt_ok" },
    { ticketId: "ticket-invalid", status: "rejected", reason: "device_not_registered" },
    { ticketId: "ticket-missing", status: "unknown", reason: "partial_receipt_response" },
  ]);
  assert.equal(fixture.retries.length, 0, "partial provider results are manual review, never send retries");
});

test("transient provider failures retry receipt polling only with a bounded clock-derived delay", async () => {
  const fixture = repositoryFixture([ticket("ticket-transient", 2)]);
  const result = await runPushReceiptReconciliation({ repository: fixture.repository, workerId: "receipt-worker", now: () => NOW, fetcher: async () => new Response("unavailable", { status: 503 }) });
  assert.deepEqual(result, { claimed: 1, delivered: 0, rejected: 0, unknown: 0, retried: 1 });
  assert.deepEqual(fixture.retries, [{ ids: ["ticket-transient"], nextAttemptAt: "2026-09-14T01:20:00.000Z", reason: "provider_transient" }]);
});

test("exhausted transient receipt polling and malformed or unknown responses become manual unknown", async () => {
  const exhausted = repositoryFixture([ticket("ticket-exhausted", 5)]);
  const exhaustedResult = await runPushReceiptReconciliation({ repository: exhausted.repository, workerId: "receipt-worker", now: () => NOW, fetcher: async () => new Response("unavailable", { status: 429 }) });
  assert.equal(exhaustedResult.unknown, 1);
  assert.equal(exhausted.resolved[0]?.reason, "receipt_retry_exhausted");
  assert.equal(exhausted.retries.length, 0);

  for (const payload of [{}, { data: [] }, { data: { "ticket-malformed": { status: "maybe" } } }, { data: { "unexpected-ticket": { status: "ok" } } }]) {
    const malformed = repositoryFixture([ticket("ticket-malformed")]);
    const result = await runPushReceiptReconciliation({ repository: malformed.repository, workerId: "receipt-worker", now: () => NOW, fetcher: async () => Response.json(payload) });
    assert.equal(result.unknown, 1);
    assert.match(malformed.resolved[0]?.reason || "", /malformed|unknown|partial/);
    assert.equal(malformed.retries.length, 0);
  }
});

test("the reconciliation boundary is idempotent when another worker already owns or resolved tickets", async () => {
  const fixture = repositoryFixture([]);
  let providerCalls = 0;
  const result = await runPushReceiptReconciliation({ repository: fixture.repository, workerId: "receipt-worker", now: () => NOW, fetcher: async () => { providerCalls += 1; return Response.json({ data: {} }); } });
  assert.deepEqual(result, { claimed: 0, delivered: 0, rejected: 0, unknown: 0, retried: 0 });
  assert.equal(providerCalls, 0);
});

test("protected cron-compatible route authenticates before polling and scheduled delivery invokes the isolated reconciler", async () => {
  const route = await readFile(new URL("../src/app/api/alerts/push-receipts/route.ts", import.meta.url), "utf8").catch(() => "");
  assert.match(route, /assertAlertDeliveryAuthorized/);
  assert.match(route, /runPushReceiptReconciliation/);
  assert.match(route, /Cache-Control["']?:\s*["']private, no-store["']/i);
  assert.doesNotMatch(route, /expoPushToken|userId|tokenHash/);
  const deliveryRoute = await readFile(new URL("../src/app/api/alerts/deliver/route.ts", import.meta.url), "utf8");
  assert.match(deliveryRoute, /heartbeatEligible[\s\S]*runPushReceiptReconciliation/);
  const authIndex = deliveryRoute.indexOf("assertAlertDeliveryAuthorized(req)");
  const receiptIndex = deliveryRoute.indexOf("runPushReceiptReconciliation()");
  const deliveryIndex = deliveryRoute.indexOf("deliverPreferenceAlerts(req");
  assert.ok(authIndex >= 0 && authIndex < receiptIndex && receiptIndex < deliveryIndex, "scheduled receipt polling must be authorized and independent of a later alert-delivery failure");
  assert.match(deliveryRoute, /pushReceipts[\s\S]*isolatedFailure/);
});
