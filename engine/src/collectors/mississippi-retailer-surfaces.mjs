import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { parseCityHiveProducts, normalizeCityHivePremises } from './cityhive-surfaces.mjs';
import { parseGoToLiquorStoreProducts } from './gotoliquorstore-surfaces.mjs';

const REGISTRY = JSON.parse(readFileSync(new URL('../../data/mississippi-retailer-registry.json', import.meta.url), 'utf8'));

export const MISSISSIPPI_RETAILER_SOURCES = Object.freeze(REGISTRY.stores.map((store) => Object.freeze({
  ...store,
  state: 'MS',
  stateCode: 'MS',
})));

const BOURBON_RE = /\b(?:bourbon|kentucky straight|american whiskey|blanton|buffalo trace|eagle rare|e\.?\s*h\.?\s*taylor|colonel taylor|weller|stagg|booker|baker|1792|maker'?s mark|old forester|woodford|four roses|knob creek|elijah craig|michter|willett|wild turkey|rare breed|larceny|heaven hill|henry mckenna|old fitzgerald|new riff|bardstown|green river|yellowstone|penelope|peerless|angel'?s envy|basil hayden|jefferson'?s|very olde st\.? nick)\b/iu;
const UNSAFE_RE = /\b(?:gift\s*(?:set|box|pack)|bundle|sampler|miniatures?|multipack|multi[\s-]*pack|variety\s*pack|case\s+of\s+\d+|pack\s+of\s+\d+|\d+\s*(?:pk|pack|bottles?)|\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:ml|l)|candle|tumbler|glassware|barware|coaster|ornament|figurine|flask|shirt|hoodie|hat|gift\s*card|accessor(?:y|ies)|cocktail|ready\s*to\s*drink|rtd|liqueur|cordial|cream|flavou?red|wine|cabernet|zinfandel|chardonnay|merlot|sauvignon|pinot|egg\s*nog|eggnog|coffee|mint\s*julep|single\s+malt|straight\s+malt|straight\s+wheat|wheat\s+whiskey|apple|peach|honey|cinnamon|peanut\s*butter|chocolate|vanilla)\b/iu;

export function isAllowedMississippiBottleFormat(value) {
  const text = String(value || '').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (!text || !BOURBON_RE.test(text) || UNSAFE_RE.test(text)) return false;
  if (/\brye\b/iu.test(text) && !/\bbourbon\b/iu.test(text)) return false;
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/giu)) {
    const milliliters = Number(match[1]) * (match[2].toLowerCase() === 'l' ? 1_000 : 1);
    if (!Number.isFinite(milliliters) || milliliters <= 375) return false;
  }
  return true;
}

