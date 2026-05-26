import { readFile } from 'node:fs/promises';
import { stableId, stripHtml, titleCase } from '../core/text.mjs';

const TRACKED_TERMS = {
  OH: ['Eagle Rare'],
  IA: ['Blanton', 'Old Fitzgerald', 'Baker'],
  UT: ['Eagle Rare', 'Blanton', 'Elijah Craig'],
  NC: ['Blanton', 'Eagle Rare', 'Weller', 'Taylor', 'Willett'],
  VA: ['Blanton', '1792 Small Batch'],
  PA: ['Buffalo Trace', 'Weller', 'Blanton', 'Eagle Rare', 'Stagg', 'Old Fitzgerald'],
  'MD-MONTGOMERY': ['Blanton', 'Eagle Rare', 'Weller']
};

const RARE_RE = /blanton|eagle rare|weller|stagg|taylor|old fitz|fitzgerald|baker|willett|pappy|van winkle|elijah craig|george t|william larue|thomas h/i;

const VIRGINIA_PRODUCTS = [
  { code: '021460', name: "Blanton's Single Barrel Bourbon", slug: 'blantons-single-barrel-bourbon', limitedCaveat: true },
  { code: '021236', name: '1792 Small Batch Bourbon', slug: '1792-small-batch-bourbon', limitedCaveat: false }
];

const OHLQ_SHA256_AVAILABILITY_BUCKETS = {
  '3:1bad6b8cf97131fceab8543e81f7757195fbb1d36b376ee994ad1cf17699c464': { value: -1, status: 'not_available', label: 'Not Available', positive: false },
  '3:5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9': { value: 0, status: 'sold_out', label: 'Sold Out', positive: false },
  '3:d2cbad71ff333de67d07ec676e352ab7f38248eb69c942950157220607c55e84': { value: 0.5, status: 'limited_supply', label: 'Limited Supply', positive: true },
  '3:6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b': { value: 1, status: 'in_stock', label: 'In Stock', positive: true }
};

function ohlqAvailability(bucket) {
  return OHLQ_SHA256_AVAILABILITY_BUCKETS[bucket] || { value: null, status: 'unknown', label: 'Unknown', positive: false };
}

function csvRows(text) {
  const rows = [];
  let row = [], cell = '', quote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quote && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quote = !quote; continue; }
    if (ch === ',' && !quote) { row.push(cell); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quote) {
      if (cell || row.length) { row.push(cell); rows.push(row); row = []; cell = ''; }
      if (ch === '\r' && next === '\n') i++;
      continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((h, i) => [h.trim(), values[i] ?? ''])));
}

