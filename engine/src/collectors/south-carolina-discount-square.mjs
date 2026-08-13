import { createHash } from 'node:crypto';
import { stableId } from '../core/text.mjs';

export const DISCOUNT_LIQUOR_SOURCE = Object.freeze({
  id: 'discount-liquor-fort-mill',
  ownerId: '151282621',
  siteId: '741520739911976347',
  merchantId: 'ML2FQ6NA8B53W',
  locationId: 'LEG9F5YDP0ZS2',
  categoryId: '4FQJPWZXRPCDSABLO3WBCNT5',
  categoryPageId: null,
  baseUrl: 'https://discountliquorfm.square.site',
  categoryUrl: 'https://discountliquorfm.square.site/s/shop',
  apiBaseUrl: 'https://cdn5.editmysite.com/app/store/api/v28/editor/users/151282621/sites/741520739911976347',
  sourceLabel: 'Discount Liquor Fort Mill Square exact-store inventory',
  catalogContract: Object.freeze({
    total: 181,
    productIdsSha256: '6de8f9aebfdae0ac1174c225e833f9aabfeea2aaef538606b334ef466b81dafb',
  }),
  store: Object.freeze({
    id: 'LEG9F5YDP0ZS2',
    name: 'Discount Liquor',
    address: '400 N Dobys Bridge Rd, Fort Mill, SC 29715',
    city: 'Fort Mill',
    zip: '29715',
    lat: 35.006664,
    lng: -80.931076,
  }),
});

function exactString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseDiscountLiquorLocation(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : null;
  const pagination = payload?.meta?.pagination;
  if (!rows || rows.length !== 1
    || pagination?.total !== 1
    || pagination?.count !== 1
    || pagination?.current_page !== 1
    || pagination?.total_pages !== 1) return null;
  const row = rows[0];
  const address = row?.address?.data;
  const source = DISCOUNT_LIQUOR_SOURCE;
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || exactString(row.id) !== source.locationId
    || exactString(row.square_id) !== source.locationId
    || exactString(row.owner_id) !== source.ownerId
    || exactString(row.site_id) !== source.siteId
    || exactString(row.display_name).toLowerCase() !== source.store.name.toLowerCase()
    || exactString(row.pickup_timezone) !== 'America/New_York'
    || row.pickup_enabled !== true
    || !address || typeof address !== 'object' || Array.isArray(address)
    || address.is_primary !== true
    || address.is_valid !== true
    || exactString(address.business_name).toLowerCase() !== source.store.name.toLowerCase()
    || exactString(address.street) !== '400 N Dobys Bridge Rd'
    || exactString(address.street2) !== ''
    || exactString(address.city) !== source.store.city
    || exactString(address.region_code) !== 'SC'
    || exactString(address.postal_code) !== source.store.zip
    || exactString(address.country_code) !== 'US'
    || Number(address.latitude) !== source.store.lat
    || Number(address.longitude) !== source.store.lng) return null;
  return source.store;
}

