import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectKnoxvilleProductPageRetailers,
  KNOXVILLE_PRODUCT_PAGE_SOURCES,
  parseKnoxvilleProductEvidence,
} from '../src/collectors/tennessee-knoxville-retailers.mjs';
import { tennesseeStoresForSource } from '../src/collectors/tennessee-retailer-surfaces.mjs';
import { isAllowedTennesseeCityHiveOption, isTennesseeRetailerInventory } from '../src/tennessee-retailer-policy.mjs';

// Minimal excerpts of the two first-party product page shapes observed on November 20.
const downtownUrl = 'https://www.dtwine.com/makers-mark-46-750-ml.html';
const downtownProduct = `
<link href="https://cdn.shoplightspeed.com/shops/636686/themes/3581/assets/style.css">
<form action="https://www.dtwine.com/cart/add/49049043/" id="product_configure_form" method="post"></form>
<meta itemprop="name" content="Makers Mark 46 Bourbon - 750 ML">
<div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
  <meta itemprop="price" content="39.99">
  <meta itemprop="priceCurrency" content="USD">
  <meta itemprop="url" content="${downtownUrl}">
  <meta itemprop="availability" content="https://schema.org/InStock">
  <meta itemprop="inventoryLevel" content="2">
</div>
<footer>Downtown Wine + Spirits  --------- 407 S. Gay St. Knoxville TN 37902</footer>`;

