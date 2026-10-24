import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { cityHiveSafeBottleMatch, cityHiveUnsafeBottleMatchReason } from '../src/collectors/safe-bottle-match.mjs';
import { parseCaliforniaShopifyProducts } from '../src/collectors/california-san-diego-surfaces.mjs';

// Real saved canonical catalog; no source registration, aliases or live requests.
const catalog = JSON.parse(await readFile(new URL('./fixtures/shopify-variant-pickup/current-bourbon-bible.json', import.meta.url), 'utf8'));
const bible = new BourbonBible(catalog.records);
const eagle = catalog.records.find(row => row.canonical === 'Eagle Rare 10 Year');
assert.ok(eagle);

for (const age of ['10 years', '10 YEARS', '10   Years', '10years', '10 year', '10 yr', '10y']) {
  test(`exact numbered age grammar accepts ${age}`, () => {
    assert.equal(cityHiveUnsafeBottleMatchReason(`Eagle Rare ${age} Kentucky Straight 750ML`, eagle), null);
    assert.equal(cityHiveUnsafeBottleMatchReason(`Eagle Rare ${age}`, { canonical: 'Eagle Rare 10Y' }), null);
  });
}

test('actual Spirits4Less title resolves through the real Bible and shared safety gate without a mapping exception', () => {
  const title = 'EAGLE RARE 10 YEARS KENTUCKY STRAIGHT 750ML';
  const match = bible.match(title);
  assert.equal(match.record.id, eagle.id); assert.ok(match.confidence >= 0.9);
  const safe = cityHiveSafeBottleMatch(title, bible);
  assert.equal(safe.record.id, eagle.id); assert.equal(safe.unsafeReason, null);
});

for (const age of ['12 years', '100 years', '110 years', '', '10yearsmith', '10yesterday', '10.5 years']) {
  test(`different, missing or non-boundary age cannot prove ten years: ${age || 'absent'}`, () => {
    assert.equal(cityHiveUnsafeBottleMatchReason(`Eagle Rare ${age} Kentucky Straight 750ML`, eagle), 'missing_age:10');
    assert.equal(cityHiveUnsafeBottleMatchReason(`Eagle Rare ${age}`, { canonical: 'Eagle Rare 10Y' }), 'missing_age:10y');
  });
}

test('opposite bottle identity remains the actual Bible identity, never Eagle Rare by age grammar', () => {
  const safe = cityHiveSafeBottleMatch('Buffalo Trace Bourbon', bible);
  assert.equal(safe.record.canonical, 'Buffalo Trace Bourbon');
  assert.notEqual(safe.record.id, eagle.id);
  assert.equal(cityHiveUnsafeBottleMatchReason('Eagle Rare 10 years Bourbon', { canonical: 'Eagle Rare 12 Year' }), 'missing_age:12');
});

for (const flavor of ['cream', 'liqueur', 'cordial', 'cocktail', 'ready to drink']) {
  test(`plural age never relaxes ${flavor} restriction`, () => {
    assert.equal(cityHiveUnsafeBottleMatchReason(`Eagle Rare 10 years ${flavor}`, eagle), 'flavored_or_liqueur_matched_core_bottle');
  });
}
for (const [raw, canonical, expected] of [
  ['Eagle Rare 10 years Rye', 'Eagle Rare 10 Year', 'rye_matched_non_rye'],
  ['Example 10 years Bourbon', 'Example 10 Year Rye', 'bourbon_matched_rye'],
  ['Eagle Rare 10 years Wheated', 'Eagle Rare 10 Year', 'wheated_matched_non_wheated'],
  ['Eagle Rare 10 years Reserve', 'Eagle Rare 10 Year', 'reserve_matched_non_reserve'],
]) test(`category/expression restriction remains ${expected}`, () => {
  assert.equal(cityHiveUnsafeBottleMatchReason(raw, { canonical }), expected);
});

for (const phrase of ['single barrel', 'full proof', 'barrel proof', 'cask strength', 'limited edition', 'small batch select', 'private selection', 'store pick']) {
  test(`unexpected specific modifier remains rejected: ${phrase}`, () => {
    assert.equal(cityHiveUnsafeBottleMatchReason(`Eagle Rare 10 years ${phrase}`, eagle), `specific_raw_modifier_matched_generic:${phrase}`);
  });
}
for (const phrase of ['limited edition', 'batch proof', 'barrel proof', 'single barrel', 'small batch select', 'small batch', 'full proof', 'bottled in bond', 'private barrel', 'store pick', 'single barrel select']) {
  test(`required canonical modifier is not supplied by plural age: ${phrase}`, () => {
    assert.equal(cityHiveUnsafeBottleMatchReason(`Example 10 years${phrase === 'single barrel select' ? ' single barrel' : ''}`, { canonical: `Example 10 Year ${phrase}` }), `missing_modifier:${phrase}`);
  });
}

test('year expressions and reviewed legacy exceptions stay unchanged', () => {
  assert.equal(cityHiveUnsafeBottleMatchReason('Example 10 years', { canonical: 'Example 10 Year 2025' }), 'missing_expression:2025');
  assert.equal(cityHiveUnsafeBottleMatchReason('Four Roses Single Barrel', { canonical: 'Four Roses Single Barrel Barrel Strength' }), 'four_roses_standard_single_barrel_not_barrel_strength');
  assert.equal(cityHiveUnsafeBottleMatchReason('Henry McKenna Single Barrel 10 Year Old Bourbon Whiskey', { canonical: 'Henry McKenna 10 Year' }), null);
  assert.equal(cityHiveUnsafeBottleMatchReason('Example Cask Strength', { canonical: 'Example Barrel Proof' }), 'missing_modifier:barrel proof');
  assert.equal(cityHiveSafeBottleMatch('Eagle Rare 10 Year Kentucky Straight Bourbon', bible).record.id, eagle.id);
});

function parsed(title, size = '750ml') {
  return parseCaliforniaShopifyProducts({ products: [{ id: '100', title, handle: 'test-only-age-grammar',
    variants: [{ id: '200', title: size, available: true, price: '49.99' }] }] });
}
for (const format of ['3pk', '3-pk', '3 pack', '3-pack', 'multipack', 'multi-pack', 'pack of 3', 'gift set', 'gift box', 'bundle', 'sampler', 'miniature', 'variety pack', '2 bottles']) {
  test(`real shared Shopify package parser still rejects plural-age ${format}`, () => {
    assert.equal(parsed(`Eagle Rare 10 years ${format}`).length, 0);
  });
}
for (const size of ['50ml', '100ml', '200ml', '375ml']) test(`real shared Shopify size exclusion stays ${size}`, () => {
  assert.equal(parsed('Eagle Rare 10 years', size).length, 0);
});
test('ordinary single bottle remains accepted by the unchanged package parser', () => {
  assert.equal(parsed('Eagle Rare 10 years').length, 1);
});
