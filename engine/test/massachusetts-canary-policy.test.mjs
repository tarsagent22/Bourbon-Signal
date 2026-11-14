import test from 'node:test';
import assert from 'node:assert/strict';
import { CENTRAL_CITYHIVE_RESEARCH_SOURCES } from '../src/collectors/central-cityhive-research-premises.mjs';
import { MA_ESPLANDA_PRODUCTS } from '../src/collectors/massachusetts-esplanda.mjs';
import { MA_JULIOS_SOURCE } from '../src/collectors/massachusetts-retailer-surfaces.mjs';
import { isMassachusettsCanaryOnSiteSignal } from '../src/massachusetts-research-policy.mjs';

const nowMs = Date.parse('2026-11-14T19:15:00.000Z');
const observedAt = '2026-11-14T18:40:25.000Z';
const base = {
  state: 'MA', previewOnly: true, locationPrecision: 'store_level', quantityIsExact: false,
  quantitySemantics: 'binary_retailer_orderable_no_exact_count', sourceAvailabilityVerified: true,
  availabilityStatus: 'in_stock', price: 50, stale: false, sourceStale: false,
  canAlertAsInventory: false, canAlertAsWatch: false, alertable: false,
  eligibleForOnSite: true, eligibleForDropFeed: true, eligibleForWatch: false,
  eligibleForDelivery: false, eligibleForEmail: false, eligibleForSms: false,
};

function cityHiveRow() {
  const source = CENTRAL_CITYHIVE_RESEARCH_SOURCES.find(row => row.state === 'MA');
  const productId = '65b2900319';
  const optionId = 'exact-option-id';
  const rawName = 'Eagle Rare 10 Year Bourbon';
  const canonicalBottleId = 'bb_d0fe561ac45db2d5';
  const canonicalName = 'Eagle Rare 10 Year';
  const proof = { schemaVersion: 1, source: 'central-cityhive', merchantId: source.merchantId,
    storeId: source.storeId, storeAddress: source.address, productId, optionId, rawName,
    canonicalBottleId, canonicalName, price: 50, observedAt, premisesVerified: true,
    pickupOfferVerified: true, reportedQuantity: 1, quantitySemantics: 'binary_retailer_orderable_no_exact_count' };
  return { ...base, type: 'retailer_store_inventory_result', eventType: 'retailer_store_inventory_result',
    source: source.sourceLabel, sourceLabel: source.sourceLabel, sourceChain: source.chainId || source.id, merchantId: source.merchantId,
    storeId: source.storeId, storeName: source.name, storeAddress: source.address, city: source.city, zip: source.zip,
    locationPrecision: 'store_level', sourceUrl: `${source.baseUrl}/shop/product/eagle-rare/${productId}?option-id=${optionId}`,
    productId, variantId: optionId, rawName, canonicalBottleId, canonicalName, observedAt,
    quantity: 0, sourceProductBinding: proof };
}

function esplandaRow() {
  const source = MA_ESPLANDA_PRODUCTS[2];
  const rawName = 'Eagle Rare 10 Year Bourbon 750 ML';
  const canonicalName = 'Eagle Rare 10 Year';
  const proof = { schemaVersion: 1, source: 'massachusetts-esplanda', sourceId: source.id,
    merchantId: source.storeRef, storeId: source.storeId, storeAddress: source.address,
    productId: source.productId, optionId: source.formatId, sourceUrl: source.requestUrl, rawName,
    canonicalBottleId: source.identity.canonicalBottleId, canonicalName, price: 50, observedAt,
    premisesVerified: true, pickupOfferVerified: true, identityMethod: source.identity.identityMethod,
    quantitySemantics: 'binary_retailer_orderable_no_exact_count' };
  return { ...base, observedAt, type: 'retailer_store_inventory_result', sourceChain: 'massachusetts-esplanda',
    sourceRuntimeId: `precision:ma:esplanda:${source.id}`, sourceLabel: `${source.storeName} public pickup inventory`,
    sourceUrl: source.requestUrl, storeId: source.storeId, storeName: source.storeName,
    storeAddress: source.address, city: source.city, zip: source.zip, merchantId: source.storeRef,
    productId: source.productId, variantId: source.formatId, rawName, canonicalBottleId: source.identity.canonicalBottleId,
    canonicalName, availabilityStatus: 'orderable', quantity: null, quantitySemantics: undefined,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count', sourceProductBinding: proof };
}

function juliosRow() {
  const productId = '56553d8e69702d2923120000';
  const optionId = 'exact-option-id';
  const sourceUrl = `${MA_JULIOS_SOURCE.baseUrl}/shop/product/wild-turkey-rare-breed/${productId}?option-id=${optionId}`;
  const rawName = 'WILD TURKEY RARE BREED';
  const canonicalBottleId = 'bb_22604f9ddde2b6ba';
  const canonicalName = 'Wild Turkey Rare Breed Straight Bourbon';
  const proof = { schemaVersion: 1, source: 'massachusetts-julios', sourceId: MA_JULIOS_SOURCE.id,
    merchantId: MA_JULIOS_SOURCE.merchantId, storeId: MA_JULIOS_SOURCE.storeId,
    storeAddress: MA_JULIOS_SOURCE.address, productId, optionId, sourceUrl, rawName,
    canonicalBottleId, canonicalName, price: 50, observedAt, premisesVerified: true,
    pickupOfferVerified: true, identityMethod: 'exact_bible_match',
    quantitySemantics: 'binary_retailer_orderable_no_exact_count' };
  return { ...base, observedAt, type: 'cityhive_store_inventory_result', sourceChain: MA_JULIOS_SOURCE.id,
    sourceRuntimeId: 'precision:ma:julios-westborough:1', merchantId: MA_JULIOS_SOURCE.merchantId,
    storeId: MA_JULIOS_SOURCE.storeId, storeName: MA_JULIOS_SOURCE.storeName,
    storeAddress: MA_JULIOS_SOURCE.address, city: MA_JULIOS_SOURCE.city,
    sourceUrl, productId, variantId: optionId, rawName, canonicalBottleId, canonicalName,
    availabilityStatus: 'orderable', quantity: null, quantitySemantics: undefined,
    inventorySemantics: 'binary_retailer_orderable_no_exact_count', sourceProductBinding: proof };
}

test('Massachusetts isolated preview accepts exact reviewed sources while keeping every alert path disabled', () => {
  for (const row of [cityHiveRow(), esplandaRow(), juliosRow()]) {
    assert.equal(isMassachusettsCanaryOnSiteSignal(row, { nowMs }), true, row.sourceProductBinding.source);
    for (const mutation of [{ storeAddress: '1 Other St, Boston, MA 02117' }, { canAlertAsInventory: true },
      { eligibleForDelivery: true }, { quantityIsExact: true }, { sourceStale: true }]) {
      assert.equal(isMassachusettsCanaryOnSiteSignal({ ...row, ...mutation }, { nowMs }), false,
        `${row.sourceProductBinding.source} accepted ${JSON.stringify(mutation)}`);
    }
  }
});
