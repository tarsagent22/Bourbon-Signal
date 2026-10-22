import { fetchWithMeta } from '../core/fetcher.mjs';
import { stableId, stripHtml } from '../core/text.mjs';
import { parseCaliforniaShopifyProducts } from './california-san-diego-surfaces.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { MalformedSourceError, SourceTimeoutError, TransientSourceError, sourceErrorForHttp } from '../sources/source-error.mjs';

// Identity only. Every execution fetches current product metadata and the exact
// variant pickup response; these reviewed IDs never supply current availability.
export const JENSENS_RUNTIME_SOURCE = Object.freeze({
  id: 'jensens-miami', runtimeId: 'fl:jensens-miami', state: 'FL',
  chain: 'jensens-liquors', merchantId: 'jensens-miami-shopify',
  sourceLabel: "Jensen's Liquors Miami Shopify pickup inventory",
  baseUrl: 'https://jensensliquors.com',
  store: Object.freeze({ id: 'jensens-liquors:1646-sw-27th', name: "Jensen's Liquors - SW 27th Ave", address: '1646 SW 27th Ave, Miami, FL 33145', city: 'Miami', zip: '33145' }),
  products: Object.freeze([Object.freeze({
    productId: '15414448390218', variantId: '67703590977610',
    handle: 'elijah-craig-single-barrel-18-years-bourbon-whiskey',
    title: 'Elijah Craig Single Barrel 18 Years Bourbon Whiskey',
    canonicalName: 'Elijah Craig 18 Year',
  })]),
  budgets: Object.freeze({ maxProducts: 2, maxRequests: 6, maxElapsedMs: 50_000, requestTimeoutMs: 12_000, maxBodyBytes: 2 * 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024 }),
});

function malformed(message) { return new MalformedSourceError(`Jensen pickup identity/schema: ${message}`); }
function plain(value) { return stripHtml(value).replace(/&#0*39;|&apos;|[’‘]/gu, "'"); }
function normalized(value) { return plain(value).toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim(); }
function premises(value) {
  return normalized(value).replace(/\bsouthwest\b/gu, 'sw').replace(/\bavenue\b/gu, 'ave')
    .replace(/\bunited states(?: of america)?\b/gu, '').replace(/\s+/gu, ' ').trim();
}

function reviewedProduct(payload, seed) {
  const product = payload?.product;
  if (!product || String(product.id) !== seed.productId || product.handle !== seed.handle
    || normalized(product.title) !== normalized(seed.title) || !Array.isArray(product.variants)) throw malformed('reviewed product identity changed');
  const variants = product.variants.filter(variant => String(variant?.id) === seed.variantId);
  if (variants.length !== 1 || String(variants[0].product_id) !== seed.productId) throw malformed('reviewed variant/product binding missing or ambiguous');
  const variant = variants[0];
  // Body copy is used only for explicit volume, never bottle identity or flavor
  // classification: descriptions can mention honey, vanilla, rye mashbill, etc.
  const sizeText = plain([product.title, variant.title, variant.option1, variant.option2, variant.option3, product.body_html].filter(Boolean).join(' '));
  const sizes = [...sizeText.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|fl\.?\s*oz)\b/giu)]
    .map(match => Number(match[1]) * (/^ml|^mill/i.test(match[2]) ? 1 : /^l/i.test(match[2]) ? 1000 : 29.5735));
  if (!sizes.length || sizes.some(size => !Number.isFinite(size) || size <= 375 || size > 1750)
    || new Set(sizes.map(size => Math.round(size))).size !== 1) throw malformed('missing, ambiguous, or excluded bottle volume');
  if (typeof variant.available !== 'undefined' && typeof variant.available !== 'boolean') throw malformed('invalid variant availability');
  const price = Number(variant.price);
  if (!Number.isFinite(price) || price <= 0) throw malformed('missing sellable price');
  return { product, variant, sizeMl: sizes[0] };
}

