import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessLegacyCollectionRetirement } from "./lib/legacy-collection-retirement.mjs";

const evidence = {
  legacyMigratedAt: "2026-07-29T10:00:00.000Z",
  legacyClearedAt: null,
  backup: { bottles: [{ bottleName: "Weller 12" }] },
  backedUpAt: "2026-07-29T10:00:00.000Z",
};
const safe = assessLegacyCollectionRetirement({
  legacyBottleCount: 1,
  durableBottleCount: 1,
  backupBottleCount: 1,
  durableVersion: 2,
  legacyFingerprint: "same",
  durableFingerprint: "same",
  backupFingerprint: "same",
  evidence,
});
assert.equal(safe.safeToClear, true);
assert.deepEqual(safe.reasons, []);

assert.deepEqual(assessLegacyCollectionRetirement({
  legacyBottleCount: 1,
  durableBottleCount: 1,
  backupBottleCount: 1,
  durableVersion: 2,
  legacyFingerprint: "legacy",
  durableFingerprint: "durable",
  backupFingerprint: "legacy",
  evidence,
}).reasons, ["durable_collection_differs"]);

assert.deepEqual(assessLegacyCollectionRetirement({
  legacyBottleCount: 1,
  durableBottleCount: 1,
  backupBottleCount: 0,
  durableVersion: 2,
  legacyFingerprint: "same",
  durableFingerprint: "same",
  backupFingerprint: "empty",
  evidence: { ...evidence, backup: null, backedUpAt: null },
}).reasons, ["immutable_backup_missing"]);

const migrationScript = readFileSync("scripts/migrate-clerk-collections.mts", "utf8");
const route = readFileSync("src/app/api/user/preferences/route.ts", "utf8");
assert.match(migrationScript, /safeToClear/);
assert.match(migrationScript, /getLegacyRetirementEvidence/);
assert.match(migrationScript, /post-write verification still found legacy bottles/);
assert.match(migrationScript, /listPendingLegacyClearAuditUserIds/);
assert.match(migrationScript, /currentAssessment[\s\S]*safeToClear/, "clear mode must revalidate fresh Clerk, Neon, and backup evidence immediately before mutation");
assert.match(migrationScript, /publicMetadata:\s*\{ collectionPreferences: null \}/, "clear mode must patch only the retired field, not a stale metadata snapshot");
assert.match(migrationScript, /Legacy collection parity preflight failed/, "unsafe check mode must exit non-zero");
assert.doesNotMatch(route, /migrateLegacyForUser/);
assert.match(route, /durable_collection_missing_for_legacy_user/, "legacy users must fail closed if the durable row is unexpectedly absent");
assert.match(route, /durable_member_collection_unavailable/);
console.log("legacy collection retirement contracts passed");
