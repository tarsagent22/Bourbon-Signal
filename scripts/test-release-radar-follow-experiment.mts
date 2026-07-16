import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPERIMENT_REGISTRY,
  RELEASE_RADAR_FOLLOW_EXPERIMENT_ID,
  assignActiveExperiment,
  getActiveExperiment,
  validateExperimentRegistry,
} from "../src/lib/growth-experiments.ts";
import {
  EXPERIMENT_PARTICIPATION_METADATA_KEY,
  buildExperimentApiResponse,
  recordExperimentParticipation,
} from "../src/lib/experiment-participation.ts";
import {
  buildEligibleExperimentTelemetry,
  buildOwnerExperimentAggregate,
  type CompanyMemberUser,
} from "../src/lib/company-control-room.ts";

const active = getActiveExperiment();
assert.ok(active, "one experiment should be active");
assert.equal(active.id, RELEASE_RADAR_FOLLOW_EXPERIMENT_ID);
assert.equal(EXPERIMENT_REGISTRY.filter((experiment) => experiment.status === "active").length, 1);
assert.equal(active.surface, "release_radar");
assert.match(active.baseline, /Follow release/);
assert.match(active.hypothesis, /authenticated members/i);
assert.equal(active.primaryMetric, "release_follow_completed");
assert.ok(active.minSampleSizePerVariant >= 50);
assert.match(active.stopRule, /95%|confidence/i);
assert.match(active.rollbackRule, /kill switch|control/i);
assert.deepEqual(active.variants.map((variant) => variant.key), ["control", "this_release"]);
assert.throws(() => getActiveExperiment([
  active,
  { ...active, id: "second-active-experiment" },
]));
assert.equal(validateExperimentRegistry(EXPERIMENT_REGISTRY).ok, true);

const assignment = assignActiveExperiment("clerk_subject_123", EXPERIMENT_REGISTRY, false);
assert.ok(assignment);
assert.deepEqual(assignActiveExperiment("clerk_subject_123", EXPERIMENT_REGISTRY, false), assignment, "assignment must remain stable");
assert.equal(assignActiveExperiment("clerk_subject_123", EXPERIMENT_REGISTRY, true), null, "kill switch must disable assignment");

const firstExposure = recordExperimentParticipation({}, active, assignment, "exposure");
assert.equal(firstExposure.changed, true);
const repeatedExposure = recordExperimentParticipation(firstExposure.privateMetadata, active, assignment, "exposure");
assert.equal(repeatedExposure.changed, false, "a repeated exposure must not create another record");
assert.deepEqual(repeatedExposure.privateMetadata, firstExposure.privateMetadata);

const firstConversion = recordExperimentParticipation(firstExposure.privateMetadata, active, assignment, "conversion");
assert.equal(firstConversion.changed, true);
const repeatedConversion = recordExperimentParticipation(firstConversion.privateMetadata, active, assignment, "conversion");
assert.equal(repeatedConversion.changed, false, "a repeated conversion must not create another record");
assert.deepEqual(repeatedConversion.privateMetadata, firstConversion.privateMetadata);
assert.deepEqual(firstConversion.privateMetadata[EXPERIMENT_PARTICIPATION_METADATA_KEY], {
  [active.id]: { variant: assignment.variant, exposed: true, converted: true },
});

const privateMetadataJson = JSON.stringify(firstConversion.privateMetadata);
for (const forbidden of ["clerk_subject_123", "member@example.com", "https://", "occurredAt", "visited", "history", "path", "timestamp"]) {
  assert.equal(privateMetadataJson.includes(forbidden), false, `private metadata must exclude ${forbidden}`);
}
const apiResponse = buildExperimentApiResponse(active, assignment);
assert.deepEqual(Object.keys(apiResponse).sort(), ["ctaLabel", "enabled", "variant"]);
assert.equal(JSON.stringify(apiResponse).includes("clerk_subject_123"), false);

function participant(id: string, variant: "control" | "this_release", converted: boolean, role = "member", email = `${id}@example.com`): CompanyMemberUser {
  return {
    id,
    primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: email }],
    publicMetadata: { role },
    privateMetadata: {
      [EXPERIMENT_PARTICIPATION_METADATA_KEY]: {
        [active.id]: { variant, exposed: true, converted },
      },
    },
  };
}

const eligibleUsers: CompanyMemberUser[] = [
  ...Array.from({ length: 5 }, (_, index) => participant(`control-${index}`, "control", index < 1)),
  ...Array.from({ length: 5 }, (_, index) => participant(`variant-${index}`, "this_release", index < 2)),
];
const duplicateSubject = eligibleUsers[0];
const users = [
  ...eligibleUsers,
  duplicateSubject,
  participant("retailer", "this_release", true, "retailer"),
  participant("owner", "this_release", true, "member", "chandler@bourbonsignal.com"),
];
const telemetry = buildEligibleExperimentTelemetry(users);
assert.equal(telemetry.filter((event) => event.name === "experiment_exposure").length, 10, "each eligible Clerk subject contributes at most one exposure");
assert.equal(telemetry.filter((event) => event.name === "experiment_metric").length, 3, "each eligible Clerk subject contributes at most one conversion");
assert.equal(JSON.stringify(telemetry).includes("control-0"), false, "telemetry must not export Clerk IDs");

const ownerAggregate = buildOwnerExperimentAggregate(users);
const result = ownerAggregate.aggregate.experiments[0];
assert.equal(result.variants.find((variant) => variant.variant === "control")?.exposures, 5);
assert.equal(result.variants.find((variant) => variant.variant === "control")?.metrics?.release_follow_completed, 1);
assert.equal(result.variants.find((variant) => variant.variant === "this_release")?.exposures, 5);
assert.equal(result.variants.find((variant) => variant.variant === "this_release")?.metrics?.release_follow_completed, 2);
const aggregateJson = JSON.stringify(ownerAggregate);
for (const forbidden of ["control-0", "@example.com", "chandler@bourbonsignal.com", "occurredAt", "history"]) {
  assert.equal(aggregateJson.includes(forbidden), false, `Control Room aggregate must exclude ${forbidden}`);
}

const routeSource = readFileSync(new URL("../src/app/api/experiments/release-radar-follow/route.ts", import.meta.url), "utf8");
assert.match(routeSource, /auth\(\)/, "experiment API must authenticate through Clerk");
assert.match(routeSource, /privateMetadata/, "experiment API must persist only private metadata");
assert.ok(routeSource.indexOf("isExperimentKillSwitchEnabled()") < routeSource.lastIndexOf("updateUserMetadata"), "kill switch must gate the Clerk write");
assert.doesNotMatch(routeSource, /console\.|emailAddresses.*NextResponse|send|Resend|message/i, "experiment API must not log identities or message customers");
const actionSource = readFileSync(new URL("../src/components/release-radar/RadarEntryActions.tsx", import.meta.url), "utf8");
assert.match(actionSource, /useReleaseRadarFollowExperiment/);
assert.match(actionSource, /recordConversion/);

console.log("Release Radar follow CTA experiment contracts passed.");