const galaxyUrl = 'https://galaxyliquor.com/portfolio/upc_088004048150';
const galaxyProduct = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Product', sku: 'upc_088004048150', name: 'Early Times Kentucky Whisky 80 Proof, 750 mL Bottle',
  offers: {
    '@type': 'Offer', availability: 'https://schema.org/InStock', price: '9.99', priceCurrency: 'USD',
    seller: {
      '@type': 'LiquorStore', name: 'Galaxy Liquor',
      address: { postalCode: '37716', addressRegion: 'TN', streetAddress: '926 N Charles G Sevier Blvd', addressLocality: 'Clinton' },
    },
  },
})}</script>`;

test('Downtown product evidence binds the Lightspeed shop, premises, offer URL and current availability', () => {
  const [store] = tennesseeStoresForSource('downtown-wine-knoxville');
  assert.equal(parseKnoxvilleProductEvidence(downtownProduct, downtownUrl, store)?.productId, '49049043');
  for (const [oldValue, newValue] of [['636686', '636687'], ['407 S.', '408 S.'], ['InStock', 'OutOfStock'], [downtownUrl, `${downtownUrl}?store=other`]]) {
    assert.equal(parseKnoxvilleProductEvidence(downtownProduct.replace(oldValue, newValue), downtownUrl, store), null);
  }
  assert.equal(parseKnoxvilleProductEvidence(downtownProduct, 'https://example.com/makers-mark-46-750-ml.html', store), null);
});

test('Galaxy product evidence binds the seller address and SKU and excludes non-stock offers', () => {
  const [store] = tennesseeStoresForSource('galaxy-liquor-clinton');
  assert.equal(parseKnoxvilleProductEvidence(galaxyProduct, galaxyUrl, store)?.price, 9.99);
  for (const [oldValue, newValue] of [['926 N', '961 N'], ['088004048150', '088004048152'], ['InStock', 'PreOrder']]) {
    assert.equal(parseKnoxvilleProductEvidence(galaxyProduct.replace(oldValue, newValue), galaxyUrl, store), null);
  }
  assert.equal(parseKnoxvilleProductEvidence('<p>In Stock</p>', galaxyUrl, store), null);
});

test('CityHive verifies the variant format when titles omit volume', () => {
  const option = (quantity, measure = 'ml') => ({ option_params: { size: { quantity, measure } } });
  assert.equal(isAllowedTennesseeCityHiveOption(option('750')), true);
  assert.equal(isAllowedTennesseeCityHiveOption(option('1.75', 'L')), true);
  assert.equal(isAllowedTennesseeCityHiveOption(option('375')), false);
  assert.equal(isAllowedTennesseeCityHiveOption({ ...option('750'), preorder_details: { enabled: true } }), false);
  assert.equal(isAllowedTennesseeCityHiveOption({ ...option('750'), option_display_data: { size: { quantity: '375', measure: 'ml' } } }), false);
});

test('catalog discovery verifies same-host detail stock, stops on a denial and preserves binary inventory', async () => {
  const [downtown, galaxy] = KNOXVILLE_PRODUCT_PAGE_SOURCES;
  const pendingUrl = 'https://galaxyliquor.com/portfolio/other-item';
  const responseBodies = new Map([
    [downtown.categoryUrl, `<a href="${downtownUrl}">Makers Mark 46 Bourbon</a><a href="https://example.com/false.html">Makers Mark 46 Bourbon</a>`],
    ...downtown.additionalCategoryUrls.map((url) => [url, '']),
    [downtownUrl, downtownProduct],
    [galaxy.categoryUrl, `<a href="${galaxyUrl}"><article><p>Early Times Kentucky Whisky</p></article></a><a href="${pendingUrl}"><article><p>Another bottle</p></article></a>`],
  ]);
  const requests = [];
  const bible = { match: (name) => ({ record: { id: name, canonical: name, tier: 'standard' }, confidence: 1 }) };
  const result = await collectKnoxvilleProductPageRetailers(bible, {
    sleep: async () => {},
    fetchText: async (url, { maxRedirects, timeoutMs }) => {
      assert.equal(maxRedirects, 0);
      assert.equal(timeoutMs, 6_000);
      requests.push(url);
      return { url, ok: responseBodies.has(url), status: responseBodies.has(url) ? 200 : 403, text: responseBodies.get(url) };
    },
  });
  assert.deepEqual(new Set(requests), new Set([downtown.categoryUrl, ...downtown.additionalCategoryUrls, downtownUrl, galaxy.categoryUrl, galaxyUrl]));
  assert.deepEqual(result.roadblocks.map(({ status }) => status), [403]);
  assert.equal(result.signals.length, 1);
  const [stock] = result.signals;
  assert.equal(isTennesseeRetailerInventory(stock), true);
  assert.equal(stock.quantity, 0);
  assert.equal(stock.quantityIsExact, false);
  assert.equal(isTennesseeRetailerInventory({ ...stock, quantity: 2, quantityIsExact: true }), false);
});

test('a reviewed Galaxy alias requires the exact SKU and expression on discovery and detail', async () => {
  const [, galaxy] = KNOXVILLE_PRODUCT_PAGE_SOURCES;
  const rareBreedUrl = 'https://galaxyliquor.com/portfolio/upc_721059000222';
  const title = 'Wild Turkey Rare Breed Barrel Proof Kentucky Straight Bourbon Whiskey, 750 mL Bottle';
  const canonical = 'Wild Turkey Rare Breed Straight Bourbon';
  const catalog = `<a href="${rareBreedUrl}"><article><p>${title}</p></article></a>`;
  const detail = galaxyProduct.replace('upc_088004048150', 'upc_721059000222')
    .replace('Early Times Kentucky Whisky 80 Proof, 750 mL Bottle', title);
  const bible = { match: (name) => name === canonical ? { record: { id: 'rare-breed', canonical, tier: 'limited' }, confidence: 1 } : null };
  const collect = async (body, catalogBible = bible) => collectKnoxvilleProductPageRetailers(catalogBible, {
    sleep: async () => {},
    fetchText: async (url) => ({
      url, ok: url === galaxy.categoryUrl || url === rareBreedUrl, status: url.startsWith('https://galaxyliquor.com/') ? 200 : 404,
      text: url === galaxy.categoryUrl ? catalog : body,
    }),
  });
  assert.deepEqual((await collect(detail)).signals.map((row) => row.canonicalName), [canonical]);
  assert.deepEqual((await collect(detail.replace('Straight Bourbon', 'Straight Rye'))).signals, []);
  const disabledBible = { match: () => ({ record: { canonical, libraryAlertEligible: false }, confidence: 1 }) };
  assert.deepEqual((await collect(detail, disabledBible)).signals, []);
});
