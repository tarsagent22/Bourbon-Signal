import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_WAREHOUSES = path.resolve('engine/data/costco-warehouses.json');
const DEFAULT_WATCHLIST = path.resolve('engine/data/costco-bourbon-watchlist.json');
const DEFAULT_OUTPUT = path.resolve('engine/data/costco-observations.json');
const COSTCO_GRAPHQL = 'https://sameday.costco.com/graphql';
const DEFAULT_ZONE_ID = '33';

const HASHES = {
  DefaultShop: 'd389a8d33d63801f1ce5c4929fb181dd10c57b49c3a2dcb6a6baa44212e8e069',
  SearchResultsPlacements: '6f8d4a3f450d8d25dbb87b6b5bcb82180a1b3c972366fb1fb7de816c05523f4a',
  Items: '9ad66078d7fa81276b6bd4eb6a6f6fcdd1f4022ff0c3f5b4663c62877f06692a'
};

const DEFAULT_SEARCH_TERMS = [
  'blanton',
  'eagle rare',
  'weller',
  'stagg',
  'e h taylor',
  'buffalo trace',
  'old forester birthday',
  'michter 10',
  'rock hill farms',
  'elmer t lee',
  'bourbon'
];

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizedSku(value) {
  return String(value || '').replace(/[^0-9]/g, '').trim();
}

function watchlistTerms(watchlist) {
  const terms = new Set(DEFAULT_SEARCH_TERMS);
  for (const item of watchlist) {
    const names = [item.canonicalName, ...(item.aliases || [])].filter(Boolean);
    for (const name of names) {
      const normalized = normalizeText(name);
      if (!normalized) continue;
      if (/weller|blanton|eagle rare|stagg|taylor|buffalo trace|birthday|michter|elmer|rock hill|russell|blood oath|little book/i.test(name)) {
        terms.add(name.toLowerCase().replace(/\./g, '').trim());
      }
    }
  }
  return [...terms].slice(0, 40);
}

function watchlistMatcher(watchlist) {
  const bySku = new Map();
  const phrases = [];
  for (const item of watchlist) {
    const sku = normalizedSku(item.itemNumber);
    if (sku) bySku.set(sku, item);
    for (const name of [item.canonicalName, ...(item.aliases || [])]) {
      const normalized = normalizeText(name);
      if (normalized) phrases.push({ normalized, item });
    }
  }
  phrases.sort((a, b) => b.normalized.length - a.normalized.length);
  return function match(product) {
    const productId = normalizedSku(product.productId || product.id?.split('-').pop());
    if (productId && bySku.has(productId)) return bySku.get(productId);
    const name = normalizeText(product.name);
    return phrases.find(({ normalized }) => name.includes(normalized) || normalized.includes(name))?.item || null;
  };
}

async function gql(operationName, variables) {
  const url = `${COSTCO_GRAPHQL}?operationName=${encodeURIComponent(operationName)}&variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: HASHES[operationName] } }))}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 BourbonSignalCostcoProbe/1.0',
      referer: 'https://sameday.costco.com/store/costco/s?k=bourbon',
      ...(process.env.COSTCO_SAMEDAY_COOKIE ? { cookie: process.env.COSTCO_SAMEDAY_COOKIE } : {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${operationName} ${response.status}: ${text.slice(0, 240)}`);
  const data = JSON.parse(text);
  if (data.errors?.length && !data.data) throw new Error(`${operationName} errors: ${JSON.stringify(data.errors).slice(0, 500)}`);
  return data.data || {};
}

