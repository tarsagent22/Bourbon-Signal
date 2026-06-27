import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureBrowserCdp, killBrowserCdp } from './core/browser-session.mjs';

const DEFAULT_CDP = process.env.FWGS_CDP_URL || process.env.OHLQ_CDP_URL || 'http://127.0.0.1:18800';
const OUT_FILE = process.env.FWGS_OUT_FILE || 'out/browser/fwgs-store-inventory.json';
const PAGE_TIMEOUT_MS = Number(process.env.FWGS_PAGE_TIMEOUT_MS || 45000);
const LOCATION_LIMIT = Number(process.env.FWGS_LOCATION_LIMIT || 100);
const LOCATION_OFFSET = Number(process.env.FWGS_LOCATION_OFFSET || 0);
const INVENTORY_CONCURRENCY = Number(process.env.FWGS_INVENTORY_CONCURRENCY || 4);
const PRODUCT_LIMIT = Number(process.env.FWGS_PRODUCT_LIMIT || 0);
const SEARCH_TERMS = (process.env.FWGS_SEARCH_TERMS || 'buffalo trace bourbon,weller bourbon,blanton bourbon,eagle rare bourbon,stagg bourbon,old fitzgerald bourbon,old fitzgerald bottled in bond,willett bourbon,michter bourbon,eh taylor bourbon,elmer t lee bourbon')
  .split(',')
  .map((term) => term.trim())
  .filter(Boolean);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function cdpFetch(cdpUrl, route, options = {}) {
  const res = await fetch(`${cdpUrl.replace(/\/$/, '')}${route}`, options);
  if (!res.ok) throw new Error(`CDP ${route} returned ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

async function getOrCreateTarget(cdpUrl) {
  const newTarget = async () => {
    try {
      return await cdpFetch(cdpUrl, `/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
    } catch {
      return await cdpFetch(cdpUrl, `/json/new?${encodeURIComponent('about:blank')}`);
    }
  };
  if (process.env.FWGS_REUSE_TAB !== '1') return newTarget();
  const tabs = await cdpFetch(cdpUrl, '/json/list');
  const existing = tabs.find((t) => t.type === 'page' && /finewineandgoodspirits\.com/.test(t.url || '') && t.webSocketDebuggerUrl)
    || tabs.find((t) => t.type === 'page' && t.url !== 'chrome://newtab/' && t.webSocketDebuggerUrl);
  return existing?.webSocketDebuggerUrl ? existing : newTarget();
}

class CdpPage {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.seq = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to CDP websocket')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', (event) => { clearTimeout(timer); reject(new Error(`CDP websocket error: ${event.message || 'unknown'}`)); }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id) return;
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(`${msg.error.message}${msg.error.data ? `: ${msg.error.data}` : ''}`));
      else pending.resolve(msg.result);
    });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  send(method, params = {}, timeoutMs = 120000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true, timeout = 120000) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, timeout }, timeout + 5000);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'Runtime.evaluate exception');
    return result.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    const started = Date.now();
    while (Date.now() - started < PAGE_TIMEOUT_MS) {
      const state = await this.evaluate('document.readyState', false).catch(() => 'loading');
      if (state === 'complete' || state === 'interactive') return;
      await sleep(500);
    }
    throw new Error(`Timed out loading ${url}`);
  }

  close() { try { this.ws?.close(); } catch {} }
}

function pageEval(page, fn, arg = {}, timeout = 120000) {
  return page.evaluate(`(${fn.toString()})(JSON.parse(${JSON.stringify(JSON.stringify(arg))}))`, true, timeout);
}