const MISSISSIPPI_BOTTLE_BRANDS = Object.freeze([
  ['angels_envy', /\bangels envy\b/u],
  ['very_olde_st_nick', /\bvery olde st nick\b/u],
  ['rare_perfection', /\brare perfection\b/u],
  ['buffalo_trace', /\bbuffalo trace\b/u],
  ['e_h_taylor', /\b(?:e h|colonel) taylor\b/u],
  ['old_fitzgerald', /\bold fitzgerald\b/u],
  ['old_forester', /\bold forester\b/u],
  ['old_grand_dad', /\bold grand dad\b/u],
  ['old_soul', /\bold soul\b/u],
  ['four_gate', /\bfour gate\b/u],
  ['four_roses', /\bfour roses\b/u],
  ['wild_turkey', /\b(?:wild turkey|rare breed)\b/u],
  ['makers_mark', /\bmakers mark\b/u],
  ['bardstown', /\bbardstown\b/u],
  ['barrell', /\bbarrell\b/u],
  ['blade_and_bow', /\bblade and bow\b/u],
  ['bulleit', /\bbulleit\b/u],
  ['penelope', /\bpenelope\b/u],
  ['whistlepig', /\bwhistle ?pig\b/u],
  ['woodford_reserve', /\bwoodford reserve\b/u],
  ['green_river', /\bgreen river\b/u],
  ['michters', /\bmichters\b/u],
  ['rabbit_hole', /\brabbit hole\b/u],
  ['evan_williams', /\bevan williams\b/u],
  ['elijah_craig', /\belijah craig\b/u],
  ['henry_mckenna', /\bhenry mckenna\b/u],
  ['heaven_hill', /\bheaven hill\b/u],
  ['knob_creek', /\bknob creek\b/u],
  ['basil_hayden', /\bbasil hayden\b/u],
  ['garrison_brothers', /\bgarrison brothers\b/u],
  ['russells_reserve', /\brussells reserve\b/u],
  ['jim_beam', /\bjim beam\b/u],
  ['yellowstone', /\byellowstone\b/u],
  ['wilderness_trail', /\bwilderness trail\b/u],
  ['blanton', /\bblantons?\b/u],
  ['eagle_rare', /\beagle rare\b/u],
  ['weller', /\bweller\b/u],
  ['stagg', /\bstagg\b/u],
  ['booker', /\bbookers?\b/u],
  ['baker', /\bbakers?\b/u],
  ['willett', /\bwillett\b/u],
  ['larceny', /\blarceny\b/u],
  ['new_riff', /\bnew riff\b/u],
  ['peerless', /\bpeerless\b/u],
  ['jeffersons', /\bjeffersons\b/u],
  ['1792', /\b1792\b/u],
]);

function mississippiBottleBrand(value) {
  return MISSISSIPPI_BOTTLE_BRANDS.find(([, pattern]) => pattern.test(value))?.[0] || null;
}

