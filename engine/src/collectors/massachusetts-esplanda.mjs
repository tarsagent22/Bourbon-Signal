import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_PAGE_BYTES = 2_000_000;

const sharedLarcenyIdentity = Object.freeze({
  productUuid: '6e487b00-125d-11ec-a49f-afb034be823e',
  productName: 'Larceny Batch A125 Barrel Proof',
  pageTitle: /Larceny Batch A125 Barrel Proof Bourbon 750 ML/i,
  bibleLookup: 'Larceny Barrel Proof',
  canonicalBottleId: 'bb_dec2c347ba378237',
  acceptedSkus: ['096749002658', '09674900265'],
  identityMethod: 'reviewed-batch-a125-product-uuid-and-cbc-upc',
});

export const MA_ESPLANDA_PRODUCTS = Object.freeze([
  Object.freeze({
    id: 'cbc-westford-larceny-a125', hostname: 'www.cbcliquors.com', storeId: 'ma:cbc-westford',
    storeName: 'CBC Liquors, Westford', address: '142 Littleton Rd, Westford, MA 01886, USA',
    city: 'Westford', county: 'Middlesex', zip: '01886', lat: 42.5692711, lng: -71.4184341,
    storeRef: 'https://www.cbcliquors.com/#store', productUrl: 'https://www.cbcliquors.com/product/batch-a125-barrel-proof-larceny/18744',
    requestUrl: 'https://www.cbcliquors.com/product/batch-a125-barrel-proof-larceny/18744?format=51634138',
    productId: '18744', formatId: '51634138', identity: sharedLarcenyIdentity,
  }),
  Object.freeze({
    id: 'wildduck-boston-larceny-a125', hostname: 'www.wildduckliquors.com', storeId: 'ma:wildduck-boston',
    storeName: 'The Wild Duck Liquor Store', address: '86 Massachusetts Ave, Boston, MA 02117, USA',
    city: 'Boston', county: 'Suffolk', zip: '02117', lat: 42.3487192, lng: -71.0882125,
    storeRef: 'https://www.wildduckliquors.com/#store', productUrl: 'https://www.wildduckliquors.com/product/batch-a125-barrel-proof-larceny/58473173',
    requestUrl: 'https://www.wildduckliquors.com/product/batch-a125-barrel-proof-larceny/58473173?format=59718141',
    productId: '58473173', formatId: '59718141', identity: sharedLarcenyIdentity,
  }),
  Object.freeze({
    id: 'wildduck-boston-eagle-rare-10', hostname: 'www.wildduckliquors.com', storeId: 'ma:wildduck-boston',
    storeName: 'The Wild Duck Liquor Store', address: '86 Massachusetts Ave, Boston, MA 02117, USA',
    city: 'Boston', county: 'Suffolk', zip: '02117', lat: 42.3487192, lng: -71.0882125,
    storeRef: 'https://www.wildduckliquors.com/#store', productUrl: 'https://www.wildduckliquors.com/product/10-year-bourbon-eagle-rare/58473338',
    requestUrl: 'https://www.wildduckliquors.com/product/10-year-bourbon-eagle-rare/58473338?format=59718348',
    productId: '58473338', formatId: '59718348',
    identity: Object.freeze({ productUuid: 'e04c2a2e-61b4-46e6-b413-6a672a0a674c',
      productName: 'Eagle Rare 10 Year Bourbon', pageTitle: /Eagle Rare 10 Year Bourbon 750 ML/i,
      bibleLookup: 'Eagle Rare 10 Year Bourbon', canonicalBottleId: 'bb_d0fe561ac45db2d5', identityMethod: 'exact-bible-name-and-store-product-id' }),
  }),
]);

const sourceById = new Map(MA_ESPLANDA_PRODUCTS.map(source => [source.id, source]));

function decodeHtml(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function metaValue(html, key) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)]
      .map(match => [match[1].toLowerCase(), decodeHtml(match[3])]));
    if (attrs.property === key || attrs.name === key) return attrs.content || '';
  }
  return '';
}

function schemaNodes(html) {
  const nodes = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!node || typeof node !== 'object') continue;
        nodes.push(node);
        if (Array.isArray(node['@graph'])) nodes.push(...node['@graph'].filter(value => value && typeof value === 'object'));
      }
    } catch { /* malformed or unrelated JSON-LD is ignored */ }
    if (nodes.length > 100) return [];
  }
  return nodes;
}

function hasType(node, type) {
  return Array.isArray(node?.['@type']) ? node['@type'].includes(type) : node?.['@type'] === type;
}

function offersFor(product) {
  return (Array.isArray(product?.offers) ? product.offers : [product?.offers]).filter(Boolean);
}

function exactRequestedUrl(value, source) {
  try {
    const url = new URL(value);
    return url.href === source.requestUrl && url.protocol === 'https:' && url.hostname === source.hostname
      && !url.port && !url.username && !url.password && !url.hash
      && url.pathname === new URL(source.productUrl).pathname
      && url.searchParams.size === 1 && url.searchParams.getAll('format').length === 1
      && url.searchParams.get('format') === source.formatId;
  } catch { return false; }
}

