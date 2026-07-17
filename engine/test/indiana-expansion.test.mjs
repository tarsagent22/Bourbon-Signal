import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INDIANA_TARGET_STORES,
  indianaCityHivePriorityRank,
  isIndianaCityHivePriorityMarket,
  filterFreshIndianaTargetSignals,
  mergeIndianaTargetCacheSignals,
  parseIndianaTargetFulfillment,
  parseIndianaTargetSearchProducts,
  shouldWriteIndianaTargetCache,
} from '../src/collectors/indiana-retailer-surfaces.mjs';
import {
  isIndianaRetailerInventory,
  isIndianaRetailerSignalIdentity,
} from '../src/indiana-retailer-policy.mjs';

const EXPECTED_TARGET_STORES = new Map([
  ['1530', ['Muncie', '3601 N Barr St, Muncie, IN 47303']],
  ['111', ['Kokomo', '1037 S Reed Rd, Kokomo, IN 46902']],
  ['1911', ['Columbus', '1865 N National Rd, Columbus, IN 47201']],
  ['139', ['New Albany', '2209 State St, New Albany, IN 47150']],
  ['2068', ['Clarksville', '1125 Veterans Pkwy, Clarksville, IN 47129']],
  ['1481', ['Evansville', '6625 E Lloyd Expy, Evansville, IN 47715']],
  ['108', ['Evansville', '4000 1st Ave, Evansville, IN 47710']],
  ['1762', ['Lafayette', '3630 South Street, Lafayette, IN 47905']],
  ['3309', ['West Lafayette', '300 W State St, Ste 100, West Lafayette, IN 47906']],
]);

test('Indiana Target registry binds official store IDs to exact Indiana addresses', () => {
  assert.equal(INDIANA_TARGET_STORES.size, EXPECTED_TARGET_STORES.size);
  for (const [id, [city, address]] of EXPECTED_TARGET_STORES) {
    const store = INDIANA_TARGET_STORES.get(id);
    assert.ok(store, `missing Target store ${id}`);
    assert.equal(store.city, city);
    assert.equal(store.address, address);
    assert.match(store.zip, /^\d{5}$/);
    assert.equal(store.officialUrl, `https://www.target.com/sl/${store.slug}/${id}`);
  }
});

test('Indiana CityHive branch expansion prioritizes every Gays Hops-N-Schnapps market', () => {
  for (const city of ['Auburn', 'Fremont', 'Angola', 'LaGrange']) {
    assert.equal(isIndianaCityHivePriorityMarket(`Gays ${city}, IN`), true, city);
  }
  assert.equal(isIndianaCityHivePriorityMarket('Louisville, KY'), false);
  assert(indianaCityHivePriorityRank('Auburn') < indianaCityHivePriorityRank('unknown Indiana town'));
});

test('Target response parsers fail closed on malformed reachable payloads', () => {
  for (const malformed of [null, {}, '{bad json', { data: { search: { products: {} } } }]) {
    assert.deepEqual(parseIndianaTargetSearchProducts(malformed), []);
  }
  for (const malformed of [null, {}, '{bad json', { data: { product: { fulfillment: { store_options: {} } } } }]) {
    assert.deepEqual(parseIndianaTargetFulfillment(malformed), []);
  }
  const products = [{ tcin: '1' }];
  assert.deepEqual(parseIndianaTargetSearchProducts({ data: { search: { products } } }), products);
});

test('Target partial refresh retains fresh cache for incomplete selected stores', () => {
  const live = [{ id: 'live-111', merchantId: '111' }];
  const cached = [
    { id: 'cached-1530', merchantId: '1530' },
    { id: 'cached-111', merchantId: '111' },
    { id: 'cached-1911', merchantId: '1911' },
    { id: 'live-111', merchantId: '1911' },
  ];
  const merged = mergeIndianaTargetCacheSignals(live, cached, {
    selectedStoreIds: new Set(['1530', '111']),
    completedStoreIds: new Set(['111']),
  });
  assert.deepEqual(merged.map((row) => row.id).sort(), ['cached-1530', 'cached-1911', 'live-111']);
  assert.equal(shouldWriteIndianaTargetCache(0, new Set(['111'])), true);
  assert.equal(shouldWriteIndianaTargetCache(0, new Set()), false);
});

