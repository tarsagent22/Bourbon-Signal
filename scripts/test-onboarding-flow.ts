import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_ONBOARDING, normalizeOnboardingDraft, beginnerPath, communityAlertsIncluded, usefulOnboardingCoverage, onboardingCoveragePresentation, onboardingFlavorSelections } from '../shared/mobile-onboarding';
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
test('Community is readable by Free and Community alerts are included with every paid billing plan', () => {
  assert.equal(TIER_ENTITLEMENTS.free.sightingsPreviewLimit, null);
  assert.equal(TIER_ENTITLEMENTS.free.feedPreviewLimit, 6);
  assert.equal(TIER_ENTITLEMENTS.free.canUseStateFilter, false);
  for (const tier of ['free', 'standard', 'barrel', 'bottled-in-bond'] as const) assert.equal(communityAlertsIncluded(tier), TIER_ENTITLEMENTS[tier].canReceiveSightingsAlerts);
});
test('established coverage stays stable through delays, failures, and quiet periods', () => {
  const state = { code: 'NC', summary: '', coverageStatus: 'available' as const, coverageStrength: 'strong' as const, health: 'current' as const };
  assert.equal(usefulOnboardingCoverage(state), true);
  assert.equal(usefulOnboardingCoverage({ ...state, coverageStrength: 'moderate' }), true);
  assert.equal(usefulOnboardingCoverage({ ...state, coverageStrength: 'sparse' }), false);
  assert.equal(usefulOnboardingCoverage({ ...state, health: 'temporarily-limited' }), true);
  assert.equal(usefulOnboardingCoverage({ ...state, coverageStatus: 'not-available' }), true);
  for (const health of ['current', 'intermittent', 'temporarily-limited', 'no-recent-update'] as const) {
    const display = onboardingCoveragePresentation({ ...state, health, coverageStatus: 'not-available', customerSummary: 'internal collector_delay' });
    assert.equal(display.label, 'Strong coverage'); assert.equal(display.canRequest, false); assert.doesNotMatch(display.description, /delay|collector|inventory|internal/);
  }
  assert.equal(onboardingCoveragePresentation({ ...state, coverageStrength: 'sparse' }).canRequest, true);
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
  assert.deepEqual(picks.map(pick => pick.id), ['makers-mark']); assert.match(picks[0].reason, /caramel/);
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


test('new flavor selections and legacy drafts resume without discarding progress', () => {
  for (const flavors of [['Caramel', 'Vanilla', 'Fruit', 'Oak', 'Spice', 'Honey'], ['Sweet & caramel', 'Oak & spice']]) assert.deepEqual(normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, step: 2, flavors })?.flavors, flavors);
});
test('recommendations favor different brands when similarly relevant picks exist', () => {
  const candidates = [
    { id: 'woodford-reserve', name: 'Woodford Reserve', brand: 'Woodford', tags: ['Oak', 'Caramel'] },
    { id: 'woodford-double-oaked', name: 'Double Oaked', brand: 'Woodford', tags: ['Oak', 'Caramel'] },
    { id: 'makers-mark', name: "Maker's Mark", brand: 'Maker', tags: ['Caramel'] },
    { id: 'knob-creek-9', name: 'Knob Creek', brand: 'Knob', tags: ['Oak'] },
  ];
  const picks = starterSuggestions(candidates, { ...EMPTY_ONBOARDING, flavors: ['Oak', 'Caramel'] });
  assert.equal(new Set(picks.map(pick => pick.brand)).size, 3);
});

test('flavor strength changes the top recommendation and structural tags stay out of tasting notes', () => {
  const candidates = [
    { id: 'makers-mark', name: "Maker's Mark", tags: ['Vanilla', 'Oak', 'Balanced', 'Dessert'], tagWeights: { Vanilla: 0.9, Oak: 0.2, Balanced: 1, Dessert: 1 } },
    { id: 'elijah-craig-small-batch', name: 'Elijah Craig', tags: ['Vanilla', 'Oak'], tagWeights: { Vanilla: 0.3, Oak: 0.9 } },
  ];
  assert.equal(starterSuggestions(candidates, { ...EMPTY_ONBOARDING, flavors: ['Vanilla'] })[0].id, 'makers-mark');
  assert.equal(starterSuggestions(candidates, { ...EMPTY_ONBOARDING, flavors: ['Oak'] })[0].id, 'elijah-craig-small-batch');
  assert.doesNotMatch(starterSuggestions(candidates, EMPTY_ONBOARDING)[0].reason, /balanced|dessert/i);
});

test('resumed legacy taste choices remain visible and allow all new choices without hidden fields exceeding the draft bound', () => {
  const saved = normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, step: 2, flavors: ['Sweet & caramel', 'Fruit & vanilla', 'Oak & spice'] })!;
  const restored = onboardingFlavorSelections(saved.flavors);
  assert.deepEqual(restored, ['Caramel', 'Fruit', 'Vanilla', 'Oak', 'Spice']);
  assert.ok(normalizeOnboardingDraft({ ...saved, flavors: [...restored, 'Honey'] }));
});


test('curated recommendations explain actual choices and never claim personalization without an answer', () => {
  const candidates = [{ id: 'old-forester-100', name: 'Old Forester 100 Proof', proof: 100, tags: [] }, { id: 'four-roses-single-barrel', name: 'Four Roses Single Barrel', proof: 100, tags: [] }];
  const picks = starterSuggestions(candidates, { ...EMPTY_ONBOARDING, flavors: ['Oak'], proof: 'bold' });
  assert.equal(picks[0].id, 'old-forester-100'); assert.match(picks[0].reason, /oak.*chose/);
  assert.match(picks[0].description, /cherry.*citrus.*oak/i);
  assert.notEqual(picks[0].description, picks[1].description);
  assert.equal(starterSuggestions(candidates, EMPTY_ONBOARDING)[0].reason, '');
  assert.equal(starterSuggestions(candidates, { ...EMPTY_ONBOARDING, proof: 'gentle' }).length, 0);
  assert.doesNotMatch(picks.map(pick => pick.description).join(' '), /classic bourbon to explore|bolder pour/);
});
