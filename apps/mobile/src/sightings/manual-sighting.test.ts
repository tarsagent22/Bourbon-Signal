import assert from "node:assert/strict";
import test from "node:test";
import { buildManualStoreId, createSightingIdempotencyKey, parseSightingDraftBinding, serializeSightingDraftBinding } from "./manual-sighting";

test("manual store IDs distinguish branches at different street addresses", () => {
  const first = buildManualStoreId("Bottle Shop", "101 Main St", "Raleigh", "NC");
  const second = buildManualStoreId("Bottle Shop", "900 North Ave", "Raleigh", "NC");
  assert.notEqual(first, second);
  assert.match(first, /^manual:[a-z0-9-]+$/);
});

test("manual store IDs hash the full address beyond the readable prefix", () => {
  const prefix = "A".repeat(180);
  assert.notEqual(
    buildManualStoreId("Bottle Shop", `${prefix} East`, "Raleigh", "NC"),
    buildManualStoreId("Bottle Shop", `${prefix} West`, "Raleigh", "NC"),
  );
  assert.notEqual(
    buildManualStoreId("Bottle Shop", "1 Calle Peñón", "Raleigh", "NC"),
    buildManualStoreId("Bottle Shop", "1 Calle Penon", "Raleigh", "NC"),
  );
});

test("manual store IDs normalize equivalent field whitespace", () => {
  assert.equal(
    buildManualStoreId(" Bottle Shop ", " 101  Main St ", " Raleigh ", " nc "),
    buildManualStoreId("Bottle Shop", "101 Main St", "Raleigh", "NC"),
  );
});

test("mobile idempotency keys satisfy the durable API key contract", () => {
  assert.equal(createSightingIdempotencyKey(1234567890, "abcdefgh"), "mobile-post-1234567890-abcdefgh");
  assert.ok(createSightingIdempotencyKey().length >= 8);
});

test("draft bindings preserve the request fingerprint across restarts", () => {
  const binding = { key: "mobile-post-12345678", fingerprint: "abc123" };
  assert.deepEqual(parseSightingDraftBinding(serializeSightingDraftBinding(binding)), binding);
  assert.deepEqual(parseSightingDraftBinding("mobile-post-legacy"), { key: "mobile-post-legacy", fingerprint: null });
});