test('Target cache freshness follows each row observation time, not a rewritten artifact timestamp', () => {
  const now = Date.parse('2026-07-14T20:00:00.000Z');
  const rows = [
    { id: 'fresh', observedAt: '2026-07-14T19:59:30.000Z' },
    { id: 'expired', observedAt: '2026-07-14T19:58:00.000Z' },
    { id: 'invalid', observedAt: 'not-a-date' },
  ];
  assert.deepEqual(filterFreshIndianaTargetSignals(rows, now, 60_000).map((row) => row.id), ['fresh']);
});

test('Target fulfillment parser accepts only known store-bound pickup or in-store availability', () => {
  const rows = parseIndianaTargetFulfillment({
    data: {
      product: {
        fulfillment: {
          store_options: [
            { location_id: '1530', location_available_to_promise_quantity: 7, order_pickup: { availability_status: 'IN_STOCK' }, in_store_only: { availability_status: 'OUT_OF_STOCK' } },
            { location_id: '111', location_available_to_promise_quantity: 5, order_pickup: { availability_status: 'OUT_OF_STOCK' }, in_store_only: { availability_status: 'OUT_OF_STOCK' } },
            { location_id: '1911', location_available_to_promise_quantity: 2, order_pickup: { availability_status: 'OUT_OF_STOCK' }, in_store_only: { availability_status: 'IN_STOCK' } },
            { location_id: '9999', location_available_to_promise_quantity: 99, order_pickup: { availability_status: 'IN_STOCK' } },
          ],
        },
      },
    },
  });

  assert.deepEqual(rows.map((row) => row.locationId), ['1530', '1911']);
  assert.equal(rows[0].availableToPromise, 7);
  assert.equal(rows[0].availabilityMode, 'order_pickup');
  assert.equal(rows[1].availabilityMode, 'in_store_only');
});

function targetSignal(overrides = {}) {
  return {
    state: 'IN',
    stateCode: 'IN',
    sourceLabel: 'Target Indiana RedSky store fulfillment',
    sourceUrl: 'https://www.target.com/p/-/A-12345678',
    sourceChain: 'target',
    merchantId: '1530',
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    storeId: 'target:1530',
    storeAddress: '3601 N Barr St, Muncie, IN 47303',
    city: 'Muncie',
    quantity: 0,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    raw: { chain: 'target', merchantId: '1530', availableToPromise: 7 },
    ...overrides,
  };
}

test('Indiana inventory policy accepts exact Target binary orderability without inventing quantity', () => {
  const signal = targetSignal();
  assert.equal(isIndianaRetailerSignalIdentity(signal), true);
  assert.equal(isIndianaRetailerInventory(signal), true);
  assert.equal(signal.quantity, 0);

  const projectedDrop = {
    ...signal,
    type: signal.eventType,
    eventType: undefined,
    source: signal.sourceLabel,
    sourceLabel: undefined,
    stateCode: undefined,
    raw: undefined,
    sourceChain: 'target',
    merchantId: '1530',
  };
  assert.equal(isIndianaRetailerSignalIdentity(projectedDrop), true);
  assert.equal(isIndianaRetailerInventory(projectedDrop), true);
});

test('Indiana inventory identity fails closed on host, store, geography, and sentinel mismatches', () => {
  assert.equal(isIndianaRetailerInventory(targetSignal({ sourceUrl: 'https://target.example/p/-/A-12345678' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ merchantId: '111', storeId: 'target:1530' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ storeAddress: '3601 N Barr St, Muncie, OH 47303' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ stateCode: 'OH' })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ stale: true, canAlertAsInventory: false })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ raw: { chain: 'target', merchantId: '1530', reportedQuantity: 1, staleFallback: true }, canAlertAsInventory: false })), false);
  assert.equal(isIndianaRetailerInventory(targetSignal({ quantity: 100, raw: { chain: 'target', merchantId: '1530', reportedQuantity: 100 } })), false);
});

