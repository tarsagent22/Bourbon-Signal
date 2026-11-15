import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../cellar/bottle-catalog-seed.json';
import { buyingScore, regionalPriceEvidence, type BottleCheckPriceSignal } from '../../../../shared/bottle-check-score';
import { bottlePriceBenchmarks, BOTTLE_CHECK_STATE_PRICES } from '../../../../shared/bottle-check-prices';
import type { BottleProfile } from '../../../../shared/bottle-profile';

const now = new Date('2026-11-15T18:00:00Z');
const strongSource = { label: 'Fixture evidence', url: 'https://example.org/review' };
const guide: BottleProfile = {
  id: 'eagle-rare-10', name: 'Eagle Rare 10 Year', proof: 90, age: '10 years', producer: 'Buffalo Trace',
  category: 'bourbon', msrp: 5,
  rarity: { tier: 'allocated', pending: false, label: 'Allocated', reviewedAt: '2026-10-10', sources: [strongSource] },
};
const scope = { state: 'NC', area: 'Raleigh' };
const checked = (askingPrice = '', reports: BottleCheckPriceSignal[] = [], bottle = guide, market = scope, at = now) =>
  buyingScore({ bottle, askingPrice, reports, scope: market, now: at });
const sample = (id: string, price: number, city = 'Raleigh', state = 'NC'): BottleCheckPriceSignal => ({
  kind: 'availability', source: { type: 'trusted_source' }, evidence: { sourceBacked: true },
  bottle: { id: 'retailer-sku', catalogId: 'eagle-rare-10' },
  location: { scope: 'exact_store', state, store: { id, address: id + ' Test St', city, state } },
  availability: { status: 'available_now', price, sizeMl: 750, priceObservedAt: '2026-11-15T12:00:00Z' },
});

test('every offline catalog match has a deterministic numeric score, even without the network', () => {
  const scores = new Set();
  for (const row of catalog) {
    const result = checked('', [], { ...guide, id: row.id, name: row.name, proof: row.proof ?? null,
      age: row.ageStatement ?? null, rarity: { ...guide.rarity, pending: true } });
    assert.ok(Number.isInteger(result.score) && result.score >= 0 && result.score <= 100, row.id);
    scores.add(result.score);
  }
  assert.ok(scores.size > 10, 'reviewed records should not all receive the same score');
  const unknown = checked('2', [], { ...guide, id: 'unknown', name: 'New unknown whiskey', rarity: { ...guide.rarity, pending: true } });
  assert.equal(unknown.score, 50);
  assert.equal(unknown.factorsUsed, 0); assert.equal(unknown.confidence, 'Limited evidence');
  assert.equal(unknown.verdict, 'Verify before buying');
});

test('raising a shelf price never raises the score; markup can never get a grab verdict', () => {
  const prices = [1, 25, 35, 44.95, 55, 70, 85, 120, 9999];
  const scores = prices.map(price => checked(String(price)).score);
  assert.ok(scores[2] > scores[5]);
  assert.ok(scores.every((score, i) => i === 0 || score <= scores[i - 1]));
  assert.equal(checked('100').verdict, 'Pass at this price');
  assert.match(checked('44.95').priceNote, /44\.95.*NC ABC list price/);
  assert.equal(checked('1e4').score, checked().score);
  assert.equal(checked('0.01').verdict, 'Check the shelf price');
  assert.equal(checked('40', [], guide, { state: 'TX', area: '' }).valuePoints, null, 'undated catalog MSRP never affects the score');
});

test('reviewed state rules and published regional benchmarks never cross state borders or expiry', () => {
  const bottle = { ...guide, id: 'wild-turkey-rare-breed', name: 'Wild Turkey Rare Breed', proof: 116.8, age: null };
  const nc = checked('68', [], bottle, { state: 'NC', area: '' });
  const va = checked('68', [], bottle, { state: 'VA', area: '' });
  assert.equal(nc.reference, 54.95);
  assert.equal(va.reference, 52.99);
  assert.ok(nc.score > va.score);
  assert.equal(checked('68', [], bottle, { state: 'VA', area: '' }, new Date('2026-12-01T12:00Z')).reference, null);
  assert.equal(checked('68', [], bottle, { state: 'CA', area: '' }).reference, null);
  const localBottle = { ...guide, marketRarity: { state: 'NC', tier: 'regular', label: 'Regular', reason: 'State fixture', reviewedAt: '2026-11-01', sources: [strongSource] } };
  assert.ok(checked('', [], localBottle).score < checked('').score);
  assert.equal(checked('', [], localBottle, { state: 'AL', area: '' }).score, checked('').score);
  localBottle.marketRarity.sources = [];
  assert.equal(checked('', [], localBottle).score, checked('').score);
});

