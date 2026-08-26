import assert from "node:assert/strict";
import test from "node:test";
import {
  BOTTLE_CONTRIBUTION_RECEIPT_LIMIT,
  bottleContributionReceiptsStorageKey,
  mergeBottleContributionReceipt,
  parseBottleContributionReceipts,
  removeBottleContributionReceipts,
  serializeBottleContributionReceipts,
} from "./contribution-receipts";

test("parses only the current bounded receipt format and valid ids", () => {
  const storageKey = bottleContributionReceiptsStorageKey("user_123");
  assert.match(storageKey, /v1\.user_123$/);
  assert.match(storageKey, /^[A-Za-z0-9._-]+$/);
  assert.doesNotMatch(storageKey, /:/);
  assert.notEqual(bottleContributionReceiptsStorageKey("user_123"), bottleContributionReceiptsStorageKey("user_456"));
  assert.equal(bottleContributionReceiptsStorageKey(null), "");
  assert.equal(bottleContributionReceiptsStorageKey("bad user id"), "");
  assert.equal(bottleContributionReceiptsStorageKey("user:123"), "");
  assert.equal(bottleContributionReceiptsStorageKey(" user_123 "), "");
  const parsed = parseBottleContributionReceipts(JSON.stringify({
    version: 1,
    receipts: [
      ["local-first", "contribution-1"],
      ["", "contribution-2"],
      ["local-third", "bad id with spaces"],
      ["local-first", "contribution-new"],
    ],
  }));
  assert.deepEqual([...parsed], [["local-first", "contribution-new"]]);
  assert.deepEqual([...parseBottleContributionReceipts('{"version":2,"receipts":[]}')], []);
  assert.deepEqual([...parseBottleContributionReceipts("not json")], []);
  assert.deepEqual([...parseBottleContributionReceipts("x".repeat(40_000))], []);
});

test("serializes, merges, and bounds receipts with newest values retained", () => {
  let receipts = new Map<string, string>();
  for (let index = 0; index <= BOTTLE_CONTRIBUTION_RECEIPT_LIMIT; index += 1) {
    receipts = mergeBottleContributionReceipt(receipts, `local-${index}`, `contribution-${index}`);
  }
  assert.equal(receipts.size, BOTTLE_CONTRIBUTION_RECEIPT_LIMIT);
  assert.equal(receipts.has("local-0"), false, "the oldest receipt is evicted");

  receipts = mergeBottleContributionReceipt(receipts, "local-1", "contribution-replaced");
  assert.equal(receipts.get("local-1"), "contribution-replaced");
  const roundTrip = parseBottleContributionReceipts(serializeBottleContributionReceipts(receipts));
  assert.deepEqual([...roundTrip], [...receipts]);
  assert.deepEqual([...mergeBottleContributionReceipt(new Map([["invalid bottle id", "contribution-old"], ["local-ok", "contribution-ok"]]), "local-new", "contribution-new")], [
    ["local-ok", "contribution-ok"],
    ["local-new", "contribution-new"],
  ]);
  assert.throws(() => mergeBottleContributionReceipt(receipts, "invalid bottle id", "contribution-ok"));
});

test("removes only named receipts without mutating the source map", () => {
  const receipts = new Map([["local-one", "contribution-1"], ["local-two", "contribution-2"]]);
  const next = removeBottleContributionReceipts(receipts, ["local-one", "missing"]);
  assert.deepEqual([...next], [["local-two", "contribution-2"]]);
  assert.equal(receipts.size, 2);
  assert.equal(removeBottleContributionReceipts(next, ["missing"]), next);
});