export function isMississippiCanonicalBottleCompatible(rawName, canonicalName) {
  const normalize = (value) => String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']s\b/gu, 's')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const raw = normalize(rawName);
  const canonical = normalize(canonicalName);
  if (!raw || !canonical) return false;
  const rawBrand = mississippiBottleBrand(raw);
  const canonicalBrand = mississippiBottleBrand(canonical);
  if (rawBrand || canonicalBrand) {
    if (!rawBrand || rawBrand !== canonicalBrand) return false;
  } else {
    const rawTokens = new Set(raw.split(' '));
    const canonicalIdentityTokens = canonical.split(' ')
      .filter((token) => /^\d{3,4}$/u.test(token) || token.length >= 3)
      .slice(0, 2);
    if (!canonicalIdentityTokens.length || canonicalIdentityTokens.some((token) => !rawTokens.has(token))) return false;
  }
  if (/\b(?:straight wheat|wheat whiskey|single malt|straight malt|malt whiskey)\b/u.test(raw)
    && !/\b(?:wheat|malt)\b/u.test(canonical)) return false;
  for (const marker of ['1783', 'heigold']) {
    if (new RegExp(`\\b${marker}\\b`, 'u').test(canonical) && !new RegExp(`\\b${marker}\\b`, 'u').test(raw)) return false;
  }
  if (/\bwild turkey master\b/u.test(canonical) && !/\bmaster'?s?\b/u.test(raw)) return false;
  return true;
}

export function parseMississippiGoToLiquorStoreProducts(html, source) {
  return parseGoToLiquorStoreProducts(html, source, {
    stores: MISSISSIPPI_RETAILER_SOURCES.filter((entry) => entry.platform === 'gotoliquorstore'),
    isAllowedBottleFormat: isAllowedMississippiBottleFormat,
  });
}

export function parseMississippiCityHiveHtml(html, source) {
  return parseCityHiveProducts(html, source, {
    sources: MISSISSIPPI_RETAILER_SOURCES.filter((entry) => entry.platform === 'cityhive'),
    isAllowedBottleFormat: isAllowedMississippiBottleFormat,
  });
}

function parseTagAttributes(value) {
  const attributes = {};
  for (const match of String(value || '').matchAll(/([a-z][a-z0-9:_-]*)\s*=\s*(["'])([\s\S]*?)\2/giu)) {
    attributes[match[1].toLowerCase()] = decodeMoonshineText(match[3]);
  }
  return attributes;
}

function normalizedVendorName(value) {
  return decodeMoonshineText(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/\band\b/gu, ' ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function exactTupelo2GoSourceUrl(source) {
  try {
    const url = new URL(String(source?.categoryUrl || ''));
    const storeId = String(source?.marketplaceStoreId || '');
    return url.protocol === 'https:'
      && url.hostname === source.hostname
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && new RegExp(`^/r/${storeId}/restaurants/delivery/Alcohol/[A-Za-z0-9-]+/?$`, 'u').test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function tupelo2GoProductBinding(source, productId, productUrl, title) {
  return createHash('sha256').update(`${source.marketplaceStoreId}\n${productId}\n${productUrl}\n${title}`).digest('hex');
}

export function parseMississippiTupelo2GoHtml(html, source) {
  if (source?.platform !== 'tupelo2go') return [];
  const markup = String(html || '');
  if (!markup || Buffer.byteLength(markup, 'utf8') > 8 * 1024 * 1024) return [];
  const productUrl = exactTupelo2GoSourceUrl(source);
  if (!productUrl) return [];

  const homeTag = [...markup.matchAll(/<div\b([^>]*)>/giu)]
    .map((match) => parseTagAttributes(match[1]))
    .find((attributes) => attributes.id === 'dd_home_div');
  const directTag = [...markup.matchAll(/<div\b([^>]*)>/giu)]
    .map((match) => parseTagAttributes(match[1]))
    .find((attributes) => attributes.id === 'dd_direct_restaurant_id');
  if (!homeTag
    || homeTag['data-dd_is_vendor'] !== '1'
    || homeTag['data-dd_vendorid'] !== String(source.marketplaceStoreId)
    || directTag?.['data-dd_vendorid'] !== String(source.marketplaceStoreId)
    || homeTag['data-dd_vendorstate']?.toUpperCase() !== 'MS'
    || normalizedVendorName(homeTag['data-dd_vendorname']) !== normalizedVendorName(source.pageVendorName)) return [];

  const addressParts = ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode']
    .map((itemprop) => decodeMoonshineText(markup.match(new RegExp(`<[^>]+itemprop=["']${itemprop}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'iu'))?.[1]));
  const address = addressParts.every(Boolean) ? addressParts.join(' ') : '';
  const approvedPremises = [source.address, ...(source.platformAddresses || [])]
    .map(normalizeCityHivePremises);
  if (!address || !approvedPremises.includes(normalizeCityHivePremises(address))) return [];
  const pageUrl = decodeMoonshineText(markup.match(/<[^>]+itemprop=["']url["'][^>]*>([\s\S]*?)<\/[^>]+>/iu)?.[1]);
  if (pageUrl !== productUrl) return [];

  const rows = [];
  const seen = new Map();
  let activeControls = 0;
  for (const anchor of markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const attributes = parseTagAttributes(anchor[1]);
    if (!String(attributes.class || '').split(/\s+/u).includes('dd_item_a') || attributes.href !== '#') continue;
    const control = String(attributes.onclick || '').match(/^Lzip\((\d+),\s*['"]?([12])['"]?,\s*event\);\s*return false;$/iu);
    if (!control) continue;
    activeControls += 1;
    if (activeControls > 5_000) return [];
    if (/\bdd_menu-item-disabled\b/iu.test(anchor[2])) continue;
    const title = decodeMoonshineText(
      anchor[2].match(/class=["'][^"']*\bdd_menu-item-title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]
      || anchor[2].match(/class=["'][^"']*\bpreview\b[^"']*["'][^>]*title=["']([^"']+)["']/iu)?.[1],
    );
    const priceText = anchor[2].match(/class=["'][^"']*\bdd_menu-item-price\b[^"']*["'][^>]*>\s*\$?\s*([\d,.]+)/iu)?.[1];
    const price = Number(String(priceText || '').replace(/,/gu, ''));
    const productId = control[1];
    if (!title || !isAllowedMississippiBottleFormat(title) || !Number.isFinite(price) || price <= 0) continue;
    const signature = `${title}\n${price}\n${control[2]}`;
    if (seen.has(productId)) {
      if (seen.get(productId) !== signature) return [];
      continue;
    }
    seen.set(productId, signature);
    rows.push({
      productId,
      productBinding: tupelo2GoProductBinding(source, productId, productUrl, title),
      variantId: null,
      controlCode: control[2],
      title,
      productUrl,
      price,
      reportedQuantity: null,
      quantity: 0,
      quantityIsExact: false,
      sourceAvailabilityVerified: true,
      pickupOfferVerified: false,
      deliveryOfferVerified: false,
      orderabilityOfferVerified: true,
      premisesVerified: true,
      inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    });
  }
  return rows;
}

function decodeMoonshineText(value) {
  return String(value || '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function goDaddyProductUrl(source, relativeUrl) {
  try {
    const relative = String(relativeUrl || '');
    const publicPath = relative.startsWith('/ols/products/') ? `/online-shopping${relative}` : relative;
    const url = new URL(publicPath, `${source.baseUrl}/online-shopping/`);
    if (url.protocol !== 'https:' || url.hostname !== source.hostname || url.username || url.password || url.search || url.hash) return null;
    if (!/^\/online-shopping\/ols\/products\/[a-z0-9][a-z0-9-]*\/?$/iu.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mississippiReleaseProductBinding(productId, productUrl, title) {
  return createHash('sha256').update(`${productId}\n${productUrl}\n${title}`).digest('hex');
}

export function parseMississippiGoDaddyReleaseProducts(payload, source, {
  observedAt = new Date().toISOString(),
} = {}) {
  if (source?.platform !== 'godaddy_release_watch' || !Array.isArray(payload?.products)) return [];
  const observedMs = Date.parse(observedAt);
  const maxAgeMs = Number(source.releaseFreshnessDays || 120) * 24 * 60 * 60_000;
  if (!Number.isFinite(observedMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return [];
  return payload.products.flatMap((product) => {
    const title = decodeMoonshineText(product?.name);
    const sourceUpdatedAt = String(product?.updated_at || '');
    const updatedMs = Date.parse(sourceUpdatedAt);
    const productId = String(product?.id || '');
    const productUrl = goDaddyProductUrl(source, product?.relative_url);
    const price = Number(product?.price?.numeric);
    if (!title || !productId || !productUrl || product?.available !== true || product?.in_stock !== true
      || !isAllowedMississippiBottleFormat(title)
      || !Number.isFinite(updatedMs) || updatedMs > observedMs + 5 * 60_000 || observedMs - updatedMs > maxAgeMs) return [];
    return [{
      productId,
      productBinding: mississippiReleaseProductBinding(productId, productUrl, title),
      variantId: null,
      title,
      productUrl,
      price: Number.isFinite(price) && price > 0 ? price : 0,
      reportedQuantity: null,
      quantity: 0,
      quantityIsExact: false,
      sourceUpdatedAt,
      sourceAvailabilityVerified: true,
      pickupOfferVerified: false,
      deliveryOfferVerified: false,
      premisesVerified: true,
      inventorySemantics: 'retailer_release_hold_watch_no_inventory_count',
    }];
  });
}

function escapeMoonshineRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function moonshineProductUrl(source, href, productId) {
  try {
    const url = new URL(String(href || ''), `https://${source.hostname}`);
    if (url.protocol !== 'https:' || url.hostname !== source.hostname || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some((key) => key !== 'search')) return null;
    url.search = '';
    url.hash = '';
    if (!/^\/shop\/[a-z0-9][a-z0-9-]*-\d+\/?$/iu.test(url.pathname)) return null;
    if (!url.pathname.replace(/\/$/u, '').endsWith(`-${productId}`)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const MOONSHINE_CARD_PATTERN = /<button\b[^>]*data-product-template-id=["']([^"']+)["'][^>]*data-product-product-id=["']([^"']+)["'][\s\S]{0,2400}?<a\b[^>]*href=["']([^"']+)["'][\s\S]{0,1000}?<h5\b[^>]*class=["'][^"']*\bsltech_name_part\b[^"']*["'][^>]*>([\s\S]*?)<\/h5>[\s\S]{0,500}?<h5\b[^>]*class=["'][^"']*\bsltech_price_part\b[^"']*["'][^>]*>([\s\S]*?)<\/h5>/giu;

function parseMoonshineCards(payload, source) {
  const productStore = String(payload?.product_store || '');
  const rows = [];
  for (const match of productStore.matchAll(MOONSHINE_CARD_PATTERN)) {
    const [, productId, platformProductId, href, rawTitle, rawPrice] = match;
    const priceText = decodeMoonshineText(rawPrice);
    const title = decodeMoonshineText(rawTitle);
    const volume = priceText.match(/\b\d+(?:\.\d+)?\s*(?:ml|l)\b/iu)?.[0] || '';
    const fullTitle = `${title}${volume && !new RegExp(`\\b${escapeMoonshineRegex(volume)}\\b`, 'iu').test(title) ? ` ${volume}` : ''}`.trim();
    const priceMatch = priceText.match(/\$\s*([\d,]+(?:\.\d{2})?)/u);
    const productUrl = moonshineProductUrl(source, href, productId);
    if (!productUrl || !title || !isAllowedMississippiBottleFormat(fullTitle) || !priceMatch) continue;
    rows.push({
      productId: String(productId),
      variantId: String(platformProductId),
      platformProductId: String(platformProductId),
      title: fullTitle,
      productUrl,
      price: Number(priceMatch[1].replace(/,/gu, '')),
      reportedQuantity: null,
      quantity: 0,
      quantityIsExact: false,
      sourceAvailabilityVerified: false,
      pickupOfferVerified: false,
      premisesVerified: false,
      inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    });
  }
  return rows;
}

export function parseMississippiMoonshineProductCards(payload, source) {
  if (source?.platform !== 'moonshine') return [];
  return parseMoonshineCards(payload, source);
}

export function parseMississippiMoonshineResponse(payload, source) {
  if (source?.platform !== 'moonshine') return [];
  const selectedSellerId = String(payload?.moonshine_seller_id || '');
  if (!selectedSellerId || selectedSellerId !== String(source.moonshineSellerId)
    || decodeMoonshineText(payload?.moonshine_seller_name) !== decodeMoonshineText(source.name)
    || String(payload?.moonshine_seller_url || '') !== String(source.sellerUrl)) return [];
  const available = String(payload?.available_store_tab || '');
  if (!available) return [];
  const availableProductId = available.match(/name=["']product_id["'][^>]*value=["']([^"']+)["']/iu)?.[1] || '';
  if (!availableProductId) return [];
  const sellerControlMatch = available.match(new RegExp(`<a\\b[^>]*href=["']${escapeMoonshineRegex(source.sellerUrl)}["'][\\s\\S]{0,1200}?<h6[^>]*>([\\s\\S]*?)<\\/h6>`, 'iu'));
  const sellerControl = sellerControlMatch && decodeMoonshineText(sellerControlMatch[1]) === decodeMoonshineText(source.name);
  const cartControl = /<form\b[^>]*action=["']\/shop\/cart\/update["']/iu.test(available)
    && new RegExp(`name=["']seller_id["'][^>]*value=["']${escapeMoonshineRegex(source.moonshineSellerId)}["']`, 'iu').test(available);
  if (!sellerControl || !cartControl) return [];
  return parseMoonshineCards(payload, source)
    .filter((row) => row.platformProductId === availableProductId)
    .map((row) => ({
      ...row,
      sourceAvailabilityVerified: true,
      pickupOfferVerified: source.pickupAvailable === true,
      orderabilityOfferVerified: source.fulfillmentMode === 'exact_store_orderability',
      premisesVerified: true,
    }));
}
