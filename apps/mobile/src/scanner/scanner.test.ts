import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabelIndex, matchBottleLabel, readBottleLabel, bottleLabelFamily, normalizeBarcode } from './label-matching';
import seed from '../cellar/bottle-catalog-seed.json';
import { compareBottlePrice } from '../../../../shared/bottle-profile';
import { validApiResponse } from '../api/response-validation';

const catalog = [
  { id: 'er10', name: 'Eagle Rare 10 Year', ageStatement: '10 years', aliases: ['Eagle Rare'] },
  { id: 'er17', name: 'Eagle Rare 17 Year', ageStatement: '17 years', aliases: ['Eagle Rare'] },
  { id: 'hh7', name: 'Heaven Hill Bottled-in-Bond', ageStatement: '07Y', proof: 100 },
  { id: 'frey', name: 'Frey Ranch Straight Bourbon' },
  { id: 'of1910', name: 'Old Forester 1910 Old Fine Whisky' },
  { id: 'of1920', name: 'Old Forester 1920 Prohibition Style' },
  { id: '1792-small-batch', name: '1792 Small Batch' },
  { id: '1792-bib', name: '1792 Bottled in Bond', aliases: ['Bottled in Bond'] },
  { id: 'er25', name: 'Eagle Rare 25Y', aliases: ['Eagle Rare'] },
];
const index = createLabelIndex(catalog);

test('owner front-label examples retrieve the expression without catalog-only suffixes', () => {
  const fullIndex = createLabelIndex(seed);
  for (const [text, id] of [
    ['PENELOPE\nRiviera\nCOOPER SERIES', 'penelope-riviera-cask-finish'],
    ['PENELOPE\nRIVIERA\nAMERICAN WHISKEY', 'penelope-riviera-cask-finish'],
    ['AGED 10 YEARS\nMc KENNA\nHENRY\nSINGLE BARREL\nBOTTLED IN BOND\n100 PROOF', 'henry-mckenna-10-year'],
    ['AGED 10 YEARS\nMcHENRY\nKENNA\nSINGLE BARREL\nBOTTLED IN BOND', 'henry-mckenna-10-year'],
    ['BUFFALO TRACE\nKENTUCKY STRAIGHT BOURBON WHISKEY', 'buffalo-trace-bourbon'],
    ['BUFF ALO\nTRACE\nKENTUCKY STRAIGHT BOURBON', 'buffalo-trace-bourbon'],
    ['PENELOPE CONUNDRUM', 'penelope-estate-collection-conundrum'],
  ]) assert.equal(matchBottleLabel(fullIndex, text)[0]?.id, id, text);
  assert.equal(readBottleLabel(fullIndex, 'PENELOPE').canHold, false);
  assert.equal(readBottleLabel(fullIndex, 'W.L. WELLER').canHold, false);
  assert.equal(readBottleLabel(fullIndex, 'PENELOPE RIVIERA').canHold, true);
  assert.equal(bottleLabelFamily(fullIndex, 'MC HENRY KENNA')?.name, 'Henry McKenna');
  assert.deepEqual(matchBottleLabel(fullIndex, 'MCHENRY COFFEE'), []);
  assert.ok(!matchBottleLabel(fullIndex, 'PENELOPE RIVIERA').some(b => b.id === 'penelope-rio-cask-finish'));
});

test('all expressions remain reachable for similar-label families, beyond the candidate limit', () => {
  const fullIndex = createLabelIndex(seed);
  for (const brand of ['Penelope', 'Buffalo Trace', 'Henry McKenna', 'Old Forester', 'Woodford Reserve', 'Wild Turkey', 'Four Roses', 'Weller', "Maker's Mark", 'E.H. Taylor']) {
    const family = bottleLabelFamily(fullIndex, brand.toUpperCase());
    assert.ok(family, brand);
    const expected = seed.filter(b => b.name.toLowerCase().replace(/^w\.l\. weller/, 'weller').startsWith(brand.toLowerCase() + ' ') || b.name.toLowerCase() === brand.toLowerCase());
    assert.deepEqual(new Set(family.bottles.map(b => b.id)), new Set(expected.map(b => b.id)), brand);
    assert.equal(readBottleLabel(fullIndex, brand).canHold, false, brand);
  }
  assert.ok(bottleLabelFamily(fullIndex, 'PENELOPE')!.bottles.length > 6);
  for (const text of ['KENTUCKY BOURBON WHISKEY', 'Handcrafted wooden table', 'PENELOPE AND BUFFALO TRACE']) assert.equal(bottleLabelFamily(fullIndex, text), undefined);
  assert.equal(readBottleLabel(fullIndex, 'PENELOPE RIVIERA AND BUFFALO TRACE').canHold, false);
});

