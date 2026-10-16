import assert from 'node:assert/strict';
import test from 'node:test';
import { createLabelIndex, matchBottleLabel, normalizeBarcode } from './label-matching';
import { createScanLoop } from './scan-loop';
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
const guideBottle: BottleProfile = { id: 'er10', name: 'Eagle Rare 10 Year', producer: null, category: 'bourbon', proof: 90, age: '10 years', msrp: 40, rarity: { label: 'Allocated', tier: 'allocated', pending: false, reviewedAt: null } };
const guideNow = new Date('2026-10-16T18:00:00Z');
const priceReport = (id: string, price: number, state = 'NC', patch: Partial<Signal> = {}): Signal => ({
  contractVersion: 'bourbon-signal/signal@1', id, kind: 'availability', bottle: { id: 'er10', name: 'Eagle Rare 10 Year' },
  source: { type: 'trusted_source', label: 'Source' }, location: { scope: 'exact_store', state, store: { id, name: id, city: 'Raleigh', state } },
  timing: { displayAt: '2026-10-16T12:00:00Z' }, availability: { status: 'reported', price },
  evidence: { photo: false, corroborationCount: 0, helpfulCount: 0, retailerReported: false, sourceBacked: true }, strength: 'more_activity', alertEligibility: { inventory: false, watch: false }, actions: [], ...patch,
});
const guide = (askingPrice: string, reports: Signal[] = [], patch: Partial<BottleProfile> = {}) => buyingScore({ bottle: { ...guideBottle, ...patch }, askingPrice, reports, scope: { state: 'NC', area: '' }, now: guideNow });
test('asking price changes the recommendation while rarity cannot inflate the score', () => {
  assert.ok(guide('40').score >= 80); assert.equal(guide('120').verdict, 'Pass at this price');
  assert.ok(guide('120').score < guide('60').score);
  assert.equal(guide('40').score, guide('40', [], { rarity: { ...guideBottle.rarity, label: 'Unicorn', tier: 'unicorn' } }).score);
  assert.ok(guide('40', [], { proof: 130 }).score < guide('40').score);
});
test('missing or invalid prices stay preliminary; missing benchmarks cannot produce a strong buy', () => {
  for (const price of ['', '0', '-2', 'abc', '12.345']) {
    const result = guide(price); assert.equal(result.preliminary, true); assert.ok(result.score <= 65); assert.doesNotMatch(result.verdict, /good buy/);
  }
  const result = guide('30', [], { msrp: null }); assert.ok(result.score <= 59); assert.equal(result.verdict, 'Compare before buying');
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
test('region changes affect the local comparison and expensive local samples do not erase MSRP', () => {
  const reports = [...[80, 90, 100].map((price, i) => priceReport('nc' + i, price)), ...[30, 35, 40].map((price, i) => priceReport('va' + i, price, 'VA'))];
  const nc = buyingScore({ bottle: guideBottle, askingPrice: '60', reports, scope: { state: 'NC', area: '' }, now: guideNow });
  const va = buyingScore({ bottle: guideBottle, askingPrice: '60', reports, scope: { state: 'VA', area: '' }, now: guideNow });
  assert.ok(nc.score > va.score); assert.equal(nc.reference, 40); assert.ok(nc.score < 65);
  assert.ok(guide('30', reports, { msrp: null }).score < 80);
  assert.match(guide('30', reports, { msrp: null }).adjustment || '', /capped at 79/);
});
