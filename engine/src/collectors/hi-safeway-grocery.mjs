import { stableId } from '../core/text.mjs';
import { parseBoundGroceryXapiInventory } from './grocery-xapi-identity.mjs';

// Four Hawaii premises were bound to Safeway's public resolver on 2026-11-14.
// This reviewed cohort is intentionally not a statewide store directory.
export const HI_SAFEWAY_SOURCES = Object.freeze([
  {
    id: 'safeway-hi-2944', merchantId: '2944', storeId: 'safeway:2944', name: 'Safeway #2944',
    address: '1234 S Beretania St, Honolulu, HI 96814', city: 'Honolulu', zip: '96814', island: 'Oahu',
  },
  {
    id: 'safeway-hi-280', merchantId: '280', storeId: 'safeway:280', name: 'Safeway #280',
    address: "1090 Ho'okele St, Kahului, HI 96732", city: 'Kahului', zip: '96732', island: 'Maui',
  },
  {
    id: 'safeway-hi-2894', merchantId: '2894', storeId: 'safeway:2894', name: 'Safeway #2894',
    address: '4454 Nuhou St Suite #301, Lihue, HI 96766', city: 'Lihue', zip: '96766', island: 'Kauai',
  },
  {
    id: 'safeway-hi-2893', merchantId: '2893', storeId: 'safeway:2893', name: 'Safeway #2893',
    address: "381 E Maka'Ala St, Hilo, HI 96720", city: 'Hilo', zip: '96720', island: 'Hawaii Island',
  },
].map(Object.freeze));

export const HI_SAFEWAY_RESOLVER_ZIPS = Object.freeze([...new Set(HI_SAFEWAY_SOURCES.map(source => source.zip))]);

const REVIEWED_SKUS = Object.freeze({
  '960051942': {
    upc: '0008024400923', canonical: 'Buffalo Trace Bourbon', abv: 45,
    title: /^Buffalo Trace Bourbon 90 Proof - 750 Ml \(limited quantities may be available in store\)$/i,
  },
  '960293806': {
    upc: '0008800400549', canonical: 'E.H. Taylor Small Batch', abv: 50,
    title: /^E\.H\. Taylor Small Batch Kentucky Straight Bourbon Whiskey 100 Proof - 750 Ml \(limited quantities may be available in store\)$/i,
  },
  '960488502': {
    upc: '0008800400552', canonical: 'E.H. Taylor Jr. Barrel Proof Bourbon', abv: null,
    // "Variable Proof" is an explicit expression. The retailer ABV may vary by
    // batch; SKU, UPC, full title, and 750 mL bind identity.
    title: /^Colonel E\.H\. Taylor Barrel Proof Straight Kentucky Bourbon Whiskey Variable Proof - 750 Ml \(limited quantities may be available in store\)$/i,
  },
});

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function hiSafewayPremiseMatches(source, store) {
  const address = store?.address;
  return String(store?.locationId || '') === source.merchantId
    && address?.state === 'HI'
    && address?.country === 'US'
    && normalize(store?.polarisBannerName) === 'safeway'
    && normalize(store?.domainName) === 'safeway'
    && normalize(`${address.line1}, ${address.city}, ${address.state} ${address.zipcode}`) === normalize(source.address);
}

function reviewedSkuMatches(product, expected) {
  const abv = Number(product.alcoholVolumePct);
  const proofIsValid = expected.abv === null
    ? Number.isFinite(abv) && abv >= 40 && abv <= 80
    : abv === expected.abv;
  return String(product.upc) === expected.upc
    && expected.title.test(String(product.name || ''))
    && proofIsValid
    && Number(product.dispItemSizeQty) === 750
    && String(product.dispUnitOfMeasure).toLowerCase() === 'ml'
    && String(product.unitOfMeasure).toLowerCase() === 'ml'
    && Number.isFinite(Number(product.price)) && Number(product.price) > 0
    && String(product.channelInventory?.instore ?? '') === '1'
    && product.channelEligibility?.inStore === true;
}

