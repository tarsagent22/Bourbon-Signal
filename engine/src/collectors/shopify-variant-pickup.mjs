import { createHash } from 'node:crypto';
import { fetchWithMeta } from '../core/fetcher.mjs';
import { stableId, stripHtml } from '../core/text.mjs';
import { cityHiveSafeBottleMatch, cityHiveUnsafeBottleMatchReason } from './safe-bottle-match.mjs';
import { parseCaliforniaShopifyProducts } from './california-san-diego-surfaces.mjs';
import { MalformedSourceError, SourceTimeoutError, TransientSourceError, sourceErrorForHttp } from '../sources/source-error.mjs';

export const SHOPIFY_VARIANT_PICKUP_VERSION = 'shopify-variant-pickup-v1';
export const SHOPIFY_VARIANT_PICKUP_BUDGETS = Object.freeze({ maxProducts: 2, maxStores: 5, maxRequests: 6, maxElapsedMs: 50_000, requestTimeoutMs: 12_000, maxBodyBytes: 2 * 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024 });
const malformed = message => new MalformedSourceError(`Shopify variant pickup: ${message}`);
const plain = value => stripHtml(value).replace(/&#0*39;|&apos;|[’‘]/gu, "'");
const normalized = value => plain(value).toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
const premises = value => normalized(value).replace(/\bunited states(?: of america)?\b/gu, '').replace(/\s+/gu, ' ').trim();
const sha256 = text => createHash('sha256').update(text).digest('hex');
const textField = value => typeof value === 'string' && value.trim() && value.length <= 500;
const numericId = value => typeof value === 'string' && /^[1-9]\d{0,19}$/u.test(value);
const slug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
const deepFreeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; };

function urls(source, seed) {
  return { productUrl: `${source.baseUrl}/products/${seed.handle}.json`, pickupUrl: `${source.baseUrl}/variants/${seed.variantId}/?section_id=${source.sectionId}` };
}