function exactDiscountLiquorProductUrl(value, siteProductId) {
  try {
    const url = new URL(exactString(value));
    return url.protocol === 'https:'
      && url.hostname === 'discountliquorfm.square.site'
      && new RegExp(`^/product/[a-z0-9-]+/${siteProductId}$`).test(url.pathname)
      && !url.search
      && !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function hasMiniatureDiscountLiquorFormat(rawName) {
  return [...String(rawName || '').matchAll(/\b(\d{2,4})\s*ml\b/giu)]
    .some((match) => Number(match[1]) <= 375);
}

function parseDiscountLiquorCatalogProduct(product) {
  const source = DISCOUNT_LIQUOR_SOURCE;
  if (!product || typeof product !== 'object' || Array.isArray(product)) return null;
  const productId = exactString(product.id);
  const siteProductId = exactString(product.site_product_id);
  const rawName = exactString(product.name).replace(/\s+/gu, ' ');
  const inventory = product.inventory;
  const quantity = inventory?.total;
  const allInventory = inventory?.all_inventory_total;
  const lowest = inventory?.lowest;
  const priceLow = product.price?.low;
  const priceHigh = product.price?.high;
  const sourceUrl = exactDiscountLiquorProductUrl(product.absolute_site_link, siteProductId);
  if (!/^[A-Z0-9]{10,40}$/.test(productId)
    || exactString(product.square_id) !== productId
    || !/^\d{1,12}$/.test(siteProductId)
    || exactString(product.owner_id) !== source.ownerId
    || exactString(product.merchant_id) !== source.merchantId
    || exactString(product.site_id) !== source.siteId
    || exactString(product.visibility) !== 'visible'
    || exactString(product.product_type) !== 'physical'
    || product.fulfillable !== true
    || rawName.length < 3
    || rawName.length > 200
    || hasMiniatureDiscountLiquorFormat(rawName)
    || !Array.isArray(product.categoryIds)
    || !product.categoryIds.includes(source.categoryId)
    || !sourceUrl
    || product.badges?.out_of_stock !== false
    || inventory?.all_variations_sold_out !== false
    || inventory?.marked_sold_out_at_all_existing_locations !== false
    || inventory?.marked_sold_out_skus_count !== 0
    || inventory?.has_location_not_tracking !== false
    || !Number.isInteger(quantity)
    || quantity <= 0
    || quantity > 10_000
    || allInventory !== quantity
    || !Number.isInteger(lowest)
    || lowest <= 0
    || lowest > quantity
    || !Number.isFinite(priceLow)
    || priceLow <= 0
    || priceLow > 10_000
    || priceHigh !== priceLow) return null;
  return {
    productId,
    siteProductId,
    rawName,
    sourceUrl,
    quantity,
    price: priceLow,
    lowStock: product.badges?.low_stock === true,
  };
}

export function parseDiscountLiquorCatalogPage(payload, options = {}) {
  const expectedPage = Number(options.expectedPage);
  const maxPages = Math.max(1, Math.min(3, Number(options.maxPages) || 3));
  const products = Array.isArray(payload?.data) ? payload.data : null;
  const pagination = payload?.meta?.pagination;
  const expectedTotalPages = Number.isInteger(pagination?.total) && Number.isInteger(pagination?.per_page)
    ? Math.ceil(pagination.total / pagination.per_page)
    : 0;
  const expectedCount = expectedTotalPages > 0 && Number.isInteger(expectedPage)
    ? (expectedPage < expectedTotalPages ? pagination.per_page : pagination.total - pagination.per_page * (expectedPage - 1))
    : 0;
  if (!products
    || !Number.isInteger(expectedPage)
    || expectedPage < 1
    || expectedPage > maxPages
    || !pagination
    || pagination.per_page !== 100
    || pagination.current_page !== expectedPage
    || !Number.isInteger(pagination.total)
    || pagination.total < 1
    || pagination.total > maxPages * 100
    || !Number.isInteger(pagination.count)
    || pagination.count !== products.length
    || pagination.count !== expectedCount
    || pagination.count < 0
    || pagination.count > 100
    || !Number.isInteger(pagination.total_pages)
    || pagination.total_pages !== expectedTotalPages
    || pagination.total_pages < 1
    || pagination.total_pages > maxPages
    || expectedPage > pagination.total_pages) return null;
  const accepted = products.map(parseDiscountLiquorCatalogProduct).filter(Boolean);
  return {
    products: accepted,
    productIds: products.map((product) => exactString(product?.id)),
    rejectedCount: products.length - accepted.length,
    total: pagination.total,
    totalPages: pagination.total_pages,
    page: expectedPage,
  };
}

export function verifyDiscountLiquorCatalogCompleteness(productIds, contract = DISCOUNT_LIQUOR_SOURCE.catalogContract) {
  if (!Array.isArray(productIds)
    || !Number.isInteger(contract?.total)
    || productIds.length !== contract.total
    || productIds.some((id) => !/^[A-Z0-9]{10,40}$/.test(id))
    || new Set(productIds).size !== productIds.length) return false;
  const digest = createHash('sha256').update([...productIds].sort().join('\n')).digest('hex');
  return digest === contract.productIdsSha256;
}

export function parseDiscountLiquorSkuPayload(payload, product) {
  const pagination = payload?.meta?.pagination;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !payload.meta || typeof payload.meta !== 'object' || Array.isArray(payload.meta)
    || !pagination
    || pagination.total !== 1
    || pagination.count !== 1
    || pagination.per_page !== 100
    || pagination.current_page !== 1
    || pagination.total_pages !== 1
    || !Array.isArray(payload.data) || payload.data.length !== 1
    || !product?.productId || !product?.siteProductId) return null;
  const variation = payload.data[0];
  const variationId = exactString(variation?.id);
  const siteProductSkuId = exactString(variation?.site_product_sku_id);
  const squareId = exactString(variation?.square_id);
  const sku = exactString(variation?.sku) || null;
  const inventory = Number(variation?.inventory);
  const totalInventory = Number(variation?.total_inventory);
  const currentPrice = Number(variation?.price?.current);
  if (!variation || typeof variation !== 'object' || Array.isArray(variation)
    || !/^[A-Z0-9]{10,40}$/.test(variationId)
    || variationId !== siteProductSkuId
    || variationId !== squareId
    || (sku != null && sku.length > 64)
    || exactString(variation.owner_id) !== DISCOUNT_LIQUOR_SOURCE.ownerId
    || exactString(variation.site_id) !== DISCOUNT_LIQUOR_SOURCE.siteId
    || exactString(variation.merchant_id) !== DISCOUNT_LIQUOR_SOURCE.merchantId
    || exactString(variation.site_product_id) !== product.siteProductId
    || exactString(variation.product_square_id) !== product.productId
    || variation.product_type !== 'physical'
    || variation.fulfillable !== true
    || variation.fulfillment?.methods?.pickup !== true
    || variation.fulfillment?.methods_at_any_location?.pickup !== true
    || variation.inventory_tracking_enabled !== true
    || variation.sold_out !== false
    || variation.stockable !== true
    || variation.sellable !== true
    || !Number.isInteger(inventory)
    || inventory <= 0
    || inventory > 10_000
    || totalInventory !== inventory
    || inventory !== product.quantity
    || !Number.isFinite(currentPrice)
    || currentPrice !== product.price) return null;
  return {
    ...product,
    variationId,
    sku,
    variationName: exactString(variation.name) || null,
    inventoryTrackingEnabled: true,
    pickupEnabled: true,
  };
}

function preservesDiscountLiquorAgeExpressions(rawName, canonicalName) {
  const rawAges = [...String(rawName || '').matchAll(/\b(\d{1,2})\s*(?:yr|yrs|year|years|yo)\b/giu)].map((match) => match[1]);
  if (!rawAges.length) return true;
  const canonical = String(canonicalName || '');
  return rawAges.every((age) => new RegExp(`\\b${age}\\s*(?:yr|yrs|year|years|y|yo)\\b`, 'iu').test(canonical));
}

export function buildDiscountLiquorSignal(config, product, bottleMatch, observedAt) {
  const source = DISCOUNT_LIQUOR_SOURCE;
  const record = bottleMatch?.record;
  const match = bottleMatch?.match;
  if (config?.id !== 'SC'
    || !record?.id
    || !record?.canonical
    || !preservesDiscountLiquorAgeExpressions(product?.rawName, record?.canonical)
    || !product?.productId
    || !product?.siteProductId
    || !/^[A-Z0-9]{10,40}$/.test(String(product?.variationId || ''))
    || (product?.sku != null && (typeof product.sku !== 'string' || product.sku.length > 64))
    || product?.inventoryTrackingEnabled !== true
    || product?.pickupEnabled !== true
    || !Number.isInteger(product?.quantity)
    || product.quantity <= 0
    || !Number.isFinite(product?.price)
    || !Number.isFinite(Date.parse(String(observedAt || '')))) return null;
  const id = stableId(['SC', source.id, source.locationId, product.productId]);
  return {
    id,
    key: id,
    state: 'SC',
    displayState: 'SC',
    stateCode: 'SC',
    sourceUrl: product.sourceUrl,
    sourceLabel: source.sourceLabel,
    sourceChain: source.id,
    eventType: 'retailer_store_inventory_result',
    rawName: product.rawName,
    canonicalBottleId: record.id,
    bottleId: record.id,
    canonicalName: record.canonical,
    tier: record.tier,
    confidence: Math.min(0.94, Math.max(0.84, Number(match?.confidence) || 0.88)),
    sourceMatchStatus: 'bottle_bible_match',
    ownerId: source.ownerId,
    siteId: source.siteId,
    merchantId: source.merchantId,
    locationId: source.locationId,
    categoryId: source.categoryId,
    productId: product.productId,
    siteProductId: product.siteProductId,
    variationId: product.variationId,
    sku: product.sku,
    sourceProductProofId: product.productId,
    quantity: product.quantity,
    storeQty: product.quantity,
    quantityIsExact: true,
    quantitySemantics: 'exact_square_single_location_inventory',
    price: product.price,
    lowStock: product.lowStock === true,
    availabilityStatus: 'in_stock',
    availabilityLabel: `Square reports ${product.quantity} in stock for pickup`,
    sourceAvailabilityVerified: true,
    orderabilityOfferVerified: true,
    locationPrecision: 'store_level',
    locationName: source.store.name,
    storeName: source.store.name,
    storeId: `${source.id}:${source.locationId}`,
    storeAddress: source.store.address,
    city: source.store.city,
    postalCode: source.store.zip,
    zip: source.store.zip,
    lat: source.store.lat,
    lng: source.store.lng,
    observedAt,
    fetchedAt: observedAt,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    dataLane: 'inventory',
    inventorySemantics: 'Discount Liquor Square Online reports a positive exact aggregate count for its single reviewed pickup location. This is current pickup orderability and exact online stock, not a shipment or guaranteed shelf reservation.',
    evidence: `Discount Liquor Square Online reports ${product.rawName} with ${product.quantity} in stock for pickup at 400 N Dobys Bridge Rd, Fort Mill${product.lowStock ? ' and marks it low stock' : ''}.`,
    raw: {
      chain: source.id,
      square: {
        ownerId: source.ownerId,
        siteId: source.siteId,
        merchantId: source.merchantId,
        locationId: source.locationId,
        categoryId: source.categoryId,
        product: {
          id: product.productId,
          siteProductId: product.siteProductId,
          quantity: product.quantity,
          price: product.price,
          sourceUrl: product.sourceUrl,
        },
        variation: {
          id: product.variationId,
          sku: product.sku,
          productId: product.productId,
          siteProductId: product.siteProductId,
          quantity: product.quantity,
          price: product.price,
          inventoryTrackingEnabled: true,
          pickupEnabled: true,
        },
      },
    },
  };
}

export function discountLiquorLocationUrl() {
  return `${DISCOUNT_LIQUOR_SOURCE.apiBaseUrl}/store-locations?page=1&per_page=100&include=address,free_fulfillment_conditions&valid=1`;
}

export function discountLiquorCatalogUrl(page) {
  const safePage = Math.max(1, Math.min(3, Number(page) || 1));
  const url = new URL(`${DISCOUNT_LIQUOR_SOURCE.apiBaseUrl}/products`);
  url.searchParams.set('page', String(safePage));
  url.searchParams.set('per_page', '100');
  url.searchParams.set('sort_by', 'category_order');
  url.searchParams.set('sort_order', 'asc');
  url.searchParams.set('categories[]', DISCOUNT_LIQUOR_SOURCE.categoryId);
  url.searchParams.set('excluded_fulfillment', 'dine_in');
  return url.href;
}

export function discountLiquorSkuUrl(product) {
  if (!/^\d{1,12}$/.test(String(product?.siteProductId || ''))) return null;
  const url = new URL(`${DISCOUNT_LIQUOR_SOURCE.apiBaseUrl}/store-locations/${DISCOUNT_LIQUOR_SOURCE.locationId}/products/${product.siteProductId}/skus`);
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '100');
  url.searchParams.set('include', 'image,media_files,product,subscriptions');
  return url.href;
}

