import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  bottleContributionStatusForAction,
  isBottleContributionPending,
  selectLatestQueueBlob,
} from "../src/lib/admin-review.ts";

assert.equal(bottleContributionStatusForAction("use_match"), "matched_existing");
assert.equal(bottleContributionStatusForAction("confirm_added"), "added");
assert.equal(bottleContributionStatusForAction("dismiss"), "rejected");
assert.equal(bottleContributionStatusForAction("needs_human"), null);
assert.equal(isBottleContributionPending("new"), true);
assert.equal(isBottleContributionPending("needs_human"), true);
assert.equal(isBottleContributionPending("matched_existing"), false);
assert.equal(isBottleContributionPending("added"), false);
assert.equal(isBottleContributionPending("rejected"), false);

const latest = selectLatestQueueBlob([
  { pathname: "bottle-contributions/queue.json", url: "legacy", uploadedAt: new Date("2026-07-01T00:00:00Z") },
  { pathname: "bottle-contributions/queue-100-a.json", url: "first", uploadedAt: new Date("2026-07-18T10:00:00Z") },
  { pathname: "bottle-contributions/queue-200-b.json", url: "latest", uploadedAt: new Date("2026-07-18T11:00:00Z") },
]);
assert.equal(latest?.url, "latest");

const bottleStorage = readFileSync(new URL("../src/lib/bottle-contributions.ts", import.meta.url), "utf8");
assert.match(bottleStorage, /createBottleContributionRepository/);
assert.doesNotMatch(bottleStorage, /access:\s*"public"|queue-\$\{Date\.now\(\)\}|\bdel\(/);
const bottleRepository = readFileSync(new URL("../src/lib/bottle-contribution-repository.ts", import.meta.url), "utf8");
assert.match(bottleRepository, /CREATE UNIQUE INDEX IF NOT EXISTS bottle_contributions_actionable_name_idx/);
assert.match(bottleRepository, /ON CONFLICT \(normalized_name\) WHERE status IN \('new', 'needs_human'\)/);
assert.match(bottleRepository, /pg_advisory_xact_lock/);
assert.match(bottleRepository, /RETURNING payload/);

const bottleClient = readFileSync(new URL("../src/app/admin/bottle-queue/AdminBottleQueueClient.tsx", import.meta.url), "utf8");
for (const phrase of ["Use suggested match", "I added this bottle", "Dismiss invalid entry", "pendingReview", "role=\"status\"", "navigator.vibrate", "embedded"]) {
  assert.match(bottleClient, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
for (const phrase of ["Needs Chandler", "Spam/reject", ">Ignore<", "Mark added"]) {
  assert.doesNotMatch(bottleClient, new RegExp(phrase));
}

const bottleRoute = readFileSync(new URL("../src/app/api/admin/bottle-contributions/route.ts", import.meta.url), "utf8");
assert.match(bottleRoute, /pendingReview:\s*isBottleContributionPending/);
assert.match(bottleRoute, /bottleContributionStatusForAction/);

const sightingClient = readFileSync(new URL("../src/app/admin/sightings/AdminSightingsClient.tsx", import.meta.url), "utf8");
for (const phrase of ["Approve & publish", "Approve, keep photo private", "Reject sighting", "navigator.vibrate"]) assert.match(sightingClient, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const phrase of ["Reject photo", ">Remove<", "Mark catalog added"]) assert.doesNotMatch(sightingClient, new RegExp(phrase));

const controlRoom = readFileSync(new URL("../src/app/admin/control-room/page.tsx", import.meta.url), "utf8");
assert.ok(controlRoom.indexOf('id="actions"') < controlRoom.indexOf('id="business"'), "owner actions must precede business metrics");
assert.match(controlRoom, /<AdminBottleQueueClient embedded \/>/);
assert.match(controlRoom, /What is running in the background/);
assert.match(controlRoom, /Runs automatically on eligible Release Radar traffic/);
assert.match(controlRoom, /Automation reporting is not connected/);
assert.doesNotMatch(controlRoom, /<h2>Automation mix<\/h2>/);

console.log("Control Room review-action contract passed.");
