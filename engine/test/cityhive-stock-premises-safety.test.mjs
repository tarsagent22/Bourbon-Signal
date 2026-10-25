import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCityHiveStockCount } from '../src/collectors/cityhive-stock-count.mjs';
import { normalizeCityHiveReportedQuantity } from '../src/collectors/cityhive-hardening.mjs';
import { normalizeGeorgiaCityHiveQuantity, isAllowedGeorgiaBottleFormat } from '../src/collectors/georgia-retailer-surfaces.mjs';
import { normalizeIndianaCityHiveQuantity, buildIndianaPaylessAvailabilityProof, hasIndianaPaylessPickupProof, INDIANA_PAYLESS_SOURCE } from '../src/collectors/indiana-retailer-matching.mjs';
import { parseCityHiveProducts, normalizeCityHivePremises } from '../src/collectors/cityhive-surfaces.mjs';
import { MISSISSIPPI_RETAILER_SOURCES, parseMississippiCityHiveHtml } from '../src/collectors/mississippi-retailer-surfaces.mjs';

const invalid = [true, false, [1], ['100'], {}, null, undefined, 1.5, -1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '', ' ', '0x10', '0X64', '1e2', '1E2', '1.0', '1.5', '+1', '-0', '01', '1_000', 'Infinity', 'NaN'];
const source = { id: 'synthetic-identity-only', platform: 'cityhive', merchantId: '0123456789abcdef01234567', hostname: 'fixture.invalid', baseUrl: 'https://fixture.invalid', categoryUrl: 'https://fixture.invalid/shop/?subtype=Bourbon', address: '100 Main St Suite 1-2, Jackson MS 39201' };
function embedded(quantity, address = source.address, patch = {}, configured = source) {
  const option = { merchant_id: configured.merchantId, full_address: address, quantity, price: 49.99,
    product_id: 'product1', option_id: 'variant1', product_url: 'https://fixture.invalid/shop/product/eagle-rare/product1?option-id=variant1',
    option_display_data: { name: 'Eagle Rare 10 Year Bourbon 750ml' }, ...patch };
  return '<script type="application/json">' + JSON.stringify({ merchant_configs: [{ merchant: { id: configured.merchantId, address: configured.address } }],
    products: [{ id: 'product1', name: 'Eagle Rare 10 Year Bourbon 750ml', merchants: [{ merchant_id: configured.merchantId,
      address: configured.address, offer_types: ['pickup'], product_options: [option] }] }] }) + '</script>';
}
const parse = (html, entry = source) => parseCityHiveProducts(html, entry, { sources: [entry] });

test('strict stock scalar admits ordinary numeric/decimal-string counts and keeps zero distinct from invalid', () => {
  for (const value of [0, 1, 7, 99, 100, 999, Number.MAX_SAFE_INTEGER]) assert.equal(parseCityHiveStockCount(value), value);
  for (const [value, expected] of [['0', 0], ['7', 7], [' 100 ', 100], ['999', 999]]) assert.equal(parseCityHiveStockCount(value), expected);
  for (const value of invalid) assert.equal(parseCityHiveStockCount(value), null, String(value));
});

test('all actual GA/IN/shared quantity callers reject malformed values without positive availability', () => {
  for (const value of invalid) {
    assert.equal(normalizeCityHiveReportedQuantity(value).reportedQuantity, 0);
    assert.equal(normalizeCityHiveReportedQuantity(value).quantity, 0);
    assert.equal(normalizeGeorgiaCityHiveQuantity(value).reportedQuantity, 0);
    assert.equal(normalizeGeorgiaCityHiveQuantity(value).quantityIsExact, false);
    const indiana = normalizeIndianaCityHiveQuantity(value);
    assert.equal(indiana.reportedQuantity, null); assert.equal(indiana.sourceAvailabilityVerified, false);
    assert.equal(indiana.quantity, 0); assert.equal(indiana.quantityIsExact, false);
  }
});

test('untrusted valueOf/toString and boxed counts never execute object coercion', () => {
  let invoked = 0; const trap = { valueOf() { invoked++; throw Error('PRIVATE_CANARY'); }, toString() { invoked++; throw Error('PRIVATE_CANARY'); } };
  for (const value of [trap, new Number(1), 1n, Symbol('PRIVATE_CANARY')]) {
    assert.equal(parseCityHiveStockCount(value), null);
    assert.equal(normalizeCityHiveReportedQuantity(value).quantity, 0);
    assert.equal(normalizeGeorgiaCityHiveQuantity(value).quantity, 0);
    assert.equal(normalizeIndianaCityHiveQuantity(value).sourceAvailabilityVerified, false);
  }
  assert.equal(invoked, 0);
});

