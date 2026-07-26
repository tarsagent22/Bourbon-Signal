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