/** Validates reviewed configuration without network, disk, database, or activation. */
export function validateShopifyVariantSource(input) {
  let source;
  try { source = JSON.parse(JSON.stringify(input)); } catch { throw malformed('configuration must be JSON'); }
  if (!source || !slug(source.id) || !/^[A-Z]{2}$/u.test(source.state || '')
    || ![source.runtimeId, source.chain, source.merchantId, source.sourceLabel].every(textField)) throw malformed('source identity missing');
  let base;
  try { base = new URL(source.baseUrl); } catch { throw malformed('invalid base URL'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.port || base.search || base.hash
    || base.pathname !== '/' || source.baseUrl !== base.origin || !base.hostname.includes('.')
    || /^(?:\d+\.){3}\d+$/u.test(base.hostname) || base.hostname.endsWith('.local')) throw malformed('base must be an exact public HTTPS origin');
  if (!['pickup-availability', 'store-availability'].includes(source.sectionId)) throw malformed('unreviewed section ID');
  source.headingIdentity ??= 'product_title';
  if (!['product_title', 'variant_title'].includes(source.headingIdentity)) throw malformed('unsupported heading identity');
  if (!Array.isArray(source.stores) || !source.stores.length || source.stores.length > SHOPIFY_VARIANT_PICKUP_BUDGETS.maxStores) throw malformed('premises budget');
  const storeIds = new Set(), addresses = new Set();
  for (const store of source.stores) {
    if (![store.id, store.name, store.pickupName, store.address, store.city].every(textField)
      || !/^\d{5}$/u.test(store.zip || '') || !premises(store.address).includes(normalized(`${source.state} ${store.zip}`))) throw malformed('exact premises identity missing');
    if (storeIds.has(store.id) || addresses.has(premises(store.address))) throw malformed('duplicate premises');
    storeIds.add(store.id); addresses.add(premises(store.address));
  }
  if (!Array.isArray(source.products) || !source.products.length || source.products.length > SHOPIFY_VARIANT_PICKUP_BUDGETS.maxProducts) throw malformed('reviewed product budget');
  const variants = new Set();
  for (const seed of source.products) {
    if (!numericId(seed.productId) || !numericId(seed.variantId) || !slug(seed.handle)
      || ![seed.title, seed.canonicalName].every(textField) || variants.has(seed.variantId)) throw malformed('reviewed product identity missing or duplicate');
    variants.add(seed.variantId);
    const expected = urls(source, seed);
    for (const [kind, url] of [['product', expected.productUrl], ['pickup', expected.pickupUrl]]) {
      const evidence = seed.evidence?.[kind];
      if (evidence?.url !== url || !/^[a-f0-9]{64}$/u.test(evidence?.sha256 || '')
        || !Number.isFinite(Date.parse(evidence?.capturedAt)) || evidence?.status !== 200) throw malformed(`reviewed ${kind} capture URL/hash/clock missing`);
    }
    if (source.headingIdentity === 'variant_title' && (!textField(seed.variantTitle) || !textField(seed.headingException))) throw malformed('variant heading needs reviewed title and exception');
    if (seed.titleMapping && (seed.titleMapping.rawTitle !== seed.title || seed.titleMapping.canonicalName !== seed.canonicalName
      || !textField(seed.titleMapping.reason) || !Array.isArray(seed.titleMapping.allowedUnsafeReasons)
      || seed.titleMapping.allowedUnsafeReasons.some(reason => reason !== 'wheated_matched_non_wheated'))) throw malformed('reviewed title mapping is not narrowly bound');
  }
  // Operators may lower bounds for dry runs; configurations cannot raise them.
  source.budgets = { ...SHOPIFY_VARIANT_PICKUP_BUDGETS, ...(source.budgets || {}) };
  for (const [key, ceiling] of Object.entries(SHOPIFY_VARIANT_PICKUP_BUDGETS)) {
    if (!Number.isInteger(source.budgets[key]) || source.budgets[key] < 1 || source.budgets[key] > ceiling) throw malformed(`invalid ${key} bound`);
  }
  if (source.products.length > source.budgets.maxProducts || source.stores.length > source.budgets.maxStores
    || source.products.length * 2 > source.budgets.maxRequests) throw malformed('configuration exceeds request/product/store bounds');
  return deepFreeze(source);
}

/** Pure onboarding plan; supplied code hash must be computed from the reviewed file. */
export function describeShopifyVariantSource(input, { collectorSha256 } = {}) {
  const source = validateShopifyVariantSource(input);
  if (!/^[a-f0-9]{64}$/u.test(collectorSha256 || '')) throw malformed('reviewed collector code SHA-256 required');
  return { scope: 'preparation_only_no_activation', collectorVersion: SHOPIFY_VARIANT_PICKUP_VERSION, collectorSha256,
    configSha256: sha256(JSON.stringify(source)), source, reuseFamily: source.sectionId === 'pickup-availability' ? 'shopify-dawn-pickup' : 'shopify-store-availability',
    exceptions: source.products.flatMap(seed => [source.headingIdentity === 'variant_title' ? seed.headingException : null, seed.titleMapping?.reason].filter(Boolean)),
    plannedRequests: source.products.flatMap(seed => Object.values(urls(source, seed))), requestCount: source.products.length * 2, budgets: source.budgets };
}

function productMetadata(payload, seed) {
  const product = payload?.product;
  if (!product || String(product.id) !== seed.productId || product.handle !== seed.handle
    || normalized(product.title) !== normalized(seed.title) || !Array.isArray(product.variants)) throw malformed('reviewed product changed');
  const variants = product.variants.filter(variant => String(variant?.id) === seed.variantId);
  if (variants.length !== 1 || String(variants[0].product_id) !== seed.productId) throw malformed('variant/product binding missing or ambiguous');
  const variant = variants[0];
  if (seed.variantTitle && normalized(seed.variantTitle) !== normalized(variant.title)) throw malformed('reviewed variant title changed');
  const text = plain([product.title, variant.title, variant.option1, variant.option2, variant.option3, product.body_html].filter(Boolean).join(' '));
  const sizes = [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|fl\.?\s*oz)\b/giu)]
    .map(match => Number(match[1]) * (/^ml|^mill/i.test(match[2]) ? 1 : /^l/i.test(match[2]) ? 1000 : 29.5735));
  if (!sizes.length || sizes.some(size => !Number.isFinite(size) || size <= 375 || size > 1750)
    || new Set(sizes.map(Math.round)).size !== 1) throw malformed('missing, ambiguous, or excluded bottle volume');
  const price = Number(variant.price);
  if (!Number.isFinite(price) || price <= 0 || (variant.available !== undefined && typeof variant.available !== 'boolean')) throw malformed('invalid sellable price or availability');
  // Reuse the existing bourbon and unsafe package-format gate. This synthetic
  // flag is format validation only; it never establishes current availability.
  if (parseCaliforniaShopifyProducts({ products: [{ ...product, variants: [{ ...variant, available: true }] }] }).length !== 1) throw malformed('unsafe product/package format');
  return { product, variant, price, sizeMl: sizes[0] };
}

