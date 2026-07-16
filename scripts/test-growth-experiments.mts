import assert from "node:assert/strict";
import {
  EXPERIMENT_REGISTRY,
  aggregateExperimentTelemetry,
  assignExperiment,
  buildExperimentExposure,
  buildExperimentMetric,
  getActiveExperiment,
  validateExperimentRegistry,
  type ExperimentDefinition,
} from "../src/lib/growth-experiments.ts";
import { GROWTH_EVENT_NAMES, sanitizeGrowthEvent } from "../src/lib/growth-events.ts";

const experiment: ExperimentDefinition = {
  id: "bottle-check-proof-order",
  status: "active",
  owner: "growth",
  surface: "bottle_check",
  baseline: "Existing completed bottle check rate.",
  hypothesis: "Proof ordering improves completed bottle checks.",
  variants: [
    { key: "control", weight: 1 },
    { key: "proof_first", weight: 1 },
  ],
  primaryMetric: "bottle_check_completed",
  allowedMetrics: ["bottle_check_completed"],
  minSampleSizePerVariant: 5,
  minRelativeLift: 0.05,
  stopRule: "Stop at the sample and confidence floors.",
  rollbackRule: "Restore control if completion regresses.",
};

assert.equal(EXPERIMENT_REGISTRY.length, 1);
assert.equal(GROWTH_EVENT_NAMES.includes("experiment_exposure"), true);
assert.equal(GROWTH_EVENT_NAMES.includes("experiment_metric"), true);
assert.deepEqual(sanitizeGrowthEvent("experiment_exposure", {
  experiment: experiment.id,
  variant: "control",
  surface: "bottle_check",
}), { experiment: experiment.id, variant: "control", surface: "bottle_check" });
assert.equal(getActiveExperiment()?.surface, "release_radar");
assert.equal(validateExperimentRegistry([experiment]).ok, true);
assert.equal(validateExperimentRegistry([{ ...experiment, surface: "pricing" as never }]).ok, false);
assert.equal(validateExperimentRegistry([{ ...experiment, primaryMetric: "email_clicked", allowedMetrics: ["email_clicked"] }]).ok, false);
assert.throws(() => getActiveExperiment([experiment, { ...experiment, id: "second" }]));

const first = assignExperiment(experiment, "user_123");
assert.deepEqual(assignExperiment(experiment, "user_123"), first);
assert.equal(["control", "proof_first"].includes(first.variant), true);
assert.notEqual(assignExperiment(experiment, "user_124").bucket, first.bucket);

assert.equal(buildExperimentExposure({ experiment, assignment: first, hostname: "localhost", occurredAt: "2026-07-16T00:00:00.000Z" }), null);
assert.equal(buildExperimentExposure({ experiment, assignment: first, hostname: "www.bourbonsignal.com", killSwitch: true, occurredAt: "2026-07-16T00:00:00.000Z" }), null);
process.env.GROWTH_EXPERIMENTS_KILL_SWITCH = "1";
assert.equal(buildExperimentExposure({ experiment, assignment: first, hostname: "www.bourbonsignal.com", killSwitch: false }), null);
delete process.env.GROWTH_EXPERIMENTS_KILL_SWITCH;
const exposure = buildExperimentExposure({ experiment, assignment: first, hostname: "www.bourbonsignal.com", occurredAt: "2026-07-16T00:00:00.000Z" });
assert.deepEqual(exposure, {
  name: "experiment_exposure",
  occurredAt: "2026-07-16T00:00:00.000Z",
  properties: { experiment: experiment.id, variant: first.variant, surface: "bottle_check" },
});
assert.equal(buildExperimentMetric({ experiment, assignment: first, metric: "purchase", hostname: "www.bourbonsignal.com" }), null);
assert.equal(buildExperimentMetric({ experiment, assignment: first, metric: "bottle_check_completed", hostname: "preview.example.com" }), null);
assert.deepEqual(buildExperimentMetric({
  experiment,
  assignment: first,
  metric: "bottle_check_completed",
  hostname: "bourbonsignal.com",
  occurredAt: "2026-07-16T00:01:00.000Z",
}), {
  name: "experiment_metric",
  occurredAt: "2026-07-16T00:01:00.000Z",
  properties: { experiment: experiment.id, variant: first.variant, metric: "bottle_check_completed", surface: "bottle_check" },
});

const events = [
  ...Array.from({ length: 100 }, () => ({ name: "experiment_exposure" as const, properties: { experiment: experiment.id, variant: "control", surface: "bottle_check" } })),
  ...Array.from({ length: 100 }, () => ({ name: "experiment_exposure" as const, properties: { experiment: experiment.id, variant: "proof_first", surface: "bottle_check" } })),
  ...Array.from({ length: 10 }, () => ({ name: "experiment_metric" as const, properties: { experiment: experiment.id, variant: "control", metric: "bottle_check_completed", surface: "bottle_check" } })),
  ...Array.from({ length: 30 }, () => ({ name: "experiment_metric" as const, properties: { experiment: experiment.id, variant: "proof_first", metric: "bottle_check_completed", surface: "bottle_check" } })),
];
const aggregate = aggregateExperimentTelemetry(events, [experiment], 5);
assert.equal(aggregate.experiments[0].outcome, "winner_loser");
assert.equal(aggregate.experiments[0].variants.find((item) => item.variant === "proof_first")?.result, "winner");
assert.equal(aggregate.experiments[0].variants.find((item) => item.variant === "control")?.result, "loser");
assert.equal(JSON.stringify(aggregate).includes("occurredAt"), false);

const inconclusive = aggregateExperimentTelemetry(events.slice(0, 8), [experiment], 5);
assert.equal(inconclusive.experiments[0].outcome, "inconclusive");
const guardedFloor = aggregateExperimentTelemetry(events.slice(0, 4), [experiment], 1);
assert.equal(guardedFloor.privacy.minCohortSize, 5);
assert.equal(guardedFloor.experiments[0].variants[0].suppressed, true);

console.log("Controlled growth experiment contract passed.");