test('Indiana policy binds existing first-party retailer identities and keeps DoorDash watch-only', () => {
  const bigRed = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'Big Red Liquors CityHive store inventory',
    sourceUrl: 'https://bigredliquors.com/shop/product/example', eventType: 'cityhive_store_inventory_result',
    locationPrecision: 'store_level', storeId: 'big-red:5e92544978e8f13c2cb1e16c',
    storeAddress: '435 S Walnut St, Bloomington, IN 47401, USA', quantity: 2,
    availabilityStatus: 'in_stock', canAlertAsInventory: true, raw: { chain: 'big-red', reportedQuantity: 2 },
  };
  const payless = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'Payless Liquors East Street barrel selections',
    sourceUrl: 'https://www.paylessliquors.info/barrel-selections', eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', storeId: 'payless-liquors:east-street',
    storeAddress: '3825 S. East Street, Indianapolis, IN 46227', quantity: 1,
    availabilityStatus: 'available_store_pick', canAlertAsInventory: true, raw: { chain: 'payless-liquors' },
  };
  const penguin = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'Penguin Liquor Lafayette in-stock product pages',
    sourceUrl: 'https://www.penguinliquor.com/p/buffalo-trace-bourbon/1138', eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', storeId: 'penguin-liquor:96',
    storeAddress: '3295 Teal Road, Lafayette, IN 47905', quantity: 1,
    availabilityStatus: 'in_stock', canAlertAsInventory: true,
    raw: { source: 'penguin_liquor_gotoliquorstore_product_page', quantitySemantics: 'in_stock_no_exact_count' },
  };
  const gays = {
    ...bigRed,
    sourceLabel: "Gays Hops-N-Schnapps CityHive store inventory",
    sourceUrl: 'https://gayshopsnschnapps.com/shop/product/example',
    storeId: 'gays-hops-n-schnapps:6230bb5d71da8220ca315f14',
    storeAddress: '101 Growth Parkway, Angola, IN 46703',
    raw: { chain: 'gays-hops-n-schnapps', reportedQuantity: 2 },
  };
  const vineAndTable = {
    ...bigRed,
    sourceLabel: 'Vine & Table CityHive store inventory',
    sourceUrl: 'https://vineandtable.com/shop/product/example',
    storeId: 'vine-and-table:5f36e823c5f1fb25f240865e',
    storeAddress: '313 East Carmel Drive, Carmel, IN 46032',
    raw: { chain: 'vine-and-table', reportedQuantity: 2 },
  };
  const doorDash = {
    state: 'IN', stateCode: 'IN', sourceLabel: 'DoorDash Frontier Liquors Evansville marketplace inventory',
    sourceUrl: 'https://www.doordash.com/convenience/store/frontier-liquors-evansville-26286224/',
    eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level', storeId: 'doordash:26286224',
    storeAddress: '1701 Oak Hill Road, Evansville, IN 47711', quantity: 1,
    availabilityStatus: 'marketplace_listed_not_out_of_stock', canAlertAsInventory: true,
    raw: { source: 'doordash_frontier_liquors_public_store_page' },
  };

  for (const signal of [bigRed, payless, penguin, gays, vineAndTable]) {
    assert.equal(isIndianaRetailerSignalIdentity(signal), true);
    assert.equal(isIndianaRetailerInventory(signal), true);
  }
  assert.equal(isIndianaRetailerSignalIdentity(doorDash), true);
  assert.equal(isIndianaRetailerInventory(doorDash), false);
  assert.equal(isIndianaRetailerInventory({ ...bigRed, sourceUrl: 'https://evil.example/shop/product/example' }), false);
});