test('source-specific sentinel projection contracts remain unchanged', () => {
  assert.deepEqual(normalizeCityHiveReportedQuantity(7), { reportedQuantity: 7, binaryAvailability: false, quantity: 7 });
  assert.deepEqual(normalizeCityHiveReportedQuantity(100), { reportedQuantity: 100, binaryAvailability: true, quantity: 1 });
  assert.deepEqual(normalizeGeorgiaCityHiveQuantity(99), { reportedQuantity: 99, quantity: 99, quantityIsExact: true, binaryAvailability: false });
  assert.deepEqual(normalizeGeorgiaCityHiveQuantity(100), { reportedQuantity: 100, quantity: 0, quantityIsExact: false, binaryAvailability: true });
  const indiana = normalizeIndianaCityHiveQuantity(999);
  assert.equal(indiana.reportedQuantity, 999); assert.equal(indiana.quantity, 0); assert.equal(indiana.quantityIsExact, false); assert.equal(indiana.sourceAvailabilityVerified, true);
  assert.equal(normalizeIndianaCityHiveQuantity(0).reportedQuantity, 0);
  assert.equal(normalizeIndianaCityHiveQuantity(0).sourceAvailabilityVerified, false);
});

test('actual shared parser rejects true, arrays, fractions, unsafe integers and nondecimal stock strings', () => {
  for (const value of invalid.filter(v => v !== undefined && typeof v !== 'number' || Number.isFinite(v))) assert.equal(parse(embedded(value)).length, 0, String(value));
  for (const value of [1, '7', 100]) { const rows = parse(embedded(value)); assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 0); assert.equal(rows[0].quantityIsExact, false); }
});

test('house and unit punctuation remains identity in both comparison directions', () => {
  for (const [left, right] of [
    ['138-44 Main St, Queens NY 11354', '138 44 Main St, Queens NY 11354'],
    ['100 Main St Suite 1-2, Jackson MS 39201', '100 Main St Suite 1/2, Jackson MS 39201'],
    ['100 Main St Suite 1-2, Jackson MS 39201', '100 Main St Suite 1 2, Jackson MS 39201'],
    ['100 Main St Suite A.1, Jackson MS 39201', '100 Main St Suite A 1, Jackson MS 39201'],
    ['100 Main St Suite 1.2, Jackson MS 39201', '100 Main St Suite 1/2, Jackson MS 39201'],
    ['100 Main St Suite 100, Jackson MS 39201', '100 Main St Unit 100, Jackson MS 39201'],
  ]) {
    assert.notEqual(normalizeCityHivePremises(left), normalizeCityHivePremises(right));
    assert.equal(parse(embedded(1, right, {}, { ...source, address: left }), { ...source, address: left }).length, 0);
    assert.equal(parse(embedded(1, left, {}, { ...source, address: right }), { ...source, address: right }).length, 0);
  }
});

test('valid exact punctuated identity and ordinary street abbreviations still match', () => {
  assert.equal(normalizeCityHivePremises('138-44 Main Street, Queens NY 11354, USA'), normalizeCityHivePremises('138 - 44 Main St., Queens NY 11354'));
  assert.equal(normalizeCityHivePremises('100 Main Street Suite 1 - 2, Jackson MS 39201'), normalizeCityHivePremises(source.address));
  const rows = parse(embedded(1, '100 Main Street Suite 1 - 2, Jackson MS 39201'));
  assert.equal(rows.length, 1);
});

test('actual option with conflicting unit cannot pass merchant/pickup proof by punctuation collapse', () => {
  assert.equal(parse(embedded(1, '100 Main St Suite 1/2, Jackson MS 39201')).length, 0);
  assert.equal(parse(embedded(1, '100 Main St Suite 1 2, Jackson MS 39201')).length, 0);
  assert.equal(parse(embedded(1)).length, 1);
});

test('existing explicit reviewed platform address aliases remain explicit rather than normalized equivalences', () => {
  const address = '100 Main St Suite 1/2, Jackson MS 39201';
  assert.equal(parse(embedded(1, address)).length, 0);
  assert.equal(parse(embedded(1, address), { ...source, platformAddresses: [address] }).length, 1);
});