async function textFetch(url, options = {}) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (BourbonSignal research)', accept: 'text/html,application/json,text/csv,*/*', ...(options.headers || {}) }, method: options.method || 'GET', body: options.body });
  return { ok: res.ok, status: res.status, url: res.url, contentType: res.headers.get('content-type') || '', text: await res.text() };
}

function bottleMatch(raw, bible) {
  const match = bible.match(raw);
  return { match, record: match?.record };
}

function signalBase(state, sourceLabel, sourceUrl, rawName, bible) {
  const { match, record } = bottleMatch(rawName, bible);
  return { match, record, base: {
    state,
    sourceLabel,
    sourceUrl,
    rawName,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || titleCase(rawName),
    confidence: Math.max(0.68, match?.confidence || 0.35),
    fetchedAt: new Date().toISOString()
  }};
}

export async function collectPrecisionProbes(config, bible, existingSignals = []) {
  if (config.id === 'OH') return collectOhio(config, bible);
  if (config.id === 'OR') return collectOregon(config, bible);
  if (config.id === 'IA') return collectIowa(config, bible, existingSignals);
  if (config.id === 'UT') return collectUtah(config, bible);
  if (config.id === 'NC') return collectWakeNc(config, bible);
  if (config.id === 'VA') return collectVirginia(config, bible);
  if (config.id === 'PA') return collectPennsylvania(config, bible);
  if (config.id === 'MD-MONTGOMERY') return collectMontgomery(config, bible);
  return { signals: [], roadblocks: [] };
}

async function collectOregon(config, bible) {
  const signals = [], roadblocks = [];
  const browserOutPath = 'out/browser/OR-product-availability.json';
  try {
    const browserRun = JSON.parse(await readFile(browserOutPath, 'utf8'));
    for (const product of browserRun.products || []) {
      if (!Array.isArray(product.stores) || !product.stores.length) continue;
      const { base } = signalBase(config.id, 'Oregon Liquor Search browser-assisted product/location search', product.pageUrl || browserOutPath, product.name || product.itemCode, bible);
      for (const store of product.stores) {
        signals.push({
          id: stableId([config.id, 'or-browser-store', product.itemCode, store.storeNo, store.quantity]),
          ...base,
          eventType: Number(store.quantity || 0) > 0 ? 'store_inventory_result' : 'store_inventory_out_of_stock',
          locationPrecision: 'store_level',
          locationName: `Oregon Liquor Store ${store.storeNo}`,
          storeName: `Oregon Liquor Store ${store.storeNo}`,
          storeId: String(store.storeNo),
          storeAddress: [store.address, store.city, 'OR', store.zip].filter(Boolean).join(', '),
          city: store.city || null,
          stateCode: 'OR',
          postalCode: store.zip || null,
          quantity: Number(store.quantity || 0) || 0,
          price: product.bottlePrice ?? null,
          observedAt: browserRun.generatedAt || base.fetchedAt,
          evidence: `Oregon Liquor Search reports ${store.quantity} bottle(s) of ${product.name || product.itemCode} at store ${store.storeNo} in ${store.city || 'Oregon'} within ${store.distanceMiles ?? '?'} miles of ${browserRun.zip}. Oregon notes quantities update daily and should be verified with the store.`,
          raw: { product, store, caveat: 'Oregon Liquor Search quantity is not real-time; updated daily.' }
        });
      }
    }
    if (signals.length) {
      roadblocks.push({ state: config.id, source: 'Oregon Liquor Search browser-assisted search', url: 'https://www.oregonliquorsearch.com/', status: 200, error: 'Store-level rows require browser/session flow with age gate and selected product code; direct guessed API routes still fail.', nextRoute: 'Promote OR browser collector into scheduled standalone runner and expand beyond Portland ZIP/test terms.' });
      return { signals, roadblocks };
    }
    roadblocks.push({ state: config.id, source: 'Oregon Liquor Search browser-assisted search', url: browserOutPath, status: 0, error: 'Browser collector output found but no store rows parsed.', nextRoute: 'Inspect current Oregon HTML table format and product code search flow.' });
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'Oregon Liquor Search browser-assisted search', url: browserOutPath, status: 0, error: error.message, nextRoute: 'Run npm run or after browser is available, then rerun npm run run.' });
  }
  return { signals, roadblocks };
}

async function collectOhio(config, bible) {
  const signals = [], roadblocks = [];
  const browserOutPath = 'out/browser/ohlq-availability.json';
  const discoveryPath = 'data/browser-discovery/ohlq-product-availability-discovery.json';
  try {
    const browserRun = JSON.parse(await readFile(browserOutPath, 'utf8'));
    for (const product of browserRun.products || []) {
      if (!product.ok || !Array.isArray(product.inventories)) continue;
      const productSku = String(product.sku || '').toLowerCase();
      const matchingRows = product.inventories.filter((store) => String(store.VariantCode || '').toLowerCase() === productSku);
      const bucketCounts = matchingRows.reduce((counts, store) => {
        const availability = ohlqAvailability(store.I);
        counts[availability.status] = (counts[availability.status] || 0) + 1;
        return counts;
      }, {});
      const positiveRows = matchingRows.filter((store) => ohlqAvailability(store.I).positive);
      for (const store of positiveRows) {
        const availability = ohlqAvailability(store.I);
        const { base } = signalBase(config.id, 'OHLQ browser-assisted product availability API', product.pageUrl || product.endpoint, product.productName || product.sku, bible);
        signals.push({
          id: stableId([config.id, 'ohlq-browser-live', product.sku, store.AgencyId, store.I, store.LastModified]),
          ...base,
          eventType: availability.status === 'in_stock' ? 'browser_assisted_store_inventory_in_stock' : 'browser_assisted_store_inventory_limited_supply',
          locationPrecision: 'store_level',
          locationName: store.AgencyName || `OHLQ Agency ${store.AgencyId}`,
          storeName: store.AgencyName || null,
          storeId: String(store.AgencyId || ''),
          storeAddress: [store.Address1, store.Address2, store.City, 'OH', store.Zip].filter(Boolean).join(', ') || null,
          city: store.City || null,
          stateCode: store.State || 'OH',
          postalCode: store.Zip || null,
          latitude: Number(store.Latitude ?? 0) || null,
          longitude: Number(store.Longitude ?? 0) || null,
          quantity: null,
          observedAt: browserRun.generatedAt || base.fetchedAt,
          availabilityStatus: availability.status,
          availabilityLabel: availability.label,
          availabilityValue: availability.value,
          evidence: `OHLQ browser-assisted collector decoded ${availability.label} for ${product.productName || product.sku} at ${store.AgencyName || store.AgencyId}${store.City ? ` in ${store.City}` : ''}. VariantCode=${product.sku}; bucket=${store.I || 'unknown'}; last modified=${store.LastModified || 'unknown'}. OHLQ exposes stock status buckets, not explicit bottle counts.`,
          raw: { product: { sku: product.sku, productName: product.productName, endpoint: product.endpoint, displayStatus: product.displayStatus, inventoryCount: product.inventoryCount, matchingVariantRowCount: matchingRows.length, positiveVariantRowCount: positiveRows.length, bucketCounts, generatedAt: browserRun.generatedAt }, availability: { ...availability, bucket: store.I || null }, store }
        });
      }
      if (!matchingRows.length) {
        roadblocks.push({ state: config.id, source: 'OHLQ browser-assisted product availability API', url: product.pageUrl || product.endpoint || browserOutPath, status: product.status || 200, error: `Browser collector returned ${product.inventoryCount || product.inventories.length} agency rows, but none matched VariantCode=${product.sku}.`, nextRoute: 'Inspect OHLQ availability bucket semantics and selected SKU/exclusive flag.' });
      }
    }
    for (const product of browserRun.products || []) {
      if (product.ok) continue;
      roadblocks.push({ state: config.id, source: 'OHLQ browser-assisted product availability API', url: product.pageUrl || product.endpoint || browserOutPath, status: product.status || 0, error: product.error || 'Browser collector did not return inventory rows', nextRoute: 'Check product slug/SKU, page Cloudflare state, and OHLQ rendered csrf token.' });
    }
    if (signals.length) {
      roadblocks.push({
        state: config.id,
        source: 'OHLQ direct server fetch',
        url: 'https://www.ohlq.com/api/product-availability/{sku}',
        status: 403,
        error: 'OHLQ live rows were collected through browser/CDP. Direct Node fetch remains Cloudflare-gated, so scheduled production collection needs a browser-assisted or token/cookie bootstrap runtime.',
        nextRoute: 'Run npm run ohlq before npm run run, or promote the browser bootstrap into the future scheduled engine runner.'
      });
      return { signals, roadblocks };
    }
  } catch {
    // Fall through to static discovery evidence below; the browser collector is optional for normal raw-fetch runs.
  }
  try {
    const prior = JSON.parse(await readFile('out/current-snapshot.json', 'utf8'));
    const priorOhlq = (prior.signals || []).filter((s) => s.state === config.id && /^browser_assisted_store_inventory_/.test(String(s.eventType || '')) && ['limited_supply', 'in_stock'].includes(String(s.availabilityStatus || '')));
    for (const s of priorOhlq) {
      signals.push({
        id: stableId([config.id, 'ohlq-prior-positive-status', s.key]),
        state: config.id,
        sourceLabel: s.sourceLabel || 'OHLQ browser-assisted product availability API',
        sourceUrl: s.sourceUrl,
        rawName: s.canonicalName,
        canonicalBottleId: s.bottleId || null,
        canonicalName: s.canonicalName,
        confidence: s.baseConfidence || s.confidence || 0.92,
        eventType: s.eventType,
        locationPrecision: s.locationPrecision,
        locationName: s.locationName,
        storeName: s.storeName,
        storeAddress: s.storeAddress,
        city: s.city,
        stateCode: 'OH',
        postalCode: s.zip || null,
        latitude: s.lat,
        longitude: s.lng,
        quantity: null,
        observedAt: s.observedAt || prior.generatedAt,
        availabilityStatus: s.availabilityStatus,
        availabilityLabel: s.availabilityLabel,
        availabilityValue: s.availabilityValue,
        evidence: `${s.evidence || `Preserved prior positive OHLQ ${s.availabilityLabel || s.availabilityStatus} status for ${s.canonicalName} at ${s.storeName || s.locationName}.`} Current scheduled browser refresh could not pass OHLQ Cloudflare, so this row is retained from the latest positive-status snapshot until a warmed browser refresh succeeds.`,
        raw: { restoredFromCurrentSnapshot: true, priorKey: s.key }
      });
    }
    if (signals.length) {
      roadblocks.push({ state: config.id, source: 'OHLQ scheduled browser refresh fallback', url: browserOutPath, status: 0, error: 'Current OHLQ browser artifact did not contain positive decoded rows; retained prior positive-status snapshot rows to avoid dropping known live site coverage.', nextRoute: 'Refresh OHLQ from an already-warmed interactive browser session or improve non-headless Cloudflare handling.' });
      return { signals, roadblocks };
    }
  } catch {
    // No prior operational OHLQ snapshot is available; fall through to static discovery evidence.
  }
  try {
    const discovery = JSON.parse(await readFile(discoveryPath, 'utf8'));
    const productName = discovery.productName || 'Eagle Rare 10 Year';
    const endpointUrl = `https://www.ohlq.com/api/product-availability/${discovery.sku || '{sku}'}`;
    for (const store of discovery.sampleInventories || []) {
      const { base } = signalBase(config.id, 'OHLQ browser-captured product availability API discovery', discovery.productPage || endpointUrl, productName, bible);
      signals.push({
        id: stableId([config.id, 'ohlq-browser-discovery', discovery.sku, store.AgencyId, store.LastModified]),
        ...base,
        eventType: 'browser_captured_store_inventory_sample',
        locationPrecision: 'store_level',
        locationName: store.AgencyName || `OHLQ Agency ${store.AgencyId}`,
        storeName: store.AgencyName || null,
        storeId: String(store.AgencyId || ''),
        storeAddress: [store.Address1, store.City, 'OH', store.Zip].filter(Boolean).join(', ') || null,
        city: store.City || null,
        stateCode: 'OH',
        postalCode: store.Zip || null,
        latitude: Number(store.Latitude ?? 0) || null,
        longitude: Number(store.Longitude ?? 0) || null,
        quantity: null,
        observedAt: discovery.capturedAt || base.fetchedAt,
        evidence: `Browser/CDP discovery confirmed OHLQ product availability endpoint returns store-level agency rows for ${productName}; sample row ${store.AgencyName || store.AgencyId} last modified ${store.LastModified || 'unknown'}. Quantity is encoded as availability buckets, not an explicit bottle count.`,
        raw: { discovery: { endpoint: discovery.endpoint, requiredHeader: discovery.requiredHeader, tokenSource: discovery.tokenSource, requiredSession: discovery.requiredSession, inventoryCount: discovery.browserProbeResults?.find((r) => r.status === 200)?.inventoryCount || null }, store, sampleOnly: true }
      });
    }
    roadblocks.push({
      state: config.id,
      source: 'OHLQ product availability API',
      url: endpointUrl,
      status: 403,
      error: 'Endpoint discovered and verified in browser, but direct Node fetch remains Cloudflare-gated and tokenless browser calls return HTTP 400. Requires browser-rendered csrf token from document.documentElement.dataset.csrfToken sent as RequestVerificationToken.',
      nextRoute: 'Implement browser-assisted collector/session bootstrap or a compliant token/cookie acquisition layer before treating OHLQ as live automated inventory.'
    });
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'OHLQ browser discovery fixture', url: discoveryPath, status: 0, error: error.message, nextRoute: 'Re-run browser/CDP discovery on an OHLQ product page and save endpoint evidence.' });
  }
  return { signals, roadblocks };
}

function safePercentDecode(text) {
  return text.replace(/%[0-9A-Fa-f]{2}/g, (match) => {
    try { return decodeURIComponent(match); } catch { return match; }
  });
}

function htmlAttrDecode(text = '') {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function collectIowa(config, bible, existingSignals) {
  const signals = [], roadblocks = [];
  const productRows = existingSignals.filter((s) => s.raw && (s.raw.item_code || s.raw.itemno || s.raw.item_number || s.raw.code) && RARE_RE.test(`${s.rawName || ''} ${s.canonicalName || ''}`)).slice(0, 24);
  const seenCodes = new Set();
  for (const sig of productRows) {
    const code = sig.raw.item_code || sig.raw.itemno || sig.raw.item_number || sig.raw.code;
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    const url = `https://shop.iowaabd.com/snapshot/inventory?code=${encodeURIComponent(code)}&download=`;
    try {
      const res = await textFetch(url);
      if (!res.ok || !/csv|Location,Street,City/i.test(res.text)) {
        roadblocks.push({ state: config.id, source: 'Iowa 14-day inventory CSV', url, status: res.status, error: 'No downloadable store CSV returned', nextRoute: 'Re-check current snapshot host/code mapping.' });
        continue;
      }
      for (const row of csvRows(res.text)) {
        const qty = Number(row['Bottles Delivered'] || 0) || null;
        const rawName = sig.rawName || sig.canonicalName;
        const { base } = signalBase(config.id, 'Iowa ABD 14-day store delivery snapshot', url, rawName, bible);
        signals.push({
          id: stableId([config.id, code, row.Location, row.Street, qty]),
          ...base,
          eventType: 'store_delivery_snapshot',
          locationPrecision: 'store_level',
          locationName: row.Location || null,
          storeName: row.Location || null,
          storeAddress: [row.Street, row.City, row.State, row.Zip].filter(Boolean).join(', '),
          city: row.City || null,
          stateCode: row.State || 'IA',
          postalCode: row.Zip || null,
          quantity: qty,
          observedAt: base.fetchedAt,
          evidence: `${qty ?? 'unknown'} bottles delivered to ${row.Location || 'store'} in Iowa ABD 14-day snapshot.`,
          raw: { code, product: sig.raw, delivery: row }
        });
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Iowa 14-day inventory CSV', url, status: 0, error: error.message, nextRoute: 'Retry snapshot CSV.' });
    }
  }
  return { signals, roadblocks };
}

async function collectUtah(config, bible) {
  const signals = [], roadblocks = [];
  for (const term of TRACKED_TERMS.UT) {
    try {
      const itemRes = await textFetch(`https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore/Products/GetItemsForTerm?term=${encodeURIComponent(term)}`, { headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json,*/*' }});
      const items = JSON.parse(itemRes.text);
      for (const item of items.slice(0, 4)) {
        const params = new URLSearchParams({ draw: '1', start: '0', length: '10', item_code: item.code, item_name: '', category: '', sub_category: '', price_min: '', price_max: '', on_spa: 'false', new_items: 'false', in_stock: 'false', status: '', 'order[0][column]': '0', 'order[0][dir]': 'asc', 'search[value]': '', 'search[regex]': 'false' });
        ['name','sku','displayGroup','status','warehouseQty','storeQty','onOrderQty','caseCost','bottlePrice','splitCaseFee','onSpa','isNewItem'].forEach((c,i)=>{ params.set(`columns[${i}][data]`, c); params.set(`columns[${i}][searchable]`, 'true'); params.set(`columns[${i}][orderable]`, 'true'); params.set(`columns[${i}][search][value]`, ''); params.set(`columns[${i}][search][regex]`, 'false'); });
        const res = await textFetch('https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore/Products/LoadProductTable', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json,*/*' }, body: params });
        const json = JSON.parse(res.text);
        for (const row of json.data || []) {
          const { base } = signalBase(config.id, 'Utah DABS Product Locator DataTables API', 'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore', row.name, bible);
          signals.push({ id: stableId([config.id, row.sku, row.storeQty, row.warehouseQty, row.status]), ...base, eventType: 'board_inventory_aggregate', locationPrecision: 'board_warehouse', locationName: 'Utah DABS statewide locator aggregate', storeQty: row.storeQty ?? null, warehouseQty: row.warehouseQty ?? null, onOrderQty: row.onOrderQty ?? null, price: row.currentPrice ?? null, observedAt: base.fetchedAt, evidence: `Utah DABS API row: storeQty=${row.storeQty}, warehouseQty=${row.warehouseQty}, status=${row.status}.`, raw: row });
        }
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Utah DABS Product Locator API', url: 'https://webapps2.abc.utah.gov/ProdApps/ProductLocatorCore', status: 0, error: error.message, nextRoute: 'Inspect product-detail session flow for per-store breakout.' });
    }
  }
  return { signals, roadblocks };
}

function parseWakeProducts(html, config, bible, url) {
  const blocks = html.split(/<div class="wake-product">/i).slice(1);
  const signals = [];
  for (const block of blocks) {
    const name = stripHtml(block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || '');
    if (!name || !RARE_RE.test(name)) continue;
    const plu = stripHtml(block.match(/PLU:\s*([^<]+)/i)?.[1] || '');
    const out = /out-of-stock/i.test(block);
    const { base } = signalBase(config.id, 'Wake County ABC store inventory search', url, name, bible);
    signals.push({ id: stableId([config.id, 'wake', plu || name, out ? 'out' : 'stock']), ...base, eventType: out ? 'store_inventory_out_of_stock' : 'store_inventory_result', locationPrecision: 'store_level', locationName: 'Wake County ABC stores', county: 'Wake', quantity: out ? 0 : null, observedAt: base.fetchedAt, evidence: out ? `${name} listed by Wake ABC search, all locations out of stock.` : `${name} listed by Wake ABC search with store inventory block.`, raw: { plu, html: block.slice(0, 3000) } });
  }
  return signals;
}

async function collectWakeNc(config, bible) {
  const signals = [], roadblocks = [];
  for (const term of TRACKED_TERMS.NC) {
    const url = 'https://wakeabc.com/search-results/';
    try {
      const res = await textFetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ productSearch: term }) });
      signals.push(...parseWakeProducts(res.text, config, bible, `${url}?productSearch=${encodeURIComponent(term)}`));
    } catch (error) { roadblocks.push({ state: config.id, source: 'Wake County ABC inventory POST', url, status: 0, error: error.message, nextRoute: 'Use browser form submission/network capture.' }); }
  }
  return { signals, roadblocks };
}

function virginiaStoreSignals(product, json, config, bible, url) {
  const signals = [];
  const rows = [];
  for (const productRow of json.products || []) {
    if (productRow.storeInfo) rows.push({ ...productRow.storeInfo, relation: 'selected_store' });
    for (const store of productRow.nearbyStores || []) rows.push({ ...store, relation: 'nearby_store' });
  }
  const seen = new Set();
  for (const store of rows) {
    const storeId = store.storeId || store.storeNumber || store.id;
    const key = `${product.code}|${storeId}|${store.quantity ?? ''}`;
    if (!storeId || seen.has(key)) continue;
    seen.add(key);
    const quantity = Number(store.quantity ?? 0) || 0;
    const { base } = signalBase(config.id, 'Virginia ABC storeNearby inventory API', url, product.name, bible);
    signals.push({
      id: stableId([config.id, product.code, storeId, quantity, store.address]),
      ...base,
      eventType: quantity > 0 ? 'store_inventory_result' : 'store_inventory_out_of_stock',
      locationPrecision: 'store_level',
      locationName: `Virginia ABC Store ${storeId}`,
      storeName: `Virginia ABC Store ${storeId}`,
      storeId: String(storeId),
      storeAddress: store.address || [store.address1, store.address2, store.city, store.state, store.zip].filter(Boolean).join(', '),
      city: store.city || null,
      stateCode: store.state || 'VA',
      postalCode: store.zip || null,
      latitude: Number(store.latitude ?? 0) || null,
      longitude: Number(store.longitude ?? 0) || null,
      distance: Number(store.distance ?? 0) || null,
      quantity,
      observedAt: base.fetchedAt,
      evidence: `Virginia ABC API reports ${quantity} bottle(s) of ${product.name} at Store ${storeId}${store.city ? ` in ${store.city}` : ''}. ${product.limitedCaveat ? 'Limited-availability products may be intentionally hidden/randomized by policy outside release windows.' : 'Normal product inventory signal.'}`,
      raw: { product, store }
    });
  }
  return signals;
}

async function collectVirginia(config, bible) {
  const signals = [], roadblocks = [];
  for (const product of VIRGINIA_PRODUCTS) {
    const url = `https://www.abc.virginia.gov/webapi/inventory/storeNearby?storeNumber=101&productCode=${encodeURIComponent(product.code)}&mileRadius=999&storeCount=5&buffer=0`;
    try {
      const res = await textFetch(url, { headers: { accept: 'application/json,*/*', referer: `https://www.abc.virginia.gov/products/bourbon/${product.slug}` } });
      if (!res.ok) {
        roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API', url, status: res.status, error: res.text.slice(0, 300), nextRoute: 'Use browser session/network capture for VA ABC inventory calls.' });
        continue;
      }
      const json = JSON.parse(res.text);
      const extracted = virginiaStoreSignals(product, json, config, bible, url);
      signals.push(...extracted);
      if (!extracted.length) {
        roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API', url, status: res.status, error: 'API returned JSON but no store rows parsed', nextRoute: 'Inspect product code/storeNumber parameters and normal-vs-limited product policy.' });
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Virginia ABC storeNearby inventory API', url, status: 0, error: error.message, nextRoute: 'Retry with current product code from browser product page.' });
    }
  }
  return { signals, roadblocks };
}

