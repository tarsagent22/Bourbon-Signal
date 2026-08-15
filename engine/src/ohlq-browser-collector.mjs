import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BrowserPage, ensureBrowserCdp, getOrCreateTarget, killBrowserCdp } from './core/browser-session.mjs';
import { ohlqBlockedReason, ohlqResultIsAccessBlocked } from './sources/ohlq-access-policy.mjs';

const DEFAULT_CDP = process.env.OHLQ_CDP_URL || process.env.BROWSER_CDP_URL || 'http://127.0.0.1:18800';
const PRODUCTS_FILE = process.env.OHLQ_PRODUCTS_FILE || 'data/ohlq-products.json';
const OUT_FILE = process.env.OHLQ_OUT_FILE || 'out/browser/ohlq-availability.json';
const COOLDOWN_FILE = process.env.OHLQ_COOLDOWN_FILE || 'out/browser/ohlq-cooldown.json';
const PAGE_TIMEOUT_MS = Number(process.env.OHLQ_PAGE_TIMEOUT_MS || 45000);
const DISCOVER = process.argv.includes('--discover') || process.env.OHLQ_DISCOVER === '1';
const DISCOVERY_PAGES = Number(process.env.OHLQ_DISCOVERY_PAGES || 2);
const DISCOVERY_LIMIT = Number(process.env.OHLQ_DISCOVERY_LIMIT || 10);
const PRODUCT_READY_TIMEOUT_MS = Number(process.env.OHLQ_PRODUCT_READY_TIMEOUT_MS || 60000);
const PRODUCT_DELAY_MS = Number(process.env.OHLQ_PRODUCT_DELAY_MS || 3500);
const BLOCKED_BACKOFF_HOURS = Number(process.env.OHLQ_BLOCKED_BACKOFF_HOURS || 24);
const JITTER_MS = Number(process.env.OHLQ_PRODUCT_JITTER_MS || 2500);
const DISCOVERY_FILE = process.env.OHLQ_DISCOVERY_FILE || 'data/browser-discovery/ohlq-bourbon-discovered-products.json';
const BOURBON_LISTING_URL = 'https://www.ohlq.com/liquor/whiskey?productsubtype=bourbon&producttype=american';

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function jitteredDelay() { return PRODUCT_DELAY_MS + Math.floor(Math.random() * Math.max(0, JITTER_MS)); }

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}


async function activeCooldown() {
  if (process.env.OHLQ_IGNORE_COOLDOWN === '1') return null;
  const payload = await readJson(COOLDOWN_FILE, null);
  const until = Date.parse(payload?.cooldownUntil || '');
  return Number.isFinite(until) && until > Date.now() ? payload : null;
}

async function writeCooldown(reason, sample = {}) {
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + Math.max(1, BLOCKED_BACKOFF_HOURS) * 60 * 60 * 1000).toISOString();
  const payload = {
    generatedAt: now.toISOString(),
    cooldownUntil,
    backoffHours: BLOCKED_BACKOFF_HOURS,
    reason: String(reason || 'OHLQ access blocked/rate-limited').slice(0, 500),
    sample
  };
  await mkdir(path.dirname(COOLDOWN_FILE), { recursive: true });
  await writeFile(COOLDOWN_FILE, JSON.stringify(payload, null, 2));
  return payload;
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

const OHLQ_DISCOVERY_INCLUDE_RE = /bourbon|american whiskey|american whisky|weller|blanton|eagle rare|stagg|e\.?\s*h\.?\s*taylor|colonel\s*taylor|buffalo trace|old fitz|fitzgerald|booker'?s?|baker'?s?|little book|blood oath|four roses|1792|russell|elijah craig|larceny|old forester|woodford|michter|willett|penelope|yellowstone|barrell|redwood empire|joseph magnus|cigar blend|remus|heaven hill|henry mckenna|green river|knob creek|maker'?s/i;
const OHLQ_DISCOVERY_EXCLUDE_RE = /cocktail|rtp|ready\s*to\s*(pour|drink)|vodka|gin|rum|tequila|mezcal|wine\b|beer|seltzer|liqueur|cream|coffee|cinnamon|peach|apple|honey|peanut\s*butter|chocolate|gift\s*card|event|ticket|shirt|hat|glass|cup/i;

