import { parseGoToLiquorStoreProducts } from './gotoliquorstore-surfaces.mjs';

function merchant(id, name, address, city, zip) {
  return [id, { id, name, address, city, state: 'GA', zip }];
}

export const GEORGIA_CITYHIVE_SOURCES = [
  {
    id: 'tower-wine-spirits', chainName: 'Tower Wine & Spirits', sourceLabel: 'Tower Wine & Spirits CityHive store inventory',
    baseUrl: 'https://www.towerwinespirits.com', categoryUrl: 'https://www.towerwinespirits.com/shop/?subtype=Bourbon',
    merchants: new Map([
      merchant('66cde7d80f43792960cbe63e', 'Tower Beer, Wine and Spirits - Buckhead', '2161 Piedmont Rd NE, Atlanta, GA 30324, USA', 'Atlanta', '30324'),
      merchant('546bac733932330002ab0300', 'Tower Beer, Wine & Spirits - Doraville', '5877 Buford Hwy NE, Doraville, GA 30340, USA', 'Doraville', '30340'),
    ]),
  },
  {
    id: 'greens-beverages', chainName: "Green's Beverages", sourceLabel: "Green's Beverages CityHive store inventory",
    baseUrl: 'https://greensbeverages.com', categoryUrl: 'https://greensbeverages.com/shop/?subtype=Bourbon',
    merchants: new Map([
      merchant('61e1d53d9f85351b2f07c313', "Green's Beverage - Ponce De Leon GA", '737 Ponce De Leon Ave NE, Atlanta, GA 30306, USA', 'Atlanta', '30306'),
      merchant('61e1d80a2645234aa8e83468', "Green's Beverage - Buford Hwy GA", '2614 Buford Hwy NE, Atlanta, GA 30324, USA', 'Atlanta', '30324'),
    ]),
  },
  {
    id: 'augusta-liquors', chainName: 'Augusta Liquors', sourceLabel: 'Augusta Liquors CityHive store inventory',
    baseUrl: 'https://augustaliquors.com', categoryUrl: 'https://augustaliquors.com/shop/?subtype=Bourbon',
    merchants: new Map([merchant('615b2040cfb5bc42596e7b5c', 'Augusta Liquors', '823 Cabela Dr, Augusta, GA 30909, USA', 'Augusta', '30909')]),
  },
  {
    id: 'grapes-and-grains', chainName: 'Grapes and Grains', sourceLabel: 'Grapes and Grains CityHive store inventory',
    baseUrl: 'https://grapesan10cce461.sites.cityhive.app', categoryUrl: 'https://grapesan10cce461.sites.cityhive.app/shop/?subtype=Bourbon',
    merchants: new Map([
      merchant('6269728eef3b95421ca0f798', 'Grapes and Grains - JC', '3719 Old Alabama Rd, Alpharetta, GA 30022, USA', 'Alpharetta', '30022'),
      merchant('626bf79b56bd3347d927f9ad', 'Grapes and Grains - Chamblee', '4783 Peachtree Rd, Chamblee, GA 30341, USA', 'Chamblee', '30341'),
    ]),
  },
  {
    id: 'fairington-wine-spirits', chainName: 'Fairington Wine and Spirits', sourceLabel: 'Fairington Wine and Spirits CityHive store inventory',
    baseUrl: 'https://fairingtf06c09c5.sites.cityhive.app', categoryUrl: 'https://fairingtf06c09c5.sites.cityhive.app/shop/?subtype=Bourbon',
    merchants: new Map([merchant('5ff3b5ea9638c72aa686d706', 'Fairington Wine and Spirits', '5940 Fairington Rd, Stonecrest, GA 30038, USA', 'Stonecrest', '30038')]),
  },
  {
    id: '74-package', chainName: '74 Package', sourceLabel: '74 Package CityHive store inventory',
    baseUrl: 'https://74package.com', categoryUrl: 'https://74package.com/shop/?subtype=Bourbon',
    merchants: new Map([merchant('61426e7ac3063702b3ce1fd9', '74 Package', '5451 Thomaston Rd, Macon, GA 31220, USA', 'Macon', '31220')]),
  },
  {
    id: 'giant-wine-spirits', chainName: 'Giant Wine & Spirits', sourceLabel: 'Giant Wine & Spirits CityHive store inventory',
    baseUrl: 'https://giantwineandspirits.com', categoryUrl: 'https://giantwineandspirits.com/shop/?subtype=Bourbon',
    merchants: new Map([merchant('6668b09b667b0b2940ac4dd4', 'Giant Wine & Spirits', '1172 Milford Church Rd SW, Marietta, GA 30060, USA', 'Marietta', '30060')]),
  },
  {
    id: 'brookhaven-bottle-shop', chainName: 'Brookhaven Bottle Shop', sourceLabel: 'Brookhaven Bottle Shop CityHive store inventory',
    baseUrl: 'https://brookhavenbottleshop.com', categoryUrl: 'https://brookhavenbottleshop.com/shop/?subtype=Bourbon',
    merchants: new Map([merchant('69014dd8e5812762036791f8', 'Brookhaven Bottle Shop', '4200 Peachtree Rd NE, Atlanta, GA 30319, USA', 'Atlanta', '30319')]),
  },
  {
    id: 'bims-liquor', chainName: "Bim's Liquor", sourceLabel: "Bim's Liquor CityHive store inventory",
    baseUrl: 'https://bimsliquor.com', categoryUrl: 'https://bimsliquor.com/shop/?subtype=Bourbon',
    merchants: new Map([merchant('64c2ea6f719b442c58864717', 'Bims Liquor Store', '1015 West Marietta St NW, Atlanta, GA 30318, USA', 'Atlanta', '30318')]),
  },
  {
    id: 'old-milton-beverage', chainName: 'Old Milton Beverage', sourceLabel: 'Old Milton Beverage CityHive store inventory',
    baseUrl: 'https://oldmiltonbeverages.com', categoryUrl: 'https://oldmiltonbeverages.com/shop/?subtype=Bourbon',
    merchants: new Map([merchant('6506025f502fc12b96c451f1', 'OLD MILTON BEVERAGE', '4045 Old Milton Pkwy, Alpharetta, GA 30022, USA', 'Alpharetta', '30022')]),
  },
  {
    id: 'vip-package-store', chainName: 'VIP Package Store', sourceLabel: 'VIP Package Store CityHive store inventory',
    baseUrl: 'https://vipliquoratl.com', categoryUrl: 'https://vipliquoratl.com/shop/?subtype=Bourbon',
    merchants: new Map([merchant('598102d9d05b4360e32fbf16', 'VIP Package Store', '5005 Snapfinger Woods Dr, Decatur, GA 30035, USA', 'Decatur', '30035')]),
  },
];