test('batch and chapter numbers keep similarly presented releases separate', () => {
  const editions = createLabelIndex([
    { id: 'chapter1', name: 'Penelope Cigar Sessions Chapter 01', brand: 'Penelope' },
    { id: 'chapter2', name: 'Penelope Cigar Sessions Chapter 02', brand: 'Penelope' },
    { id: 'batch32', name: 'Barrell Bourbon Batch 032', brand: 'Barrell' },
    { id: 'batch34', name: 'Barrell Bourbon Batch 034', brand: 'Barrell' },
  ]);
  assert.deepEqual(matchBottleLabel(editions, 'PENELOPE CIGAR SESSIONS CHAPTER 2').map(b => b.id), ['chapter2']);
  assert.deepEqual(matchBottleLabel(editions, 'BARRELL BOURBON BATCH 032').map(b => b.id), ['batch32']);
  assert.deepEqual(new Set(matchBottleLabel(editions, 'PENELOPE CIGAR SESSIONS').map(b => b.id)), new Set(['chapter1', 'chapter2']));
});

test('every bundled library identity is retrievable from its full label text', () => {
  const fullIndex = createLabelIndex(seed);
  assert.equal(createLabelIndex(seed), fullIndex, 'scanner screens reuse the same prepared index');
  for (const bottle of seed) assert.ok(matchBottleLabel(fullIndex, bottle.name).some(b => b.id === bottle.id), bottle.name);
});

test('punctuated initials, short ages and a single anchored OCR error remain searchable', () => {
  const fullIndex = createLabelIndex(seed);
  assert.ok(matchBottleLabel(fullIndex, 'O.F.C. BOURBON').some(b => b.id === 'o-f-c-bourbon'));
  assert.deepEqual(matchBottleLabel(index, 'EAGLE RARE 10YO').map(b => b.id), ['er10']);
  assert.equal(matchBottleLabel(index, 'FREY RANOH KENTUCKY STRAIGHT BOURBON')[0]?.id, 'frey');
  assert.deepEqual(matchBottleLabel(index, 'RANOH'), [], 'a corrected word alone is not identity evidence');
  assert.ok(!matchBottleLabel(index, 'OLD FORESTER 1910').some(b => b.id === 'of1920'));
});
test('label candidates survive multiline label boilerplate', () => {
  assert.equal(matchBottleLabel(index, 'FREY RANCH\nFARMERS + DISTILLERS\nSTRAIGHT BOURBON WHISKEY\nNEVADA GROWN')[0]?.id, 'frey');
  assert.equal(matchBottleLabel(index, 'HEAVEN HILL\nBOTTLED-IN-BOND\n7 YEARS\nKENTUCKY STRAIGHT BOURBON WHISKEY\n100 PROOF')[0]?.id, 'hh7');
  assert.ok(!matchBottleLabel(index, 'HEAVEN HILL BOTTLED IN BOND 7 YEARS').some(item => item.id.startsWith('1792')));
  assert.equal(matchBottleLabel(index, '1792\nSMALL BATCH\nKENTUCKY STRAIGHT BOURBON WHISKEY')[0]?.id, '1792-small-batch');
});
test('explicit age excludes other ages even if they share a short alias', () => {
  assert.deepEqual(matchBottleLabel(index, 'EAGLE RARE\nAGED 10 YEARS\nKENTUCKY STRAIGHT BOURBON').map(item => item.id), ['er10']);
});
test('incomplete labels expose alternatives instead of inventing an exact release', () => {
  assert.deepEqual(new Set(matchBottleLabel(index, 'EAGLE RARE').map(item => item.id)), new Set(['er10', 'er17', 'er25']));
  assert.equal(matchBottleLabel(index, 'OLD FORESTER\n1910\nOLD FINE WHISKY')[0]?.id, 'of1910');
});
test('generic label text and unrelated words return no candidates', () => {
  for (const text of ['', 'KENTUCKY STRAIGHT BOURBON WHISKEY 100 PROOF', 'Handcrafted wooden table', 'EAGLE']) assert.deepEqual(matchBottleLabel(index, text), []);
});
test('Eagle Rare survives joined lettering, short OCR errors and spelled-out ages', () => {
  const fullIndex = createLabelIndex(seed);
  for (const [text, id] of [
    ['EAGLERARE\nAGED TEN YEARS\n45.0% ALC/VOL', 'eagle-rare-10'],
    ['EAGLE RARC\nTWELVE YEARS OLD', 'eagle-rare-12'],
    ['EAGLE RARE\nSEVENTEEN YEARS\nKENTUCKY STRAIGHT BOURBON', 'eagle-rare-17-year'],
    ['EAGLE RARE\nAGED TWENTY-FIVE YEARS', 'eagle-rare-25y'],
    ['EALGE RARE\n10 YEARS', 'eagle-rare-10'],
  ]) assert.equal(readBottleLabel(fullIndex, text).matches[0]?.id, id, text);
  for (const text of ['EAGLE RARE', 'EAGLE RARE 101 PROOF', 'EAGLE RARE 12% ABV', 'EAGLE RARC TWELVE YEARS', 'EAGLE BOURBON']) {
    const result = readBottleLabel(fullIndex, text);
    assert.ok(result.matches.some(bottle => bottle.id.startsWith('eagle-rare-')), text);
    assert.equal(result.canHold, false, text);
  }
  assert.deepEqual(readBottleLabel(fullIndex, 'EAGLE').matches, []);
});

