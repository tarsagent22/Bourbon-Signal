import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabelIndex, matchBottleLabel, normalizeBarcode } from './label-matching';
import { createScanLoop } from './scan-loop';
import { scanGuide, scanCrop } from './scan-guide';
import { createCandidateLatch } from './scan-candidates';
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
test('barcodes require valid check digits and normalize UPC-A to EAN-13', () => {
  assert.equal(normalizeBarcode('036000291452'), '0036000291452');
  assert.equal(normalizeBarcode('0036000291452'), '0036000291452');
  for (const code of ['036000291453', 'not-a-code', '123', 'https://example.com']) assert.equal(normalizeBarcode(code), null);
});

test('portrait scan guide maps exactly into cover-cropped portrait and landscape captures', () => {
  for (const view of [{ width: 280, height: 380 }, { width: 353, height: 380 }, { width: 740, height: 380 }]) {
    const guide = scanGuide(view);
    assert.ok(guide.height > guide.width * 1.5);
    for (const picture of [{ width: 3024, height: 4032 }, { width: 4032, height: 3024 }, { width: 1080, height: 1920 }]) {
      const crop = scanCrop(picture, view);
      assert.ok(crop.width > 0 && crop.height > crop.width);
      assert.ok(crop.originX >= 0 && crop.originY >= 0 && crop.originX + crop.width <= picture.width && crop.originY + crop.height <= picture.height);
      const scale = Math.max(view.width / picture.width, view.height / picture.height);
      assert.ok(Math.abs(crop.originX * scale - (picture.width * scale - view.width) / 2 - guide.left) < 1);
      assert.ok(Math.abs(crop.originY * scale - (picture.height * scale - view.height) / 2 - guide.top) < 1);
      assert.ok(Math.abs(crop.width * scale - guide.width) < 1);
    }
  }
});