function goTo(id, chain, name, hostname, categoryUrl, address, city, zip) {
  const baseUrl = `https://${hostname}`;
  return { id, merchantId: id, chain, name, sourceLabel: `${name} GoToLiquorStore store inventory`, hostname, baseUrl, categoryUrl, storeId: `${chain}:${id}`, address, city, state: 'GA', zip };
}

export const GEORGIA_GOTOLIQUOR_STORES = [
  goTo('1071', 'beverage-world-cumming', 'Beverage World of Cumming', 'www.bwcumming.com', 'https://www.bwcumming.com/c/spirits/whiskey/19', '745 Lanier 400 Parkway, Cumming, GA 30040', 'Cumming', '30040'),
  goTo('1279', 'the-wine-store-alpharetta', 'The Wine Store', 'www.thewinestoreinc.com', 'https://www.thewinestoreinc.com/c/spirits/whiskey/19', '8455 Holcomb Bridge Road, Alpharetta, GA 30022', 'Alpharetta', '30022'),
  goTo('575', 'abc-augusta', 'ABC Augusta', 'www.abcaugusta.com', 'https://www.abcaugusta.com/c/spirits/whiskey/19', '3441 Wrightsboro Road, Augusta, GA 30909', 'Augusta', '30909'),
  goTo('108', 'al-gs-liquor-store', "AL G's Liquor Store", 'www.algsliquorstore.com', 'https://www.algsliquorstore.com/c/spirits/whiskey/19', '3646 Austell Road Southwest, Marietta, GA 30008', 'Marietta', '30008'),
  goTo('712', 'uptown-package-store', 'Uptown Package Store', 'www.uptownpackagestore.com', 'https://www.uptownpackagestore.com/c/spirits/whiskey/19', '3800 Pleasantdale Road, Atlanta, GA 30340', 'Atlanta', '30340'),
  goTo('546', 'd-and-m-package-store', 'D & M Package Store', 'www.dandmpackagestore.com', 'https://www.dandmpackagestore.com/c/spirits/whiskey/19', '595 Ralph David Abernathy Boulevard Southwest, Atlanta, GA 30312', 'Atlanta', '30312'),
  goTo('1208', 'peachtree-package-store', 'Peachtree Package Store', 'www.peachtreepackage.com', 'https://www.peachtreepackage.com/c/spirits/whiskey/19', '300 Peachtree Street Northeast, Atlanta, GA 30308', 'Atlanta', '30308'),
  goTo('441', 'georgia-world-of-beverage', 'Georgia World of Beverage', 'www.georgiaworldofbeverage.com', 'https://www.georgiaworldofbeverage.com/c/spirits/whiskey/19', '8455 Senoia Road, Fairburn, GA 30213', 'Fairburn', '30213'),
  goTo('944', 'global-beverage-superstore', 'Global Beverage Superstore', 'www.globalbeveragestore.com', 'https://www.globalbeveragestore.com/c/spirits/whiskey/19', '2157 West Point Road, LaGrange, GA 30240', 'LaGrange', '30240'),
  goTo('699', 'harrys-liquor', "Harry's Liquor", 'www.harryscordele.com', 'https://www.harryscordele.com/c/spirits/whiskey/19', '1807 Central Avenue, Cordele, GA 31015', 'Cordele', '31015'),
  goTo('180', 'country-club-package', 'Country Club Package', 'www.countryclubpackage.com', 'https://www.countryclubpackage.com/c/spirits/whiskey/19', '4575 Forsyth Road, Macon, GA 31210', 'Macon', '31210'),
  goTo('1065', 'p-and-p-liquor-store', 'P & P Liquor Store', 'www.ppliquorstore.com', 'https://www.ppliquorstore.com/c/spirits/whiskey/19', '4151 Mercer University Drive, Macon, GA 31204', 'Macon', '31204'),
  goTo('1309', 'forsyth-world-of-beverage', 'Forsyth World of Beverage', 'www.forsythwob.com', 'https://www.forsythwob.com/c/spirits/whiskey/19', '3535 Peachtree Parkway, Suwanee, GA 30024', 'Suwanee', '30024'),
  goTo('1052', 'warehouse-package-store', 'Warehouse Package Store', 'www.warehousepackagestore.com', 'https://www.warehousepackagestore.com/c/spirits/whiskey/19', '407 Vallotton Drive, Valdosta, GA 31602', 'Valdosta', '31602'),
];

