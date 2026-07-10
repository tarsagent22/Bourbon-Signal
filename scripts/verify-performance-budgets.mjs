#!/usr/bin/env node

export const PERFORMANCE_BUDGETS = Object.freeze({
  homepageFirstLoadJsKb: 260,
  sharedFirstLoadJsKb: 110,
  initialDropRecords: 50,
  initialDropPayloadBytes: 200_000,
  engineAgeMinutes: 90,
});

export function evaluatePerformanceBudgets(metrics, budgets = PERFORMANCE_BUDGETS) {
  const failures = [];
  const checks = [
    ["homepage first-load JavaScript", metrics.homepageFirstLoadJsKb, budgets.homepageFirstLoadJsKb, "KB"],
    ["shared first-load JavaScript", metrics.sharedFirstLoadJsKb, budgets.sharedFirstLoadJsKb, "KB"],
    ["initial drop record count", metrics.initialDropRecords, budgets.initialDropRecords, "records"],
    ["initial drop payload", metrics.initialDropPayloadBytes, budgets.initialDropPayloadBytes, "bytes"],
    ["engine freshness", metrics.engineAgeMinutes, budgets.engineAgeMinutes, "minutes"],
  ];
  for (const [label, actual, maximum, unit] of checks) {
    if (!Number.isFinite(actual)) failures.push(`${label} metric is missing`);
    else if (actual > maximum) failures.push(`${label} is ${actual} ${unit}; budget is ${maximum} ${unit}`);
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll("\\", "/")}`) {
  const raw = process.env.BOURBON_SIGNAL_PERFORMANCE_METRICS;
  if (!raw) {
    console.error("Set BOURBON_SIGNAL_PERFORMANCE_METRICS to a JSON metrics object.");
    process.exit(2);
  }
  const failures = evaluatePerformanceBudgets(JSON.parse(raw));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("Performance budgets passed.");
}
