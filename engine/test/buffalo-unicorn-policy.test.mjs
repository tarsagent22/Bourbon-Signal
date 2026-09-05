import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_YORK_RETAILER_SOURCES, isAllowedMetroBottle } from '../src/collectors/metro-retailer-surfaces.mjs';
import { isMetroRetailerInventory } from '../src/metro-retailer-policy.mjs';

// Production-observed product identity; quantities here are synthetic test inputs.
test('Van Winkle canonical names survive final inventory policy without weakening stock or identity gates', () => {
  const source = NEW_YORK_RETAILER_SOURCES.find((s) => s.id === 'bailey-discount-liquor-wine');
  const store = source.stores[0];
  const productId = '56c2703975627570b0c00100';
  const variantId = 'd42d3b2a08c9b2f89caf3b53e22057de283f8aff0c6ff93675f7dd11656b25c4';
  const signal = {
    id: 'synthetic-buffalo-unicorn-policy', state: 'NY', stateCode: 'NY',
    sourceChain: source.id, sourceLabel: source.sourceLabel,
    sourceUrl: `${source.baseUrl}/shop/product/old-rip-van-winkle-10-year-bourbon-whiskey/${productId}?option-id=${variantId}`,
    merchantId: store.merchantId, productId, variantId,
    eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    locationName: `${store.name} — ${store.address}`, storeId: store.id, storeName: store.name,
    storeAddress: store.address, address: store.address, city: store.city, area: source.area,
    postalCode: store.zip, zip: store.zip,
    rawName: 'Old Rip Van Winkle 10 Year Bourbon Whiskey', canonicalName: 'Old Rip Van Winkle 10 Year',
    canonicalBottleId: 'bb_770b95a65307bba6', tier: 'unicorn',
    availabilityStatus: 'in_stock', sourceAvailabilityVerified: true, pickupOfferVerified: true,
    premisesVerified: true, observedAt: new Date().toISOString(),
    quantity: 1, reportedQuantity: 1, quantityIsExact: true,
    inventorySemantics: 'exact_retailer_reported_quantity', canAlertAsInventory: true,
  };
  assert.equal(isMetroRetailerInventory(signal), true);
  for (const change of [
    { quantity: 0, reportedQuantity: 0 }, { sourceAvailabilityVerified: false },
    { merchantId: 'wrong-merchant' }, { storeId: 'wrong-store' },
    { variantId: 'wrong-variant' }, { pickupOfferVerified: false },
    { premisesVerified: false }, { stale: true },
    { rawName: 'Old Rip Van Winkle 10 Year Bourbon Whiskey 50ml' },
    { rawName: 'Old Rip Van Winkle 10 Year Bourbon Whiskey Gift Set' },
    { canonicalName: 'Van Winkle Family Reserve Rye 13 Year' },
  ]) assert.equal(isMetroRetailerInventory({ ...signal, ...change }), false, JSON.stringify(change));
  for (const name of ['Pappy Van Winkle 15 Year', 'Van Winkle Family Reserve 12 Year']) {
    assert.equal(isAllowedMetroBottle(name), true, name);
  }
});
