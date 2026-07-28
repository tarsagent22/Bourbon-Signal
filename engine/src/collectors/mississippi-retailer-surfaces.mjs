import { readFileSync } from 'node:fs';

import { parseCityHiveProducts } from './cityhive-surfaces.mjs';
import { parseGoToLiquorStoreProducts } from './gotoliquorstore-surfaces.mjs';

const REGISTRY = JSON.parse(readFileSync(new URL('../../data/mississippi-retailer-registry.json', import.meta.url), 'utf8'));

export const MISSISSIPPI_RETAILER_SOURCES = Object.freeze(REGISTRY.stores.map((store) => Object.freeze({
  ...store,
  state: 'MS',
  stateCode: 'MS',
})));

const BOURBON_RE = /\b(?:bourbon|kentucky straight|american whiskey|blanton|buffalo trace|eagle rare|e\.?\s*h\.?\s*taylor|colonel taylor|weller|stagg|booker|baker|1792|maker'?s mark|old forester|woodford|four roses|knob creek|elijah craig|michter|willett|wild turkey|rare breed|larceny|heaven hill|henry mckenna|old fitzgerald|new riff|bardstown|green river|yellowstone|penelope|peerless|angel'?s envy|basil hayden|jefferson'?s)\b/iu;
const UNSAFE_RE = /\b(?:gift\s*(?:set|box|pack)|bundle|sampler|miniatures?|multipack|multi[\s-]*pack|variety\s*pack|case\s+of\s+\d+|pack\s+of\s+\d+|\d+\s*(?:pk|pack|bottles?)|\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:ml|l)|candle|tumbler|glassware|barware|coaster|ornament|figurine|flask|shirt|hoodie|hat|gift\s*card|accessor(?:y|ies)|cocktail|ready\s*to\s*drink|rtd|liqueur|cordial|cream|flavou?red|wine|apple|peach|honey|cinnamon|peanut\s*butter|chocolate|vanilla)\b/iu;

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
    || String(payload?.moonshine_seller_name || '') !== String(source.name)
    || String(payload?.moonshine_seller_url || '') !== String(source.sellerUrl)) return [];
  const available = String(payload?.available_store_tab || '');
  if (!available) return [];
  const availableProductId = available.match(/name=["']product_id["'][^>]*value=["']([^"']+)["']/iu)?.[1] || '';
  if (!availableProductId) return [];
  const sellerControl = new RegExp(`<a\\b[^>]*href=["']${escapeMoonshineRegex(source.sellerUrl)}["'][\\s\\S]{0,1200}?<h6[^>]*>\\s*${escapeMoonshineRegex(source.name)}\\s*<\\/h6>`, 'iu');
  const cartControl = /<form\b[^>]*action=["']\/shop\/cart\/update["']/iu.test(available)
    && new RegExp(`name=["']seller_id["'][^>]*value=["']${escapeMoonshineRegex(source.moonshineSellerId)}["']`, 'iu').test(available);
  if (!sellerControl.test(available) || !cartControl) return [];
  return parseMoonshineCards(payload, source)
    .filter((row) => row.platformProductId === availableProductId)
    .map((row) => ({
      ...row,
      sourceAvailabilityVerified: true,
      pickupOfferVerified: source.pickupAvailable === true,
      premisesVerified: true,
    }));
}
