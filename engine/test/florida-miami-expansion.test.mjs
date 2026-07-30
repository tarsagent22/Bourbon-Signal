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

const source = FL_CITYHIVE_SOURCES.find((entry) => entry.id === 'big-daddys-liquors');

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

test('Big Daddy CityHive source covers the complete reviewed South Florida branch registry', () => {
  assert.ok(source);
  assert.equal(source.baseUrl, 'https://bigdaddysliquors.com');
  assert.equal(source.categoryUrl, 'https://bigdaddysliquors.com/shop/?subtype=bourbon');
  assert.equal(source.merchants.size, 14);
  for (const city of ['Miami', 'Hialeah', 'North Miami', 'Fort Lauderdale', 'West Palm Beach', 'Pompano Beach', 'Hollywood', 'Hallandale Beach', 'Pembroke Pines', 'Miramar', 'Surfside']) {
    assert.ok([...source.merchants.values()].some((store) => store.city === city), `missing reviewed Big Daddy branch in ${city}`);
  }
});

test('Florida CityHive address guard requires an exact reviewed store address', () => {
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'FL', city: 'Miami', fullAddress: '8600 Biscayne Blvd, Miami, FL 33138, USA',
  }), true);
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'FL', city: 'West Palm Beach', fullAddress: '330 Southern Blvd, West Palm Beach, FL 33405, USA',
  }), true);
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'FL', city: 'Miami', fullAddress: '8602 Biscayne Blvd, Miami, FL 33138, USA',
  }), false);
  assert.equal(isFloridaCityHiveAddressAllowed(source, {
    state: 'GA', city: 'Miami', fullAddress: '1 Forged Way, Miami, GA 33101',
  }), false);
});

test('Florida CityHive merchant selection rejects unknown IDs and address drift', () => {
  const miamiId = '5d4c3687c9bb183d498c2c78';
  const westPalmId = '5d4c3678c9bb183d498c2c50';
  const blobs = [{ merchant_configs: [
    merchant(miamiId, "Big Daddy's Liquors - Miami", 'Miami', '8600 Biscayne Blvd, Miami, FL 33138, USA'),
    merchant(westPalmId, "Big Daddy's Liquors - West Palm Beach", 'West Palm Beach', '330 Southern Blvd, West Palm Beach, FL 33405, USA'),
    merchant('aaaaaaaaaaaaaaaaaaaaaaaa', 'Forged branch', 'Miami', '1 Forged Way, Miami, FL 33101, USA'),
    merchant('5d4c3683c9bb183d498c2c6c', "Big Daddy's Liquors - North Miami", 'North Miami', '13180 Biscayne Blvd, North Miami, FL 33181, USA'),
  ] }];
  assert.deepEqual(
    floridaCityHivePriorityMerchants(blobs, source).map((row) => ({ id: row.id, city: row.city, address: row.address.full_address })),
    [
      { id: miamiId, city: 'Miami', address: '8600 Biscayne Blvd, Miami, FL 33138, USA' },
      { id: westPalmId, city: 'West Palm Beach', address: '330 Southern Blvd, West Palm Beach, FL 33405, USA' },
    ],
  );
});

test('Florida CityHive product options must match the selected exact merchant and address', () => {
  const merchantId = '5d4c3687c9bb183d498c2c78';
  const selected = new Set([merchantId]);
  assert.equal(isFloridaCityHiveProductOptionAllowed(source, selected, {
    merchant_id: merchantId,
    full_address: '8600 Biscayne Blvd, Miami, FL 33138, USA',
  }), true);
  assert.equal(isFloridaCityHiveProductOptionAllowed(source, selected, {
    merchant_id: '5d4c3678c9bb183d498c2c50',
    full_address: '8600 Biscayne Blvd, Miami, FL 33138, USA',
  }), false);
  assert.equal(isFloridaCityHiveProductOptionAllowed(source, selected, {
    merchant_id: merchantId,
    full_address: '330 Southern Blvd, West Palm Beach, FL 33405, USA',
  }), false);
});

test('Big Daddy CityHive inventory requires the complete reviewed first-party identity', () => {
  const merchantId = '5d4c3687c9bb183d498c2c78';
  const signal = {
    state: 'FL',
    sourceLabel: "Big Daddy's South Florida CityHive store inventory",
    sourceUrl: 'https://bigdaddysliquors.com/shop/product/example',
    sourceChain: 'big-daddys-liquors',
    merchantId,
    storeId: `big-daddys-liquors:${merchantId}`,
    storeAddress: '8600 Biscayne Blvd, Miami, FL 33138, USA',
    eventType: 'cityhive_store_inventory_result',
    locationPrecision: 'store_level',
    quantity: 1,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    canAlertAsInventory: true,
  };
  assert.equal(isFloridaRetailerSignalIdentity(signal), true);
  assert.equal(isFloridaRetailerInventory(signal), true);
  assert.equal(isFloridaRetailerSignalIdentity({ ...signal, sourceUrl: 'https://marketplace.example/product' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...signal, storeId: 'big-daddys-liquors:forged' }), false);
  assert.equal(isFloridaRetailerSignalIdentity({ ...signal, storeAddress: '8602 Biscayne Blvd, Miami, FL 33138, USA' }), false);
  assert.equal(isFloridaRetailerInventory({ ...signal, availabilityStatus: 'stale', sourceAvailabilityVerified: false, canAlertAsInventory: false }), false);
});

test('Florida customer coverage describes the multi-region exact-store expansion', () => {
  const lifecycle = getStateLifecycle('FL');
  assert.match(lifecycle.customerSummary, /Jacksonville/i);
  assert.match(lifecycle.customerSummary, /South Florida/i);
  assert.match(lifecycle.customerSummary, /Panhandle/i);
  assert.match(lifecycle.customerSummary, /exact merchant\/store identity/i);
  for (const area of ['Jacksonville', 'West Palm Beach', 'Fort Lauderdale', 'Sarasota', 'Gainesville', 'Destin']) {
    assert.ok(lifecycle.areaOptions.includes(area), `missing ${area} from customer Florida areas`);
  }
});
