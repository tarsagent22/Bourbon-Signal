import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BourbonBible } from '../src/core/bible.mjs';
import { fingerprintName, stableId } from '../src/core/text.mjs';
import {
  FWGS_REVIEWED_PRODUCT_CONTRACT,
  FWGS_REVIEWED_PRODUCT_IDENTITIES,
  FWGS_REVIEWED_SOURCE_HOST,
  reviewedFwgsBottleMatch,
} from '../src/collectors/fwgs-reviewed-matching.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/pennsylvania-fwgs-20261022/reviewed-products.json', import.meta.url), 'utf8'));
const additions = JSON.parse(await readFile(new URL('../data/pennsylvania-fwgs-bible-additions.json', import.meta.url), 'utf8'));
const addedRecords = additions.families.map((family) => ({
  id: `bb_${stableId([fingerprintName(family.canonical)])}`,
  canonical: family.canonical,
  normalizedKey: fingerprintName(family.canonical),
  aliases: family.aliases,
  tier: family.tier,
  producer: family.producer,
  sources: ['state:PA:fwgs', 'state:PA'],
}));
const records = [...fixture.existingCanonicalRecords, ...addedRecords];
const bible = new BourbonBible(records);

test('six exact FWGS product signatures map to distinct reviewed canonical families', () => {
  for (const entry of fixture.reviewedProducts) {
    const result = reviewedFwgsBottleMatch(entry.product, bible);
    assert.equal(result.reviewed, true);
    assert.equal(result.record?.id, entry.canonicalBottleId, entry.product.name);
    assert.equal(result.record?.canonical, entry.canonicalName);
    assert.equal(result.match?.method, 'reviewed-fwgs-product-identity');
    assert.equal(result.match?.confidence, 1);
    assert.deepEqual(result.proof, {
      contractVersion: FWGS_REVIEWED_PRODUCT_CONTRACT,
      sourceHost: FWGS_REVIEWED_SOURCE_HOST,
      sku: entry.product.sku,
      sourceTitle: entry.product.name,
      sourceBrand: entry.product.brand,
      sourceCategory: entry.product.category,
      sourceType: entry.product.type,
      sourceRoute: entry.product.route,
      sourceProductUrl: entry.sourceUrl,
      canonicalBottleId: entry.canonicalBottleId,
      canonicalName: entry.canonicalName,
    });
  }
});

test('the frozen capture supplies 1362 identity candidates, with only 912 eligible tiers', () => {
  assert.equal(fixture.provenance.originalBibleRecordCount, 185);
  assert.equal(fixture.provenance.capturedAt, '2026-10-22T17:03:05.073Z');
  assert.equal(fixture.reviewedProducts.reduce((sum, entry) => sum + entry.rows, 0), 1362);
  const eligibleTiers = new Set(['unicorn', 'allocated', 'limited']);
  const tierEligibleCandidates = fixture.reviewedProducts.reduce((sum, entry) => {
    const result = reviewedFwgsBottleMatch(entry.product, bible);
    return sum + (eligibleTiers.has(result.record?.tier) ? entry.rows : 0);
  }, 0);
  assert.equal(tierEligibleCandidates, 912, 'candidate counts do not establish public projection or notification delivery');
});

test('source-scoped matching does not add broad global FWGS title aliases', () => {
  for (const entry of fixture.reviewedProducts) assert.equal(bible.match(entry.product.name), null, entry.product.name);
  for (const family of additions.families) {
    assert.deepEqual(family.aliases, [family.canonical]);
    assert.equal(bible.match(family.canonical)?.record?.canonical, family.canonical);
    const identity = FWGS_REVIEWED_PRODUCT_IDENTITIES.find((entry) => entry.canonicalName === family.canonical);
    assert.equal(family.reviewedFwgsProduct.sku, identity.sku);
    assert.equal(family.reviewedFwgsProduct.route, identity.route);
    assert.equal(family.reviewedFwgsProduct.name, identity.name);
    assert.equal(family.reviewedFwgsProduct.brand, identity.brand);
    assert.equal(family.reviewedFwgsProduct.category, identity.category);
    assert.equal(family.reviewedFwgsProduct.type, identity.type);
    assert.ok(family.sourceUrls.every((value) => new URL(value).protocol === 'https:'));
  }
  assert.equal(addedRecords.find((record) => record.canonical === 'Larceny Barrel Proof').tier, 'standard');
  assert.equal(addedRecords.find((record) => record.canonical === 'Knob Creek 12 Year').tier, 'standard');
  assert.equal(addedRecords.find((record) => record.canonical === '1792 Bottled in Bond').tier, 'limited');
  assert.equal(additions.families.find((family) => family.canonical === '1792 Bottled in Bond').tierEvidence.producerDesignation, 'Limited Edition');
});