function lightspeed(storeId, chain, name, merchantId, hostname, categoryUrl, address, city, zip) {
  return { id: storeId, storeId, chain, name, sourceLabel: `${name} Lightspeed store inventory`, merchantId, hostname, baseUrl: `https://${hostname}`, categoryUrl, address, city, state: 'GA', zip, delayMs: 2_000 };
}

export const GEORGIA_LIGHTSPEED_STORES = [
  lightspeed('elemental-spirits:atlanta', 'elemental-spirits', 'Elemental Spirits', 'lightspeed:635360', 'www.elementalspirits.co', 'https://www.elementalspirits.co/spirits/whiskey/bourbon/', '602 N Highland Ave NE, Atlanta, GA 30307', 'Atlanta', '30307'),
  lightspeed('ansley-wine-merchants:atlanta', 'ansley-wine-merchants', 'Ansley Wine Merchants', 'lightspeed:640117', 'ansley-wine-merchants.shoplightspeed.com', 'https://ansley-wine-merchants.shoplightspeed.com/spirits/whiskies/bourbon/', '1544 Piedmont Ave NE #211, Atlanta, GA 30324', 'Atlanta', '30324'),
];

export function buildGeorgiaConfiguredStoreLocationSignals(observedAt) {
  return [...GEORGIA_GOTOLIQUOR_STORES, ...GEORGIA_LIGHTSPEED_STORES].map((store) => ({
    id: `georgia-configured-store-location:${store.storeId}`,
    state: 'GA',
    stateCode: 'GA',
    sourceLabel: `${store.name} first-party exact-store identity`,
    sourceUrl: store.categoryUrl,
    sourceChain: store.chain,
    merchantId: store.merchantId,
    rawName: store.name,
    canonicalBottleId: null,
    canonicalName: null,
    confidence: 0.8,
    eventType: 'retailer_store_location',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: store.storeId,
    storeAddress: store.address,
    city: store.city,
    postalCode: store.zip,
    zip: store.zip,
    quantity: 0,
    observedAt,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    inventorySemantics: 'The configured first-party retailer category identifies an exact Georgia premises. This directory row is not product availability or bottle inventory.',
    evidence: `${store.name}'s configured first-party category identity is attached to ${store.address}.`,
    raw: {
      chain: store.chain,
      merchantId: store.merchantId,
      configuredFirstPartyStoreIdentity: true,
      platform: GEORGIA_GOTOLIQUOR_STORES.includes(store) ? 'gotoliquorstore' : 'lightspeed',
    },
  }));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function plainText(value) {
  return decodeHtml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function attribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeHtml(tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2]
    || tag.match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, 'i'))?.[1]
    || '');
}

