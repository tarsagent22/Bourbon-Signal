import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CDP = process.env.OHLQ_CDP_URL || 'http://127.0.0.1:18800';
const PRODUCTS_FILE = process.env.OHLQ_PRODUCTS_FILE || 'data/ohlq-products.json';
const OUT_FILE = process.env.OHLQ_OUT_FILE || 'out/browser/ohlq-availability.json';
const PAGE_TIMEOUT_MS = Number(process.env.OHLQ_PAGE_TIMEOUT_MS || 45000);
const DISCOVER = process.argv.includes('--discover') || process.env.OHLQ_DISCOVER === '1';
const DISCOVERY_PAGES = Number(process.env.OHLQ_DISCOVERY_PAGES || 2);
const DISCOVERY_LIMIT = Number(process.env.OHLQ_DISCOVERY_LIMIT || 20);
const DISCOVERY_FILE = process.env.OHLQ_DISCOVERY_FILE || 'data/browser-discovery/ohlq-bourbon-discovered-products.json';
const BOURBON_LISTING_URL = 'https://www.ohlq.com/liquor/whiskey?productsubtype=bourbon&producttype=american';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function cdpFetch(cdpUrl, route, options = {}) {
  const res = await fetch(`${cdpUrl.replace(/\/$/, '')}${route}`, options);
  if (!res.ok) throw new Error(`CDP ${route} returned ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

async function getOrCreateTarget(cdpUrl) {
  const tabs = await cdpFetch(cdpUrl, '/json/list');
  const existing = tabs.find((t) => t.type === 'page' && t.url !== 'chrome://newtab/');
  if (existing?.webSocketDebuggerUrl) return existing;
  try {
    return await cdpFetch(cdpUrl, `/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  } catch {
    return await cdpFetch(cdpUrl, `/json/new?${encodeURIComponent('about:blank')}`);
  }
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

  send(method, params = {}) {
    const id = ++this.seq;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }
      }, 60000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.ws.send(payload);
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, timeout: 60000 });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime.evaluate exception');
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

function normalizeSku(value) {
  return value ? String(value).trim().toLowerCase() : null;
}

function cleanListingName(text) {
  return String(text || '')
    .replace(/Now\s*\$.*$/i, '')
    .replace(/\$.*$/g, '')
    .replace(/\d+\s*(ml|l)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProductUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url || '').split('#')[0].split('?')[0];
  }
}

