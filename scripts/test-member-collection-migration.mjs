import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const route = read('src/app/api/user/preferences/route.ts');
const hook = read('src/hooks/useAreaPreferences.ts');
const dashboard = read('src/app/dashboard/page.tsx');
const tasteScore = read('src/lib/member-taste-score.ts');
const schema = read('src/lib/member-collection-schema.sql');
const migration = read('scripts/migrate-app-storage.mjs');

assert.match(schema, /CREATE TABLE IF NOT EXISTS member_collection_state/i);
assert.match(schema, /CREATE TABLE IF NOT EXISTS member_collection_bottles/i);
assert.match(schema, /PRIMARY KEY\s*\(\s*user_id\s*,\s*canonical_key\s*\)/i);
assert.match(schema, /version BIGINT NOT NULL DEFAULT 0/i);
assert.match(migration, /--check/);
assert.match(migration, /--apply/);

assert.match(route, /getMemberCollectionRepository/);
assert.match(route, /migrateLegacyForUser/);
assert.match(route, /replaceForUser/);
assert.match(route, /delete publicMetadataPatch\.collectionPreferences/, 'collection writes never rewrite the oversized Clerk payload');
assert.doesNotMatch(route, /publicMetadataPatch\.collectionPreferences\s*=\s*null/, 'legacy Clerk data remains available during the rollback grace period');
assert.match(route, /durable_member_collection_unavailable/);
assert.ok(
  route.indexOf('memberProfile = applyMemberProfilePreferencePatch') < route.indexOf('getMemberCollectionRepository().replaceForUser'),
  'payload validation must happen before collection storage is mutated',
);
assert.doesNotMatch(route, /collectionPreferences:\s*normalizeCollectionPreferences\(user\.publicMetadata/, 'GET must not treat Clerk metadata as the durable collection source');

assert.match(hook, /readPendingCollection/);
assert.match(hook, /writePendingCollection/);
assert.match(hook, /clearPendingCollection/);
assert.match(hook, /syncPendingCollection/);
assert.match(hook, /status:\s*["']pending["']/);
assert.match(hook, /status:\s*["']conflict["']/);
assert.match(hook, /pendingWrite\.operationId/);
assert.match(dashboard, /setSavingCollection\(true\)/);
assert.match(dashboard, /await savePreferences\(nextPrefs\)/);
assert.doesNotMatch(dashboard, /setSavingCollection\(false\)[\s\S]{0,300}void savePreferences\(nextPrefs\)/, 'collection UI must await persistence');
assert.match(dashboard, /Saved on this device[\s\S]*sync/i, 'offline saves are labelled honestly');

assert.match(tasteScore, /getTasteAggregate/);
assert.doesNotMatch(tasteScore, /clerkClient|getUserList/, 'member taste scoring reads aggregate collection rows instead of scanning Clerk accounts');

console.log('member collection migration contracts passed');