function pickupState(html, productTitle) {
  if (!/<(?:pickup-availability-preview|pickup-availability-drawer)\b/iu.test(html)
    || !/pickup-availability-list__item/iu.test(html)) throw malformed('pickup response lacks store status structure');
  const heading = html.match(/<h2\b[^>]*id=["']PickupAvailabilityHeading["'][^>]*>([\s\S]*?)<\/h2>/iu)
    || html.match(/<h2\b[^>]*class=["'][^"']*pickup-availability-drawer-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/iu);
  if (!heading || normalized(heading[1]) !== normalized(productTitle)) throw malformed('pickup product heading changed');
  const blocks = [...html.matchAll(/<li\b[^>]*class=["'][^"']*\bpickup-availability-list__item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/giu)];
  if (!blocks.length) throw malformed('pickup store rows missing');
  const states = [];
  for (const [, block] of blocks) {
    const heading = block.match(/<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/iu);
    const address = block.match(/<address\b[^>]*>([\s\S]*?)<\/address>/iu);
    const addressLine = address?.[1]?.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu)?.[1];
    if (normalized(heading?.[1]) !== normalized("Jensen's Liquors PICKUP")
      || premises(addressLine || '') !== premises(JENSENS_RUNTIME_SOURCE.store.address)) throw malformed('unreviewed pickup name or premises');
    const statusText = plain(block.replace(/<address\b[\s\S]*?<\/address>/giu, ' '));
    const positive = /\bpickup\s+available\b/iu.test(statusText);
    const negative = /\bpickup\s+(?:unavailable|not available)\b/iu.test(statusText);
    if (positive === negative) throw malformed('missing or conflicting pickup availability');
    states.push(positive);
  }
  if (states.length !== 1) throw malformed('duplicate pickup premises');
  return states[0];
}

/**
 * Pure collection: no cache, files, database, notifications, or retry loop.
 * @param {any} bible Canonical Bottle Bible matcher.
 * @param {{ observedAt?: string, signal?: AbortSignal, fetchText?: (url: string, options: any) => Promise<any> }} [options]
 */
export async function collectJensensSource(bible, { observedAt = new Date().toISOString(), signal, fetchText = fetchWithMeta } = {}) {
  if (!Number.isFinite(Date.parse(observedAt))) throw malformed('invalid observation clock');
  if (typeof bible?.match !== 'function' || typeof fetchText !== 'function') throw malformed('canonical matcher or transport unavailable');
  const source = JENSENS_RUNTIME_SOURCE;
  const budgets = source.budgets;
  if (!source.products.length || source.products.length > budgets.maxProducts) throw malformed('reviewed product budget exceeded');
  const startedAt = Date.now();
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new SourceTimeoutError(source.runtimeId, budgets.maxElapsedMs)), budgets.maxElapsedMs);
  const signals = [];
  const accounting = { requestCount: 0, bytes: 0, elapsedMs: 0, completeSnapshot: false, productsChecked: 0, positiveProducts: 0, negativeProducts: 0 };
  async function request(url, accept) {
    combined.throwIfAborted();
    if (accounting.requestCount >= budgets.maxRequests) throw malformed('request budget exceeded');
    const remainingMs = budgets.maxElapsedMs - (Date.now() - startedAt);
    if (remainingMs <= 0) throw new SourceTimeoutError(source.runtimeId, budgets.maxElapsedMs);
    accounting.requestCount += 1;
    const timeoutMs = Math.min(budgets.requestTimeoutMs, remainingMs);
    const requestController = new AbortController();
    const requestSignal = AbortSignal.any([combined, requestController.signal]);
    let requestTimer;
    let abortListener;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => fetchText(url, { signal: requestSignal, timeoutMs, maxBytes: budgets.maxBodyBytes, maxRedirects: 0, headers: { accept } })),
        new Promise((_, reject) => {
          abortListener = () => reject(requestSignal.reason || new SourceTimeoutError(source.runtimeId, timeoutMs));
          requestSignal.addEventListener('abort', abortListener, { once: true });
          requestTimer = setTimeout(() => requestController.abort(new SourceTimeoutError(source.runtimeId, timeoutMs)), timeoutMs);
        }),
      ]);
      combined.throwIfAborted();
      if (!result?.ok) {
        if (!Number(result?.status)) throw new TransientSourceError('Jensen source transport failed');
        const error = sourceErrorForHttp(result.status, `Jensen source HTTP ${result.status}`, { details: { retryAfterSeconds: Number(result.retryAfterSeconds) || 0 } });
        if ([401, 403, 429].includes(Number(result.status))) error.transient = false;
        throw error;
      }
      if (Number(result.status) !== 200 || result.url !== url || typeof result.text !== 'string') throw malformed('redirected or invalid source response');
      const bytes = Buffer.byteLength(result.text, 'utf8');
      accounting.bytes += bytes;
      if (bytes > budgets.maxBodyBytes || accounting.bytes > budgets.maxTotalBytes) throw malformed('response byte budget exceeded');
      return result.text;
    } finally {
      clearTimeout(requestTimer);
      if (abortListener) requestSignal.removeEventListener('abort', abortListener);
      requestController.abort();
    }
  }
  try {
    for (const seed of source.products) {
      const productUrl = `${source.baseUrl}/products/${seed.handle}`;
      const body = await request(`${productUrl}.json`, 'application/json');
      let payload;
      try { payload = JSON.parse(body); } catch { throw malformed('malformed product JSON'); }
      const { product, variant, sizeMl } = reviewedProduct(payload, seed);
      // A reviewed source identity maps its exact product/variant/title to the
      // existing canonical EC18 record. Generic fuzzy matching remains strict.
      const { match, record } = cityHiveSafeBottleMatch(seed.canonicalName, bible);
      if (!record || normalized(record.canonical) !== normalized(seed.canonicalName)
        || !Number.isFinite(match?.confidence) || match.confidence < 0.72) throw malformed('reviewed product no longer has an unambiguous canonical bottle');
      const pickupUrl = `${source.baseUrl}/variants/${seed.variantId}/?section_id=pickup-availability`;
      const available = pickupState(await request(pickupUrl, 'text/html'), product.title);
      accounting.productsChecked += 1;
      if (!available) { accounting.negativeProducts += 1; continue; }
      if (variant.available === false) throw malformed('pickup conflicts with explicit variant unavailability');
      // The single-product .json endpoint omits available. Set the format
      // parser's input only after exact variant pickup has positively proved it.
      const [row] = parseCaliforniaShopifyProducts({ products: [{ ...product, variants: [{ ...variant, available: true }] }] });
      if (!row || row.productId !== seed.productId || row.variantId !== seed.variantId || row.handle !== seed.handle) throw malformed('product format rejected');
      accounting.positiveProducts += 1;
      signals.push({
        id: stableId(['FL', source.id, source.store.id, seed.variantId]), state: 'FL', stateCode: 'FL',
        sourceLabel: source.sourceLabel, sourceUrl: productUrl, sourceChain: source.chain, sourceRuntimeId: source.runtimeId,
        merchantId: source.merchantId, productId: seed.productId, variantId: seed.variantId, sourceProductBinding: pickupUrl,
        rawName: row.title, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier,
        confidence: Math.min(0.92, Math.max(0.8, match.confidence)), eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
        locationName: source.store.name, storeName: source.store.name, storeId: source.store.id, storeAddress: source.store.address,
        city: source.store.city, postalCode: source.store.zip, zip: source.store.zip,
        quantity: 0, quantityIsExact: false, price: row.price, size: `${sizeMl} ml`,
        availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports pickup available; exact count not published',
        sourceAvailabilityVerified: true, pickupOfferVerified: true, premisesVerified: true, observedAt,
        canAlertAsInventory: true, canAlertAsWatch: true, inventorySemantics: 'binary_retailer_orderable_no_exact_count',
        evidence: `Jensen's Liquors reports pickup available for ${row.title} at ${source.store.address}. Exact shelf count is not published.`,
        caveat: 'Retailer-published pickup availability can change. Confirm before driving.',
        raw: { chain: source.chain, merchantId: source.merchantId, productId: seed.productId, variantId: seed.variantId,
          product: { id: seed.productId, handle: seed.handle }, variant: { id: seed.variantId, sku: row.sku, available: true },
          pickupVerified: true, pickupOfferVerified: true, premisesVerified: true, pickupAddress: source.store.address,
          variantPickupVerified: true, variantPickupUrl: pickupUrl, sizeMl, sizeMetadataVerified: true },
      });
    }
    accounting.completeSnapshot = true;
    accounting.elapsedMs = Date.now() - startedAt;
    return { signals, roadblocks: [], accounting, metadata: { completeSnapshot: true } };
  } catch (error) {
    accounting.elapsedMs = Date.now() - startedAt;
    if (!(error instanceof Error)) error = combined.aborted
      ? new SourceTimeoutError(source.runtimeId, budgets.maxElapsedMs)
      : new TransientSourceError('Jensen source transport failed');
    error.details = { ...(error.details || {}), accounting };
    throw error;
  } finally { clearTimeout(timer); controller.abort(); }
}
