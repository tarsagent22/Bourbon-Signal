import assert from 'node:assert/strict';
import test from 'node:test';
import { preferencesFixture } from '../api/astra-fixtures';
import { bottleHandoffParams, coverageContext, handoffPrice, parseBottleHandoff, regionContext, supportContext } from './bottle-handoff';
import { personalTasteNote, tasteDiscovery } from './taste-discovery';
import { EMPTY_ONBOARDING, normalizeOnboardingDraft } from '../../../../shared/mobile-onboarding';
import type { MemberCollectionBottle } from '../api/types';

test('Bottle Check handoffs retain entered price and reference region, bind the owner, and never invent a store', () => {
  const params = bottleHandoffParams({ id: 'scan-1', owner: 'member-a', bottleId: 'makers-mark', bottleName: "Maker's Mark", price: '49.9', state: 'NC', area: 'Raleigh', store: '' });
  assert.deepEqual(parseBottleHandoff(params, 'member-a'), { id: 'scan-1', bottleId: 'makers-mark', bottleName: "Maker's Mark", price: '49.90', state: 'NC', area: 'Raleigh', store: '' });
  assert.equal(parseBottleHandoff(params, 'member-b'), null);
  assert.equal(parseBottleHandoff({ ...params, scanBottleId: ['makers-mark', 'other'] }, 'member-a'), null);
  assert.equal(handoffPrice('Infinity'), ''); assert.equal(handoffPrice('-2'), ''); assert.equal(handoffPrice('1e3'), '');
  assert.equal(handoffPrice('100000.01'), ''); assert.equal(handoffPrice('12.345'), '');
});
test('location context validates the full state and carries an area only within a known state', () => {
  assert.deepEqual(regionContext(' nc ', 'Raleigh'), { state: 'NC', area: 'Raleigh' });
  assert.deepEqual(regionContext('NCjunk', 'Raleigh'), { state: '', area: '' });
  assert.deepEqual(regionContext('', 'Raleigh'), { state: '', area: '' });
  assert.equal(coverageContext({ state: 'NC', area: 'Raleigh', store: 'Downtown ABC' }).kind, 'store');
  const support = supportContext({ screen: 'Signal detail', bottle: 'Eagle Rare', signalId: 'member:sighting_1', state: 'NC', area: 'Raleigh' });
  assert.equal(support.state, 'NC'); assert.match(support.context, /Signal: member:sighting_1/);
});
const bottle = (id: string, name: string, overrides = {}): MemberCollectionBottle => ({ bottleId: id, bottleName: name, canonicalKey: name.toLowerCase(), isRated: true, rating: 85, sealedQuantity: 1, openedQuantity: 0, finishedCount: 0, tastedOnly: false, tasteTags: ['Vanilla'], addedAt: '2026-10-01', updatedAt: '2026-10-16', ...overrides });
test('personal ratings are explicit personal evidence and survive canonical identity matching', () => {
  const prefs = preferencesFixture({ collectionPreferences: { version: 1, bottles: [bottle('makers-mark', "Maker's Mark", { wouldBuyAgain: true })] } });
  assert.equal(personalTasteNote({ id: 'makers-mark', name: 'Other spelling' }, prefs), 'You rated this 8.5/10 · You’d buy again');
  assert.equal(personalTasteNote({ id: 'other', name: 'Other' }, prefs), '');
});
test('taste suggestions require repeated rated cues and recommendation access, and exclude saved or tasted bottles', () => {
  const catalog = [{ id: 'makers-mark', name: "Maker's Mark" }, { id: 'knob-creek-9', name: 'Knob Creek 9' }, { id: 'woodford-double-oaked', name: 'Woodford Reserve Double Oaked' }];
  const draft = { ...EMPTY_ONBOARDING, savedBottleIds: ['makers-mark'] };
  const prefs = preferencesFixture({ entitlements: { canUseRecommendations: true }, collectionPreferences: { version: 1, bottles: [bottle('first', 'Favorite A'), bottle('second', 'Favorite B')] } });
  const picks = tasteDiscovery(catalog, prefs, draft);
  assert.equal(picks[0].source, 'saved'); assert.ok(picks.some(pick => pick.source === 'ratings'));
  const standard = { ...prefs, entitlements: { ...prefs.entitlements, canUseRecommendations: false } };
  assert.deepEqual(tasteDiscovery(catalog, standard, draft).map(pick => pick.bottle.id), ['makers-mark']);
  assert.deepEqual(tasteDiscovery(catalog, { ...prefs, collectionPreferences: { version: 1, bottles: [bottle('first', 'Favorite A')] } }), []);
  assert.ok(!tasteDiscovery(catalog, { ...prefs, collectionPreferences: { version: 1, bottles: [...prefs.collectionPreferences.bottles, bottle('knob-creek-9', 'Knob Creek 9', { tastedOnly: true, sealedQuantity: 0 })] } }).some(pick => pick.bottle.id === 'knob-creek-9'));
});
test('saved onboarding picks round trip without implying ownership or changing older drafts', () => {
  const original = normalizeOnboardingDraft(EMPTY_ONBOARDING)!;
  assert.equal(original.savedBottleIds, undefined);
  assert.deepEqual(normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, savedBottleIds: ['makers-mark', 'makers-mark'] })?.savedBottleIds, ['makers-mark']);
  assert.equal(normalizeOnboardingDraft({ ...EMPTY_ONBOARDING, savedBottleIds: ['invalid/id'] }), null);
});

test('completed onboarding taste choices remain useful before enough ratings exist', () => {
  const catalog = [{ id: 'woodford-double-oaked', name: 'Woodford Reserve Double Oaked', proof: 90 }, { id: 'wild-turkey-rare-breed', name: 'Wild Turkey Rare Breed', proof: 116 }];
  const prefs = preferencesFixture({ entitlements: { canUseRecommendations: true } });
  const draft = { ...EMPTY_ONBOARDING, flavors: ['Caramel'], proof: 'gentle' as const };
  const picks = tasteDiscovery(catalog, prefs, draft);
  assert.equal(picks[0].bottle.id, 'woodford-double-oaked');
  assert.equal(picks[0].source, 'preferences'); assert.match(picks[0].reason, /caramel/);
  assert.deepEqual(tasteDiscovery(catalog, { ...prefs, entitlements: { canUseRecommendations: false } }, draft), []);
});
