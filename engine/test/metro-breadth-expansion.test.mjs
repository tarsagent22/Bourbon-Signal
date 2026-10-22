import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NEW_YORK_EXPANSION_RETAILER_SOURCES, COLORADO_EXPANSION_RETAILER_SOURCES } from '../src/collectors/metro-expansion-sources.mjs';
import { parseMetroCityHiveHtml, isAllowedMetroBottle } from '../src/collectors/metro-retailer-surfaces.mjs';
import { cityHiveSafeBottleMatch } from '../src/collectors/safe-bottle-match.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { fingerprintName } from '../src/core/text.mjs';

const sources = [...NEW_YORK_EXPANSION_RETAILER_SOURCES, ...COLORADO_EXPANSION_RETAILER_SOURCES];
const fixtureRoot = new URL('./fixtures/metro-expansion-20261022/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', fixtureRoot), 'utf8'));
const families = new Map();
for (const filename of ['bourbon-bible-seed.json', 'bourbon-bible-additions.json', 'south-carolina-dunes-bible-additions.json']) {
  for (const family of JSON.parse(readFileSync(new URL(`../data/${filename}`, import.meta.url), 'utf8').replace(/^\uFEFF/u, '')).families || []) {
    const prior = families.get(family.canonical);
    families.set(family.canonical, { ...family, id: fingerprintName(family.canonical), normalizedKey: fingerprintName(family.canonical), aliases: [...new Set([...(prior?.aliases || []), ...(family.aliases || [])])] });
  }
}
const bible = new BourbonBible([...families.values()]);
function page(payload) { return `<script type="application/json">${JSON.stringify(payload)}</script>`; }
function payload(html) { return JSON.parse(html.match(/<script[^>]*>([\s\S]*?)<\/script>/u)[1]); }

test('breadth adds eight exact pickup premises with canonical bottle evidence and bounded requests', () => {
  assert.equal(NEW_YORK_EXPANSION_RETAILER_SOURCES.length, 4);
  assert.equal(COLORADO_EXPANSION_RETAILER_SOURCES.length, 4);
  assert.equal(new Set(sources.map(source => source.stores[0].merchantId)).size, 8);
  assert.equal(manifest.length, 11);
  for (const source of sources) {
    assert.equal(source.inventoryMode, 'premises_quantity');
    assert.equal(source.stores.length, 1);
    assert.equal(source.maxPages, 1);
    assert.ok(manifest.some(entry => entry.id === source.id && entry.canonicalMatches.length > 0), source.id);
    if (source.depthDiscovery) {
      assert.deepEqual(source.depthDiscovery.queryTerms, ['buffalo trace']);
      assert.equal(source.depthDiscovery.maxRequests, 2);
    }
  }
});

for (const source of sources) {
  test(`captured ${source.id} evidence preserves exact merchant, premises, product identity and safe formats`, () => {
    for (const evidence of manifest.filter(entry => entry.id === source.id)) {
      const html = readFileSync(new URL(evidence.fixture, fixtureRoot), 'utf8');
      assert.equal(createHash('sha256').update(html).digest('hex'), evidence.fixtureSha256);
      assert.equal(evidence.httpStatus, 200);
      assert.equal(new URL(evidence.url).hostname, source.host);
      const rows = parseMetroCityHiveHtml(html, source);
      assert.equal(rows.length, evidence.parsedRows);
      assert.ok(rows.every(row => row.merchantId === source.stores[0].merchantId && row.premisesVerified && row.pickupOfferVerified));
      for (const expected of evidence.canonicalMatches) {
        const row = rows.find(candidate => candidate.productId === expected.productId && candidate.variantId === expected.variantId);
        assert.ok(row, expected.productId);
        const matched = cityHiveSafeBottleMatch(row.title, bible);
        assert.equal(matched.record?.canonical, expected.canonical);
        assert.ok(matched.match.confidence >= 0.72);
      }
      assert.deepEqual(parseMetroCityHiveHtml(html, { ...source, baseUrl: 'https://attacker.example' }), []);
      assert.deepEqual(parseMetroCityHiveHtml(html.replaceAll(source.baseUrl, 'https://attacker.example'), source), []);
      assert.deepEqual(parseMetroCityHiveHtml(html.replaceAll(source.stores[0].merchantId, 'forged-merchant'), source), []);
      assert.deepEqual(parseMetroCityHiveHtml(html.replaceAll(source.stores[0].address, '1 Different Premises, Miami, FL 33101'), source), []);
      const noPickup = payload(html);
      for (const product of noPickup.products) for (const merchant of product.merchants || []) merchant.offer_types = ['shipping'];
      assert.deepEqual(parseMetroCityHiveHtml(page(noPickup), source), []);
      const noStock = payload(html);
      for (const product of noStock.products) for (const merchant of product.merchants || []) for (const option of merchant.product_options || []) option.quantity = 0;
      assert.deepEqual(parseMetroCityHiveHtml(page(noStock), source), []);
      const miniatures = payload(html);
      for (const product of miniatures.products) for (const merchant of product.merchants || []) for (const option of merchant.product_options || []) option.option_display_data.size = { quantity: '50', measure: 'ml' };
      assert.deepEqual(parseMetroCityHiveHtml(page(miniatures), source), []);
    }
  });
}

test('retail growth rejects flavored bourbon names observed during source screening', () => {
  assert.equal(isAllowedMetroBottle('Jim Beam Kentucky Fire Bourbon Whiskey'), false);
  assert.equal(isAllowedMetroBottle('Jim Beam Pineapple Bourbon'), false);
});