async function discoverBourbonProducts(page, seedProducts) {
  const discovered = [];
  const seen = new Set(seedProducts.map((p) => normalizeProductUrl(p.pageUrl)));
  for (let pageNo = 1; pageNo <= DISCOVERY_PAGES && discovered.length < DISCOVERY_LIMIT; pageNo++) {
    const url = `${BOURBON_LISTING_URL}${pageNo > 1 ? `&page=${pageNo}` : ''}`;
    await page.navigate(url);
    await sleep(2200);
    const links = await page.evaluate(`(() => Array.from(document.querySelectorAll('a[href*="/liquor/whiskey/american/bourbon/"]'))
      .map((a) => ({ text: a.textContent.trim().replace(/\\s+/g, ' '), href: a.href }))
      .filter((x) => x.text && !/View Details/i.test(x.text)))()`);
    for (const link of links || []) {
      const normalizedUrl = normalizeProductUrl(link.href);
      if (!normalizedUrl || seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      discovered.push({ name: cleanListingName(link.text), pageUrl: normalizedUrl, sku: null, isExclusive: false, discoveredFrom: url, discoveryText: link.text });
      if (discovered.length >= DISCOVERY_LIMIT) break;
    }
  }
  const payload = { generatedAt: new Date().toISOString(), sourceUrl: BOURBON_LISTING_URL, pageCount: DISCOVERY_PAGES, limit: DISCOVERY_LIMIT, discoveredCount: discovered.length, products: discovered };
  await mkdir(path.dirname(DISCOVERY_FILE), { recursive: true });
  await writeFile(DISCOVERY_FILE, JSON.stringify(payload, null, 2));
  return discovered;
}

async function collectProduct(page, product) {
  await page.navigate(product.pageUrl);
  await sleep(1800);
  const result = await page.evaluate(`(async () => {
    const pageUrl = location.href;
    const title = document.title;
    const product = window.Ohlq?.renderProductDetail?.Product || null;
    const selectedVariant = product?.ProductVariants?.find(v => v.Code === product?.PreferredVariantSku)
      || product?.ProductVariants?.[0]
      || null;
    const sku = (${JSON.stringify(product.sku || null)})
      || selectedVariant?.Code
      || product?.PreferredVariantSku
      || product?.BaseSku
      || null;
    const csrf = document.documentElement.dataset.csrfToken || null;
    if (!csrf) return { ok: false, pageUrl, title, productName: product?.ProductName || ${JSON.stringify(product.name)}, sku, status: 0, error: 'No OHLQ csrf token on rendered page' };
    if (!sku) return { ok: false, pageUrl, title, productName: product?.ProductName || ${JSON.stringify(product.name)}, sku, status: 0, error: 'No product SKU found on rendered page' };
    const skuLower = String(sku).toLowerCase();
    const params = new URLSearchParams({ isExclusive: String(Boolean(${JSON.stringify(Boolean(product.isExclusive))} || selectedVariant?.IsExclusiveHybrid)), sortByAvailability: 'true', sku: skuLower });
    const endpoint = '/api/product-availability/' + skuLower + '?' + params.toString();
    const response = await fetch(endpoint, { credentials: 'include', headers: { RequestVerificationToken: csrf, accept: 'application/json, text/plain, */*' } });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return {
      ok: response.ok && Array.isArray(json?.Inventories),
      status: response.status,
      endpoint,
      pageUrl,
      title,
      productName: product?.ProductName || ${JSON.stringify(product.name)},
      sku: skuLower,
      baseSku: product?.BaseSku || null,
      preferredVariantSku: product?.PreferredVariantSku || null,
      isExclusive: Boolean(${JSON.stringify(Boolean(product.isExclusive))} || selectedVariant?.IsExclusiveHybrid),
      displayStatus: selectedVariant?.DisplayStatus || null,
      inventoryCount: json?.Inventories?.length || 0,
      inventories: (json?.Inventories || []).map((store) => ({
        AgencyId: store.AgencyId,
        AgencyName: store.AgencyName,
        VariantCode: store.VariantCode,
        LocationTypes: store.LocationTypes,
        DeliveryAvailable: store.DeliveryAvailable,
        PickupAvailable: store.PickupAvailable,
        Latitude: store.Latitude,
        Longitude: store.Longitude,
        Address1: store.Address1,
        Address2: store.Address2,
        City: store.City,
        State: store.State,
        Zip: store.Zip,
        I: store.I,
        Distance: store.Distance,
        LastModified: store.LastModified,
        PhoneNumber: store.PhoneNumber,
        EcommerceUrls: store.EcommerceUrls,
        Url: store.Url,
        Price: store.Price,
        LimitOne: store.LimitOne
      })),
      geocodeResults: json?.GeocodeResults || null,
      error: response.ok ? null : text.slice(0, 500)
    };
  })()`);
  return result;
}

async function main() {
  const seedProducts = JSON.parse(await readFile(PRODUCTS_FILE, 'utf8'));
  const target = await getOrCreateTarget(DEFAULT_CDP);
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.connect();
  const results = [];
  let products = seedProducts;
  let discoveredProducts = [];
  try {
    if (DISCOVER) {
      console.log(`OHLQ discovery: ${DISCOVERY_PAGES} listing pages, max ${DISCOVERY_LIMIT} new products`);
      discoveredProducts = await discoverBourbonProducts(page, seedProducts);
      products = [...seedProducts, ...discoveredProducts];
      console.log(`  discovered ${discoveredProducts.length} products; collecting ${products.length} total`);
    }
    for (const product of products) {
      console.log(`OHLQ ${product.name}`);
      try {
        const result = await collectProduct(page, product);
        results.push(result);
        console.log(`  ${result.ok ? 'ok' : 'blocked'}: sku=${normalizeSku(result.sku) || 'none'}, stores=${result.inventoryCount || 0}, status=${result.status}`);
      } catch (error) {
        results.push({ ok: false, productName: product.name, pageUrl: product.pageUrl, sku: product.sku || null, status: 0, error: error.message, inventories: [] });
        console.log(`  error: ${error.message}`);
      }
      await sleep(1000);
    }
  } finally {
    page.close();
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    cdpUrl: DEFAULT_CDP,
    discovery: DISCOVER ? { enabled: true, sourceUrl: BOURBON_LISTING_URL, pageCount: DISCOVERY_PAGES, limit: DISCOVERY_LIMIT, discoveredProductCount: discoveredProducts.length, discoveryFile: DISCOVERY_FILE } : { enabled: false },
    products: results,
    summary: {
      productCount: results.length,
      okProductCount: results.filter((r) => r.ok).length,
      inventoryRowCount: results.reduce((sum, r) => sum + (r.inventories?.length || 0), 0)
    }
  };
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_FILE}: ${payload.summary.okProductCount}/${payload.summary.productCount} products, ${payload.summary.inventoryRowCount} store rows.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
