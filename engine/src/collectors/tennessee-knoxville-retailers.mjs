import { stableId, stripHtml } from '../core/text.mjs';
import { isAllowedTennesseeBottleFormat, isTennesseeRetailerInventory } from '../tennessee-retailer-policy.mjs';
import { normalizeCityHivePremises } from './cityhive-surfaces.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { tennesseeStoresForSource } from './tennessee-retailer-surfaces.mjs';

export const KNOXVILLE_PRODUCT_PAGE_SOURCES = Object.freeze([
  {
    id: 'downtown-wine-knoxville',
    categoryUrl: 'https://www.dtwine.com/spirits/whiskey/bourbon/',
    additionalCategoryUrls: [
      'https://www.dtwine.com/spirits/whiskey/bourbon/page2.html',
      'https://www.dtwine.com/spirits/whiskey/bourbon/page3.html',
    ],
  },
  { id: 'galaxy-liquor-clinton', categoryUrl: 'https://galaxyliquor.com/portfolio?category=Bourbon' },
]);

const PRODUCT_REQUEST_LIMIT = 16;
const REQUEST_TIMEOUT_MS = 6_000;
const REQUEST_DELAY_MS = 600;
const IN_STOCK = 'https://schema.org/InStock';
const EXPRESSION_PRIORITY = /\b(?:barrel proof|single barrel|bottled in bond|cask strength|full proof|double oak(?:ed)?|special release|private selection)\b/i;
const REVIEWED_GALAXY_TITLES = new Map([
  ['upc_721059000222', {
    title: 'Wild Turkey Rare Breed Barrel Proof Kentucky Straight Bourbon Whiskey, 750 mL Bottle',
    canonical: 'Wild Turkey Rare Breed Straight Bourbon',
  }],
  ['upc_721059947503', {
    title: 'Wild Turkey Kentucky Spirit Single Barrel Kentucky Straight Bourbon Whiskey 750 mL',
    canonical: 'Wild Turkey Kentucky Spirit Single Barrel',
  }],
]);

function productUrl(value, store) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const path = store.platform === 'lightspeed' ? /^\/[a-z0-9-]+\.html$/i : /^\/portfolio\/[a-z0-9_]+$/i;
  return url.origin === `https://${store.hostname}` && !url.username && !url.password
    && !url.search && !url.hash && path.test(url.pathname);
}

function matchProductBottle(name, href, store, bible) {
  const reviewed = store.platform === 'galaxy' ? REVIEWED_GALAXY_TITLES.get(new URL(href).pathname.split('/').at(-1)) : null;
  const matched = cityHiveSafeBottleMatch(reviewed?.title === name ? reviewed.canonical : name, bible);
  return matched.record?.libraryAlertEligible === false ? { ...matched, record: null } : matched;
}

