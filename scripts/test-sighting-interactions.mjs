import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySightingVote, compactSightingsPreferencesForMetadata } from '../src/lib/sightings.ts';

const existing = [{ sightingId: 's-1', kind: 'up', createdAt: '2026-07-10T00:00:00.000Z' }];
assert.deepEqual(applySightingVote(existing, 's-1', 'up', '2026-07-11T00:00:00.000Z'), [], 'same vote toggles off');
assert.equal(applySightingVote(existing, 's-1', 'down', '2026-07-11T00:00:00.000Z')[0]?.kind, 'down', 'opposite vote replaces prior vote');
assert.equal(applySightingVote([], 's-2', 'up', '2026-07-11T00:00:00.000Z')[0]?.sightingId, 's-2', 'new vote persists');

const bloated = {
  submittedSightings: [{ id: 's-1', bottleName: 'Bottle', storeId: 'store', storeName: 'Store', storeAddress: '1 Main St', source: 'custom', createdAt: '2026-07-10T00:00:00.000Z', reporterUserId: 'derived-owner', rewardState: { basePointsAwarded: 1, verificationSources: ['photo', 'community'], verifiedAt: '2026-07-10T00:00:00.000Z', photoProof: { url: 'https://example.test/photo.jpg', uploadedAt: '2026-07-10T00:00:00.000Z', status: 'verified_public' } }, reviewState: { needsStoreReview: false } }],
  signalReports: [],
  sightingVotes: [],
};
const compacted = compactSightingsPreferencesForMetadata(bloated);
assert.equal(compacted.submittedSightings[0].reporterUserId, undefined, 'owner id is derived during aggregation');
assert.equal(compacted.submittedSightings[0].rewardState?.photoProof?.url, 'https://example.test/photo.jpg', 'public proof survives compaction');
assert.equal(compacted.submittedSightings[0].rewardState?.verificationSources, undefined, 'derived reward evidence does not bloat Clerk metadata');
assert.ok(JSON.stringify(compacted).length < JSON.stringify(bloated).length, 'metadata compaction leaves room for later sightings and votes');

const hook = readFileSync(new URL('../src/hooks/useSightings.ts', import.meta.url), 'utf8');
assert.match(hook, /data\.error/, 'API errors should reach the member instead of failing silently');
assert.match(hook, /optimistic/i, 'votes should update immediately while persistence completes');

const sightingsClient = readFileSync(new URL('../src/app/sightings/SightingsClient.tsx', import.meta.url), 'utf8');
assert.match(sightingsClient, /Sighting saved, but the photo could not be uploaded/, 'photo failure must not hide a saved sighting');
assert.match(sightingsClient, /catch \(error\)/, 'submission errors must be surfaced');

const bottleCheck = readFileSync(new URL('../src/app/bottle-check/page.tsx', import.meta.url), 'utf8');
assert.match(bottleCheck, /useState\(""\)/, 'Bottle Check should begin with a clean search field');
assert.match(bottleCheck, /\.bc-live-suggestions \{[^}]*position:absolute/s, 'typeahead should anchor directly beneath the search input');

console.log('Sighting interactions and Bottle Check typeahead verified.');
