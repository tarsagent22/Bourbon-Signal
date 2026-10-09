import assert from "node:assert/strict";
import test from "node:test";
import { readRequestedMemberAlert } from "../src/lib/alert-queue/member-alert-lookup";
import { PostgresAlertQueueRepository } from "../src/lib/alert-queue/postgres-repository";

const alert = { id: "alert-1", userId: "member-1", dedupeKey: "episode-1", bottleName: "Bottle", signalId: "trusted_source:1", createdAt: "2026-10-09T15:00:00.000Z" };

test("an evicted alert resolves from the durable record without querying current inventory", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const sql = { query: async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return { rows: [{ member_alert: alert, stable_keys: ["episode-1"], created_at: alert.createdAt }] };
  } };
  const recovered = await readRequestedMemberAlert("member-1", "alert-1", { sql, candidates: async () => { throw new Error("inventory should not be queried"); } });
  assert.equal(recovered?.signalId, alert.signalId);
  assert.deepEqual(calls[0].params, ["member-1", "alert-1", "clerk:member-1:alert-1"]);
  assert.match(calls[0].text, /outbox.user_id=\$1 and outbox.alert_id=\$2/);
  assert.match(calls[0].text, /candidate.user_id=outbox.user_id/);
});

test("another member's notification cannot disclose details or trigger inventory loading", async () => {
  const recovered = await readRequestedMemberAlert("member-2", "alert-1", {
    sql: { query: async () => ({ rows: [] }) },
    candidates: async () => { throw new Error("must not load inventory"); },
  });
  assert.equal(recovered, null);
});

test("invalid notification identifiers never query storage", async () => {
  assert.equal(await readRequestedMemberAlert("member-1", "javascript:bad", { sql: { query: async () => { throw new Error("must not query"); } } }), null);
});

test("older evicted notifications show their sent report without inventing a Signal destination", async () => {
  const recovered = await readRequestedMemberAlert("member-1", "alert-old", {
    sql: { query: async () => ({ rows: [{ stable_keys: ["availability-episode:1"], created_at: alert.createdAt,
      legacy_candidates: [{ bottle: "Bottle", state: "NC", location: "Store 1", eventType: "inventory" }] }] }) },
    candidates: async () => { throw new Error("historical inventory must not be needed"); },
  });
  assert.equal(recovered?.id, "alert-old");
  assert.equal(recovered?.bottleName, "Bottle");
  assert.equal(recovered?.storeLabel, "Store 1");
  assert.equal(recovered?.signalId, undefined);
});

test("durable alert snapshot is committed with the delivered candidate batch", async () => {
  let saved: unknown[] = [];
  const repository = new PostgresAlertQueueRepository({ query: async (_text, params = []) => { saved = params; return { rows: [{ id: "candidate-1" }] }; } });
  await repository.markBatchDelivered(["candidate-1"], "clerk:member-1:alert-1", alert.createdAt, alert);
  assert.deepEqual(JSON.parse(String(saved[3])), alert);
});