test('barcodes require valid check digits and normalize UPC-A to EAN-13', () => {
  assert.equal(normalizeBarcode('036000291452'), '0036000291452');
  assert.equal(normalizeBarcode('0036000291452'), '0036000291452');
  for (const code of ['036000291453', 'not-a-code', '123', 'https://example.com']) assert.equal(normalizeBarcode(code), null);
});

test('everyday rye scan gaps exist offline and explicit expressions avoid conflicting candidates', () => {
  const liveIndex = createLabelIndex(seed);
  for (const [text, id] of [
    ['WILD TURKEY 101 KENTUCKY STRAIGHT RYE WHISKEY', 'wild-turkey-101-rye'],
    ['WILD TURKEY RARE BREED RYE BARREL PROOF', 'wild-turkey-rare-breed-rye'],
    ['NEW RIFF KENTUCKY STRAIGHT RYE WHISKEY BOTTLED IN BOND', 'new-riff-bottled-in-bond-rye'],
    ['GREEN RIVER KENTUCKY STRAIGHT RYE WHISKEY', 'green-river-rye'],
  ]) {
    const results = matchBottleLabel(liveIndex, text);
    assert.equal(results[0]?.id, id);
    assert.ok(results.every(bottle => /rye/i.test(bottle.name)));
  }
  const taylor = matchBottleLabel(liveIndex, 'COLONEL E H TAYLOR SMALL BATCH KENTUCKY STRAIGHT BOURBON WHISKEY');
  assert.equal(taylor[0]?.id, 'eh-taylor-small-batch');
  assert.deepEqual(taylor.map(bottle => bottle.id), ['eh-taylor-small-batch']);
  assert.ok(matchBottleLabel(liveIndex, 'FOUR ROSES SINGLE BARREL HIGH RYE BOURBON').some(bottle => bottle.id === 'four-roses-single-barrel'));
});
test('price comparison handles partial data, invalid money and fractional premiums', () => {
  assert.equal(compareBottlePrice('47.97', 40).kind, 'compared');
  assert.equal(compareBottlePrice('47.97', null).kind, 'unpriced');
  assert.equal(compareBottlePrice('40', 40).kind === 'compared' && compareBottlePrice('40', 40).label, 'At MSRP');
  assert.equal(compareBottlePrice('40.25', 40).kind === 'compared' && compareBottlePrice('40.25', 40).label, 'Less than 1% above MSRP');
  for (const input of ['-1', '0', '1e3', '1.999', 'NaN', 'Infinity']) assert.equal(compareBottlePrice(input, 40).kind, 'invalid');
  assert.equal(compareBottlePrice('', 40).kind, 'empty');
});
test('malformed profile facts are rejected at the mobile API boundary', () => {
  const bottle = { id: 'er10', name: 'Eagle Rare 10 Year', producer: null, category: 'bourbon', proof: 90, age: '10 years', msrp: null, rarity: { label: 'Allocated', tier: 'allocated', pending: false, reviewedAt: null } };
  assert.equal(validApiResponse('/api/v1/bottles/er10', { bottle }), true);
  assert.equal(validApiResponse('/api/v1/bottles/er10', { bottle: { ...bottle, msrp: -1 } }), false);
  assert.equal(validApiResponse('/api/v1/bottles/er10', { bottle: { ...bottle, rarity: {} } }), false);
});