test('host/product/variant/merchant/pickup safeguards remain fail closed', () => {
  for (const patch of [{ product_url: 'https://foreign.invalid/shop/product/eagle-rare/product1?option-id=variant1' },
    { product_url: 'https://fixture.invalid/shop/product/eagle-rare/other?option-id=variant1' },
    { product_url: 'https://fixture.invalid/shop/product/eagle-rare/product1?option-id=other' },
    { merchant_id: 'foreign' }, { offer_types: ['shipping_only'] }]) {
    const html = embedded(1, source.address, patch);
    if ('offer_types' in patch) assert.equal(parse(html.replace('"offer_types":["pickup"]', '"offer_types":["shipping_only"]')).length, 0);
    else assert.equal(parse(html).length, 0);
  }
});

test('saved Georgia CityHive embedded fixtures retain their existing positive binary rows', () => {
  const fixtures = [
    { file: 'dekalb-live-shape.html', count: 3, id: 'dekalb-package-fixture', merchantId: '614294182bffa1413867340c', hostname: 'dekalbpackage.com', address: '3711 N Decatur Rd, Decatur, GA 30032, USA' },
    { file: 'hwy-155-live-shape.html', count: 2, id: 'hwy-155-package-fixture', merchantId: '62d51cb495773e3714a3a607', hostname: 'hwy155package.com', address: '3430 N McDonough Rd, Locust Grove, GA 30248, USA' },
  ];
  for (const fixture of fixtures) {
    const entry = { ...fixture, platform: 'cityhive', baseUrl: 'https://' + fixture.hostname, categoryUrl: 'https://' + fixture.hostname + '/shop/?subtype=Bourbon' };
    const html = readFileSync(new URL('./fixtures/ga/cityhive/' + fixture.file, import.meta.url), 'utf8');
    const rows = parseCityHiveProducts(html, entry, { sources: [entry], isAllowedBottleFormat: isAllowedGeorgiaBottleFormat });
    assert.equal(rows.length, fixture.count); assert.ok(rows.every(row => row.quantity === 0 && row.quantityIsExact === false && row.premisesVerified));
  }
});

test('actual Mississippi parser + reviewed registry still parse saved positive fixture and reject malformed stock', () => {
  const entry = MISSISSIPPI_RETAILER_SOURCES.find(row => row.platform === 'cityhive' && row.merchantId === '68ba2980113a7a29c2076fc3');
  assert.ok(entry); const html = readFileSync(new URL('./fixtures/ms/cityhive/positive.html', import.meta.url), 'utf8');
  const rows = parseMississippiCityHiveHtml(html, entry); assert.equal(rows.length, 1); assert.equal(rows[0].reportedQuantity, 10);
  for (const value of [true, [1], 1.5, '0x10', '1e2']) assert.equal(parseMississippiCityHiveHtml(html.replace('"quantity": 10', '"quantity": ' + JSON.stringify(value)), entry).length, 0);
});


test('captured Indiana curly-apostrophe product title retains existing source normalization and pickup proof', () => {
  const capture = JSON.parse(readFileSync(new URL('./fixtures/indiana-retailer/2026-10-22-identity-regressions.json', import.meta.url), 'utf8'));
  const row = capture.signals.find(row => row.rawName === 'Maker\u2019s Mark Private Selections');
  assert.ok(row, 'the original captured curly-apostrophe title must exist');
  const proof = buildIndianaPaylessAvailabilityProof({ rawName: row.rawName, observedAt: capture.paylessPage.observedAt,
    sourceUrl: INDIANA_PAYLESS_SOURCE.url, storeAddress: INDIANA_PAYLESS_SOURCE.storeAddress,
    pickupText: capture.paylessPage.html.replace(/<[^>]+>/g, ' ') });
  assert.ok(proof); assert.equal(proof.sourceProductBinding.sourceTitle, "Maker's Mark Private Selections");
  assert.equal(hasIndianaPaylessPickupProof({ ...row, rawName: row.rawName, sourceUrl: INDIANA_PAYLESS_SOURCE.url,
    storeId: INDIANA_PAYLESS_SOURCE.storeId, storeAddress: INDIANA_PAYLESS_SOURCE.storeAddress,
    observedAt: capture.paylessPage.observedAt, ...proof }), true);
});
