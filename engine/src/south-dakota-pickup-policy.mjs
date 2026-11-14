export const origin = 'https://www.mrliquor.com';
export const batchPath = '/api/trpc/organization.get,ecomStore.fromStore,product.getAll';
export const sources = Object.freeze([
  { id: 5187, publicId: '1lal4mjsoicy3', name: 'Mr. Liquor West', address: '3609 Sturgis Road', zip: '57702',
    terms: ['Wild Turkey'], products: [
      ['3iyhimjsprb11', '721059003872', 'Wild Turkey - 101 8 Year (Allocated)', 'Wild Turkey 101 8Y .75l'],
    ] },
  { id: 5220, publicId: 'dhut4mjstu0n3', name: 'Mr. Liquor South', address: '5312 Black Hills Blvd', zip: '57701',
    terms: ['Heaven Hill', 'Larceny'], products: [
      ['58g3imjsu2bs7', '096749002429', 'Heaven Hill - 7 Year Bourbon - 750ml', 'Heaven Hill Bottled-in-Bond 7 Year'],
      ['6ydeimjsu2t72', '096749002658', 'Larceny Bourbon - Barrel Proof (Allocated)', 'Larceny Barrel Proof'],
    ] },
]);
export const silent = Object.freeze({
  alertable: false, canAlertAsInventory: false, canAlertAsWatch: false, eligibleForOnSite: false,
  eligibleForDropFeed: false, eligibleForWatch: false, eligibleForDelivery: false,
  eligibleForEmail: false, eligibleForSms: false,
});
export const city = 'Rapid City';
export const storeId = source => `sante:sd:mr-liquor:${source.id}`;
export const sourceId = source => `research:sd:mr-liquor:${source.id}`;
export const southDakotaProductionRuntimeId = 'sd:mr-liquor-sante';
export const fullAddress = source => `${source.address}, ${city}, SD ${source.zip}`;

export function southDakotaRetailerRequest(term) {
  const nil = {json: null, meta: {values: ['undefined']}};
  const filter = {
    hasPromo: false, inStock: true, categories: null, collections: null, text: term, matchTypes: [],
    tags: [], min_price: null, max_price: null, pagination: {pageIndex: 0, pageSize: 20},
    sorting: {id: 'best_selling', desc: true},
  };
  const body = {0: nil, 1: nil, 2: {
    json: filter, meta: {values: Object.fromEntries(['categories', 'collections', 'min_price', 'max_price']
      .map(key => [key, ['undefined']]))},
  }};
  const url = new URL(batchPath, origin);
  url.search = new URLSearchParams({batch: '1', input: JSON.stringify(body)});
  return url.href;
}

function isExactSouthDakotaPickup(row) {
  const source = sources.find(entry => storeId(entry) === row?.storeId);
  const proof = row?.sourceProductBinding;
  return Boolean(source && row.state === 'SD' && row.city === city && row.postalCode === source.zip
    && row.storeAddress === fullAddress(source) && row.sourceRuntimeId === sourceId(source)
    && source.terms.some(term => southDakotaRetailerRequest(term) === row.sourceUrl)
    && proof?.source === 'mr-liquor-sante'
    && proof.premiseVerified === true && proof.pickupOfferVerified === true && proof.storeId === row.storeId
    && proof.storeAddress === row.storeAddress && proof.productId === row.productId && proof.observedAt === row.observedAt
    && proof.canonicalBottleId === row.canonicalBottleId && Number.isSafeInteger(proof.availableToOrder)
    && proof.availableToOrder > 0 && row.sourceAvailabilityVerified === true && row.availabilityStatus === 'in_stock'
    && (row.quantity === 0 || (row.quantity == null && row.storeQty === 0))
    && row.quantityIsExact === false && row.quantitySemantics === 'binary_retailer_orderable_no_exact_count'
    && source.products.some(([id,upc,title,name]) =>
      id === row.productId && upc === proof.upc && title === row.rawName && name === row.canonicalName));
}

export function isSouthDakotaShadowPickup(row) {
  return isExactSouthDakotaPickup(row) && row.sourceProductBinding.shadowOnly === true && row.raw?.shadowOnly === true
    && Object.keys(silent).every(key => row[key] === false);
}

export function isSouthDakotaCanaryPickup(row, nowMs = Date.now()) {
  const observed = Date.parse(row?.observedAt || '');
  return isExactSouthDakotaPickup(row) && Number.isFinite(observed) && nowMs >= observed && nowMs - observed <= 2 * 60 * 60_000
    && row.previewOnly === true && row.sourceProductBinding.shadowOnly !== true && row.raw?.shadowOnly !== true
    && row.sourceStale !== true && row.stale !== true && row.quarantined !== true
    && row.eligibleForOnSite === true && row.eligibleForDropFeed === true
    && Object.keys(silent).filter(key => key !== 'eligibleForOnSite' && key !== 'eligibleForDropFeed')
      .every(key => row[key] === false);
}