function ohlqDiscoveryProductLooksRelevant(product = {}) {
  const hay = `${product.name || ''} ${product.discoveryText || ''} ${product.pageUrl || ''}`;
  if (!OHLQ_DISCOVERY_INCLUDE_RE.test(hay)) return false;
  if (OHLQ_DISCOVERY_EXCLUDE_RE.test(hay) && !/barrel proof|cask strength|bourbon|whiskey|whisky/i.test(hay)) return false;
  if (/yellowstone/i.test(hay) && /small batch|select|6yr|6 year/i.test(hay) && !/limited edition/i.test(hay)) return false;
  if (/bulleit/i.test(hay) && /mesquite/i.test(hay)) return false;
  return true;
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
      const candidate = { name: cleanListingName(link.text), pageUrl: normalizedUrl, sku: null, isExclusive: false, discoveredFrom: url, discoveryText: link.text };
      if (!ohlqDiscoveryProductLooksRelevant(candidate)) continue;
      discovered.push(candidate);
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
  await waitForOhlqProductReady(page, product);
  const result = await page.evaluate(`(async () => {
    const pageUrl = location.href;
    const title = document.title;
    const product = window.Ohlq?.renderProductDetail?.Product || null;
    const selectedVariant = product?.ProductVariants?.find(v => v.Code === product?.PreferredVariantSku)
      || product?.ProductVariants?.[0]
      || null;
    const sku = selectedVariant?.Code
      || product?.PreferredVariantSku
      || product?.BaseSku
      || (${JSON.stringify(product.sku || null)})
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

function expectedProductTokens(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !['bourbon', 'whiskey', 'straight', 'kentucky', 'american', 'single', 'barrel'].includes(token))
    .slice(0, 4);
}

async function waitForOhlqProductReady(page, product) {
  const started = Date.now();
  let lastState = null;
  const expectedTokens = expectedProductTokens(product.name);
  const expectedSku = normalizeSku(product.sku);
  while (Date.now() - started < PRODUCT_READY_TIMEOUT_MS) {
    lastState = await page.evaluate(`(() => {
      const product = window.Ohlq?.renderProductDetail?.Product || null;
      const selectedVariant = product?.ProductVariants?.find(v => v.Code === product?.PreferredVariantSku)
        || product?.ProductVariants?.[0]
        || null;
      const selectedSku = selectedVariant?.Code || product?.PreferredVariantSku || product?.BaseSku || null;
      const pageText = [product?.ProductName, document.title, location.pathname].filter(Boolean).join(' ').toLowerCase();
      const expectedTokens = ${JSON.stringify(expectedTokens)};
      const expectedSku = ${JSON.stringify(expectedSku)};
      const skuMatches = !expectedSku || String(selectedSku || '').toLowerCase() === expectedSku;
      const tokenMatches = !expectedTokens.length || expectedTokens.some((token) => pageText.includes(token));
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        hasCsrf: Boolean(document.documentElement.dataset.csrfToken),
        productName: product?.ProductName || null,
        selectedSku,
        skuMatches,
        tokenMatches,
        matchesExpected: skuMatches && tokenMatches
      };
    })()`, true).catch((error) => ({ error: error.message }));
    if (lastState?.hasCsrf && (lastState.productName || lastState.selectedSku) && lastState.matchesExpected && !/just a moment/i.test(String(lastState.title || ''))) return lastState;
    if (/404:\s*page not found|page not found/i.test(String(lastState?.title || '')) && lastState?.hasCsrf) {
      throw new Error(`OHLQ product page not found for ${product.pageUrl}; last state=${JSON.stringify(lastState)}`);
    }
    if (/access denied|restrict access|forbidden/i.test(String(lastState?.title || ''))) {
      throw new Error(`OHLQ/Cloudflare access denied for ${product.pageUrl}; last state=${JSON.stringify(lastState)}`);
    }
    await sleep(750);
  }
  throw new Error(`Timed out waiting for rendered OHLQ product data on ${product.pageUrl}; last state=${JSON.stringify(lastState)}`);
}

async function main() {
  const cooldown = await activeCooldown();
  if (cooldown) {
    throw new Error(`OHLQ collector cooldown active until ${cooldown.cooldownUntil}: ${cooldown.reason || 'access blocked/rate-limited'}`);
  }

  const seedProducts = JSON.parse(await readFile(PRODUCTS_FILE, 'utf8'));
  const browser = await ensureBrowserCdp(DEFAULT_CDP, { timeoutMs: Number(process.env.OHLQ_CDP_START_TIMEOUT_MS || 45000) });
  console.log(`OHLQ CDP ${DEFAULT_CDP}; browser ${browser.started ? `started ${browser.executable} profile=${browser.profileDir}` : 'already running'}; headless=${process.env.BROWSER_HEADLESS === '0' ? 'false' : 'true'}`);
  const target = await getOrCreateTarget(DEFAULT_CDP, 'ohlq.com');
  const page = new BrowserPage(target.webSocketDebuggerUrl, { pageTimeoutMs: PAGE_TIMEOUT_MS });
  await page.connect();
  const results = [];
  const blockSignals = [];
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
      let accessBlocked = false;
      try {
        const result = await collectProduct(page, product);
        results.push(result);
        if (!result.ok && ohlqResultIsAccessBlocked(result)) {
          blockSignals.push({ productName: result.productName, pageUrl: result.pageUrl, status: result.status, error: result.error || result.title || 'blocked' });
          accessBlocked = true;
        }
        console.log(`  ${result.ok ? 'ok' : 'blocked'}: sku=${normalizeSku(result.sku) || 'none'}, stores=${result.inventoryCount || 0}, status=${result.status}`);
      } catch (error) {
        const blocked = ohlqBlockedReason(error.message);
        const failed = { ok: false, productName: product.name, pageUrl: product.pageUrl, sku: product.sku || null, status: 0, error: error.message, inventories: [] };
        results.push(failed);
        if (blocked) blockSignals.push({ productName: product.name, pageUrl: product.pageUrl, status: 0, error: error.message });
        accessBlocked = blocked;
        console.log(`  error: ${error.message}`);
      }
      if (accessBlocked) {
        console.log('  stopping OHLQ collection after the first access block; cooldown will be recorded.');
        break;
      }
      await sleep(jitteredDelay());
    }
  } finally {
    page.close();
    if (process.env.OHLQ_KEEP_BROWSER !== '1') await killBrowserCdp(browser).catch(() => false);
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
  if (blockSignals.length > 0 || payload.summary.okProductCount === 0) {
    const reason = blockSignals[0]?.error || 'OHLQ returned no successful product availability results';
    const cooldown = await writeCooldown(reason, { blockedCount: blockSignals.length, productCount: results.length, firstBlocked: blockSignals[0] || null });
    payload.cooldown = { cooldownUntil: cooldown.cooldownUntil, reason: cooldown.reason };
  }
  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${OUT_FILE}: ${payload.summary.okProductCount}/${payload.summary.productCount} products, ${payload.summary.inventoryRowCount} store rows${payload.cooldown ? `; cooldown until ${payload.cooldown.cooldownUntil}` : ''}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