function sourceProductSnapshot(product) {
  return {
    id: product.id, pid: product.pid, storeId: product.storeId,
    name: product.name, upc: product.upc, price: product.price,
    containsAlcohol: product.containsAlcohol, alcoholVolumePct: product.alcoholVolumePct,
    dispItemSizeQty: product.dispItemSizeQty, dispUnitOfMeasure: product.dispUnitOfMeasure,
    unitOfMeasure: product.unitOfMeasure, dispItemPackageQty: product.dispItemPackageQty,
    channelEligibility: { inStore: product.channelEligibility.inStore },
    channelInventory: { instore: product.channelInventory.instore },
  };
}

function toResearchSignal(row, source, observedAt) {
  const { rawProduct: product } = row;
  const match = row.record;
  const productSnapshot = sourceProductSnapshot(product);
  const inventorySemantics = 'binary_retailer_in_store_no_exact_count';

  return {
    id: stableId(['HI', 'safeway-xapi', source.merchantId, row.productId]),
    state: 'HI', stateCode: 'HI', sourceChain: 'safeway-hi-xapi',
    sourceLabel: 'Hawaii Safeway XAPI in-store availability',
    sourceUrl: `https://www.safeway.com/shop/product-details.${row.productId}.html`,
    merchantId: source.merchantId, productId: row.productId, variantId: row.productId,
    rawName: row.title, canonicalBottleId: match.id, canonicalName: match.canonical,
    tier: match.tier, sourceBottleMatchMethod: 'hi-safeway-reviewed-sku', confidence: 1,
    eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    locationName: source.name, storeName: source.name, storeId: source.storeId,
    storeAddress: source.address, address: source.address, city: source.city,
    postalCode: source.zip, zip: source.zip, quantity: 0, quantityIsExact: false,
    price: Number(product.price), observedAt, fetchedAt: observedAt,
    availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports in-store availability',
    sourceAvailabilityVerified: true, canAlertAsInventory: false, canAlertAsWatch: false,
    dataLane: 'inventory', inventorySemantics,
    caveat: 'First-party in-store availability only; no exact quantity or retailer observation timestamp. Research only.',
    evidence: `${source.name} reports ${row.title} available at ${source.address}.`,
    sourceProductBinding: {
      schemaVersion: 1, source: 'safeway-hi-xapi', merchantId: source.merchantId,
      storeId: source.storeId, storeAddress: source.address, productId: row.productId,
      variantId: row.productId, rawName: row.title, canonicalBottleId: row.record.id,
      observedAt, premisesVerified: true, inStoreChannelVerified: true,
      inventorySemantics, productSnapshot,
    },
    raw: { chain: 'safeway-hi-xapi', product: productSnapshot, inventorySemantics, shadowOnly: true },
  };
}

export function parseHiSafewayInventory(payload, source, bible, { observedAt } = {}) {
  if (!HI_SAFEWAY_SOURCES.includes(source)
    || !Number.isFinite(Date.parse(observedAt))
    || payload?.appCode !== 'GR200 :: A-CT: 200') return [];

  // Pre-filter before shared matching: a legacy family fallback maps Bulleit
  // Single Malt to Bulleit Bourbon. Only exact reviewed Safeway SKUs enter.
  const docs = Array.isArray(payload?.response?.docs) ? payload.response.docs : [];
  const reviewedDocs = docs.filter(product => Object.hasOwn(REVIEWED_SKUS, String(product?.id || '')));
  const exactPayload = { ...payload, response: { ...payload.response, docs: reviewedDocs } };
  return parseBoundGroceryXapiInventory(exactPayload, { merchantId: source.merchantId }, bible)
    .filter(row => reviewedSkuMatches(row.rawProduct, REVIEWED_SKUS[row.productId]))
    .flatMap(row => {
      const record = bible.match(REVIEWED_SKUS[row.productId].canonical)?.record;
      if (!record || record.canonical !== REVIEWED_SKUS[row.productId].canonical || !record.libraryIdentities?.length) return [];
      return [toResearchSignal(row, source, observedAt)];
    });
}
