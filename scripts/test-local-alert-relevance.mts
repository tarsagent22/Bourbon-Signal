import assert from 'node:assert/strict';
import test from 'node:test';
import delivery from '../src/lib/alert-delivery.ts';
import dedupe from '../src/lib/alert-dedupe.ts';
const { groupCandidatesByLocation, candidateMatchesArea, candidateMatchesBottlePrefs, normalizeAreaPrefs, normalizeBottleAlertPreferences } = delivery;
const { stableUnderlyingAlertKey } = dedupe;
const prefs = normalizeBottleAlertPreferences({ bottleNames: ['Eagle Rare 10 Year'] });
const base = { state: 'VA', locationPrecision: 'store_level', tier: 'allocated', priorityClass: 'major', signalAt: new Date().toISOString(), quantity: 1 };
const wanted = { ...base, id: 'wanted', bottle: 'Eagle Rare 10 Year', storeId: 'watched-store', locationName: 'Watched store', reliabilityScore: 80 };
const other = { ...base, id: 'other', bottle: 'Another Bottle', storeId: 'other-store', locationName: 'Other store', reliabilityScore: 95 };

test('explicit watchlist location ranks first before a one-message cap', () => {
  const ranked = groupCandidatesByLocation([other, wanted], prefs);
  assert.equal(ranked.slice(0, 1)[0].storeId, 'watched-store');
  assert.equal(ranked.length, 2, 'non-watched opportunities are retained');
});
test('a watched child controls relevance even when higher-ranked group primary is not watched', () => {
  const primary = { ...other, id: 'primary', storeId: 'watched-store', locationName: 'Watched store', reliabilityScore: 99, eligibleForEmail: false };
  const external = { ...other, reliabilityScore: 100 };
  const grouped = groupCandidatesByLocation([external, primary, wanted], prefs);
  assert.equal(grouped[0].storeId, 'watched-store');
  assert.equal(grouped[0].__groupCandidates[0].id, 'primary', 'ordering groups must not change the policy-bearing primary');
  assert.equal(grouped[0].eligibleForEmail, false);
});
test('watchlist ordering neither changes stable episode identities nor invents prices', () => {
  const before = stableUnderlyingAlertKey(wanted);
  const result = groupCandidatesByLocation([other, wanted], prefs);
  assert.equal(stableUnderlyingAlertKey(result[0].__groupCandidates.find((x: any) => x.id === 'wanted')), before);
  assert.equal(result[0].price, undefined);
});
test('canonical area and specific-bottle exclusions remain ahead of ordering', () => {
  const area = normalizeAreaPrefs({ states: ['VA'] });
  const foreign = { ...wanted, id: 'foreign', state: 'NC', reliabilityScore: 999 };
  const candidates = [foreign, other, wanted].filter(x => candidateMatchesArea(x, area)).filter(x => candidateMatchesBottlePrefs(x, 'specific_bottles', prefs));
  const result = groupCandidatesByLocation(candidates, prefs);
  assert.equal(result.length, 1);
  assert.equal(result[0].state, 'VA');
  assert.equal(result[0].__groupCandidates.length, 1);
});
test('empty watchlist preserves legacy ordering and does not auto-watch', () => {
  const empty = normalizeBottleAlertPreferences({});
  assert.equal(groupCandidatesByLocation([wanted, other], empty)[0].storeId, 'other-store');
  assert.deepEqual(empty, { bottleNames: [], bottleKeys: [] });
});
