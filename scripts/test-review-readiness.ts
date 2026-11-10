import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rewardMembershipMetadata } from '../src/lib/reward-membership.ts';
import { resolveEffectiveMembershipTier } from '../src/lib/entitlements.ts';

const now = new Date('2026-11-09T12:00:00Z');
const sandbox = { tier: 'free', appleMembershipTier: 'barrel', appleMembershipPlan: 'barrel_monthly', appleMembershipStatus: 'active', appleMembershipExpiresAt: '2027-01-01T00:00:00Z' };
test('sandbox unlocks app testing but cannot qualify for paid rewards', () => {
  assert.equal(resolveEffectiveMembershipTier(sandbox, now), 'barrel');
  assert.equal(resolveEffectiveMembershipTier(rewardMembershipMetadata(sandbox, { appleMembershipEnvironment: 'sandbox' }), now), 'free');
  assert.equal(sandbox.appleMembershipTier, 'barrel');
});
test('production Apple access and independent Founder/Stripe access survive', () => {
  assert.equal(resolveEffectiveMembershipTier(rewardMembershipMetadata(sandbox, { appleMembershipEnvironment: 'production' }), now), 'barrel');
  for (const independent of [{ tier: 'barrel', plan: 'barrel_monthly', membershipStatus: 'active' }, { tier: 'bottled-in-bond', plan: 'bib_lifetime', membershipStatus: 'lifetime' }]) {
    assert.equal(resolveEffectiveMembershipTier(rewardMembershipMetadata({ ...sandbox, ...independent }, { appleMembershipEnvironment: 'sandbox' }), now), independent.tier);
  }
});
test('caller public environment cannot override private sandbox authority', () => {
  assert.equal(resolveEffectiveMembershipTier(rewardMembershipMetadata({ ...sandbox, appleMembershipEnvironment: 'production' }, { appleMembershipEnvironment: 'sandbox' }), now), 'free');
});
test('Google sandbox cannot satisfy rewards either', () => {
  const google = Object.fromEntries(Object.entries(sandbox).map(([k,v]) => [k.replace('apple', 'google'),v]));
  assert.equal(resolveEffectiveMembershipTier(rewardMembershipMetadata(google, { googleMembershipEnvironment: 'sandbox' }), now), 'free');
});
