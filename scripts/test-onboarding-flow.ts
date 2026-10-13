import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_ONBOARDING, normalizeOnboardingDraft, beginnerPath, communityAlertsIncluded, usefulOnboardingCoverage } from '../shared/mobile-onboarding';
import { createSignalFeedHandler } from '../src/lib/signals/signal-route';
import { starterSuggestions } from '../src/lib/onboarding-discovery';
import { TIER_ENTITLEMENTS } from '../src/lib/entitlements';
import { MobileOnboardingValidationError, prepareMobileOnboarding } from '../src/lib/mobile-onboarding';
import { loadWithMocks } from '../apps/mobile/src/astra-test-harness';

test('drafts are bounded, validated, and keep the agreed interest paths', () => {
  assert.ok(normalizeOnboardingDraft(EMPTY_ONBOARDING));
  assert.equal(normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, step: 99 }), null);
  assert.equal(normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, homeState: 'XX' }), null);
  assert.equal(normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, displayName: 'a'.repeat(33) }), null);
  assert.equal(normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, flavors: ['invented'] }), null);
  assert.equal(beginnerPath('starting'), true); assert.equal(beginnerPath('unsure'), true);
  assert.equal(beginnerPath('enthusiast'), false); assert.equal(beginnerPath('hunter'), false);
});
test('Community is readable by Free, but Community alerts remain Barrel-only', () => {
  assert.equal(TIER_ENTITLEMENTS.free.sightingsPreviewLimit, null);
  assert.equal(TIER_ENTITLEMENTS.free.feedPreviewLimit, 6);
  assert.equal(TIER_ENTITLEMENTS.free.canUseStateFilter, false);
  for (const tier of ['free', 'standard', 'barrel', 'bottled-in-bond'] as const) assert.equal(communityAlertsIncluded(tier), TIER_ENTITLEMENTS[tier].canReceiveSightingsAlerts);
});
test('a merely active or stale state does not receive the stronger onboarding coverage pitch', () => {
  const state = { code: 'NC', summary: '', coverageStatus: 'available' as const, coverageStrength: 'strong' as const, health: 'current' as const };
  assert.equal(usefulOnboardingCoverage(state), true);
  assert.equal(usefulOnboardingCoverage({ ...state, coverageStrength: 'moderate' }), true);
  assert.equal(usefulOnboardingCoverage({ ...state, coverageStrength: 'sparse' }), false);
  assert.equal(usefulOnboardingCoverage({ ...state, health: 'temporarily-limited' }), false);
  assert.equal(usefulOnboardingCoverage({ ...state, coverageStatus: 'not-available' }), false);
});
test('Free filtering is rejected before source reads; Standard state selection remains allowed', async () => {
  let reads = 0;
  const getDrops = async () => { reads++; return Response.json({ drops: [], total: 0, snapshot: 'fixture', hasMore: false }); };
  const getSightings = async () => { reads++; return Response.json({ sightings: [], totalSightings: 0, previewLimit: null }); };
  const handler = (paid: boolean) => createSignalFeedHandler({ getDrops, getSightings, getFilterAccess: async () => ({ canUseStateFilter: paid, canUseDropFeedFilters: false, canUseBottleSearch: false, canUseAdvancedFilters: false }) });
  for (const query of ['state=NC', 'tiers=allocated', 'tiers=&tiers=allocated', 'area=Triad%20Municipal%20ABC&state=NC', 'search=Stagg', 'freshness=24h']) {
    assert.equal((await handler(false)(new Request(`https://example.test/api/v1/signals?view=market&${query}`))).status, 403, query);
  }
  assert.equal(reads, 0);
  assert.equal((await handler(true)(new Request('https://example.test/api/v1/signals?view=market&state=NC'))).status, 200);
});
test('starting suggestions obey known budget/proof, exclude unknown prices, and explain flavor matches', () => {
  const candidates = [
    { id: 'makers-mark', name: "Maker's Mark", proof: 90, msrp: 30, tags: ['Sweet', 'Caramel'] },
    { id: 'wild-turkey-101', name: 'Wild Turkey 101', proof: 101, msrp: 25, tags: ['Spice'] },
    { id: 'knob-creek-9', name: 'Knob Creek 9', proof: 100, tags: ['Oak'] },
    { id: 'unicorn', name: 'Rare bottle', proof: 90, msrp: 30, tags: ['Sweet'] },
  ];
  const draft = { ...EMPTY_ONBOARDING, proof: 'gentle' as const, budget: 'Under $40' as const, flavors: ['Sweet & caramel'] };
  const picks = starterSuggestions(candidates, draft);
  assert.deepEqual(picks.map(pick => pick.id), ['makers-mark']); assert.match(picks[0].reason, /sweet and caramel/);
  assert.equal(starterSuggestions(candidates, { ...draft, likedBottleId: 'makers-mark' }).length, 0);
  assert.equal(starterSuggestions(candidates, { ...draft, budget: '$40–$70' }).length, 0);
});
function routeHarness() {
  let signedIn = true;
  const user: any = { id: 'member-1', publicMetadata: { communityDisplayName: '', memberProfile: { avatar: 'keep' } }, privateMetadata: {} };
  const client = { users: { async getUser() { return structuredClone(user); }, async updateUserMetadata(_id: string, patch: any) {
    if (patch.publicMetadata) user.publicMetadata = { ...user.publicMetadata, ...patch.publicMetadata };
    if (patch.privateMetadata) user.privateMetadata = { ...user.privateMetadata, ...patch.privateMetadata };
  } } };
  const route = loadWithMocks('src/app/api/v1/me/onboarding/route.ts', {
    '@clerk/nextjs/server': { auth: async () => ({ userId: signedIn ? user.id : null }), clerkClient: async () => client },
    '@/lib/community-sightings-repository': { createCommunitySightingsRepository: () => null },
    '@/lib/community-display-name': { communityDisplayNameFromMetadata: (metadata: any) => metadata.communityDisplayName },
    '@/lib/mobile-onboarding': { prepareMobileOnboarding, MobileOnboardingValidationError },
    '@/lib/signals/signal-api-contract': { publicSignalIdentityFromMetadata: () => null },
    '@/lib/signals/signal-api-route': { PRIVATE_SIGNAL_API_HEADERS: { 'Cache-Control': 'private, no-store' }, signalApiError: (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status }) },
    '@/lib/member-numbers': { ensureMemberNumber: async (_client: unknown, member: unknown) => member },
    '../../../../../../shared/mobile-onboarding': { normalizeOnboardingDraft },
  });
  const post = (body: unknown) => route.POST(new Request('https://example.test/api/v1/me/onboarding', { method: 'POST', body: JSON.stringify(body) }));
  return { route, user, post, signOut: () => { signedIn = false; } };
}
test('saving profile does not finish onboarding; progress resumes until the final explicit action', async () => {
  const h = routeHarness(); const draft = { ...EMPTY_ONBOARDING, displayName: 'Oak Street', homeState: 'NC', step: 2 };
  const body = { displayName: 'Oak Street', homeState: 'NC', age21Affirmed: true, draft };
  assert.equal((await (await h.post({ ...body, action: 'profile' })).json()).completed, false);
  assert.equal(h.user.publicMetadata.memberProfile.avatar, 'keep');
  const affirmed = h.user.privateMetadata.mobileOnboarding.age21AffirmedAt;
  assert.equal((await (await h.route.GET()).json()).draft.step, 2);
  assert.equal((await (await h.post({ action: 'save', draft: { ...draft, step: 4 } })).json()).completed, false);
  assert.equal((await (await h.route.GET()).json()).draft.step, 4);
  assert.equal((await (await h.post({ ...body, action: 'complete' })).json()).completed, true);
  assert.equal(h.user.privateMetadata.mobileOnboarding.age21AffirmedAt, affirmed);
  assert.equal((await (await h.route.GET()).json()).completed, true);
});
test('invalid setup and unauthenticated writes cannot complete an account', async () => {
  const h = routeHarness();
  assert.equal((await h.post({ action: 'save', draft: { ...EMPTY_ONBOARDING, step: 1000 } })).status, 400);
  assert.equal((await h.post({ displayName: 'Oak', homeState: 'NC', age21Affirmed: false })).status, 400);
  assert.equal(h.user.privateMetadata.mobileOnboarding, undefined);
  h.signOut(); assert.equal((await h.post({ action: 'save', draft: EMPTY_ONBOARDING })).status, 401);
});