test('recent comparable city prices move the automatic score; sparse cities fall back to the state', () => {
  const reports = [30, 32, 34].map((price, i) => sample(String(i), price));
  const premium = [75, 85, 95].map((price, i) => sample(String(i + 3), price, 'Durham'));
  assert.ok(checked('', [...reports, ...premium]).score > checked('', [...reports, ...premium], guide, { state: 'NC', area: 'Durham' }).score);
  const statewide = checked('', reports, guide, { state: 'NC', area: 'Chapel Hill' });
  assert.equal(statewide.stateFallback, true);
  assert.equal(statewide.evidenceScope, 'NC price evidence');
  assert.equal(statewide.reference, 44.95);
  assert.equal(checked('', reports, guide, { state: 'VA', area: 'Richmond' }).price, null);
  assert.equal(checked('', reports, guide, { state: 'NC', area: 'Raleigh' }, new Date('2026-11-23T00:00Z')).price, null);
  assert.equal(checked('', reports, { ...guide, name: 'Eagle Rare 10 Year 375 mL' }).reference, null);
  assert.equal(checked('', premium, guide, { state: 'NC', area: 'Durham' }).verdict, 'High price in this market');
  assert.equal(checked('86', premium, guide, { state: 'NC', area: 'Durham' }).verdict, 'Pass at this price');
});

test('wrong sizes and releases, boards, stale rows, user posts and duplicate premises cannot create a median', () => {
  const valid = sample('A', 35);
  const sameAddress = sample('B', 35); sameAddress.location.store!.address = valid.location.store!.address;
  const sameId = sample('A', 35); sameId.location.store!.address = '2 Alternate Avenue';
  const exclusions: Array<(r: BottleCheckPriceSignal) => void> = [
    r => { r.historical = true; }, r => { r.kind = 'release'; }, r => { r.location.scope = 'board'; },
    r => { r.source.type = 'member'; }, r => { r.evidence.sourceBacked = false; },
    r => { r.bottle.catalogId = 'eagle-rare-17-year'; r.bottle.id = guide.id; },
    r => { r.bottle = {}; }, r => { r.availability!.sizeMl = 375; }, r => { delete r.availability!.sizeMl; },
    r => { r.availability!.priceObservedAt = '2026-11-17T12:00:00Z'; }, r => { delete r.availability!.priceObservedAt; },
    r => { r.availability!.price = Infinity; }, r => { r.availability!.status = 'upcoming'; },
    r => { r.location.state = 'VA'; },
  ];
  const rejected = exclusions.map((change, i) => { const row = sample('bad' + i, 40); change(row); return row; });
  assert.deepEqual(regionalPriceEvidence(guide, [valid, sameAddress, sameId, ...rejected], scope, now),
    { count: 1, median: null, low: 35, high: 35 });
  const conflict = sample('A', 100);
  for (const rows of [[valid, conflict], [conflict, valid]]) assert.equal(regionalPriceEvidence(guide, rows, scope, now).count, 0);
});

test('a median with no independent reference is never compared to itself', () => {
  const reports = [35, 40, 45].map((price, i) => sample(String(i), price, 'City', 'CA'));
  const market = { state: 'CA', area: 'City' };
  const automatic = checked('', reports, guide, market);
  assert.equal(automatic.price, 40);
  assert.equal(automatic.valuePoints, null);
  assert.ok(checked('35', reports, guide, market).score > automatic.score);
});

test('official price entries map to exact catalog IDs and size; the 2026 birthday edition uses the 700 mL references', () => {
  const ids = new Set<string>(catalog.map(row => row.id));
  for (const list of Object.values(BOTTLE_CHECK_STATE_PRICES)) {
    const skus = new Set();
    for (const [id, [sku, amount]] of Object.entries(list.bottles)) {
      assert.ok(ids.has(id), id); assert.ok(amount > 0); assert.ok(!skus.has(sku)); skus.add(sku);
    }
  }
  const bottle = { ...guide, id: 'old-forester-birthday-bourbon-2026', name: 'Old Forester Birthday Bourbon 2026' };
  const current = bottlePriceBenchmarks(bottle, 'NC', now);
  assert.equal(current.state?.amount, 199.95);
  assert.equal(current.state?.sizeMl, 700);
  assert.equal(current.msrp?.amount, 199);
  assert.equal(bottlePriceBenchmarks({ id: 'old-forester-birthday-bourbon-2025' }, 'NC', now).state, null);
  assert.equal(checked('450', [], bottle).verdict, 'Pass at this price');
});