function sameHttpsHost(value, hostname, baseUrl) {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === String(hostname || '').toLowerCase() ? url : null;
  } catch {
    return null;
  }
}

function isHiddenControl(tag) {
  return /<input\b[^>]*\btype\s*=\s*["']?hidden\b/i.test(tag)
    || /\s(?:hidden|disabled)(?:\s|=|>)/i.test(tag)
    || /aria-hidden\s*=\s*["']?true/i.test(tag)
    || /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(tag)
    || /class\s*=\s*["'][^"']*\b(?:hidden|d-none|sr-only)\b/i.test(tag);
}

function priceFromBlock(block) {
  const value = Number(String(block).match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/)?.[1] || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function hasHiddenAncestor(html, index) {
  const stack = [];
  const prefix = String(html || '').slice(0, index);
  for (const match of prefix.matchAll(/<\/?(div|li|article|section|ul|ol)\b[^>]*>/gi)) {
    const tag = match[0];
    const name = match[1].toLowerCase();
    if (/^<\//.test(tag)) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].name !== name) continue;
        stack.splice(i);
        break;
      }
      continue;
    }
    const hidden = isHiddenControl(tag) || stack.some((entry) => entry.hidden);
    stack.push({ name, hidden });
  }
  return stack.some((entry) => entry.hidden);
}

function blocksAtStarts(html, patterns) {
  const source = String(html || '');
  const starts = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) starts.push({ index: match.index, tag: match[0] });
  }
  starts.sort((a, b) => a.index - b.index);
  return starts
    .map((start, index) => ({ ...start, block: source.slice(start.index, starts[index + 1]?.index ?? source.length) }))
    .filter((start) => !isHiddenControl(start.tag) && !hasHiddenAncestor(source, start.index))
    .map((start) => start.block);
}

function productAnchor(block, store) {
  for (const match of String(block).matchAll(/<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    const tag = match[0].slice(0, match[0].indexOf('>') + 1);
    const url = sameHttpsHost(match[2], store.hostname, store.baseUrl);
    if (!url || url.search || url.hash || /\/cart\//i.test(url.pathname)) continue;
    const className = attribute(tag, 'class');
    if (!/\/p\/[^/]+\/\d+\/?$/i.test(url.pathname) && !/\.html$/i.test(url.pathname) && !/\b(?:product-name|product-card__title|title)\b/i.test(className)) continue;
    const rawName = plainText(match[3]) || plainText(attribute(tag, 'title'));
    if (!rawName) continue;
    return { url, rawName };
  }
  return null;
}

function escapedRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isAllowedGeorgiaBottleFormat(value) {
  const text = plainText(value).toLowerCase();
  const size = text.match(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/i);
  if (size) {
    const ml = Number(size[1]) * (size[2].toLowerCase() === 'l' ? 1_000 : 1);
    if (!Number.isFinite(ml) || ml <= 375) return false;
  }
  return !/\b(?:bundle|multipack|multi-pack|gift\s*set|case\s+of\s+\d+|pack\s+of\s+\d+|\d+\s*(?:pack|pk)|\d+\s*x\s*\d+(?:\.\d+)?\s*(?:ml|l)|(?:pack|case)[ _-]*(?:count|quantity|size)["']?\s*[:=]\s*\d+)\b/i.test(text);
}

export function isAllowedGeorgiaBourbonIdentity(rawName, canonicalName) {
  const rawText = plainText(rawName).toLowerCase();
  const text = `${rawText} ${canonicalName || ''}`.toLowerCase();
  if (/\b(?:cream|liqueur|cordial|cocktail|ready\s*to\s*drink|vodka|gin|rum|tequila|mezcal|brandy|cognac|beer|wine|seltzer|peanut\s*butter|cinnamon|honey|apple|peach|vanilla|chocolate)\b/i.test(text)) return false;
  if (/\b(?:candle|tumbler|glass|glassware|barware|coaster|ornament|figurine|flask|shirt|tee|hoodie|sweater|jacket|hat|poster|sign|sticker|keychain|golf|towel|tray|bag|cooler|umbrella|gift\s*card|accessor(?:y|ies))\b/i.test(rawText)) return false;
  if (/\brye\b/i.test(text) && !/\bbourbon\b/i.test(text)) return false;
  return /\b(?:bourbon|blanton|eagle\s+rare|weller|stagg|e\.?\s*h\.?\s*taylor|colonel\s+taylor|buffalo\s+trace|michter|willett|old\s+fitz|fitzgerald|elmer\s+t\.?\s*lee|rock\s+hill|booker|baker|little\s+book|blood\s+oath|four\s+roses|1792|russell|elijah\s+craig|larceny|old\s+forester|wild\s+turkey|rare\s+breed|woodford|knob\s+creek|maker|bardstown|green\s+river|heaven\s+hill|henry\s+mckenna|new\s+riff|barrell|yellowstone|penelope|peerless|angel'?s\s+envy|basil\s+hayden|jefferson'?s|ben\s+holladay)\b/i.test(rawText);
}

export function normalizeGeorgiaCityHiveQuantity(value) {
  const parsed = Number(value);
  const reportedQuantity = Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  const binaryAvailability = reportedQuantity >= 100;
  return {
    reportedQuantity,
    quantity: binaryAvailability ? 0 : reportedQuantity,
    quantityIsExact: reportedQuantity > 0 && !binaryAvailability,
    binaryAvailability,
  };
}

export function parseGeorgiaGoToLiquorStoreProducts(html, store) {
  if (!store || !GEORGIA_GOTOLIQUOR_STORES.some((candidate) => candidate.id === store.id && candidate.hostname === store.hostname)) return [];
  return parseGoToLiquorStoreProducts(html, store, {
    stores: GEORGIA_GOTOLIQUOR_STORES,
    isAllowedBottleFormat: isAllowedGeorgiaBottleFormat,
  }).map((row) => ({
    productId: row.productId,
    rawName: row.title,
    productUrl: row.productUrl,
    price: row.price,
  }));
}

export function parseGeorgiaLightspeedProducts(html, store) {
  if (!store || !GEORGIA_LIGHTSPEED_STORES.some((candidate) => candidate.id === store.id && candidate.hostname === store.hostname)) return [];
  const rows = [];
  const seen = new Set();
  const blocks = blocksAtStarts(html, [
    /<div\b[^>]*class\s*=\s*["'][^"']*\bprod-card\b[^"']*["'][^>]*>/gi,
    /<div\b[^>]*class\s*=\s*["'][^"']*\bproduct\b[^"']*["'][^>]*>/gi,
  ]);
  for (const block of blocks) {
    let productId = '';
    for (const match of block.matchAll(/<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
      if (isHiddenControl(match[0]) || !/^Add\s+to\s+cart$/i.test(plainText(match[3]))) continue;
      const cartUrl = sameHttpsHost(match[2], store.hostname, store.baseUrl);
      if (!cartUrl || cartUrl.search || cartUrl.hash) continue;
      productId = cartUrl.pathname.match(/^\/cart\/add\/(\d+)\/?$/i)?.[1] || '';
      if (productId) break;
    }
    if (!productId) continue;
    const product = productAnchor(block, store);
    if (!product || !isAllowedGeorgiaBottleFormat(product.rawName) || seen.has(product.url.href)) continue;
    seen.add(product.url.href);
    rows.push({ productId, rawName: product.rawName, productUrl: product.url.href, price: priceFromBlock(block) });
  }
  return rows;
}
