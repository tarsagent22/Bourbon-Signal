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