function itemIdsFromSearch(payload, limit = 30) {
  const ids = [];
  const seen = new Set();
  function visit(value) {
    if (!value || ids.length >= limit) return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value !== 'object') return;
    if (Array.isArray(value.itemIds)) {
      for (const id of value.itemIds) {
        if (!seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(payload);
  return ids;
}

function directCandidateIds(retailerLocationId, watchlist) {
  return watchlist
    .map((item) => normalizedSku(item.itemNumber))
    .filter(Boolean)
    .map((sku) => `items_${retailerLocationId}-${sku}`);
}

function availabilityStatus(item) {
  const available = item.availability?.available;
  const label = item.availability?.viewSection?.stockLevelLabelString || '';
  if (available === true) return 'available';
  if (/out of stock|sold out|unavailable/i.test(label)) return 'out_of_stock';
  if (/low stock|in stock|available/i.test(label)) return 'available';
  return available === false ? 'out_of_stock' : 'unknown';
}

function priceAmount(item) {
  const candidates = [
    item.pricing?.price?.amount,
    item.pricing?.price?.displayString,
    item.viewSection?.priceString,
    item.viewSection?.pricingString
  ];
  for (const candidate of candidates) {
    const num = Number(String(candidate ?? '').replace(/[^0-9.]/g, ''));
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function categoryName(item) {
  return item.viewSection?.trackingProperties?.product_category_name || item.productCategoryName || null;
}

function shouldKeepItem(item, match) {
  const name = String(item.name || '');
  const category = String(categoryName(item) || '');
  if (match) return true;
  return /bourbon|american whiskey|whiskey|whisky/i.test(`${name} ${category}`)
    && /weller|blanton|eagle rare|stagg|taylor|buffalo trace|birthday|michter|elmer|rock hill|russell|blood oath|little book|four roses|henry mckenna/i.test(name);
}

async function probeWarehouse(warehouse, watchlist, terms, options) {
  const observations = [];
  const productMap = new Map();
  const matchWatchItem = watchlistMatcher(watchlist);
  const errors = [];
  let shop;
  try {
    shop = (await gql('DefaultShop', {
      postalCode: String(warehouse.zip),
      coordinates: { latitude: Number(warehouse.latitude), longitude: Number(warehouse.longitude) },
      addressId: null
    })).defaultShop;
  } catch (error) {
    errors.push(`DefaultShop: ${error.message}`);
    return { warehouse, observations, errors, shop: null };
  }
  if (!shop?.id || !shop?.retailerLocationId) {
    return { warehouse, observations, errors: ['DefaultShop returned no shop/retailerLocationId'], shop };
  }

  const shopId = String(shop.id);
  const retailerLocationId = String(shop.retailerLocationId);
  const zoneId = String(options.zoneId || DEFAULT_ZONE_ID);
  const searchTermsUsed = [];

  for (const query of terms) {
    try {
      const search = await gql('SearchResultsPlacements', {
        action: null,
        query,
        pageViewId: `bs-costco-${warehouse.state}-${retailerLocationId}-${Date.now()}`,
        elevatedProductId: null,
        searchSource: 'search',
        filters: [],
        disableReformulation: false,
        disableLlm: false,
        forceInspiration: false,
        orderBy: 'bestMatch',
        clusterId: null,
        includeDebugInfo: false,
        clusteringStrategy: null,
        contentManagementSearchParams: { itemGridColumnCount: 5 },
        shopId,
        postalCode: String(warehouse.zip),
        zoneId,
        first: Number(options.first || 12)
      });
      const ids = itemIdsFromSearch(search.searchResultsPlacements, 24);
      if (ids.length) {
        searchTermsUsed.push(query);
        for (const id of ids) productMap.set(id, { id, discovery: 'search', query });
      }
    } catch (error) {
      errors.push(`Search(${query}): ${error.message}`);
    }
  }

  for (const id of directCandidateIds(retailerLocationId, watchlist)) {
    if (!productMap.has(id)) productMap.set(id, { id, discovery: 'direct_item_candidate' });
  }

  const ids = [...productMap.keys()].slice(0, Number(options.maxItems || 80));
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    try {
      const data = await gql('Items', {
        ids: chunk,
        shopId,
        zoneId,
        postalCode: String(warehouse.zip)
      });
      for (const item of data.items || []) {
        const match = matchWatchItem(item);
        if (!shouldKeepItem(item, match)) continue;
        const status = availabilityStatus(item);
        const productId = String(item.productId || item.id?.split('-').pop() || '');
        const source = productMap.get(item.id) || {};
        observations.push({
          state: warehouse.state,
          city: warehouse.city,
          zip: String(warehouse.zip),
          storeName: `Costco ${warehouse.city}`,
          storeNumber: retailerLocationId,
          warehouseMarket: warehouse.market,
          warehousePriority: warehouse.priority,
          bottleName: item.name,
          productName: item.name,
          canonicalName: match?.canonicalName || null,
          itemNumber: match?.itemNumber || null,
          sameDayProductId: productId || null,
          status,
          availability: status,
          availabilityLabel: item.availability?.viewSection?.stockLevelLabelString || null,
          quantity: status === 'available' ? 1 : 0,
          price: priceAmount(item),
          category: categoryName(item),
          sourceUrl: `https://sameday.costco.com/store/costco/s?k=${encodeURIComponent(source.query || item.name || 'bourbon')}`,
          observedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          sourceSystem: 'costco_sameday_instacart_graphql',
          discoveryMethod: source.discovery || 'items',
          searchQuery: source.query || null,
          retailerLocationId,
          shopId,
          lead: warehouse.lead || null
        });
      }
    } catch (error) {
      errors.push(`Items(${chunk.length}): ${error.message}`);
    }
  }

  return { warehouse, shop: { shopId, retailerLocationId }, observations, errors, searchTermsUsed };
}

const statesFilter = new Set(String(argValue('--states', '') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
const limit = Number(argValue('--limit', '0')) || null;
const priorityMax = Number(argValue('--priority-max', '0')) || null;
const writeOutput = hasFlag('--write');
const includeOutOfStock = hasFlag('--include-out-of-stock');
const outputFile = path.resolve(argValue('--output', DEFAULT_OUTPUT));
const warehousesFile = path.resolve(argValue('--warehouses', DEFAULT_WAREHOUSES));
const watchlistFile = path.resolve(argValue('--watchlist', DEFAULT_WATCHLIST));
const first = Number(argValue('--first', '12')) || 12;

const warehousesPayload = await readJson(warehousesFile, { warehouses: [] });
const watchlist = await readJson(watchlistFile, []);
let warehouses = Array.isArray(warehousesPayload) ? warehousesPayload : warehousesPayload.warehouses || [];
if (statesFilter.size) warehouses = warehouses.filter((warehouse) => statesFilter.has(String(warehouse.state || '').toUpperCase()));
if (priorityMax) warehouses = warehouses.filter((warehouse) => Number(warehouse.priority || 99) <= priorityMax);
warehouses.sort((a, b) => Number(a.priority || 99) - Number(b.priority || 99) || String(a.state).localeCompare(String(b.state)) || String(a.city).localeCompare(String(b.city)));
if (limit) warehouses = warehouses.slice(0, limit);

const terms = watchlistTerms(watchlist);
const generatedAt = new Date().toISOString();
const results = [];
for (const warehouse of warehouses) {
  const result = await probeWarehouse(warehouse, watchlist, terms, { first });
  results.push(result);
  const positives = result.observations.filter((row) => row.status === 'available').length;
  const firstError = result.errors[0] ? ` first=${result.errors[0].slice(0, 140)}` : '';
  console.log(`${warehouse.state} ${warehouse.city}: ${result.observations.length} watched products, ${positives} available, ${result.errors.length} errors${firstError}`);
}

const observations = results
  .flatMap((result) => result.observations)
  .filter((row) => includeOutOfStock || row.status === 'available');

const payload = {
  generatedAt,
  source: 'costco_sameday_instacart_graphql',
  sourceCaveat: 'Costco Same-Day availability is fast-moving retailer/app availability, not a reservation or guaranteed shelf hold. Verify before driving.',
  warehouseCount: warehouses.length,
  observationCount: observations.length,
  positiveCount: observations.filter((row) => row.status === 'available').length,
  observations,
  diagnostics: results.map((result) => ({
    state: result.warehouse.state,
    city: result.warehouse.city,
    zip: result.warehouse.zip,
    shop: result.shop,
    observedRows: result.observations.length,
    positiveRows: result.observations.filter((row) => row.status === 'available').length,
    errors: result.errors
  }))
};

if (writeOutput) {
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${observations.length} observations (${payload.positiveCount} positive) to ${outputFile}`);
} else {
  console.log(JSON.stringify({
    generatedAt,
    warehouseCount: warehouses.length,
    observationCount: observations.length,
    positiveCount: payload.positiveCount,
    positives: observations.filter((row) => row.status === 'available').slice(0, 20),
    note: 'Run with --write to update engine/data/costco-observations.json. By default only available rows are emitted; add --include-out-of-stock for product-map diagnostics.'
  }, null, 2));
}
