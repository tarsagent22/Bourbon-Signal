import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../src/app/api/v1/me/account/route.ts");
const identityProvider = read("../src/lib/account-deletion-identity-provider.ts");
const schema = read("../src/lib/account-deletion-schema.sql");
const repository = read("../src/lib/account-deletion-repository.ts");
const migration = read("./migrate-app-storage.mjs");

test("account deletion is authenticated, recent-auth gated, and uses Clerk server revocation APIs", () => {
  assert.match(route, /await auth\(\)/);
  assert.match(route, /factorVerificationAge/);
  assert.match(route, /confirmation/);
  assert.match(route, /requestAccountDeletion/);
  assert.match(route, /withMemberAlertLease\(userId,[\s\S]*requireDurable:\s*true/, "deletion must fence final push authorization with the member delivery lease");
  assert.match(identityProvider, /pushDevices:\s*\[\]/);
  assert.match(identityProvider, /notificationPreferences/);
  assert.match(identityProvider, /onSite:\s*\{\s*enabled:\s*false/);
  assert.match(identityProvider, /push:\s*\{\s*enabled:\s*false/);
  assert.match(identityProvider, /email:\s*\{[^}]*enabled:\s*false/);
  assert.match(identityProvider, /sms:\s*\{[^}]*enabled:\s*false/);
  assert.match(identityProvider, /sessions\.getSessionList/);
  assert.match(identityProvider, /sessions\.revokeSession/);
  assert.match(identityProvider, /users\.banUser/);
  assert.match(identityProvider, /users\.deleteUser/);
  assert.doesNotMatch(`${route}\n${identityProvider}`, /console\.(?:log|error|warn)/);
});

test("deletion tombstones are durable and canonical migration installs them", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS account_deletion_requests/i);
  assert.match(schema, /remaining_cleanup JSONB NOT NULL/i);
  assert.match(schema, /status TEXT NOT NULL/i);
  assert.match(migration, /account-deletion-schema\.sql/);
  for (const pending of ["application_data_cleanup_pending", "identity_metadata_cleanup_pending", "session_revocation_pending", "identity_ban_pending", "identity_deletion_pending"]) {
    assert.match(repository, new RegExp(pending));
  }
});

test("proven immediate cleanup removes owned product data and disables every queued delivery lane", () => {
  for (const table of [
    "member_push_ownership", "alert_push_outbox", "alert_push_tickets", "alert_candidates", "alert_baselines",
    "member_collection_state", "member_collection_legacy_backups", "bourbon_recommendation_feedback_state",
    "hunt_outcomes", "welcome_signal_previews", "community_sightings", "community_sighting_votes",
  ]) assert.match(repository, new RegExp(table));
  assert.doesNotMatch(repository, /alert_resource_leases/, "deletion must not reference a nonexistent lease table");
  assert.match(repository, /alert_push_outbox[\s\S]*status IN \('pending','unknown','accepted'\)[\s\S]*THEN 'suppressed'/);
  assert.match(repository, /alert_push_tickets[\s\S]*account_deleted_after_acceptance/);
  assert.match(repository, /DELETE FROM alert_candidates[\s\S]*status IN \('pending','claimed','failed'\)/);
  assert.doesNotMatch(repository, /DELETE\s+FROM\s+signal_point_ledger/i);
  assert.doesNotMatch(repository, /DELETE\s+FROM\s+gift_orders/i);
  assert.doesNotMatch(repository, /DELETE\s+FROM\s+coverage_requests/i);
});
