import assert from 'node:assert/strict';
import test from 'node:test';
import { createBottleProfileHandler } from '../src/lib/bottle-profile-route.ts';
import type { BibleBottle } from '../src/lib/bourbonBible';
const bottle = { id: 'example-10', canonicalName: 'Example 10 Year', brand: 'Example', category: 'bourbon', proof: 90, msrp: null, ageStatement: '10 years', nationalTier: 'allocated', nationalConfidence: 'low', scarcityLastReviewedAt: null } as BibleBottle;
test('profile requires authentication before catalog access and never caches member responses publicly', async () => {
  const handler = createBottleProfileHandler({ authenticate: async () => null, readBottle: async () => { assert.fail('unauthenticated catalog access'); } });
  const response = await handler('example-10'); assert.equal(response.status, 401); assert.match(response.headers.get('Cache-Control')!, /private, no-store/);
});
test('unknown identity and invalid identity remain distinct from catalog outages', async () => {
  const handler = createBottleProfileHandler({ authenticate: async () => 'member', readBottle: async () => null });
  assert.equal((await handler('missing')).status, 404); assert.equal((await handler('x'.repeat(161))).status, 400);
  const unavailable = createBottleProfileHandler({ authenticate: async () => 'member', readBottle: async () => { throw new Error('database'); } });
  const response = await unavailable('example-10'); assert.equal(response.status, 503); assert.equal((await response.json()).error.retryable, true);
});
test('profile preserves missing prices and pending rarity without fabricating facts', async () => {
  const handler = createBottleProfileHandler({ authenticate: async () => 'member', readBottle: async () => bottle });
  const response = await handler(bottle.id); const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.bottle.msrp, null); assert.equal(payload.bottle.rarity.pending, true); assert.equal(payload.bottle.proof, 90);
  assert.equal(payload.bottle.guidance, undefined); assert.equal(payload.bottle.secondary, undefined);
});
test('redirected catalog identity is returned as canonical and nonfinite prices are omitted', async () => {
  const handler = createBottleProfileHandler({ authenticate: async () => 'member', readBottle: async () => ({ ...bottle, msrp: Infinity, proof: NaN }) });
  const payload = await (await handler('old-id')).json(); assert.equal(payload.bottle.id, bottle.id); assert.equal(payload.bottle.msrp, null); assert.equal(payload.bottle.proof, null);
});

test('state context uses source-backed overrides and rejects unknown regions without leaking private evidence', async () => {
  const override = { jurisdiction: 'AL', tier: 'allocated', confidence: 'medium', reason: 'Synthetic official allocation fixture', officialAllocationStatus: 'state_allocated', verifiedOpportunityCount: 0, coverageDenominator: 0, evidenceWindow: { start: '2026-05-01', end: '2026-08-03' }, sourceIds: ['official-al-master-list'], lastReviewedAt: '2026-08-03' } as const;
  const handler = createBottleProfileHandler({ authenticate: async () => 'member', readBottle: async () => ({ ...bottle, stateOverrides: [{ ...override, sourceIds: [...override.sourceIds] }] }) });
  const al = await (await handler(bottle.id, 'AL')).json();
  assert.equal(al.bottle.marketRarity.state, 'AL'); assert.equal(al.bottle.marketRarity.tier, 'allocated');
  assert.match(al.bottle.marketRarity.sources[0].url, /^https:\/\/alabcboard.gov/);
  assert.equal((await (await handler(bottle.id, 'NC')).json()).bottle.marketRarity, null);
  assert.equal((await handler(bottle.id, 'XX')).status, 400);
  const weak = createBottleProfileHandler({ authenticate: async () => 'member', readBottle: async () => ({ ...bottle, stateOverrides: [{ ...override, confidence: 'low', sourceIds: [...override.sourceIds] }] }) });
  assert.equal((await (await weak(bottle.id, 'AL')).json()).bottle.marketRarity, null);
});