function exactStore(nodes, source) {
  const store = nodes.find(node => hasType(node, 'LiquorStore') && node['@id'] === source.storeRef);
  if (!store || store.name !== source.storeName) return false;
  const address = store.address || {};
  const geo = store.geo || {};
  if (address.streetAddress !== source.address.split(',')[0] || address.addressLocality !== source.city
    || address.addressRegion !== 'MA' || address.postalCode !== source.zip || address.addressCountry !== 'US') return false;
  if (Math.abs(Number(geo.latitude) - source.lat) > 0.00002 || Math.abs(Number(geo.longitude) - source.lng) > 0.00002) return false;
  return nodes.some(node => hasType(node, 'Service') && node.name === 'Store pickup'
    && node.provider?.['@id'] === source.storeRef && node.serviceType === 'Store pickup');
}

function identityFor(product, pageTitle, source, bible) {
  const identity = source.identity;
  if (product?.name !== identity.productName || product?.productID !== identity.productUuid || !identity.pageTitle.test(pageTitle)) return null;
  if (identity.acceptedSkus && !identity.acceptedSkus.includes(String(product.sku || ''))) return null;
  const match = bible?.match?.(identity.bibleLookup);
  if (!match?.record?.id || match.confidence !== 1 || match.record.id !== identity.canonicalBottleId) return null;
  return { record: match.record, method: identity.identityMethod };
}

export function parseMassachusettsEsplandaProduct(html, source, bible, { requestedUrl = source?.requestUrl, observedAt } = {}) {
  if (sourceById.get(source?.id) !== source || typeof html !== 'string' || Buffer.byteLength(html) > MAX_PAGE_BYTES
    || !Number.isFinite(Date.parse(observedAt || '')) || !exactRequestedUrl(requestedUrl, source)) return null;
  const nodes = schemaNodes(html);
  const product = nodes.find(node => hasType(node, 'Product'));
  if (!product) return null;
  const pageTitle = metaValue(html, 'og:title');
  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
  if (!pageTitle || decodeHtml(canonical) !== source.productUrl || metaValue(html, 'og:site_name') !== source.storeName
    || metaValue(html, 'product:availability').toLowerCase() !== 'in stock'
    || metaValue(html, 'og:url') !== source.productUrl || !exactStore(nodes, source)) return null;
  const price = Number(metaValue(html, 'product:price:amount'));
  if (!Number.isFinite(price) || price <= 0 || metaValue(html, 'product:price:currency') !== 'USD'
    || metaValue(html, 'product:retailer_item_id') !== source.identity.productUuid) return null;
  const offer = offersFor(product).find(value => value?.url === requestedUrl && value.availableAtOrFrom?.['@id'] === source.storeRef);
  if (!offer || offer.availability !== 'https://schema.org/InStock' || offer.priceCurrency !== 'USD'
    || Number(offer.price) !== price || offer.sku !== product.sku) return null;
  const matched = identityFor(product, pageTitle, source, bible);
  if (!matched) return null;
  const id = createHash('sha256').update(`MA|${source.storeId}|${source.productId}|${source.formatId}|${matched.record.id}`).digest('hex').slice(0, 24);
  return {
    id, state: 'MA', sourceLabel: `${source.storeName} public pickup inventory`, sourceUrl: requestedUrl,
    sourceRuntimeId: `precision:ma:esplanda:${source.id}`, sourceChain: 'massachusetts-esplanda',
    productId: source.productId, variantId: source.formatId, merchantId: source.storeRef,
    rawName: pageTitle.replace(/\s*\|\s*[^|]+$/, ''), canonicalName: matched.record.canonical,
    canonicalBottleId: matched.record.id, confidence: 1, eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level', storeId: source.storeId, storeName: source.storeName,
    storeAddress: source.address, city: source.city, county: source.county, lat: source.lat, lng: source.lng,
    observedAt, signalAt: observedAt, stale: false, sourceStale: false,
    price, quantity: 0, quantityIsExact: false, sourceAvailabilityVerified: true,
    availabilityStatus: 'orderable', availabilityLabel: 'Retailer reports the item in stock and offers store pickup; no exact shelf count is published.',
    inventorySemantics: 'binary_retailer_orderable_no_exact_count', canAlertAsInventory: true,
    canAlertAsWatch: false, alertable: false, eligibleForOnSite: false, eligibleForDelivery: false,
    eligibleForEmail: false, eligibleForSms: false,
    evidence: 'First-party product offer reports InStock, links to this exact LiquorStore, and the same page publishes an in-store pickup service. This is a binary retailer orderability signal, not an exact quantity.',
    raw: { shadowOnly: true, premisesVerified: true, pickupOfferVerified: true, esplandaSourceId: source.id,
      sourceMatchStatus: matched.method, productUuid: product.productID, sku: String(product.sku || ''),
      sourceHostname: source.hostname, storeRef: source.storeRef },
  };
}

