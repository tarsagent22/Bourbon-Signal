import assert from "node:assert/strict";
import { evaluatePerformanceBudgets } from "./verify-performance-budgets.mjs";

const healthy = evaluatePerformanceBudgets({
  homepageFirstLoadJsKb: 244,
  sharedFirstLoadJsKb: 103,
  initialDropRecords: 50,
  initialDropPayloadBytes: 140_000,
  engineAgeMinutes: 40,
});
assert.deepEqual(healthy, []);

const failures = evaluatePerformanceBudgets({
  homepageFirstLoadJsKb: 280,
  sharedFirstLoadJsKb: 120,
  initialDropRecords: 75,
  initialDropPayloadBytes: 250_000,
  engineAgeMinutes: 120,
});
assert.equal(failures.length, 5);
assert.ok(failures.some((failure) => failure.includes("engine freshness")));
assert.ok(failures.some((failure) => failure.includes("initial drop record")));

console.log("Performance budget tests passed.");