async function collectPennsylvania(config, bible) {
  const signals = [], roadblocks = [];
  const url = 'https://www.finewineandgoodspirits.com/search?Ntt=bourbon';
  try {
    const res = await textFetch(url);
    if (!res.ok) {
      roadblocks.push({ state: config.id, source: 'FWGS search hydration', url, status: res.status, error: 'Search page did not load', nextRoute: 'Use browser/network extraction for Oracle Commerce search and pickup APIs.' });
      return { signals, roadblocks };
    }
    const decoded = safePercentDecode(res.text);
    for (const term of TRACKED_TERMS.PA) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const facetRe = new RegExp(`\\{\\"count\\":(\\d+),\\"link\\":\\"([^\\"]+)\\",\\"label\\":\\"(${escaped})\\"`, 'i');
      const match = decoded.match(facetRe);
      if (!match) continue;
      const count = Number(match[1]) || null;
      const link = htmlAttrDecode(match[2]).replace(/\\u0026/g, '&');
      const { base } = signalBase(config.id, 'FWGS Oracle Commerce search facet', url, term, bible);
      signals.push({
        id: stableId([config.id, 'fwgs-facet', term, count, link]),
        ...base,
        eventType: 'store_pickup_search_aggregate',
        locationPrecision: 'store_aggregate',
        locationName: 'Pennsylvania FWGS statewide search',
        quantity: count,
        observedAt: base.fetchedAt,
        evidence: `FWGS search hydration exposes ${count ?? 'unknown'} in-stock/search result(s) for ${term}; store pickup/store-detail inventory still needs Oracle Commerce API extraction.`,
        raw: { term, count, link }
      });
    }
    for (const term of TRACKED_TERMS.PA) {
      const searchUrl = `https://www.finewineandgoodspirits.com/search?Ntt=${encodeURIComponent(term.toLowerCase())}`;
      const termRes = await textFetch(searchUrl);
      if (!termRes.ok) continue;
      const count = Number(termRes.text.match(/PRODUCTS\s*\(\s*(?:<!--\s*-->\s*)?(\d+)/i)?.[1] || 0);
      if (!count) continue;
      const { base } = signalBase(config.id, 'FWGS Oracle Commerce product search count', searchUrl, term, bible);
      signals.push({
        id: stableId([config.id, 'fwgs-search-count', term, count]),
        ...base,
        eventType: 'store_pickup_search_count',
        locationPrecision: 'store_aggregate',
        locationName: 'Pennsylvania FWGS statewide search',
        quantity: count,
        observedAt: base.fetchedAt,
        evidence: `FWGS product search returned ${count} product result(s) for ${term}; visible page offers “View products available for: Shipping”, but store-specific pickup inventory still needs Oracle Commerce store/fulfillment API extraction.`,
        raw: { term, count }
      });
    }
    if (!signals.length) {
      roadblocks.push({ state: config.id, source: 'FWGS search hydration', url, status: res.status, error: 'Loaded FWGS search but no tracked rare brand facets parsed', nextRoute: 'Inspect Oracle Commerce /ccstore and Endeca search payloads in browser.' });
    }
  } catch (error) {
    roadblocks.push({ state: config.id, source: 'FWGS search hydration', url, status: 0, error: error.message, nextRoute: 'Retry through browser/network extraction.' });
  }
  return { signals, roadblocks };
}