function catalogCandidates(html, categoryUrl, store, bible) {
  const candidates = new Map();
  for (const link of html.matchAll(/<a\b([^>]*\bhref="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!URL.canParse(link[2], categoryUrl)) continue;
    const href = new URL(link[2], categoryUrl).href;
    const name = store.platform === 'galaxy'
      ? link[3].match(/<article\b[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]
      : link[1].match(/\btitle="([^"]+)"/i)?.[1] || link[3];
    const label = stripHtml(name).replace(/&#x27;|&#039;/gi, "'");
    if (candidates.has(href) || !productUrl(href, store) || !isAllowedTennesseeBottleFormat(label)) continue;
    const { record } = matchProductBottle(label, href, store, bible);
    if (!record) continue;
    const priority = /^(?:unicorn|rare|allocated)$/i.test(record.tier) ? 2 : Number(EXPRESSION_PRIORITY.test(label));
    candidates.set(href, { href, priority });
  }
  return candidates;
}

function metaContent(html, property) {
  const content = html.match(new RegExp(`<meta\\s+itemprop="${property}"\\s+content="([^"]*)"`, 'i'))?.[1];
  return stripHtml(content).replace(/&#x27;|&#039;/gi, "'");
}

function downtownProduct(html, href) {
  if (!html.includes('https://cdn.shoplightspeed.com/shops/636686/')) return null;
  if (!/Downtown Wine \+ Spirits\s*-+\s*407 S\. Gay St\. Knoxville TN 37902/i.test(stripHtml(html))) return null;
  const offer = html.match(/<div\s+itemprop="offers"\s+itemscope\s+itemtype="https:\/\/schema\.org\/Offer">([\s\S]*?)<\/div>/i)?.[1] || '';
  const productId = html.match(/<form\s+action="https:\/\/www\.dtwine\.com\/cart\/add\/(\d+)\/"\s+id="product_configure_form"/i)?.[1];
  if (!productId || metaContent(offer, 'availability') !== IN_STOCK || metaContent(offer, 'url') !== href) return null;
  if (metaContent(offer, 'priceCurrency') !== 'USD') return null;
  return { productId, rawName: metaContent(html, 'name'), price: Number(metaContent(offer, 'price')), sourceUrl: href };
}

function galaxyProduct(html, href, store) {
  const sku = new URL(href).pathname.split('/').at(-1);
  for (const script of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let product;
    try { product = JSON.parse(script[1]); } catch { continue; }
    if (product?.['@type'] !== 'Product' || product.sku !== sku) continue;
    const offer = product.offers;
    const seller = offer?.seller;
    const address = seller?.address;
    const premises = [address?.streetAddress, address?.addressLocality, address?.addressRegion, address?.postalCode].join(' ');
    if (seller?.['@type'] !== 'LiquorStore' || seller.name !== store.name
      || normalizeCityHivePremises(premises) !== normalizeCityHivePremises(store.address)) return null;
    if (offer['@type'] !== 'Offer' || offer.availability !== IN_STOCK || offer.priceCurrency !== 'USD') return null;
    // The storefront composes its structured title from brand plus product title.
    const rawName = String(product.name || '').replace(/^(.{2,60}?)\s+\1(?=\s)/i, '$1');
    return { productId: sku, rawName, price: Number(offer.price), sourceUrl: href };
  }
  return null;
}

export function parseKnoxvilleProductEvidence(html, href, store) {
  if (!productUrl(href, store)) return null;
  return store.platform === 'lightspeed' ? downtownProduct(html, href) : galaxyProduct(html, href, store);
}

async function collectStore(source, bible, { fetchText, sleep, signal }) {
  const [store] = tennesseeStoresForSource(source.id);
  const signals = [];
  const roadblocks = [];
  const request = async (url, maxBytes) => {
    const response = await fetchText(url, { timeoutMs: REQUEST_TIMEOUT_MS, maxBytes, maxRedirects: 0, signal });
    if (response.ok && response.url === url) return response;
    roadblocks.push({
      state: 'TN', source: store.sourceLabel, url, status: response.status || 0,
      error: response.error || `Expected the reviewed storefront URL and a successful response, got HTTP ${response.status}.`,
    });
    return response.ok ? { ...response, ok: false } : response;
  };

  const candidates = new Map();
  for (const url of [source.categoryUrl, ...(source.additionalCategoryUrls || [])]) {
    if (url !== source.categoryUrl) await sleep(REQUEST_DELAY_MS, signal);
    const catalog = await request(url, 2 * 1024 * 1024);
    if ([403, 429].includes(catalog.status)) return { signals, roadblocks };
    if (!catalog.ok) continue;
    for (const [href, candidate] of catalogCandidates(catalog.text, url, store, bible)) candidates.set(href, candidate);
  }
  const selected = [...candidates.values()].sort((left, right) => right.priority - left.priority).slice(0, PRODUCT_REQUEST_LIMIT);
  for (const { href } of selected) {
    await sleep(REQUEST_DELAY_MS, signal);
    const detail = await request(href, 512 * 1024);
    if ([403, 429].includes(detail.status)) break;
    if (!detail.ok) continue;
    const product = parseKnoxvilleProductEvidence(detail.text, href, store);
    if (!product || !isAllowedTennesseeBottleFormat(product.rawName)) continue;
    const { record, match } = matchProductBottle(product.rawName, href, store, bible);
    if (!record || !Number.isFinite(product.price) || product.price <= 0) continue;
    const row = {
      ...product,
      id: stableId(['TN', store.storeId, product.productId]),
      state: 'TN', stateCode: 'TN', eventType: 'retailer_store_inventory_result',
      sourceLabel: store.sourceLabel, sourceChain: store.sourceId, merchantId: store.merchantId,
      storeId: store.storeId, storeName: store.name, locationName: store.name,
      storeAddress: store.address, city: store.city, postalCode: store.zip, zip: store.zip,
      locationPrecision: 'store_level', observedAt: new Date().toISOString(),
      canonicalBottleId: record.id, canonicalName: record.canonical, confidence: Math.max(0.8, match.confidence),
      quantity: 0, quantityIsExact: false, reportedQuantity: 1,
      availabilityStatus: 'binary_retailer_in_stock', availabilityLabel: 'In stock',
      inventorySemantics: 'binary_retailer_orderable_no_exact_count', sourceAvailabilityVerified: true,
      canAlertAsInventory: true, canAlertAsWatch: true,
      evidence: `${store.name} reports ${product.rawName} in stock at ${store.address}.`,
    };
    if (isTennesseeRetailerInventory(row)) signals.push(row);
  }
  if (!signals.length && !roadblocks.length) {
    roadblocks.push({
      state: 'TN', source: store.sourceLabel, url: source.categoryUrl, status: 'reachable_no_exact_store_orderability',
      error: 'No product page provided a safely matched in-stock offer for this exact store.',
    });
  }
  return { signals, roadblocks };
}

export async function collectKnoxvilleProductPageRetailers(bible, options) {
  const results = await Promise.all(KNOXVILLE_PRODUCT_PAGE_SOURCES.map((source) => collectStore(source, bible, options)));
  return { signals: results.flatMap((result) => result.signals), roadblocks: results.flatMap((result) => result.roadblocks) };
}