test('changing or omitting any reviewed identity component fails closed', () => {
  for (const { product } of fixture.reviewedProducts) {
    const mutations = {
      sku: '999999999', name: `${product.name} Cask Strength`, brand: 'Unknown Brand',
      category: product.category === null ? 'Bourbon' : 'Rye Whiskey', type: 'liqueur',
      route: `/other-product/product/${product.sku}`,
    };
    for (const [field, value] of Object.entries(mutations)) {
      assert.equal(reviewedFwgsBottleMatch({ ...product, [field]: value }, bible).record, null, `${product.sku} changed ${field}`);
      const incomplete = { ...product };
      delete incomplete[field];
      assert.equal(reviewedFwgsBottleMatch(incomplete, bible).record, null, `${product.sku} missing ${field}`);
    }
    for (const route of [
      `https://${FWGS_REVIEWED_SOURCE_HOST}${product.route}`, `${product.route}?sku=other`,
      `https://unreviewed.example${product.route}`, product.route.replace('/product/', '/product/../product/'),
    ]) {
      assert.equal(reviewedFwgsBottleMatch({ ...product, route }, bible).record, null, route);
    }
  }
});

test('specific batch, age, strength, or format metadata requires a separate review', () => {
  for (const { product } of fixture.reviewedProducts) {
    for (const field of ['batch', 'batchCode', 'batchNumber', 'age', 'ageYears', 'proof', 'abv', 'size', 'bottleSize', 'format', 'variant', 'variantId', 'variantTitle']) {
      const result = reviewedFwgsBottleMatch({ ...product, [field]: 'unreviewed' }, bible);
      assert.equal(result.record, null, field);
      assert.equal(result.reason, 'unreviewed_fwgs_variant_metadata');
    }
    for (const suffix of [' Gift Pack', ' with Mixing Glass', ' Rye', ' Single Barrel FWGS Exclusive', ' 15 Year', ' Batch C925', ' 375ml', ' 6 Pack']) {
      assert.equal(reviewedFwgsBottleMatch({ ...product, name: `${product.name}${suffix}` }, bible).record, null, suffix);
    }
  }
});

test('real neighboring FWGS expressions do not collapse into the reviewed families', () => {
  for (const { product } of fixture.unreviewedProducts) {
    const result = reviewedFwgsBottleMatch(product, bible);
    assert.equal(result.record, null, product.name);
    assert.equal(result.proof, null);
    assert.equal(result.reason, 'unreviewed_fwgs_product');
  }
});

test('missing, ambiguous, or changed canonical records cannot acquire reviewed proof', () => {
  for (const { product, canonicalBottleId, canonicalName } of fixture.reviewedProducts) {
    const target = records.find((record) => record.id === canonicalBottleId);
    const siblings = records.filter((record) => record.id !== canonicalBottleId);
    const invalidBibles = [
      { records: siblings },
      { records: [...records, { ...target }] },
      { records: [...records, { ...target, id: 'other', canonical: canonicalName }] },
      ...['id', 'canonical', 'tier', 'producer'].map((field) => ({ records: [...siblings, { ...target, [field]: 'changed' }] })),
    ];
    for (const invalid of invalidBibles) {
      const result = reviewedFwgsBottleMatch(product, invalid);
      assert.equal(result.record, null);
      assert.equal(result.proof, null);
    }
  }
  assert.equal(reviewedFwgsBottleMatch(fixture.reviewedProducts[0].product, {}).record, null);
});

test('online product availability and inventory never establish or change store pickup proof', () => {
  for (const { product } of fixture.reviewedProducts) {
    for (const available of ['Y', 'N']) {
      for (const status of ['IN_STOCK', 'OUT_OF_STOCK']) {
        const result = reviewedFwgsBottleMatch({ ...product, onlineAvailable: available, inventory: { stockStatus: status, inStockQuantity: 0 } }, bible);
        assert.ok(result.record);
        assert.equal(Object.hasOwn(result.proof, 'quantity'), false);
        assert.equal(Object.hasOwn(result.proof, 'storeId'), false);
        assert.equal(Object.hasOwn(result.proof, 'observedAt'), false);
        assert.equal(Object.hasOwn(result.proof, 'availabilityStatus'), false);
      }
    }
  }
});

test('the reviewed registry and entries are immutable', () => {
  assert.ok(Object.isFrozen(FWGS_REVIEWED_PRODUCT_IDENTITIES));
  assert.ok(FWGS_REVIEWED_PRODUCT_IDENTITIES.every(Object.isFrozen));
});
