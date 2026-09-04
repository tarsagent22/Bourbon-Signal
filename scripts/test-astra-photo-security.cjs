const { test } = require('node:test');
const assert = require('node:assert/strict');
const { functions, moduleFrom } = require('./astra-security-test-helpers.cjs');
const validators = moduleFrom('src/lib/sighting-photo-upload.ts');
const route = 'src/app/api/sightings/photo/route.ts';
const proof = { url: 'https://fixture.invalid/winner.jpg', pathname: 'sighting-proofs/sighting_owned/1.jpg', status: 'verified_public' };
function attachment({ existing = proof, race = false, owner = 'user_fixture', metadata } = {}) {
  const deleted = [], lookups = [];
  const uploaded = metadata || { url: 'https://fixture.invalid/new.jpg', pathname: 'sighting-proofs/sighting_owned/3.jpg', size: 50, contentType: 'image/jpeg' };
  const repo = { replacePhotoProof: async (_id, _user, previous) => race && previous === null ? null : { rewardGeneration: 1 }, getSighting: async () => ({ reporterUserId: owner, rewardState: { photoProof: proof } }) };
  const ctx = functions(route, ['attachUploadedPhoto'], { ...validators,
    getOwnedSighting: async () => ({ target: { reporterUserId: owner, rewardState: { photoProof: existing } }, repository: repo }),
    reconcileAttachedPhotoRewards: async () => {}, head: async value => { lookups.push(value); return uploaded; },
    del: async value => deleted.push(value), BlobNotFoundError: class extends Error {},
  });
  return { run: (blob = { pathname: uploaded.pathname, url: 'https://fixture.invalid/another-members-photo.jpg' }) => ctx.attachUploadedPhoto({ sightingId: 'sighting_owned', userId: 'user_fixture', blob, token: 'offline-fixture' }), deleted, lookups };
}
test('F1 audit counterexample: winning proof replays without deleting arbitrary URL or pathname', async () => {
  for (const url of ['https://fixture.invalid/another-members-photo.jpg', undefined]) {
    const h = attachment();
    assert.equal(await h.run({ pathname: 'sighting-proofs/sighting_owned/3.jpg', url }), proof);
    assert.deepEqual(h.deleted, []);
    assert.deepEqual(h.lookups, []);
  }
});
test('F1 first attachment resolves configured-store pathname, never caller URL', async () => {
  const h = attachment({ existing: null });
  const result = await h.run();
  assert.equal(result.url, 'https://fixture.invalid/new.jpg');
  assert.deepEqual(h.lookups, ['sighting-proofs/sighting_owned/3.jpg']);
});
test('F1 concurrent losing attachment preserves winner and every existing object', async () => {
  const h = attachment({ existing: null, race: true });
  assert.equal(await h.run(), proof);
  assert.deepEqual(h.deleted, []);
});
test('F1 owner mismatch and unbound metadata cannot attach', async () => {
  await assert.rejects(attachment({ owner: 'user_other' }).run(), /Sighting not found/);
  await assert.rejects(attachment({ existing: null, metadata: { url: 'https://fixture.invalid/other.jpg', pathname: 'sighting-proofs/sighting_other/3.jpg', size: 50, contentType: 'image/jpeg' } }).run({ pathname: 'sighting-proofs/sighting_owned/3.jpg' }), /verified/);
});
test('F1 oversized IDs are rejected rather than truncated into authority', () => {
  assert.equal(validators.validSightingPhotoId('sighting_' + 'a'.repeat(151)), null);
});
test('F2 caller-writable historical metadata is never migrated by photo ownership lookup', async () => {
  let inserted = 0;
  const legacy = { id: 'sighting_forged', createdAt: '2020-01-01T00:00:00.000Z', rarityTier: 'unicorn' };
  const ctx = functions(route, ['getOwnedSighting', 'normalizePrefs'], {
    createCommunitySightingsRepository: () => ({ getSighting: async () => null, insertSightingIfAbsent: async s => { inserted++; return { sighting: s }; } }),
    clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: { sightingsPreferences: { submittedSightings: [legacy] } } }) } }),
    canonicalizeLegacySighting: s => s,
  });
  assert.equal(await ctx.getOwnedSighting(legacy.id, 'user_fixture'), null);
  assert.equal(inserted, 0);
});
test('F2 existing legitimate durable photos and moderation remain untouched', async () => {
  const target = { reporterUserId: 'user_fixture', rewardState: { photoProof: proof, removedAt: '2026-01-01' }, reviewState: { reviewedBy: 'owner' } };
  const ctx = functions(route, ['getOwnedSighting'], { createCommunitySightingsRepository: () => ({ getSighting: async () => target }) });
  assert.equal((await ctx.getOwnedSighting('sighting_owned', 'user_fixture')).target, target);
  assert.equal(await ctx.getOwnedSighting('sighting_owned', 'user_other'), null);
});
test('F2 preferences reject authority fields before storage access, preserving legacy records', async () => {
  const response = { json: (body, options) => ({ body, status: options?.status || 200 }) };
  let storage = 0;
  const ctx = functions('src/app/api/user/preferences/route.ts', ['POST'], {
    isQaPreviewRequest: () => false, auth: async () => ({ userId: 'user_fixture' }), NextResponse: response,
    clerkClient: async () => { storage++; return { users: { getUser: async () => ({}) } }; },
    loadDurableCollection: async () => null,
  });
  for (const sightingsPreferences of [{ submittedSightings: [{ id: 'sighting_forged' }] }, { sightingVotes: [] }, { signalReports: [] }]) {
    const result = await ctx.POST({ json: async () => ({ sightingsPreferences }) });
    assert.equal(result.status, 400);
  }
  assert.equal(storage, 0);
});
test('F2 voting cannot promote a missing durable record from mutable legacy metadata', async () => {
  let migrationReads = 0;
  const ctx = functions('src/app/api/sightings/route.ts', ['PATCH'], {
    isQaPreviewRequest: () => false, auth: async () => ({ userId: 'user_voter' }), requireSightingsEntitlements: async () => ({ canReadSightings: true }),
    clerkClient: async () => ({ users: { getUser: async () => ({}) } }), isRewardsAdminEmail: () => false, verifiedPrimaryClerkEmail: () => '',
    NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) },
    createCommunitySightingsRepository: () => ({ getSighting: async () => null }),
    getAggregateSightings: async () => { migrationReads++; return { sightings: [] }; },
  });
  assert.equal((await ctx.PATCH({ json: async () => ({ sightingId: 'sighting_forged', vote: 'up' }) })).status, 404);
  assert.equal(migrationReads, 0);
});