async function collectFwgs(page) {
  const productResult = await pageEval(page, async ({ searchTerms }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try { return await fetch(url, { ...options, signal: controller.signal }); }
      finally { clearTimeout(timer); }
    };
    const bourbonRe = /bourbon|straight rye|american whiskey|michter|willett|buffalo trace|eagle rare|weller|blanton|stagg|old fitz|fitzgerald|e\.?h\.?\s*taylor|elmer t|colonel\s*taylor/i;
    const excludeRe = /cream|cocktail|wine|cabernet|chardonnay|sauvignon|cava|grenache|merlot|vodka|gin|rum|tequila|liqueur|ready to drink|flavored whiskey|black cherry/i;
    const decode = (text) => String(text || '')
      .replace(/%[0-9A-Fa-f]{2}/g, (match) => { try { return decodeURIComponent(match); } catch { return match; } })
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    const attr = (block, key) => {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return block.match(new RegExp('"' + escaped + '":\\["([^"]*)"\\]'))?.[1] || null;
    };
    const inventoryMap = (decoded) => {
      const map = new Map();
      for (const match of decoded.matchAll(/"([0-9]{8,9})":\{"default":\{([^}]+)\}\}/g)) {
        const sku = match[1];
        const body = match[2];
        const qty = Number(body.match(/"inStockQuantity":(\d+)/)?.[1] || body.match(/"orderableQuantity":(\d+)/)?.[1] || 0) || 0;
        const stockStatus = body.match(/"stockStatus":"([^"]+)"/)?.[1] || null;
        const prior = map.get(sku);
        if (!prior || qty > prior.inStockQuantity || (stockStatus === 'IN_STOCK' && prior.stockStatus !== 'IN_STOCK')) {
          map.set(sku, { sku, stockStatus, inStockQuantity: qty, orderableQuantity: Number(body.match(/"orderableQuantity":(\d+)/)?.[1] || 0) || 0 });
        }
      }
      return map;
    };
    const parseRows = (decoded, term) => {
      const inventory = inventoryMap(decoded);
      const rows = [];
      for (const match of decoded.matchAll(/"attributes":\{[\s\S]*?\}\}/g)) {
        const block = match[0];
        if (!block.includes('product.displayName')) continue;
        const sku = attr(block, 'product.repositoryId') || attr(block, 'sku.repositoryId') || attr(block, 'sku.listingId');
        const name = attr(block, 'product.displayName');
        const brand = attr(block, 'product.brand');
        const category = attr(block, 'parentCategory.displayName');
        const type = attr(block, 'B2CProduct.x_type');
        const route = attr(block, 'product.route');
        if (!sku || !name) continue;
        const searchable = `${name} ${brand || ''} ${category || ''} ${type || ''}`;
        if (!bourbonRe.test(searchable) || excludeRe.test(searchable)) continue;
        rows.push({
          sku,
          name,
          brand,
          category,
          type,
          route,
          price: Number(attr(block, 'sku.activePrice') || attr(block, 'product.salePrice') || attr(block, 'product.listPrice') || 0) || null,
          onlineAvailable: attr(block, 'product.b2c_onlineAvailable') || null,
          bopisDisabled: attr(block, 'B2CProduct.b2c_disableBopis') || null,
          highlyAllocated: attr(block, 'B2CProduct.b2c_highlyAllocatedProduct') || null,
          lotteryProduct: attr(block, 'B2CProduct.b2c_lotteryProduct') || null,
          searchTerm: term,
          inventory: inventory.get(sku) || { sku, stockStatus: null, inStockQuantity: 0, orderableQuantity: 0 }
        });
      }
      return rows;
    };

    document.cookie = 'AGEVERIFY=Over21; path=/; max-age=31536000';
    const productsBySku = new Map();
    const productSearches = [];
    for (const term of searchTerms) {
      const response = await fetchWithTimeout(`/search?Ntt=${encodeURIComponent(term)}`, { credentials: 'include', headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }, 22000);
      const decoded = decode(await response.text());
      const rows = parseRows(decoded, term);
      const pageCount = Number(decoded.match(/PRODUCTS\s*\(\s*(?:<!--\s*-->\s*)?(\d+)/i)?.[1] || decoded.match(/"totalMatchingRecords":(\d+)/i)?.[1] || 0) || 0;
      productSearches.push({ term, status: response.status, ok: response.ok, pageCount, rowCount: rows.length });
      for (const row of rows) if (!productsBySku.has(row.sku)) productsBySku.set(row.sku, row);
      await sleep(250);
    }
    return { products: [...productsBySku.values()], productSearches };
  }, { searchTerms: SEARCH_TERMS }, 180000);

  let products = productResult.products || [];
  if (PRODUCT_LIMIT > 0) products = products.slice(0, PRODUCT_LIMIT);
  console.log(`  FWGS products parsed: ${products.length}`);

  const locationResult = await pageEval(page, async ({ locationLimit, locationOffset }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try { return await fetch(url, { ...options, signal: controller.signal }); }
      finally { clearTimeout(timer); }
    };
    const allLocations = [];
    let locOffset = locationOffset;
    let locationTotal = null;
    while (allLocations.length < locationLimit) {
      const pageLimit = Math.min(250, locationLimit - allLocations.length);
      const res = await fetchWithTimeout(`/ccstore/v1/locations?limit=${pageLimit}&offset=${locOffset}`, { credentials: 'include', headers: { accept: 'application/json' } }, 22000);
      const json = await res.json();
      if (locationTotal == null) locationTotal = Number(json.totalResults || json.total || 0) || null;
      const items = json.items || [];
      allLocations.push(...items);
      if (!items.length || (locationTotal != null && locOffset + items.length >= locationTotal)) break;
      locOffset += items.length;
      await sleep(120);
    }
    return { total: locationTotal, locations: allLocations.filter((loc) => loc.locationId && loc.inventory !== false && loc.pickUp !== false) };
  }, { locationLimit: LOCATION_LIMIT, locationOffset: LOCATION_OFFSET }, 120000);
  const locations = locationResult.locations || [];
  console.log(`  FWGS locations parsed: ${locations.length}/${locationResult.total || 'unknown'}`);

  const skus = products.map((product) => product.sku);
  const inventoryRows = [];
  const failures = [];
  const batchSize = Number(process.env.FWGS_BATCH_SIZE || 25);
  for (let i = 0; i < locations.length; i += batchSize) {
    const batch = locations.slice(i, i + batchSize);
    const result = await pageEval(page, async ({ batch, products, skus, inventoryConcurrency }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try { return await fetch(url, { ...options, signal: controller.signal }); }
        finally { clearTimeout(timer); }
      };
      const inventoryRows = [];
      const failures = [];
      let cursor = 0;
      async function worker() {
        while (cursor < batch.length) {
          const location = batch[cursor++];
          try {
            const response = await fetchWithTimeout('/ccstorex/custom/v1/b2b/get-inventory', {
              method: 'POST',
              credentials: 'include',
              headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                'X-CCProfileType': 'storefrontUI',
                'X-CC-MeteringMode': 'CC-NonMetered',
                'X-CC-Frontend-Forwarded-Url': window.location.host + window.location.pathname + window.location.search
              },
              body: JSON.stringify({ method: 'pickup', location: location.locationId, items: skus })
            }, 10000);
            const json = await response.json().catch(async () => ({ parseError: await response.text().catch(() => '') }));
            if (!response.ok || json.parseError) failures.push({ locationId: location.locationId, status: response.status, error: json.parseError || json });
            for (const product of products) {
              const quantity = Number(json[product.sku] || 0) || 0;
              if (quantity > 0) inventoryRows.push({ product, location, quantity, status: 'IN_STOCK' });
            }
          } catch (error) {
            failures.push({ locationId: location.locationId, status: 0, error: error.message || String(error) });
          }
          await sleep(60);
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, inventoryConcurrency) }, () => worker()));
      return { inventoryRows, failures };
    }, { batch, products, skus, inventoryConcurrency: INVENTORY_CONCURRENCY }, Math.max(45000, batch.length * 12000));
    inventoryRows.push(...(result.inventoryRows || []));
    failures.push(...(result.failures || []));
    console.log(`  FWGS inventory ${Math.min(i + batch.length, locations.length)}/${locations.length}: +${result.inventoryRows?.length || 0} rows, failures ${failures.length}`);
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl: 'https://www.finewineandgoodspirits.com/store-locator',
    locationEndpoint: `/ccstore/v1/locations?limit=${LOCATION_LIMIT}&offset=${LOCATION_OFFSET}`,
    inventoryEndpoint: '/ccstorex/custom/v1/b2b/get-inventory',
    searchTerms: SEARCH_TERMS,
    productSearches: productResult.productSearches || [],
    products,
    locations,
    inventoryRows,
    failures,
    summary: {
      productCount: products.length,
      locationCount: locations.length,
      positiveInventoryRowCount: inventoryRows.length,
      failureCount: failures.length
    }
  };
}
async function main() {
  const browser = await ensureBrowserCdp(DEFAULT_CDP);
  if (browser.started) console.log(`Started browser CDP for FWGS on ${DEFAULT_CDP} (pid ${browser.pid || 'unknown'}).`);
  const target = await getOrCreateTarget(DEFAULT_CDP);
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.connect();
  try {
    await page.navigate('https://www.finewineandgoodspirits.com/store-locator');
    await sleep(2200);
    console.log(`FWGS browser collector: ${SEARCH_TERMS.length} search terms, ${LOCATION_LIMIT} locations from offset ${LOCATION_OFFSET}, concurrency ${INVENTORY_CONCURRENCY}`);
    const payload = await collectFwgs(page);
    await mkdir(path.dirname(OUT_FILE), { recursive: true });
    await writeFile(OUT_FILE, JSON.stringify({ ...payload, cdpUrl: DEFAULT_CDP }, null, 2));
    console.log(`Wrote ${OUT_FILE}: ${payload.summary.productCount} products, ${payload.summary.locationCount} stores, ${payload.summary.positiveInventoryRowCount} positive store rows, ${payload.summary.failureCount} failures.`);
  } finally {
    page.close();
    await killBrowserCdp(browser);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