test('scan waits for agreement and holds results through blank frames, reordering and different bottles', () => {
  const latch = createCandidateLatch();
  const one = catalog[0], two = catalog[1];
  assert.equal(latch.observe([one, two]), null);
  assert.equal(latch.observe([]), null);
  assert.equal(latch.observe([one, two]), null);
  assert.equal(latch.observe([two, one]), null);
  assert.deepEqual(latch.observe([two, one]), [two, one]);
  for (const matches of [[], [one], [two], [one, two]]) assert.equal(latch.observe(matches), null);
  assert.equal(latch.verified([one]), null);
  const rescan = createCandidateLatch();
  assert.equal(rescan.observe([one]), null);
  assert.deepEqual(rescan.observe([one]), [one]);
  assert.deepEqual(createCandidateLatch().verified([one]), [one]);
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
test('stopping a scan discards an in-flight result and does not schedule another frame', async () => {
  let finish!: (value: string) => void; let reads = 0; const values: string[] = [];
  const loop = createScanLoop({ read: () => { reads += 1; return new Promise<string>(resolve => { finish = resolve; }); }, onResult: value => values.push(value), onError: error => { throw error; }, delay: 5 });
  loop.start(); loop.start(); assert.equal(reads, 1); loop.stop(); finish('stale');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(values, []); assert.equal(reads, 1);
});
test('pause and restart do not overlap reads and a resumed scan recovers', async () => {
  let finish!: (value: number) => void; let reads = 0; const results: number[] = [];
  const loop = createScanLoop({ read: () => { reads += 1; return new Promise<number>(resolve => { finish = resolve; }); }, onResult: value => results.push(value), onError: error => { throw error; }, delay: 5 });
  loop.start(); loop.stop(); loop.start(); assert.equal(reads, 1); finish(1);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(reads, 2); finish(2); await Promise.resolve(); loop.stop(); assert.deepEqual(results, [2]);
});
test('read failures are delivered without leaving the loop stuck', async () => {
  const errors: unknown[] = []; let reads = 0;
  const loop = createScanLoop({ read: async () => { reads += 1; throw new Error('camera'); }, onResult: () => assert.fail(), onError: error => errors.push(error), delay: 5 });
  loop.start(); await new Promise(resolve => setTimeout(resolve, 18)); loop.stop();
  assert.ok(reads >= 2); assert.equal(errors.length, reads);
});

// Buying guidance must never turn missing evidence or a rare label into a buy signal.
import { buyingScore, regionalPriceEvidence } from './buying-score';
import type { BottleProfile } from '../../../../shared/bottle-profile';
import type { Signal } from '../api/types';
const guideBottle: BottleProfile = { id: 'er10', name: 'Eagle Rare 10 Year', producer: null, category: 'bourbon', proof: 90, age: '10 years', msrp: 40, rarity: { label: 'Allocated', tier: 'allocated', pending: false, reviewedAt: '2026-10-01' } };
const guideNow = new Date('2026-10-16T18:00:00Z');
const priceReport = (id: string, price: number, state = 'NC', patch: Partial<Signal> = {}): Signal => ({
  contractVersion: 'bourbon-signal/signal@1', id, kind: 'availability', bottle: { id: 'er10', name: 'Eagle Rare 10 Year' },
  source: { type: 'trusted_source', label: 'Source' }, location: { scope: 'exact_store', state, store: { id, name: id, city: 'Raleigh', state } },
  timing: { displayAt: '2026-10-16T12:00:00Z' }, availability: { status: 'reported', price },
  evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true }, strength: 'more_activity', alertEligibility: { inventory: false, watch: false }, actions: [], ...patch,
});
const guide = (askingPrice: string, reports: Signal[] = [], patch: Partial<BottleProfile> = {}) => buyingScore({ bottle: { ...guideBottle, ...patch }, askingPrice, reports, scope: { state: 'NC', area: '' }, now: guideNow });
test('zero-input assessments use published reviews and automatic prices rather than placeholder points', () => {
  const automatic = guide('');
  assert.equal(automatic.automatic, true); assert.equal(automatic.price, null); assert.equal(automatic.valuePoints, null);
  assert.ok(automatic.score != null && automatic.score > 75); assert.notEqual(automatic.score, 59);
  assert.equal(automatic.priceBasis, 'Catalog reference');
  assert.ok(automatic.sources.some(source => source.label.includes('Distiller community')));
  const common = guide('', [], { id: 'makers-mark', name: "Maker's Mark", proof: 90, age: null, rarity: { ...guideBottle.rarity, tier: 'regular' } });
  assert.notEqual(common.score, automatic.score);
  assert.equal(guide('120').verdict, 'Steep price premium'); assert.equal(guide('120').score, guide('60').score);
});

test('missing reviews and classifications never receive a fabricated number', () => {
  const unknown = { ...guideBottle, id: 'unreviewed', name: 'Unknown Release 14 Year', proof: 100, rarity: { ...guideBottle.rarity, tier: 'unicorn', pending: true, reviewedAt: null } };
  for (const askingPrice of ['', '40']) {
    const result = buyingScore({ bottle: unknown, askingPrice, reports: [], scope: { state: 'NC', area: '' }, now: guideNow });
    assert.equal(result.score, null); assert.equal(result.findVerdict, 'Still researching this release');
  }
  assert.equal(guide('', [], { name: 'Eagle Rare 17 Year', age: '17 years', rarity: { ...guideBottle.rarity, pending: true } }).score, null);
  assert.equal(guide('', [], { proof: 130, rarity: { ...guideBottle.rarity, pending: true } }).score, null, 'conflicting producer proof prevents transferring a review');
  for (const input of ['0', '-2', 'abc', '12.345']) {
    assert.equal(guide(input).verdict, 'Check the shelf price'); assert.equal(guide(input).score, guide('').score);
  }
  const reputationOnly = guide('', [], { msrp: null });
  assert.equal(reputationOnly.price, null); assert.equal(reputationOnly.verdict, 'Notable find');
  assert.ok(reputationOnly.score != null);
});

test('regional prices require three independent current exact-release store observations', () => {
  const valid = [priceReport('one', 35), priceReport('two', 40), priceReport('three', 45)];
  assert.equal(regionalPriceEvidence(guideBottle, valid, { state: 'NC', area: 'Raleigh' }, guideNow).median, 40);
  const rejected = [priceReport('other-state', 1, 'VA'), priceReport('old', 2, 'NC', { timing: { displayAt: '2026-10-01T12:00:00Z' } }), priceReport('future', 3, 'NC', { timing: { displayAt: '2026-10-20T12:00:00Z' } }), priceReport('historical', 4, 'NC', { historical: true }), priceReport('other-release', 5, 'NC', { bottle: { id: 'er17', name: 'Eagle Rare 17 Year' } }), priceReport('unknown', 6, 'NC', { availability: { status: 'unknown', price: 6 } })];
  assert.deepEqual(regionalPriceEvidence(guideBottle, [...valid, ...rejected], { state: 'NC', area: 'Raleigh' }, guideNow), { count: 3, median: 40, low: 35, high: 45 });
  assert.equal(regionalPriceEvidence(guideBottle, valid, { state: 'NC', area: 'Durham' }, guideNow).count, 0);
  assert.equal(regionalPriceEvidence(guideBottle, valid.slice(0, 2), { state: 'NC', area: '' }, guideNow).median, null);
  const duplicate = priceReport('new-provider-id', 100, 'NC', { location: valid[0].location, timing: { displayAt: '2026-10-16T17:00:00Z' } });
  const evidence = regionalPriceEvidence(guideBottle, [...valid, duplicate], { state: 'NC', area: '' }, guideNow);
  assert.equal(evidence.count, 3); assert.equal(evidence.high, 100);
});
test('automatic local prices change the assessment while expensive markets cannot erase the catalog benchmark', () => {
  const reports = [...[80, 90, 100].map((price, i) => priceReport('nc' + i, price)), ...[30, 35, 40].map((price, i) => priceReport('va' + i, price, 'VA'))];
  const automatic = (state: string) => buyingScore({ bottle: guideBottle, askingPrice: '', reports, scope: { state, area: '' }, now: guideNow });
  assert.equal(automatic('NC').price, 90); assert.equal(automatic('VA').price, 35);
  assert.equal(automatic('NC').score, automatic('VA').score, 'price affects the verdict, not fixed find-strength weights');
  assert.equal(automatic('NC').reference, 40); assert.equal(automatic('NC').verdict, 'Steep price premium');
});

test('verified regional rarity is bounded and scoped, and missing sightings do not manufacture rarity', () => {
  const region: BottleProfile['marketRarity'] = { state: 'NC', tier: 'allocated', label: 'Allocated', reason: 'Synthetic source-backed fixture', reviewedAt: '2026-10-01', sources: [] };
  const assessment = (state: string, marketRarity = region) => buyingScore({ bottle: { ...guideBottle, marketRarity }, askingPrice: '', reports: [], scope: { state, area: '' }, now: guideNow });
  assert.equal(assessment('NC').localClassification, true); assert.equal(assessment('VA').localClassification, false);
  assert.equal(assessment('NC', { ...region!, reviewedAt: '2020-01-01' }).localClassification, false);
  assert.equal(assessment('NC', { ...region!, reviewedAt: '2030-01-01' }).localClassification, false);
  assert.equal(guide('').localClassification, false);
});

test('personal ratings are context and cannot replace public reputation', () => {
  const base = guide('');
  const result = buyingScore({ bottle: guideBottle, askingPrice: '', reports: [], scope: { state: 'NC', area: '' }, now: guideNow, collection: [{ bottleId: guideBottle.id, isRated: true, rating: 10 } as any] });
  assert.equal(result.score, base.score); assert.match(result.personalNote || '', /1.0\/10/);
});

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


test('rarity leads the fixed score and missing reviews show an honest range', () => {
  const scoreTier = (tier: string) => guide('', [], { rarity: { ...guideBottle.rarity, tier } });
  assert.ok(scoreTier('unicorn').score! > scoreTier('allocated').score!);
  assert.ok(scoreTier('allocated').score! > scoreTier('limited').score!);
  assert.ok(scoreTier('limited').score! > scoreTier('regular').score!);
  const unreviewed = guide('', [], { name: 'Unreviewed expression' });
  assert.equal(unreviewed.scoreKind, 'SIGNAL SCORE'); assert.equal(unreviewed.reputationScore, null);
  assert.equal(unreviewed.score, null); assert.deepEqual(unreviewed.scoreRange, { low: 64, high: 84 });
  const reviewOnly = guide('', [], { rarity: { ...guideBottle.rarity, pending: true } });
  assert.equal(reviewOnly.scoreKind, 'SIGNAL SCORE'); assert.equal(reviewOnly.verdict, 'Reviews available');
  assert.equal(reviewOnly.score, null); assert.ok(reviewOnly.reputationScore != null);
});


test('catalog-only and self-referenced medians never award price value points', () => {
  assert.equal(guide('').valuePoints, null); assert.equal(guide('').price, null);
  const prices = [35, 40, 45].map((value, i) => priceReport(String(i), value));
  assert.equal(guide('', prices, { msrp: null }).valuePoints, null);
  assert.equal(guide('30', prices, { msrp: null }).valuePoints, 100);
  const fallback = buyingScore({ bottle: guideBottle, askingPrice: '', reports: prices, scope: { state: 'NC', area: 'Lewisville' }, now: guideNow });
  assert.equal(fallback.stateFallback, true); assert.equal(fallback.local.median, null);
  assert.equal(fallback.price, 40); assert.equal(fallback.evidenceScope, 'National context');
  assert.ok(fallback.notes.some(note => /Lewisville.*NC observations/.test(note)));
  assert.equal(fallback.valuePoints, 90);
  const noState = buyingScore({ bottle: guideBottle, askingPrice: '', reports: prices, scope: { state: 'VA', area: 'Richmond' }, now: guideNow });
  assert.equal(noState.price, null); assert.equal(noState.valuePoints, null);
});

test('owner screenshot bottles have attributable release context without assuming a shelf price', () => {
  for (const fixture of [{ id: 'heaven-hill-bottled-in-bond', name: 'Heaven Hill 7 Year Bottled-in-Bond', proof: 100, age: '7 years', msrp: 49.95 }, { id: 'blantons-gold-bourbon', name: "Blanton's Gold Bourbon", proof: 103, age: null, msrp: 149.95 }]) {
    const result = guide('', [], { ...fixture, rarity: { ...guideBottle.rarity, pending: true, reviewedAt: null } });
    assert.ok(result.score != null); assert.equal(result.valuePoints, null);
    assert.equal(result.price, null); assert.equal(result.localClassification, false);
    assert.ok(result.sources.some(source => source.label === 'Release context'));
    assert.ok(result.reviewStats.count > 1000);
  }
  assert.equal(bottleReputation({ name: "Blanton's Gold Single Barrel Select", proof: 103, age: null }), null);
  const expired = guide('', [], { rarity: { ...guideBottle.rarity, reviewedAt: '2020-01-01' } });
  assert.equal(expired.score, null);
});


test('researched release context expires and cannot populate another state classification', () => {
  const bottle = { ...guideBottle, id: 'blantons-gold-bourbon', name: "Blanton's Gold Bourbon", proof: 103, age: null, rarity: { ...guideBottle.rarity, pending: true, reviewedAt: null } };
  const current = buyingScore({ bottle, askingPrice: '', reports: [], scope: { state: 'NC', area: '' }, now: guideNow });
  assert.ok(current.score != null); assert.equal(current.localClassification, false);
  const expired = buyingScore({ bottle, askingPrice: '', reports: [], scope: { state: 'NC', area: '' }, now: new Date('2028-01-01') });
  assert.equal(expired.score, null); assert.equal(expired.reputationScore, null);
  assert.equal(expired.sources.length, 0);
});


test('ambiguous brand-only catalog names require the reviewed proof', () => {
  for (const name of ['Old Forester', 'Henry McKenna']) {
    assert.equal(bottleReputation({ name, proof: null, age: null }), null);
    assert.equal(bottleReputation({ name, proof: 100, age: null }), null);
  }
  assert.ok(bottleReputation({ name: 'Old Forester', proof: 86, age: null }));
  assert.ok(bottleReputation({ name: 'Henry McKenna', proof: 80, age: null }));
});

test('Signal Score uses fixed weights across absent, entered and observed prices', () => {
  const base = guide('');
  assert.equal(base.score, Math.round(base.findPoints! * 0.8 + base.reputationScore! * 0.2));
  for (const price of ['', '1', '40', '120', '9999']) assert.equal(guide(price).score, base.score);
  assert.equal(guide('40').priceVerdict, 'Good buy at this price');
  assert.equal(guide('120').priceVerdict, 'Steep price premium');
  assert.equal(base.priceVerdict, null);
  const noBenchmark = guide('40', [], { msrp: null });
  assert.equal(noBenchmark.priceVerdict, 'Price reference unavailable');
  assert.equal(noBenchmark.valuePoints, null); assert.equal(noBenchmark.score, base.score);
});

test('common screenshot expression has a sourced zero-input result without invented local rarity', () => {
  for (const state of ['NC', 'VA']) {
    const result = buyingScore({ bottle: { ...guideBottle, id: 'buffalo-trace-bourbon', name: 'Buffalo Trace Bourbon', proof: 90, age: null, rarity: { ...guideBottle.rarity, pending: true, reviewedAt: null } }, askingPrice: '', reports: [], scope: { state, area: '' }, now: guideNow });
    assert.ok(result.score != null); assert.equal(result.findVerdict, 'Everyday option');
    assert.equal(result.localClassification, false); assert.equal(result.evidenceScope, 'National context');
    assert.equal(result.price, null); assert.equal(result.priceVerdict, null);
    assert.ok(result.sources.some(source => source.label === 'Release context'));
  }
});