// Balanced div extraction handles nested Shopify tooltips without flattening
// outer preview rows into their independently addressed premises rows.
function divs(html) {
  const stack = [], result = [];
  for (const token of html.matchAll(/<\/?div\b[^>]*>/giu)) {
    if (/^<\/div/iu.test(token[0])) {
      const start = stack.pop();
      if (!start) throw malformed('unbalanced theme markup');
      result.push({ attributes: start.tag, body: html.slice(start.end, token.index) });
    } else stack.push({ tag: token[0], end: token.index + token[0].length });
  }
  if (stack.length) throw malformed('truncated theme markup');
  return result;
}

function pickupRows(rawHtml, source, seed, variant) {
  const html = rawHtml.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/giu, ' ');
  // Templates and hidden/inert text are not visible retailer status evidence.
  // SVG icons commonly have aria-hidden and do not supply text identity/status.
  for (const tag of html.matchAll(/<([a-z][\w-]*)\b[^>]*>/giu)) {
    if (['svg', 'path', 'use', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g'].includes(tag[1].toLowerCase())) continue;
    if (tag[1].toLowerCase() === 'template' || /\s(?:hidden|inert)(?:\s|=|>)/iu.test(tag[0])
      || /\saria-hidden\s*=\s*["']?true\b/iu.test(tag[0])
      || /\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(tag[0])) throw malformed('hidden, inert, or template pickup evidence');
  }
  if (!new RegExp(`id=["']shopify-section-${source.sectionId}["']`, 'iu').test(html)) throw malformed('section identity missing');
  let blocks, heading;
  if (source.sectionId === 'pickup-availability') {
    heading = html.match(/<h2\b[^>]*id=["']PickupAvailabilityHeading["'][^>]*>([\s\S]*?)<\/h2>/iu)?.[1];
    blocks = [...html.matchAll(/<li\b[^>]*class=["'][^"']*\bpickup-availability-list__item\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/giu)].map(match => match[1]);
  } else {
    heading = html.match(/<div\b[^>]*\bdata-availability-product-title(?:=["'][^"']*["'])?[^>]*>([\s\S]*?)<\/div>/iu)?.[1];
    if (source.headingIdentity === 'variant_title' && !normalized(heading)) heading = html.match(/<small\b[^>]*>([\s\S]*?)<\/small>/iu)?.[1];
    blocks = divs(html).filter(div => /class=["'][^"']*\bstore-availability__info\b[^"']*["']/iu.test(div.attributes)
      && !/class=["'][^"']*\bstore-availability__info\b/iu.test(div.body)
      && (/<p\b[^>]*>[\s\S]*?\b[A-Z]{2}\s+\d{5}\b/iu.test(div.body)
        || /<p\b[^>]*>\s*Pickup\s+(?:available|unavailable|not available)\b/iu.test(div.body))).map(div => div.body);
  }
  const expectedHeading = source.headingIdentity === 'variant_title' ? variant.title : seed.title;
  if (!normalized(heading) || normalized(heading) !== normalized(expectedHeading)) throw malformed('pickup heading identity missing or changed');
  if (source.headingIdentity === 'variant_title' && !/\b\d+(?:\.\d+)?\s*(?:ml|l)\b/iu.test(plain(heading))) throw malformed('variant heading lacks explicit volume');
  if (!blocks.length) throw malformed('pickup premises rows missing');
  const found = new Set(), rows = [];
  for (const block of blocks) {
    const name = block.match(source.sectionId === 'pickup-availability' ? /<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/iu : /<strong\b[^>]*>([\s\S]*?)<\/strong>/iu)?.[1];
    const addressContainer = source.sectionId === 'pickup-availability' ? block.match(/<address\b[^>]*>([\s\S]*?)<\/address>/iu)?.[1] : block;
    const paragraphs = [...String(addressContainer || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)].map(match => match[1]);
    const addresses = paragraphs.filter(value => /\b[A-Z]{2}\s+\d{5}\b/iu.test(plain(value)));
    if (addresses.length !== 1) throw malformed('exact address missing or ambiguous');
    const store = source.stores.find(item => normalized(item.pickupName) === normalized(name) && premises(item.address) === premises(addresses[0]));
    if (!store || found.has(store.id)) throw malformed('unknown or duplicate pickup premises');
    found.add(store.id);
    const statusMarkup = source.sectionId === 'pickup-availability' ? block.replace(/<address\b[\s\S]*?<\/address>/giu, ' ') : block.replace(addresses[0], ' ');
    const statusParagraphs = [...statusMarkup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)].map(match => plain(match[1])).filter(text => /\bpickup\b/iu.test(text));
    if (statusParagraphs.length !== 1) throw malformed('missing or ambiguous pickup status paragraph');
    const statusText = statusParagraphs[0];
    const positive = /\bpickup\s+available\b/iu.test(statusText), negative = /\bpickup\s+(?:currently\s+)?(?:unavailable|not available)\b/iu.test(statusText);
    if (positive === negative) throw malformed('missing or conflicting pickup status');
    rows.push({ store, available: positive });
  }
  if (found.size !== source.stores.length) throw malformed('partial premises response');
  return rows;
}

/** Pure bounded collection. No retries, catalog pulls, persistence, or sends.
 * @param {any} bible Canonical Bottle Bible matcher.
 * @param {any} input Reviewed JSON source configuration.
 * @param {{ observedAt?: string, signal?: AbortSignal, fetchText?: (url: string, options: any) => Promise<any> }} [options]
 */
export async function collectShopifyVariantPickup(bible, input, { observedAt, signal, fetchText = fetchWithMeta } = {}) {
  const source = validateShopifyVariantSource(input), budgets = source.budgets;
  if ((observedAt !== undefined && !Number.isFinite(Date.parse(observedAt))) || typeof bible?.match !== 'function' || typeof fetchText !== 'function') throw malformed('invalid clock, matcher, or transport');
  const startedAt = Date.now(), controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new SourceTimeoutError(source.runtimeId, budgets.maxElapsedMs)), budgets.maxElapsedMs);
  const accounting = { requestCount: 0, bytes: 0, elapsedMs: 0, completeSnapshot: false, productsChecked: 0, positiveProducts: 0, negativeProducts: 0, premisesChecked: 0 };
  const signals = [], observations = [], receipts = [];
  async function request(url, accept) {
    combined.throwIfAborted();
    const remaining = budgets.maxElapsedMs - (Date.now() - startedAt);
    if (remaining <= 0) throw new SourceTimeoutError(source.runtimeId, budgets.maxElapsedMs);
    const maxBytes = Math.min(budgets.maxBodyBytes, budgets.maxTotalBytes - accounting.bytes);
    if (maxBytes <= 0) throw malformed('response byte budget exhausted');
    if (accounting.requestCount >= budgets.maxRequests) throw malformed('request budget exceeded');
    accounting.requestCount++;
    const requestController = new AbortController(), requestSignal = AbortSignal.any([combined, requestController.signal]);
    const timeoutMs = Math.min(remaining, budgets.requestTimeoutMs);
    let timeout, abortListener;
    try {
      const response = await Promise.race([Promise.resolve().then(() => fetchText(url, { signal: requestSignal, timeoutMs, maxBytes, maxRedirects: 0, headers: { accept } })),
        new Promise((_, reject) => { abortListener = () => reject(requestSignal.reason); requestSignal.addEventListener('abort', abortListener, { once: true }); timeout = setTimeout(() => requestController.abort(new SourceTimeoutError(source.runtimeId, timeoutMs)), timeoutMs); })]);
      combined.throwIfAborted();
      const bytes = typeof response?.text === 'string' ? Buffer.byteLength(response.text, 'utf8') : 0;
      accounting.bytes += bytes;
      if (bytes > maxBytes || accounting.bytes > budgets.maxTotalBytes) throw malformed('response byte budget exceeded');
      if (!response?.ok) {
        if (!Number(response?.status)) throw new TransientSourceError('Shopify transport failed');
        const retryAfterSeconds = Math.max(0, Number(response.retryAfterSeconds) || 0);
        const error = sourceErrorForHttp(response.status, `Shopify HTTP ${response.status}`, { details: { retryAfterSeconds } });
        if ([401, 403, 429].includes(Number(response.status))) error.transient = false;
        throw error;
      }
      if (Number(response.status) !== 200 || response.url !== url || typeof response.text !== 'string') throw malformed('redirect or invalid response');
      receipts.push({ url, status: 200, bytes, sha256: sha256(response.text), observedAt: new Date().toISOString() });
      return response.text;
    } finally { clearTimeout(timeout); if (abortListener) requestSignal.removeEventListener('abort', abortListener); requestController.abort(); }
  }
  try {
    for (const seed of source.products) {
      const { productUrl, pickupUrl } = urls(source, seed);
      let payload;
      try { payload = JSON.parse(await request(productUrl, 'application/json')); } catch (error) { if (error instanceof SyntaxError) throw malformed('malformed product JSON'); throw error; }
      const { variant, price, sizeMl } = productMetadata(payload, seed);
      const { match, record } = cityHiveSafeBottleMatch(seed.canonicalName, bible);
      if (!record || normalized(record.canonical) !== normalized(seed.canonicalName) || !Number.isFinite(match?.confidence) || match.confidence < 0.72) throw malformed('reviewed canonical mapping rejected');
      const rawMatch = bible.match(seed.title), rawSafe = cityHiveSafeBottleMatch(seed.title, bible);
      if (rawMatch?.record && rawMatch.record.id !== record.id) throw malformed('raw product resolves to a different canonical bottle');
      if (!rawSafe.record || rawSafe.record.id !== record.id) {
        const mapping = seed.titleMapping;
        const identityWords = value => normalized(plain(value).replace(/['’‘]/gu, '')).split(' ').filter(Boolean);
        const rawWords = new Set(identityWords(seed.title)), canonicalWords = identityWords(record.canonical);
        const unsafe = cityHiveUnsafeBottleMatchReason(seed.title, record);
        if (!mapping || !canonicalWords.every(word => rawWords.has(word))
          || (unsafe && !mapping.allowedUnsafeReasons.includes(unsafe))) throw malformed('raw title lacks independent canonical compatibility or reviewed mapping');
      }
      const rows = pickupRows(await request(pickupUrl, 'text/html'), source, seed, variant);
      const clock = observedAt || new Date().toISOString();
      accounting.productsChecked++;
      if (rows.some(row => row.available)) accounting.positiveProducts++; else accounting.negativeProducts++;
      for (const { store, available } of rows) {
        if (available && variant.available === false) throw malformed('explicit variant unavailability conflicts with pickup');
        accounting.premisesChecked++;
        observations.push({ storeId: store.id, productId: seed.productId, variantId: seed.variantId, availabilityStatus: available ? 'in_stock' : 'out_of_stock', observedAt: clock, sourceProductBinding: pickupUrl });
        if (!available) continue;
        signals.push({ id: stableId([source.state, source.id, store.id, seed.variantId]), state: source.state, stateCode: source.state,
          sourceLabel: source.sourceLabel, sourceUrl: productUrl.replace(/\.json$/u, ''), sourceChain: source.chain, sourceRuntimeId: source.runtimeId,
          merchantId: source.merchantId, productId: seed.productId, variantId: seed.variantId, sourceProductBinding: pickupUrl,
          rawName: seed.title, canonicalBottleId: record.id, canonicalName: record.canonical, tier: record.tier, confidence: Math.min(0.92, Math.max(0.8, match.confidence)),
          eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level', storeId: store.id, storeName: store.name, locationName: store.name,
          storeAddress: store.address, city: store.city, zip: store.zip, postalCode: store.zip, price, size: `${sizeMl} ml`, quantity: 0, quantityIsExact: false,
          availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports pickup available; exact count not published', sourceAvailabilityVerified: true,
          pickupOfferVerified: true, premisesVerified: true, observedAt: clock, canAlertAsInventory: true, canAlertAsWatch: true,
          inventorySemantics: 'binary_retailer_orderable_no_exact_count', evidence: `${source.sourceLabel} reports pickup available for ${seed.title} at ${store.address}. Exact shelf count is not published.`,
          caveat: 'Retailer-published pickup availability can change. Confirm before driving.',
          raw: { chain: source.chain, merchantId: source.merchantId, productId: seed.productId, variantId: seed.variantId,
            product: { id: seed.productId, handle: seed.handle }, variant: { id: seed.variantId, sku: variant.sku, available: true },
            pickupVerified: true, pickupOfferVerified: true, premisesVerified: true, pickupAddress: store.address, variantPickupVerified: true,
            variantPickupUrl: pickupUrl, sizeMl, sizeMetadataVerified: true, collectorVersion: SHOPIFY_VARIANT_PICKUP_VERSION } });
      }
    }
    accounting.completeSnapshot = true; accounting.elapsedMs = Date.now() - startedAt;
    return { signals, observations, roadblocks: [], accounting, metadata: { completeSnapshot: true, collectorVersion: SHOPIFY_VARIANT_PICKUP_VERSION, configSha256: sha256(JSON.stringify(source)), receipts } };
  } catch (error) {
    accounting.elapsedMs = Date.now() - startedAt;
    if (!(error instanceof Error)) error = new TransientSourceError('Shopify transport failed');
    error.details = { ...(error.details || {}), accounting, receipts };
    throw error;
  } finally { clearTimeout(timer); controller.abort(); }
}
