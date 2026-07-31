import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runtime = read('src/lib/neon-runtime.ts');
const bottleRepository = read('src/lib/bottle-contribution-repository.ts');
const sightingsRepository = read('src/lib/community-sightings-repository.ts');
const retailerRepository = read('src/lib/retailer-repository.ts');
const controlRoom = read('src/lib/company-control-room-server.ts');
const packageJson = JSON.parse(read('package.json'));
const backup = read('scripts/backup-neon-local.mjs');
const migration = read('scripts/migrate-app-storage.mjs');
const release = read('scripts/release-production.mjs');

const runtimeSelection = runtime.match(/return env\.BOURBON_QUEUE_DATABASE_URL[\s\S]*?\|\| null/)?.[0] || '';
const pooledIndex = runtimeSelection.indexOf('env.BOURBON_QUEUE_DATABASE_URL');
const dedicatedUnpooledIndex = runtimeSelection.indexOf('env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED');
const genericIndex = runtimeSelection.indexOf('env.DATABASE_URL');
assert.ok(pooledIndex >= 0 && pooledIndex < dedicatedUnpooledIndex && dedicatedUnpooledIndex < genericIndex, 'runtime uses dedicated pooled, dedicated unpooled, then generic database URLs');
for (const [name, source] of Object.entries({ bottleRepository, sightingsRepository, retailerRepository })) {
  assert.doesNotMatch(source, /ensureSchema\(/, `${name} must not execute schema migrations in request paths`);
  assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|CREATE INDEX/i, `${name} contains DML only`);
}
assert.equal(packageJson.scripts['migrate:app-storage'], 'node scripts/migrate-app-storage.mjs --check');
assert.equal(packageJson.scripts['migrate:app-storage:apply'], 'node scripts/migrate-app-storage.mjs --apply');
assert.equal(packageJson.scripts['backup:neon-local'], 'node scripts/backup-neon-local.mjs');

assert.match(backup, /createCipheriv\(["']aes-256-gcm["']/);
assert.match(backup, /ProtectedData.*CurrentUser/s, 'Windows protects the local AES key with DPAPI');
assert.match(backup, /gzipSync/);
assert.match(backup, /retention/i);
assert.match(backup, /['"]coverage_request_automation_jobs['"]/, 'encrypted backups include the durable coverage automation queue');
assert.match(backup, /Number\.isInteger\(configuredRetention\)/);
assert.match(backup, /isolationLevel:\s*['"]RepeatableRead['"]/);
assert.match(backup, /JSON\.parse\(await readFile\(temporaryFile/);
assert.doesNotMatch(backup, /writeFile\([^\n]+JSON\.stringify\(payload/, 'raw database JSON is never written to disk');
assert.match(migration, /requiredColumns/);
assert.match(migration, /expectedIndexes/);
assert.match(migration, /retailer_submissions_store_id_fkey/);
assert.match(release, /vercel['"], \[['"]env['"], ['"]run['"], ['"]-e['"], ['"]production['"][\s\S]*migrate:app-storage/);
assert.match(controlRoom, /CONTROL_ROOM_CACHE_TTL_MS\s*=\s*20_000/, 'Control Room aggregation should have a short bounded cache');
assert.match(controlRoom, /controlRoomInFlight/, 'concurrent Control Room loads should be deduplicated');

console.log('Neon runtime efficiency contracts passed');