function discountLiquorLocationSignal(config, observedAt) {
  const source = DISCOUNT_LIQUOR_SOURCE;
  const id = stableId(['SC', source.id, source.locationId, 'location']);
  return {
    id,
    key: id,
    state: config.id,
    stateCode: config.id,
    sourceLabel: source.sourceLabel,
    sourceUrl: source.categoryUrl,
    sourceChain: source.id,
    eventType: 'retailer_store_location',
    rawName: source.store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.98,
    locationPrecision: 'store_level',
    locationName: source.store.name,
    storeName: source.store.name,
    storeId: `${source.id}:${source.locationId}`,
    storeAddress: source.store.address,
    city: source.store.city,
    postalCode: source.store.zip,
    zip: source.store.zip,
    lat: source.store.lat,
    lng: source.store.lng,
    quantity: 0,
    observedAt,
    fetchedAt: observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    raw: {
      chain: source.id,
      store: { ...source.store },
      square: { ownerId: source.ownerId, siteId: source.siteId, merchantId: source.merchantId, locationId: source.locationId },
    },
  };
}

export async function collectDiscountLiquorInventory(config, bible, observedAt, options = {}) {
  const source = DISCOUNT_LIQUOR_SOURCE;
  const fetchJson = options.fetchJson;
  const sleepFn = options.sleepFn || (async () => {});
  const matchBottle = options.matchBottle || (() => ({ match: null, record: null }));
  const delayMs = Math.max(0, Math.min(2_000, Number(options.delayMs) || 250));
  const roadblocks = [];
  const catalogContract = options.catalogContract || source.catalogContract;
  if (config?.id !== 'SC' || typeof fetchJson !== 'function') {
    return {
      signals: [],
      roadblocks: [{ state: config?.id || 'SC', source: source.sourceLabel, url: source.categoryUrl, status: 'collector_misconfigured', error: 'Discount Liquor collector requires SC configuration and a bounded JSON fetcher.', nextRoute: 'Restore the reviewed Square collector wiring before retrying.' }],
    };
  }

  const locationUrl = discountLiquorLocationUrl();
  let locationAttempt;
  try {
    locationAttempt = await fetchJson(locationUrl);
  } catch (error) {
    locationAttempt = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
  if (!locationAttempt?.ok) {
    return {
      signals: [],
      roadblocks: [{ state: 'SC', source: source.sourceLabel, url: locationUrl, status: locationAttempt?.status || 0, error: locationAttempt?.error || 'Square store-location request failed.', nextRoute: 'Retry the one reviewed public Square location endpoint at the next cadence.' }],
    };
  }
  if (!parseDiscountLiquorLocation(locationAttempt.payload)) {
    return {
      signals: [],
      roadblocks: [{ state: 'SC', source: source.sourceLabel, url: locationUrl, status: 'identity_mismatch', error: 'Square store-location payload no longer matches the single reviewed Discount Liquor pickup premise.', nextRoute: 'Re-verify the official location, merchant, and address before emitting inventory.' }],
    };
  }

  const signals = [discountLiquorLocationSignal(config, observedAt)];
  const seen = new Map();
  const catalogProductIds = [];
  let expectedTotal = null;
  let expectedTotalPages = null;
  let catalogComplete = true;
  for (let page = 1; page <= (expectedTotalPages || 1); page += 1) {
    const url = discountLiquorCatalogUrl(page);
    let attempt;
    try {
      attempt = await fetchJson(url);
    } catch (error) {
      attempt = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    }
    if (!attempt?.ok) {
      roadblocks.push({ state: 'SC', source: source.sourceLabel, url, status: attempt?.status || 0, error: attempt?.error || `Square catalog page ${page} failed.`, nextRoute: 'Retry only the bounded whisky category pages before variation verification.' });
      catalogComplete = false;
      break;
    }
    const parsed = parseDiscountLiquorCatalogPage(attempt.payload, { expectedPage: page, maxPages: 3 });
    if (!parsed || (expectedTotal != null && (parsed.total !== expectedTotal || parsed.totalPages !== expectedTotalPages))) {
      roadblocks.push({ state: 'SC', source: source.sourceLabel, url, status: 'malformed_catalog', error: `Square catalog page ${page} failed pagination or exact-product validation.`, nextRoute: 'Inspect the official Square response shape before widening or promoting rows.' });
      catalogComplete = false;
      break;
    }
    if (page === 1) {
      expectedTotal = parsed.total;
      expectedTotalPages = parsed.totalPages;
    }
    catalogProductIds.push(...parsed.productIds);
    for (const product of parsed.products) {
      const prior = seen.get(product.productId);
      if (prior) {
        if (JSON.stringify(prior) !== JSON.stringify(product)) {
          seen.delete(product.productId);
          catalogComplete = false;
          roadblocks.push({ state: 'SC', source: source.sourceLabel, url, status: 'conflicting_product_identity', error: `Square returned conflicting rows for product ${product.productId}; the entire catalog response was rejected.`, nextRoute: 'Wait for a stable exact product row before emitting inventory.' });
        }
        continue;
      }
      seen.set(product.productId, product);
    }
    if (!catalogComplete) break;
    if (page < expectedTotalPages && delayMs > 0) await sleepFn(delayMs);
  }
  if (!catalogComplete) return { signals, roadblocks };
  if (!verifyDiscountLiquorCatalogCompleteness(catalogProductIds, catalogContract)) {
    roadblocks.push({ state: 'SC', source: source.sourceLabel, url: source.categoryUrl, status: 'catalog_contract_changed', error: 'The reviewed Square whisky catalog identity set changed; no inventory was emitted.', nextRoute: 'Review the complete current catalog and update the pinned identity contract before collecting inventory.' });
    return { signals, roadblocks };
  }

  const matchedCandidates = [...seen.values()]
    .map((product) => ({ product, bottleMatch: matchBottle(product.rawName, bible) }))
    .filter(({ bottleMatch }) => bottleMatch?.record?.id && bottleMatch?.record?.canonical);
  const maxSkuRequests = Math.max(1, Math.min(60, Number(options.maxSkuRequests) || 60));
  if (matchedCandidates.length > maxSkuRequests) {
    roadblocks.push({ state: 'SC', source: source.sourceLabel, url: source.categoryUrl, status: 'variation_budget_exceeded', error: `Square produced ${matchedCandidates.length} safe Bottle Bible candidates, above the ${maxSkuRequests}-variation request budget.`, nextRoute: 'Review category breadth before increasing the bounded variation budget; no partial inventory was emitted.' });
    return { signals, roadblocks };
  }
  let representativeSkuFailure = null;
  for (const { product, bottleMatch } of matchedCandidates.slice(0, maxSkuRequests)) {
    const url = discountLiquorSkuUrl(product);
    let attempt;
    try {
      attempt = url ? await fetchJson(url) : { ok: false, status: 0, error: 'Invalid Square site product identifier.' };
    } catch (error) {
      attempt = { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    }
    if (!attempt?.ok) {
      representativeSkuFailure ||= { state: 'SC', source: source.sourceLabel, url: url || source.categoryUrl, status: attempt?.status || 0, error: attempt?.error || 'Square variation request failed.', nextRoute: 'Retry only the affected exact product variation at the next cadence.' };
    } else {
      const trackedProduct = parseDiscountLiquorSkuPayload(attempt.payload, product);
      if (!trackedProduct) {
        representativeSkuFailure ||= { state: 'SC', source: source.sourceLabel, url, status: 'malformed_variation', error: 'Square variation payload did not prove one tracked pickup SKU with matching exact location quantity.', nextRoute: 'Recheck the exact variation contract; do not fall back to aggregate inventory.' };
      } else {
        const signal = buildDiscountLiquorSignal(config, trackedProduct, bottleMatch, observedAt);
        if (signal) signals.push(signal);
      }
    }
    if (delayMs > 0) await sleepFn(delayMs);
  }
  if (representativeSkuFailure) {
    roadblocks.push(representativeSkuFailure);
    return { signals: signals.filter((signal) => signal.eventType !== 'retailer_store_inventory_result'), roadblocks };
  }
  return { signals, roadblocks };
}
