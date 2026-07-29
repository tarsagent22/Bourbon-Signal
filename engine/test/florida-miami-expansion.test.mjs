import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FL_CITYHIVE_SOURCES,
  floridaCityHivePriorityMerchants,
  isFloridaCityHiveAddressAllowed,
  isFloridaCityHiveProductOptionAllowed,
} from '../src/collectors/precision-probes.mjs';
import {
  isFloridaRetailerInventory,
  isFloridaRetailerSignalIdentity,
} from '../src/florida-retailer-policy.mjs';
import { getStateLifecycle } from '../src/state-lifecycle.mjs';

const source = {
  id: 'big-daddys-liquors',
  allowedCities: new Set(['Hialeah', 'Miami', 'North Miami']),
};

function merchant(id, name, city, fullAddress) {
  return {
    merchant: {
      id,
      name,
      display_name: name,
      address: {
        full_address: fullAddress,
        city,
        state: 'FL',
        zipcode: fullAddress.match(/\b(\d{5})\b/)?.[1],
        address_properties: { city, state: 'FL', full_address: fullAddress },
      },
    },
  };
}

test('Miami CityHive source is explicitly scoped to exact Miami-Dade cities', () => {
  const configured = FL_CITYHIVE_SOURCES.find((entry) => entry.id === 'big-daddys-liquors');
  assert.ok(configured);
  assert.equal(configured.baseUrl, 'https://bigdaddysliquors.com');
  assert.deepEqual([...configured.allowedCities].sort(), ['Hialeah', 'Miami', 'North Miami']);
  assert.equal(configured.maxPages, 3);
  assert.equal(configured.urls[0], 'https://bigdaddysliquors.com/shop/?subtype=bourbon');
  assert.match(configured.discoveryUrl, /region=Miami/i);
  assert.match(configured.urls[0], /subtype=bourbon/);
});

test('Florida CityHive address guard includes Miami-Dade targets and excludes unrelated Florida stores', () => {
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'FL', city: 'Miami', fullAddress: '8600 Biscayne Boulevard, Miami, FL 33138',
  }), true);
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'FL', city: 'North Miami', fullAddress: '13185 Biscayne Boulevard, North Miami, FL 33181',
  }), true);
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'FL', city: 'West Palm Beach', fullAddress: '330 Southern Boulevard, West Palm Beach, FL 33405',
  }), false);
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'FL', city: 'Hallandale Beach', fullAddress: '4 North Federal Highway, Hallandale Beach, FL 33009',
  }), false);
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'GA', city: 'Miami', fullAddress: '1 Forged Way, Miami, GA 33101',
  }), false);
});

test('Florida CityHive merchant selection preserves exact store identity and Miami-Dade scope', () => {
  const blobs = [{ merchant_configs: [
    merchant('aaaaaaaaaaaaaaaaaaaaaaaa', "Big Daddy's Liquors - Miami", 'Miami', '8600 Biscayne Boulevard, Miami, FL 33138'),
    merchant('bbbbbbbbbbbbbbbbbbbbbbbb', "Big Daddy's Liquors - Coconut Grove", 'Miami', '2988 Southwest 27th Avenue, Miami, FL 33133'),
    merchant('cccccccccccccccccccccccc', "Big Daddy's Liquors - Hialeah", 'Hialeah', '1550 West 84th Street, Hialeah, FL 33014'),
    merchant('dddddddddddddddddddddddd', "Big Daddy's Liquors - West Palm Beach", 'West Palm Beach', '330 Southern Boulevard, West Palm Beach, FL 33405'),
  ] }];
  assert.deepEqual(
    floridaCityHivePriorityMerchants(blobs, source).map((row) => ({ id: row.id, city: row.city, address: row.address.full_address })),
    [
      { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', city: 'Miami', address: '8600 Biscayne Boulevard, Miami, FL 33138' },
      { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', city: 'Miami', address: '2988 Southwest 27th Avenue, Miami, FL 33133' },
      { id: 'cccccccccccccccccccccccc', city: 'Hialeah', address: '1550 West 84th Street, Hialeah, FL 33014' },
    ],
  );
});

test('Miami CityHive product options must belong to a selected exact Miami-Dade merchant', () => {
  const selected = new Set(['aaaaaaaaaaaaaaaaaaaaaaaa']);
  assert.equal(isFloridaCityHiveProductOptionAllowed(source, selected, {
    merchant_id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    full_address: '8600 Biscayne Boulevard, Miami, FL 33138',
  }), true);
  assert.equal(isFloridaCityHiveProductOptionAllowed(source, selected, {
    merchant_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    full_address: '8600 Biscayne Boulevard, Miami, FL 33138',
  }), false);
  assert.equal(isFloridaCityHiveProductOptionAllowed(source, selected, {
    merchant_id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    full_address: '330 Southern Boulevard, West Palm Beach, FL 33405',
  }), false);
});

test('Miami Big Daddy CityHive rows require the exact first-party identity', () => {
  const signal = {
    state: 'FL',
    sourceLabel: "Big Daddy's Miami-Dade CityHive store inventory",
    sourceUrl: 'https://bigdaddysliquors.com/shop/product',
    sourceChain: 'big-daddys-liquors',
    merchantId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    storeId: 'big-daddys-liquors:aaaaaaaaaaaaaaaaaaaaaaaa',
    storeAddress: '8600 Biscayne Boulevard, Miami, FL 33138',
    eventType: 'cityhive_store_inventory_result',
    locationPrecision: 'store_level',
    quantity: 0,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
  };
  assert.equal(isFloridaRetailerSignalIdentity(signal), true);
  assert.equal(isFloridaRetailerInventory(signal), true);
  assert.equal(isFloridaRetailerSignalIdentity({ ...signal, sourceUrl: 'https://marketplace.example/product' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...signal, storeId: 'big-daddys-liquors:forged' }), false);
});

test('Florida customer coverage describes the exact-store Miami-Dade expansion', () => {
  const lifecycle = getStateLifecycle('FL');
  assert.match(lifecycle.customerSummary, /Miami-Dade/i);
  assert.match(lifecycle.customerSummary, /exact-store/i);
});