async function collectMontgomery(config, bible) {
  const signals = [], roadblocks = [];
  const url = 'https://www2.montgomerycountymd.gov/abssearch/webservice.asmx/SearchByName';
  for (const term of TRACKED_TERMS['MD-MONTGOMERY']) {
    try {
      const res = await textFetch(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json,*/*' }, body: `{'Name':'${term.replace(/'/g, '')}'}` });
      const json = JSON.parse(res.text);
      for (const row of json.d || []) {
        const name = row.text || row.value;
        const { base } = signalBase(config.id, 'Montgomery County ABS product autocomplete', url, name, bible);
        signals.push({ id: stableId([config.id, 'moco', name]), ...base, eventType: 'county_product_search_match', locationPrecision: 'board_county', locationName: 'Montgomery County ABS', county: 'Montgomery', observedAt: base.fetchedAt, evidence: `Montgomery ABS product search match: ${name}. Store inventory modal exists but needs ASP.NET postback/viewstate extraction.`, raw: row });
      }
    } catch (error) { roadblocks.push({ state: config.id, source: 'Montgomery ABS SearchByName', url, status: 0, error: error.message, nextRoute: 'Replay ASP.NET selected item/postback to open StoreInventory modal.' }); }
  }
  const pageUrl = 'https://www2.montgomerycountymd.gov/abssearch/default.aspx';
  for (const term of TRACKED_TERMS['MD-MONTGOMERY']) {
    try {
      const first = await textFetch(pageUrl);
      const state = (name) => first.text.match(new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)`, 'i'))?.[1]
        || first.text.match(new RegExp(`id=["']${name}["'][^>]*value=["']([^"']*)`, 'i'))?.[1]
        || '';
      const params = new URLSearchParams({
        __VIEWSTATE: state('__VIEWSTATE'),
        __VIEWSTATEGENERATOR: state('__VIEWSTATEGENERATOR'),
        __EVENTVALIDATION: state('__EVENTVALIDATION'),
        __EVENTTARGET: 'btnSearch',
        __EVENTARGUMENT: '',
        txtKeyword: term,
        SpiritList: 'Search By Spirit',
        WineList: 'Search By Wine',
        BeerList: 'Search By Beer',
        fldBrowserType: '0'
      });
      const res = await textFetch(pageUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params });
      const cards = res.text.split(/<div class="col-md-2 mb-3 card-size">/i).slice(1);
      for (const card of cards) {
        const rawName = stripHtml(card.match(/<span class="indigo-text descfont">([\s\S]*?)<\/span>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
        if (!rawName || !RARE_RE.test(rawName)) continue;
        const code = stripHtml(card.match(/#\s*([^|<]+)/i)?.[1] || '').trim();
        const size = stripHtml(card.match(/<span class="blue-text">([^<]+)<\/span>/i)?.[1] || '').trim();
        const price = Number((card.match(/item-price">\$([0-9,.]+)/i)?.[1] || '').replace(/,/g, '').trim()) || null;
        const allocated = /ALLOCATED/i.test(card);
        const highlyAllocated = /HIGHLY\s+ALLOCATED/i.test(card);
        const { base } = signalBase(config.id, 'Montgomery County ABS ASP.NET product search', pageUrl, rawName, bible);
        signals.push({
          id: stableId([config.id, 'moco-product-postback', code || rawName, price]),
          ...base,
          eventType: allocated || highlyAllocated ? 'county_allocated_product_row' : 'county_product_row',
          locationPrecision: 'board_county',
          locationName: 'Montgomery County ABS',
          county: 'Montgomery',
          price,
          observedAt: base.fetchedAt,
          evidence: `Montgomery ABS ASP.NET product search row: ${rawName}${code ? ` (#${code})` : ''}${price ? ` at $${price}` : ''}${allocated ? '; marked allocated' : ''}. Store-level modal is not exposed for these allocated rows in the product-card HTML.`,
          raw: { code, size, price, allocated, highlyAllocated, term }
        });
      }
    } catch (error) {
      roadblocks.push({ state: config.id, source: 'Montgomery ABS ASP.NET product search', url: pageUrl, status: 0, error: error.message, nextRoute: 'Use browser click/network capture for any item rows that expose StoreInventory modal arguments.' });
    }
  }
  return { signals, roadblocks };
}
