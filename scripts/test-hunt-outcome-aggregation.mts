import assert from "node:assert/strict";
import { HuntOutcomeRepository } from "../src/lib/hunt-outcome-repository.ts";

class AggregationExecutor {
  calls: Array<{ text: string; params: unknown[] }> = [];

  async query(text: string, params: unknown[] = []) {
    this.calls.push({ text, params });
    return [{
      total_responses: 8,
      found_it_count: 3,
      by_source_type: [
        { key: "member", totalResponses: 5, foundItCount: 2 },
        { key: "trusted_source", totalResponses: 3, foundItCount: 1 },
      ],
      by_state: [
        { key: "KY", totalResponses: 6, foundItCount: 3 },
        { key: "OH", totalResponses: 2, foundItCount: 0 },
      ],
    }];
  }
}

const executor = new AggregationExecutor();
const repository = new HuntOutcomeRepository(executor);
const aggregation = await repository.aggregatePrivate({
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  sourceType: "member",
  stateCode: "ky",
});

assert.deepEqual(aggregation, {
  window: {
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-09-01T00:00:00.000Z",
  },
  filters: { sourceType: "member", stateCode: "KY" },
  totalResponses: 8,
  foundItCount: 3,
  foundItRate: 0.375,
  bySourceType: [
    { sourceType: "member", totalResponses: 5, foundItCount: 2, foundItRate: 0.4 },
    { sourceType: "trusted_source", totalResponses: 3, foundItCount: 1, foundItRate: 1 / 3 },
  ],
  byState: [
    { stateCode: "KY", totalResponses: 6, foundItCount: 3, foundItRate: 0.5 },
    { stateCode: "OH", totalResponses: 2, foundItCount: 0, foundItRate: 0 },
  ],
});

const call = executor.calls[0];
assert.deepEqual(call.params, [
  "2026-08-01T00:00:00.000Z",
  "2026-09-01T00:00:00.000Z",
  "member",
  "KY",
]);
assert.match(call.text, /updated_at\s*>=\s*\$1::timestamptz/i, "aggregation uses an explicit inclusive window start");
assert.match(call.text, /updated_at\s*<\s*\$2::timestamptz/i, "aggregation uses an explicit exclusive window end");
assert.match(call.text, /COUNT\(\*\) FILTER \(WHERE outcome = 'found_it'\)/i);
assert.match(call.text, /GROUP BY source_type/i);
assert.match(call.text, /GROUP BY state_code/i);
assert.doesNotMatch(call.text, /store_id|store_name|GROUP BY user_id/i, "private aggregation cannot produce member or store rankings");
assert.equal(JSON.stringify(aggregation).includes("userId"), false);

await assert.rejects(
  () => repository.aggregatePrivate({
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
  }),
  /valid aggregation window/i,
);
await assert.rejects(
  () => repository.aggregatePrivate({
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-09-01T00:00:00.000Z",
    sourceType: "public" as never,
  }),
  /source type/i,
);
assert.equal(executor.calls.length, 1, "invalid aggregation filters never reach storage");

console.log("Hunt Outcome private aggregation tests passed.");
