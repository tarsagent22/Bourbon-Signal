import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_STATE_SOURCES } from './state-sources.mjs';

const OUT = path.resolve('out');
const DATA = path.resolve('data');
const DISCOVERY_OUT = path.join(OUT, 'store-discovery');
const UNIVERSE_DATA = path.join(DATA, 'store-universe');
const USER_AGENT = 'BourbonSignalStoreDiscovery/0.1 (+https://bourbonsignal.com; retailer coverage audit)';
const DEFAULT_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_DISCOVERY_TIMEOUT_MS || 18_000);
const DEFAULT_MAX_PAGES = Number(process.env.BOURBON_SIGNAL_DISCOVERY_MAX_PAGES || 2);
const DEFAULT_DIRECTORY_LIMIT = Number(process.env.BOURBON_SIGNAL_DISCOVERY_DIRECTORY_LIMIT || 75);

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function title(value) {
  return String(value || '').trim().replace(/\w\S*/g, (part) => part[0].toUpperCase() + part.slice(1).toLowerCase());
}

function canonicalCity(value) {
  const city = title(value || '');
  const aliases = {
    'Mt Pleasant': 'Mount Pleasant',
    'Mt. Pleasant': 'Mount Pleasant',
    'Thompsons Station': "Thompson's Station",
    'Thompson Station': "Thompson's Station",
    'Farragut': 'Knoxville',
    'Maryville': 'Alcoa/Maryville',
    'Alcoa': 'Alcoa/Maryville',
    'Alcoa/maryville': 'Alcoa/Maryville'
  };
  return aliases[city] || city || null;
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.7',
        'user-agent': USER_AGENT
      }
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url || url, text };
  } catch (error) {
    return { ok: false, status: 0, url, text: '', error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function textOnly(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function cityHiveJsonBlobs(html) {
  const blobs = [];
  for (const match of String(html || '').matchAll(/JSON\.parse\(decodeURIComponent\("([^"]+)"\)\)/g)) {
    try { blobs.push(JSON.parse(decodeURIComponent(match[1]))); } catch {}
  }
  return blobs;
}

function visitObjects(value, fn) {
  if (!value || typeof value !== 'object') return;
  fn(value);
  if (Array.isArray(value)) {
    for (const child of value) visitObjects(child, fn);
    return;
  }
  for (const child of Object.values(value)) if (child && typeof child === 'object') visitObjects(child, fn);
}

function cityHiveProducts(blobs) {
  const products = [];
  for (const blob of blobs) visitObjects(blob, (value) => {
    if (Array.isArray(value.products)) products.push(...value.products);
  });
  return uniqueBy(products, (product) => product?.id || product?.slug || product?.name);
}

function cityHiveMerchantConfigs(blobs) {
  const configs = [];
  for (const blob of blobs) visitObjects(blob, (value) => {
    if (Array.isArray(value.merchant_configs)) configs.push(...value.merchant_configs);
  });
  return uniqueBy(configs, (cfg) => cfg?.merchant?.id || cfg?.id || cfg?.merchant?.name || cfg?.name);
}

function cityHivePageUrls(baseUrl, maxPages = DEFAULT_MAX_PAGES) {
  const root = new URL(baseUrl);
  const hostRoot = `${root.protocol}//${root.host}`;
  const seeds = [
    `${hostRoot}/`,
    `${hostRoot}/accessibility`,
    `${hostRoot}/shop/?subtype=bourbon`,
    `${hostRoot}/shop/?subtype=whiskey`
  ];
  const urls = [];
  for (const seed of seeds) {
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(seed);
      if (/\/shop\//i.test(url.pathname) && page > 0) url.searchParams.set('skip', String(page * 18));
      urls.push(url.toString());
    }
  }
  return uniqueBy(urls, (url) => url);
}

function cityHiveAddressParts(address = {}) {
  const props = address.address_properties || {};
  const coords = address.location?.coordinates || [];
  return {
    fullAddress: address.full_address || props.full_address || null,
    street: address.street_address || props.street_address || null,
    city: address.city || props.city || null,
    county: address.district || props.district || null,
    zip: address.zipcode || props.zip || null,
    state: address.state || props.state || props.province || null,
    lat: Number(props.lat ?? coords[1]) || null,
    lng: Number(props.lng ?? coords[0]) || null
  };
}

function addressFromText(text, state) {
  const re = /(?:located in|shopping from)\s+([^\.\n]+?\b(?:TN|Tennessee)\b\s*\d{5}(?:-\d{4})?)/i;
  const match = String(text || '').match(re);
  if (!match) return null;
  const value = match[1].replace(/^at\s+/i, '').trim();
  if (state === 'TN' && !/\b(TN|Tennessee)\b/i.test(value)) return null;
  return value;
}

function cityFromAddress(address, state) {
  const text = String(address || '');
  const m = text.match(/,\s*([^,]+),\s*(?:TN|Tennessee)\b/i);
  if (m) return canonicalCity(m[1]);
  return null;
}


function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function domainFromUrl(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
}

function stateSourceRows(stateId) {
  const source = ALL_STATE_SOURCES.find((row) => row.id === stateId);
  return source?.sources || [];
}

function sourceUrlsForState(stateId) {
  return stateSourceRows(stateId)
    .filter((row) => row.precisionOnly && row.url && /shop|api|store|inventory|bourbon|whiskey/i.test(`${row.url} ${row.label}`))
    .map((row) => ({ name: row.label, url: row.url, source: 'state-sources', inventoryStatus: 'source-registry' }));
}

function registeredSourceDomains(stateId) {
  return new Set(stateSourceRows(stateId).map((row) => domainFromUrl(row.url)).filter(Boolean));
}

function inventoryStatusForProbe(probe) {
  if (probe.positiveProductOptions > 0 && probe.tnMerchantCount > 0) return 'live-inventory';
  if (probe.productCount > 0 && probe.tnMerchantCount > 0) return 'catalog-or-inventory';
  if (probe.tnMerchantCount > 0 || probe.address) return 'storefront-probeable';
  if (probe.platforms.includes('cityhive')) return 'platform-detected';
  return 'directory-only';
}

function scoreProbe(probe) {
  let score = 0;
  if (probe.address && /\bTN\b|Tennessee/i.test(probe.address)) score += 3;
  if (probe.tnMerchantCount > 0) score += 4;
  if (probe.platforms.includes('cityhive')) score += 3;
  if (probe.platforms.includes('shopify')) score += 3;
  if (probe.productCount > 0) score += 3;
  if (probe.positiveProductOptions > 0) score += 5;
  if (probe.fetchOkCount > 0) score += 1;
  if (probe.outOfStateMerchantCount > 0 && probe.tnMerchantCount === 0) score -= 5;
  return score;
}


async function fetchShopifyStats(baseUrl) {
  try {
    const root = new URL(baseUrl);
    const url = `${root.protocol}//${root.host}/collections/bourbon/products.json?limit=50`;
    const res = await fetchText(url, { timeoutMs: DEFAULT_TIMEOUT_MS });
    if (!res.ok || !/^\s*\{/.test(res.text)) return { productCount: 0, availableCount: 0, url, ok: false };
    const json = JSON.parse(res.text);
    const products = Array.isArray(json.products) ? json.products : [];
    const availableCount = products.reduce((sum, product) => sum + (product.variants || []).filter((variant) => variant.available).length, 0);
    return { productCount: products.length, availableCount, url, ok: products.length > 0 };
  } catch {
    return { productCount: 0, availableCount: 0, url: null, ok: false };
  }
}

async function probeStore(seed, stateId) {
  const baseUrl = seed.url;
  const pages = cityHivePageUrls(baseUrl);
  const htmlPages = [];
  const errors = [];
  for (const url of pages) {
    const res = await fetchText(url);
    if (res.ok) htmlPages.push(res);
    else errors.push({ url, status: res.status, error: res.error || `HTTP ${res.status}` });
  }
  const combined = htmlPages.map((page) => page.text).join('\n');
  const text = textOnly(combined);
  const blobs = cityHiveJsonBlobs(combined);
  const products = cityHiveProducts(blobs);
  const configs = cityHiveMerchantConfigs(blobs);
  const shopifyStats = await fetchShopifyStats(baseUrl);
  const merchants = uniqueBy(configs.map((cfg) => cfg?.merchant || cfg).filter(Boolean), (merchant) => merchant.id || merchant.name || merchant.display_name);
  const merchantRows = merchants.map((merchant) => {
    const a = cityHiveAddressParts(merchant.address || {});
    const address = a.fullAddress || [a.street, a.city, a.state || stateId, a.zip].filter(Boolean).join(', ');
    return {
      id: merchant.id || null,
      name: merchant.display_name || merchant.name || seed.name || null,
      address: address || null,
      city: canonicalCity(a.city || cityFromAddress(address, stateId) || seed.city),
      state: String(a.state || '').toUpperCase() || (address && /\bTN\b|Tennessee/i.test(address) ? 'TN' : null),
      zip: a.zip || null,
      lat: a.lat,
      lng: a.lng
    };
  });
  const address = addressFromText(text, stateId) || seed.address || null;
  const textCity = canonicalCity(cityFromAddress(address, stateId) || seed.city);
  const optionStats = { optionCount: 0, positiveOptionCount: 0, merchantIds: new Set() };
  for (const product of products) {
    for (const merchant of product?.merchants || []) {
      for (const option of merchant?.product_options || []) {
        optionStats.optionCount += 1;
        if (Number(option.quantity || 0) > 0) optionStats.positiveOptionCount += 1;
        if (option.merchant_id) optionStats.merchantIds.add(option.merchant_id);
      }
    }
  }
  const tnMerchants = merchantRows.filter((row) => row.state === stateId || /\bTN\b|Tennessee/i.test(row.address || ''));
  const outOfStateMerchants = merchantRows.filter((row) => row.state && row.state !== stateId && !/\bTN\b|Tennessee/i.test(row.address || ''));
  const platforms = [];
  if (/cityhive|assets\.cityhive|widget\.cityhive|sites\.cityhive\.app|Powered\s+By\s+City\s*Hive/i.test(combined)) platforms.push('cityhive');
  if (shopifyStats.ok) platforms.push('shopify');
  const probe = {
    seedName: seed.name,
    baseUrl,
    domain: domainFromUrl(baseUrl),
    fetchOkCount: htmlPages.length,
    fetchErrorCount: errors.length,
    platforms,
    address,
    city: textCity,
    productCount: products.length + shopifyStats.productCount,
    cityHiveProductCount: products.length,
    shopifyProductCount: shopifyStats.productCount,
    productOptionCount: optionStats.optionCount,
    positiveProductOptions: optionStats.positiveOptionCount + shopifyStats.availableCount,
    shopifyAvailableVariants: shopifyStats.availableCount,
    merchantCount: merchantRows.length,
    tnMerchantCount: tnMerchants.length,
    outOfStateMerchantCount: outOfStateMerchants.length,
    merchants: tnMerchants.length ? tnMerchants : (merchantRows.length ? merchantRows : (address ? [{ id: null, name: seed.name, address, city: textCity, state: stateId }] : [])),
    errors: errors.slice(0, 3)
  };
  if (!probe.merchants.length && shopifyStats.ok && seed.city) {
    probe.merchants = [{ id: null, name: seed.name, address: seed.address || null, city: canonicalCity(seed.city), state: stateId }];
    probe.tnMerchantCount = 1;
  }
  probe.inventoryStatus = seed.inventoryStatus && seed.inventoryStatus !== 'source-registry' ? seed.inventoryStatus : inventoryStatusForProbe(probe);
  probe.score = scoreProbe(probe);
  probe.promotable = probe.inventoryStatus === 'live-inventory' && probe.tnMerchantCount > 0 && probe.platforms.includes('cityhive');
  return probe;
}

function storesFromStateOutput(stateReport, stateId) {
  const signals = (stateReport?.signals || []).filter((row) => row.state === stateId && row.locationPrecision === 'store_level' && (row.storeName || row.locationName) && (row.storeAddress || row.city));
  const statusRank = { 'storefront-probeable': 3, 'live-inventory': 5 };
  const rows = signals.map((row) => ({
    id: row.storeId || null,
    name: row.storeName || row.locationName,
    address: row.storeAddress || null,
    city: canonicalCity(row.city || cityFromAddress(row.storeAddress, stateId)),
    state: stateId,
    zip: row.zip || row.postalCode || null,
    lat: row.lat || null,
    lng: row.lng || null,
    sourceLabels: [row.sourceLabel || row.source].filter(Boolean),
    inventoryStatus: /inventory_result/i.test(row.eventType || row.type || '') && Number(row.quantity || 0) > 0 && row.canAlertAsInventory ? 'live-inventory' : 'storefront-probeable',
    discoverySource: 'state-output'
  }));
  const byStore = new Map();
  for (const row of rows) {
    const key = `${norm(row.name)}|${norm(row.address)}|${norm(row.city)}`;
    const previous = byStore.get(key);
    if (!previous || (statusRank[row.inventoryStatus] || 0) > (statusRank[previous.inventoryStatus] || 0)) {
      byStore.set(key, { ...(previous || {}), ...row, sourceLabels: uniqueBy([...(previous?.sourceLabels || []), ...(row.sourceLabels || [])], (value) => value) });
    }
  }
  return [...byStore.values()];
}

function storesFromProbe(probe, stateId) {
  return uniqueBy((probe.merchants || []).filter((merchant) => merchant.state === stateId || /\bTN\b|Tennessee/i.test(merchant.address || '')).map((merchant) => ({
    id: merchant.id ? `${probe.domain}:${merchant.id}` : null,
    name: merchant.name || probe.seedName,
    address: merchant.address || probe.address || null,
    city: canonicalCity(merchant.city || probe.city || cityFromAddress(merchant.address || probe.address, stateId)),
    state: stateId,
    zip: merchant.zip || null,
    lat: merchant.lat || null,
    lng: merchant.lng || null,
    website: probe.baseUrl,
    ecommercePlatform: probe.platforms[0] || null,
    inventoryStatus: probe.inventoryStatus,
    discoverySource: 'probe',
    sourceLabels: [`${probe.seedName} probe`]
  })), (row) => `${norm(row.name)}|${norm(row.address)}|${norm(row.city)}`);
}


function storesFromLiquorFindHtml(html, sourceUrl, stateId, limit = DEFAULT_DIRECTORY_LIMIT) {
  const rows = [];
  const stateLower = stateId.toLowerCase();
  const re = new RegExp(`<a[^>]+href=\"([^\"]*?/stores/${stateLower}/([^/\"]+)/[^\"]+)\"[^>]*>([\\s\\S]*?)<\/a>`, 'gi');
  for (const match of String(html || '').matchAll(re)) {
    const href = decodeHtml(match[1]);
    const city = canonicalCity(match[2].replace(/-/g, ' '));
    const name = stripTags(match[3]);
    if (!name || /^(liquor stores|tennessee)$/i.test(name)) continue;
    rows.push({
      id: null,
      name,
      address: null,
      city,
      state: stateId,
      website: href.startsWith('http') ? href : `https://liquorfind.com${href}`,
      ecommercePlatform: null,
      inventoryStatus: 'directory-only',
      discoverySource: `directory-url:${sourceUrl}`,
      sourceLabels: ['LiquorFind Tennessee directory']
    });
    if (rows.length >= limit) break;
  }
  return uniqueBy(rows, (row) => `${norm(row.name)}|${norm(row.city)}`);
}

async function storesFromDirectoryUrls(urls, stateId) {
  const rows = [];
  for (const entry of urls || []) {
    const sourceUrl = typeof entry === 'string' ? entry : entry.url;
    const limit = typeof entry === 'object' && entry.limit ? Number(entry.limit) : DEFAULT_DIRECTORY_LIMIT;
    if (!sourceUrl) continue;
    const res = await fetchText(sourceUrl, { timeoutMs: DEFAULT_TIMEOUT_MS });
    if (!res.ok) continue;
    if (/liquorfind\.com\/stores\//i.test(sourceUrl)) rows.push(...storesFromLiquorFindHtml(res.text, sourceUrl, stateId, limit));
  }
  return uniqueBy(rows, (row) => `${norm(row.name)}|${norm(row.city)}`);
}

function cityHiveSourceSnippet(probe) {
  if (!probe.promotable) return null;
  const id = slug(probe.seedName || probe.domain);
  const chainName = probe.merchants?.[0]?.name || probe.seedName || probe.domain;
  const baseUrl = new URL(probe.baseUrl).origin;
  return {
    id,
    chainName,
    sourceLabel: `${chainName} CityHive store inventory`,
    baseUrl,
    merchantKeys: (probe.merchants || []).map((merchant) => merchant.id || `${norm(merchant.name)}|${norm(merchant.address)}|${norm(merchant.city)}`).filter(Boolean),
    urls: [`${baseUrl}/shop/?subtype=bourbon`, `${baseUrl}/shop/?subtype=whiskey`]
  };
}

function formatCityHiveSource(source) {
  return `  {
    id: '${source.id}',
    chainName: '${String(source.chainName).replace(/'/g, "\\'")}',
    sourceLabel: '${String(source.sourceLabel).replace(/'/g, "\\'")}',
    baseUrl: '${source.baseUrl}',
    urls: [
      '${source.urls[0]}',
      '${source.urls[1]}'
    ]
  }`;
}

async function main() {
  const stateId = String(process.argv.find((arg) => /^[A-Z]{2}(?:-[A-Z]+)?$/.test(arg)) || process.env.BOURBON_SIGNAL_DISCOVERY_STATE || 'TN').toUpperCase();
  await mkdir(DISCOVERY_OUT, { recursive: true });
  await mkdir(UNIVERSE_DATA, { recursive: true });
  const seedFile = path.join(DATA, 'store-discovery-seeds', `${stateId}.json`);
  const seedData = await readJson(seedFile, { platformSeeds: [], directorySeeds: [] });
  const stateReport = await readJson(path.join(OUT, 'states', `${stateId}.json`), { signals: [] });
  const seeds = uniqueBy([
    ...sourceUrlsForState(stateId),
    ...(seedData.platformSeeds || [])
  ].filter((seed) => seed.url), (seed) => domainFromUrl(seed.url));
  const probes = [];
  for (const seed of seeds) {
    probes.push(await probeStore(seed, stateId));
  }
  const currentStores = storesFromStateOutput(stateReport, stateId);
  const probeStores = probes.flatMap((probe) => storesFromProbe(probe, stateId));
  const directoryUrlStores = await storesFromDirectoryUrls(seedData.directoryUrls || [], stateId);
  const directoryStores = (seedData.directorySeeds || []).map((seed) => ({
    id: null,
    name: seed.name,
    address: seed.address || null,
    city: canonicalCity(seed.city || cityFromAddress(seed.address, stateId)),
    state: stateId,
    website: seed.url || null,
    ecommercePlatform: null,
    inventoryStatus: seed.inventoryStatus || 'directory-only',
    discoverySource: seed.source || 'directory-seed',
    sourceLabels: [seed.source].filter(Boolean)
  }));
  const statusRank = { 'directory-only': 1, 'platform-detected': 2, 'storefront-probeable': 3, 'catalog-or-inventory': 4, 'live-inventory': 5, 'alert-grade': 6 };
  const storeMap = new Map();
  for (const row of [...currentStores, ...probeStores, ...directoryStores, ...directoryUrlStores]) {
    const key = `${norm(row.name)}|${norm(row.address)}|${norm(row.city)}`;
    if (!key.trim()) continue;
    const previous = storeMap.get(key);
    if (!previous || (statusRank[row.inventoryStatus] || 0) > (statusRank[previous.inventoryStatus] || 0)) {
      storeMap.set(key, { ...(previous || {}), ...row, sourceLabels: uniqueBy([...(previous?.sourceLabels || []), ...(row.sourceLabels || [])], (value) => value) });
    }
  }
  const stores = [...storeMap.values()]
    .map((row) => ({ ...row, key: slug(`${row.name}-${row.city || ''}-${row.zip || ''}`) }))
    .sort((a, b) => norm(a.city).localeCompare(norm(b.city)) || norm(a.name).localeCompare(norm(b.name)));
  const byStatus = stores.reduce((acc, row) => { acc[row.inventoryStatus] = (acc[row.inventoryStatus] || 0) + 1; return acc; }, {});
  const byCity = stores.reduce((acc, row) => { const city = row.city || 'Unknown'; acc[city] = (acc[city] || 0) + 1; return acc; }, {});
  const registeredDomains = registeredSourceDomains(stateId);
  const promotableCityHiveSources = uniqueBy(probes.map(cityHiveSourceSnippet).filter(Boolean), (source) => source.baseUrl)
    .map((source) => ({ ...source, alreadyRegistered: registeredDomains.has(domainFromUrl(source.baseUrl)) }));
  const registeredMerchantKeys = new Set(promotableCityHiveSources
    .filter((source) => source.alreadyRegistered)
    .flatMap((source) => source.merchantKeys || []));
  const newPromotableCityHiveSources = promotableCityHiveSources
    .filter((source) => !source.alreadyRegistered)
    .filter((source) => !(source.merchantKeys || []).some((key) => registeredMerchantKeys.has(key)));
  const report = {
    generatedAt: new Date().toISOString(),
    state: stateId,
    seedFile,
    summary: {
      seedCount: seeds.length,
      probedCount: probes.length,
      knownStoreCount: stores.length,
      currentStoreCount: currentStores.length,
      probeDiscoveredStoreCount: probeStores.length,
      directorySeedStoreCount: directoryStores.length,
      directoryUrlStoreCount: directoryUrlStores.length,
      byStatus,
      cityCount: Object.keys(byCity).length,
      byCity: Object.fromEntries(Object.entries(byCity).sort()),
      promotableCityHiveSourceCount: promotableCityHiveSources.length,
      newPromotableCityHiveSourceCount: newPromotableCityHiveSources.length
    },
    probes: probes.sort((a, b) => b.score - a.score),
    promotableCityHiveSources,
    newPromotableCityHiveSources
  };
  const universe = {
    generatedAt: report.generatedAt,
    state: stateId,
    model: 'Bourbon Signal national store universe v0.1',
    caveat: 'Known-store coverage is not equivalent to live bottle inventory. inventoryStatus separates directory-only, platform/probeable, live inventory, and alert-grade semantics.',
    summary: report.summary,
    stores
  };
  await writeFile(path.join(DISCOVERY_OUT, `${stateId}.json`), JSON.stringify(report, null, 2));
  await writeFile(path.join(DISCOVERY_OUT, `${stateId}-new-cityhive-sources.mjs`), newPromotableCityHiveSources.map(formatCityHiveSource).join(',\n') + (newPromotableCityHiveSources.length ? '\n' : ''));
  await writeFile(path.join(UNIVERSE_DATA, `${stateId}.json`), JSON.stringify(universe, null, 2));
  console.log(JSON.stringify({
    state: stateId,
    knownStoreCount: stores.length,
    byStatus,
    cityCount: Object.keys(byCity).length,
    promotableCityHiveSourceCount: promotableCityHiveSources.length,
    newPromotableCityHiveSourceCount: newPromotableCityHiveSources.length,
    newPromotableCityHiveSources: newPromotableCityHiveSources.map((source) => ({ id: source.id, baseUrl: source.baseUrl, chainName: source.chainName }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