export async function collectMassachusettsEsplanda(config, bible, {
  fetchImpl = fetch, shadowMode = process.env.BOURBON_SIGNAL_SHADOW_MODE === '1',
  now = () => new Date().toISOString(), signal,
  reportDirectory = path.resolve('out/research-plains-retail/MA-esplanda'),
} = {}) {
  if (config?.id !== 'MA' || !shadowMode) return { signals: [], sourceReports: [], sourceResults: [], roadblocks: [] };
  const signals = [];
  const sourceReports = [];
  const sourceResults = [];
  const roadblocks = [];
  const deniedHosts = new Set();
  for (const source of MA_ESPLANDA_PRODUCTS) {
    const sourceRuntimeId = `precision:ma:esplanda:${source.id}`;
    if (deniedHosts.has(source.hostname)) {
      const error = 'skipped_after_host_denial';
      sourceReports.push({ sourceRuntimeId, label: `${source.storeName} public pickup inventory`, url: source.requestUrl,
        ok: false, status: 'skipped', signalType: 'retailer_store_inventory_result', matchedBottleCount: 0, locationPrecision: 'store_level', error });
      sourceResults.push({ sourceId: sourceRuntimeId, sourceLabel: source.storeName, sourceUrl: source.requestUrl,
        ok: false, status: 'skipped', checkedAt: null, lastGoodAt: null, alertable: false, inventoryAlertable: false, watchAlertable: false });
      continue;
    }
    const startedAt = now();
    let status = 0, error = null, observedAt = null, body = Buffer.alloc(0), finalUrl = source.requestUrl, contentType = '';
    try {
      const timeout = AbortSignal.timeout(30_000);
      const response = await fetchImpl(source.requestUrl, { method: 'GET', redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      status = response.status;
      finalUrl = response.url || source.requestUrl;
      contentType = response.headers?.get('content-type') || '';
      if (status === 403 || status === 429) deniedHosts.add(source.hostname);
      if (status !== 200) { await response.body?.cancel(); throw new Error(`source_http_${status}`); }
      if (finalUrl !== source.requestUrl || !/^text\/html(?:\s*;|$)/i.test(contentType)) throw new Error('source_page_binding_failed');
      const responseDate = response.headers?.get('date');
      const parsedDate = Date.parse(responseDate || '');
      if (!Number.isFinite(parsedDate)) throw new Error('missing_source_date');
      observedAt = new Date(parsedDate).toISOString();
      if (!response.body) throw new Error('missing_body');
      const chunks = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > MAX_PAGE_BYTES) throw new Error('source_size_limit');
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
      if (!parseMassachusettsEsplandaProduct(body.toString('utf8'), source, bible, { requestedUrl: source.requestUrl, observedAt })) {
        throw new Error('untrusted_product_or_store_binding');
      }
    } catch (failure) {
      if (Number.isInteger(Number(failure?.status))) status = Number(failure.status);
      error = /^(source_http_\d{3}|source_page_binding_failed|missing_source_date|missing_body|source_size_limit|untrusted_product_or_store_binding)$/.test(failure.message)
        ? failure.message : 'public_source_request_or_parse_failed';
      roadblocks.push({ state: 'MA', source: source.storeName, sourceRuntimeId, url: source.requestUrl,
        status, error, nextRoute: 'Preserve the source failure; do not retry a denial or infer availability.' });
    }
    const digest = body.length ? createHash('sha256').update(body).digest('hex') : null;
    let artifactPath = null;
    if (body.length && body.length <= MAX_PAGE_BYTES) {
      artifactPath = `source-captures/${source.id}-${digest.slice(0, 12)}.html`;
      await mkdir(path.join(reportDirectory, 'source-captures'), { recursive: true });
      await writeFile(path.join(reportDirectory, artifactPath), body);
    }
    if (!error && observedAt) {
      const row = parseMassachusettsEsplandaProduct(body.toString('utf8'), source, bible, { requestedUrl: source.requestUrl, observedAt });
      if (row) signals.push(row);
      else error = 'untrusted_product_or_store_binding';
    }
    sourceReports.push({ sourceRuntimeId, label: `${source.storeName} public pickup inventory`, url: source.requestUrl,
      ok: !error, status, contentType, signalType: 'retailer_store_inventory_result',
      matchedBottleCount: error ? 0 : 1, locationPrecision: 'store_level', error,
      receipt: { requestedUrl: source.requestUrl, finalUrl, status, contentType, bytes: body.length, sha256: digest, observedAt, artifactPath } });
    sourceResults.push({ sourceId: sourceRuntimeId, sourceLabel: `${source.storeName} public pickup inventory`,
      sourceUrl: source.requestUrl, ok: !error, status: error ? 'failed' : 'success', checkedAt: observedAt || startedAt,
      lastGoodAt: error ? null : observedAt, alertable: false, inventoryAlertable: false, watchAlertable: false });
  }
  return { signals, sourceReports, sourceResults, roadblocks };
}