// Buying guidance must never turn missing evidence or a rare label into a buy signal.
const guideNow = new Date('2026-11-15T18:00:00Z');
import { bottleReputation, reputationEvidence, BOTTLE_REPUTATION, type BottleReputation } from '../../../../shared/bottle-reputation';
test('source groups deduplicate publishers, reject small samples, stale and future evidence, and expose disagreement', () => {
  const rating = { publisher: 'Fixture', kind: 'expert' as const, value: 90, scale: 100, source: 'https://example.com/review', checkedAt: '2026-10-01' };
  const entry: BottleReputation = { key: 'test', names: ['Test'], ratings: [rating, { ...rating, value: 10 }, { ...rating, kind: 'community', value: 4, scale: 5, count: 1000 }] };
  assert.equal(reputationEvidence(entry, guideNow).score, 85);
  assert.equal(reputationEvidence({ ...entry, ratings: [{ ...rating, kind: 'community', scale: 5, value: 5, count: 3 }] }, guideNow).score, null);
  for (const checkedAt of ['2020-01-01', '2030-01-01', 'nonsense']) assert.equal(reputationEvidence({ ...entry, ratings: [{ ...rating, checkedAt }] }, guideNow).score, null);
  assert.equal(reputationEvidence({ ...entry, ratings: [rating, { ...rating, kind: 'community', value: 2, scale: 5, count: 1000 }] }, guideNow).confidence, 'Mixed reviews');
  assert.equal(reputationEvidence({ ...entry, ratings: [{ ...rating, value: 200 }] }, guideNow).score, null);
});

test('review registry is attributable and release-specific; no broad brand or age matching', () => {
  assert.ok(BOTTLE_REPUTATION.length >= 30);
  assert.equal(new Set(BOTTLE_REPUTATION.map(record => record.key)).size, BOTTLE_REPUTATION.length);
  for (const entry of BOTTLE_REPUTATION) {
    assert.ok(entry.names.length && entry.ratings.length);
    assert.ok(entry.ratings.every(rating => /^https:\/\//.test(rating.source) && rating.checkedAt === '2026-10-16'));
    assert.ok(reputationEvidence(entry, guideNow).score != null);
  }
  for (const name of ['Eagle Rare', 'Eagle Rare 12 Year', "Maker's Mark Cellar Aged", "Blanton's Gold"]) assert.equal(bottleReputation({ name, proof: null, age: null }), null);
});


test('ambiguous brand-only catalog names require the reviewed proof', () => {
  for (const name of ['Old Forester', 'Henry McKenna']) {
    assert.equal(bottleReputation({ name, proof: null, age: null }), null);
    assert.equal(bottleReputation({ name, proof: 100, age: null }), null);
  }
  assert.ok(bottleReputation({ name: 'Old Forester', proof: 86, age: null }));
  assert.ok(bottleReputation({ name: 'Henry McKenna', proof: 80, age: null }));
});
