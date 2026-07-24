const BOURBON_IDENTITY_RE = /\b(?:bourbon|kentucky straight|american whiskey|blanton(?:'s|s)?|buffalo trace|eagle rare|e\.?\s*h\.?\s*taylor|colonel\s+taylor|weller|stagg|booker(?:'s|s)?|baker(?:'s|s)?|1792|maker(?:'s|s)? mark|old forester|woodford reserve|four roses|knob creek|elijah craig|michter(?:'s|s)?|willett|wild turkey|rare breed|larceny|heaven hill|henry mckenna|old fitzgerald|new riff|bardstown bourbon|green river|yellowstone|penelope|peerless|angel'?s envy|basil hayden|jefferson'?s)\b/i;
const UNSAFE_PRODUCT_RE = /\b(?:gift\s*(?:set|box|pack)|bundle|sampler|miniatures?|multipack|multi[\s-]*pack|variety\s*pack|case\s+of\s+\d+|pack\s+of\s+\d+|\d+\s*(?:pk|pack|bottles?)|\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:ml|l)|candle|tumbler|glassware|barware|coaster|ornament|figurine|flask|shirt|hoodie|hat|poster|sign|sticker|keychain|gift\s*card|accessor(?:y|ies)|cocktail|ready\s*to\s*drink|rtd|liqueur|cordial|cream|flavou?red|wine|cabernet|sauvignon|merlot|chardonnay|pinot|apple|peach|honey|cinnamon|peanut\s*butter|chocolate|vanilla|maple|orange|cherry)\b/i;
const NON_BOTTLE_RE = /\b(?:can|cans|canned|pouch|pouches|keg|boxed|box|bag[\s-]*in[\s-]*box)\b/i;
const SIZE_RE = /\b(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|l|lit(?:er|re)s?)\b/giu;
const MAX_EMBEDDED_JSON_BYTES = 8 * 1024 * 1024;
const MAX_EMBEDDED_NODES = 25_000;

function store(id, name, merchantId, address, city, stateCode, zip) {
  return Object.freeze({ id, name, merchantId, address, city, state: stateCode, stateCode, zip });
}

function cityHiveSource({ id, chainName, baseUrl, stateCode, area, stores }) {
  return Object.freeze({
    id,
    chainName,
    sourceLabel: `${chainName} CityHive ${area} store inventory`,
    platform: 'cityhive',
    inventoryMode: 'premises_quantity',
    baseUrl,
    host: new URL(baseUrl).hostname,
    productsUrl: `${baseUrl}/shop/?subtype=Bourbon`,
    fulfillmentPolicyUrl: `${baseUrl}/shop/?subtype=Bourbon`,
    maxPages: 1,
    stateCode,
    area,
    inventoryEligible: true,
    stores: Object.freeze(stores),
  });
}

function shopifySource({ id, chainName, baseUrl, merchantId, address, city, stateCode, zip, area, fulfillmentPolicyUrl }) {
  return Object.freeze({
    id,
    chainName,
    sourceLabel: `${chainName} Shopify ${area} pickup inventory`,
    platform: 'shopify',
    inventoryMode: 'catalog_only',
    baseUrl,
    host: new URL(baseUrl).hostname,
    productsUrl: `${baseUrl}/products.json?limit=250`,
    fulfillmentPolicyUrl,
    maxPages: 4,
    stateCode,
    area,
    inventoryEligible: false,
    stores: Object.freeze([
      store(`${id}:${merchantId}`, chainName, merchantId, address, city, stateCode, zip),
    ]),
  });
}

export const NEW_YORK_RETAILER_SOURCES = Object.freeze([
  cityHiveSource({
    id: 'cellar-53',
    chainName: 'Cellar 53',
    baseUrl: 'https://cellar53wine.com',
    stateCode: 'NY',
    area: 'New York City',
    stores: [
      store('cellar-53:56f03a5769702d2666060000', 'Cellar 53', '56f03a5769702d2666060000', '785 10TH AVENUE, NEW YORK, NY 10019', 'New York', 'NY', '10019'),
    ],
  }),
  shopifySource({
    id: 'broadway-spirits',
    chainName: 'Broadway Spirits',
    baseUrl: 'https://www.broadwayspirits.com',
    merchantId: 'broadway-spirits-shopify',
    address: '299 Broadway, New York NY 10007',
    city: 'New York',
    stateCode: 'NY',
    zip: '10007',
    area: 'New York City',
    fulfillmentPolicyUrl: 'https://www.broadwayspirits.com/pages/contact',
  }),
  shopifySource({
    id: 'flatiron-wines',
    chainName: 'Flatiron Wines & Spirits',
    baseUrl: 'https://nyc.flatiron-wines.com',
    merchantId: 'flatiron-wines-nyc-shopify',
    address: '873 Broadway, New York NY 10003',
    city: 'New York',
    stateCode: 'NY',
    zip: '10003',
    area: 'New York City',
    fulfillmentPolicyUrl: 'https://nyc.flatiron-wines.com/pages/contact-us',
  }),
]);

export const COLORADO_RETAILER_SOURCES = Object.freeze([
  cityHiveSource({
    id: 'bonnie-brae-liquor',
    chainName: 'Bonnie Brae Liquor',
    baseUrl: 'https://bonniebraeliquor.com',
    stateCode: 'CO',
    area: 'Denver Metro',
    stores: [
      store('bonnie-brae-liquor:5a25ddc66befa569f21cce70', 'Bonnie Brae Liquor', '5a25ddc66befa569f21cce70', '785 S University Blvd Denver CO 80209', 'Denver', 'CO', '80209'),
    ],
  }),
  cityHiveSource({
    id: 'mollys-spirits',
    chainName: "Molly's Spirits",
    baseUrl: 'https://mollysspirits.com',
    stateCode: 'CO',
    area: 'Denver Metro',
    stores: [
      store('mollys-spirits:5dae07618a609e45343a1169', "Molly's Spirits Lakeside", '5dae07618a609e45343a1169', '5809 W 44th Ave Denver CO 80212', 'Denver', 'CO', '80212'),
      store('mollys-spirits:5e17a5034caea3266d7aedf0', "Molly's Spirits Greenwood Village", '5e17a5034caea3266d7aedf0', '8557 E Arapahoe Rd a Greenwood Village CO 80112', 'Greenwood Village', 'CO', '80112'),
    ],
  }),
  cityHiveSource({
    id: 'total-beverage',
    chainName: 'Total Beverage',
    baseUrl: 'https://totalbev.com',
    stateCode: 'CO',
    area: 'Denver Metro',
    stores: [
      store('total-beverage:5aaac90bc7f3a3342acbee37', 'Total Beverage', '5aaac90bc7f3a3342acbee37', '9359 Sheridan Boulevard, Westminster, CO 80031, USA', 'Westminster', 'CO', '80031'),
    ],
  }),
]);

export const METRO_RETAILER_SOURCES = Object.freeze([
  ...NEW_YORK_RETAILER_SOURCES,
  ...COLORADO_RETAILER_SOURCES,
]);

const SOURCE_BY_ID = new Map(METRO_RETAILER_SOURCES.map((source) => [source.id, source]));

function canonicalSource(candidate) {
  const source = SOURCE_BY_ID.get(String(candidate?.id || ''));
  if (!source) return null;
  return source.platform === candidate.platform
    && source.stateCode === candidate.stateCode
    && source.baseUrl === candidate.baseUrl
    && source.productsUrl === candidate.productsUrl
    ? source
    : null;
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function normalizedText(value) {
  if (Array.isArray(value)) return value.map(normalizedText).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(normalizedText).join(' ');
  return decodeHtmlEntities(value).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function normalizeMetroPremises(value) {
  return normalizedText(value)
    .toLowerCase()
    .replace(/\b(?:united states of america|united states|usa)\b/gu, ' ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function exactPremises(value, store) {
  return Boolean(value) && normalizeMetroPremises(value) === normalizeMetroPremises(store.address);
}

function sizeValues(text) {
  const values = [];
  for (const match of String(text || '').matchAll(SIZE_RE)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    values.push(/^l/iu.test(match[2]) ? amount * 1_000 : amount);
  }
  return values;
}

export function isAllowedMetroBottle(value, {
  explicitSize = null,
  explicitUnit = null,
  packSize = null,
  containerType = null,
} = {}) {
  const text = normalizedText(value);
  if (!text || !BOURBON_IDENTITY_RE.test(text) || UNSAFE_PRODUCT_RE.test(text)) return false;
  if (/\brye\b/iu.test(text) && !/\bbourbon\b/iu.test(text)) return false;
  if (NON_BOTTLE_RE.test(text)) return false;
  if (packSize != null && packSize !== '' && Number(packSize) !== 1) return false;
  if (containerType && !/^bottle$/iu.test(String(containerType).trim())) return false;
  const sizes = sizeValues(text);
  if (explicitSize != null && explicitSize !== '' && Number.isFinite(Number(explicitSize))) {
    sizes.push(/^l/iu.test(String(explicitUnit || '')) ? Number(explicitSize) * 1_000 : Number(explicitSize));
  }
  return !sizes.some((size) => size <= 375);
}

export function normalizeMetroCityHiveQuantity(value) {
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

function decodeJsString(value, quote) {
  if (quote === '"') {
    try { return JSON.parse(`"${value}"`); } catch { /* use the conservative decoder below */ }
  }
  return String(value)
    .replace(/\\x([0-9a-f]{2})/giu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/giu, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\(["'`\\/bfnrt])/gu, (_, escaped) => ({
      b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
    })[escaped] ?? escaped);
}

function parseEncodedJson(value) {
  let decoded = String(value || '');
  for (let pass = 0; pass < 2; pass += 1) {
    try { decoded = decodeURIComponent(decoded); } catch { break; }
  }
  if (decoded.length > MAX_EMBEDDED_JSON_BYTES) return null;
  try { return JSON.parse(decoded); } catch { return null; }
}

function embeddedJsonValues(html) {
  const source = String(html || '');
  if (!source || source.length > MAX_EMBEDDED_JSON_BYTES * 2) return [];
  const values = [];
  for (const match of source.matchAll(/decodeURIComponent\(\s*(["'`])([\s\S]*?)\1\s*\)/giu)) {
    const parsed = parseEncodedJson(decodeJsString(match[2], match[1]));
    if (parsed) values.push(parsed);
  }
  for (const match of source.matchAll(/<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    const raw = decodeHtmlEntities(match[1]).trim();
    if (!raw || raw.length > MAX_EMBEDDED_JSON_BYTES) continue;
    try { values.push(JSON.parse(raw)); } catch { /* malformed embedded JSON fails closed */ }
  }
  return values;
}

function productPayloads(values) {
  const payloads = [];
  const seen = new Set();
  let visited = 0;
  const walk = (value) => {
    if (++visited > MAX_EMBEDDED_NODES || value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (Array.isArray(value.products)) payloads.push(value);
    for (const child of Object.values(value)) walk(child);
  };
  for (const value of values) walk(value);
  return payloads;
}

function addressText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  const direct = value.full_address || value.fullAddress || value.formatted_address || value.formattedAddress;
  if (direct) return String(direct);
  return [
    value.address1 || value.address_1 || value.street || value.street_address,
    value.address2 || value.address_2 || value.unit,
    value.city || value.addressLocality,
    value.state || value.stateCode || value.addressRegion,
    value.zip || value.zipcode || value.postalCode,
  ].filter(Boolean).join(' ');
}

function entityAddress(value) {
  return addressText(value?.full_address || value?.fullAddress || value?.address || value?.address_properties || value?.addressProperties);
}

function merchantId(value) {
  return String(value?.merchant_id || value?.merchantId || value?.merchant?.id || value?.merchant?._id || value?.id || value?._id || '').trim();
}

function hasPickupOffer(...values) {
  const text = values.map(normalizedText).join(' ');
  return /\b(?:pick[\s_-]*up|store[\s_-]*pickup|in[\s_-]*store[\s_-]*pickup)\b/iu.test(text);
}

function exactProductUrl(value, source, productId, variantId) {
  try {
    const url = new URL(String(value || ''));
    const sourceOrigin = new URL(source.baseUrl).origin;
    if (url.protocol !== 'https:' || url.origin !== sourceOrigin || url.username || url.password || url.hash) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 4 || parts[0] !== 'shop' || parts[1] !== 'product' || parts[3] !== productId) return null;
    const query = [...url.searchParams.entries()];
    if (query.length !== 1 || query[0][0] !== 'option-id' || query[0][1] !== variantId) return null;
    return url.href;
  } catch {
    return null;
  }
}

function merchantConfigurations(values) {
  const configurations = [];
  const seen = new Set();
  let visited = 0;
  const walk = (value) => {
    if (++visited > MAX_EMBEDDED_NODES || value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (Array.isArray(value.merchant_configs)) configurations.push(...value.merchant_configs);
    if (Array.isArray(value.merchantConfigs)) configurations.push(...value.merchantConfigs);
    for (const child of Object.values(value)) walk(child);
  };
  for (const value of values) walk(value);
  return configurations;
}

function exactMerchantConfiguration(configurations, id, store) {
  return configurations.some((entry) => {
    const merchant = entry?.merchant || entry;
    return merchantId(merchant) === id && exactPremises(entityAddress(merchant), store);
  });
}

function productMerchants(product) {
  const values = [
    ...(Array.isArray(product?.merchants) ? product.merchants : []),
    ...(Array.isArray(product?.merchant_options) ? product.merchant_options : []),
  ];
  if (!values.length && Array.isArray(product?.options)) values.push({ product_options: product.options });
  return values;
}

function merchantOptions(merchant) {
  return [
    ...(Array.isArray(merchant?.product_options) ? merchant.product_options : []),
    ...(Array.isArray(merchant?.productOptions) ? merchant.productOptions : []),
    ...(Array.isArray(merchant?.options) ? merchant.options : []),
  ];
}

function productDescription(product, option) {
  const display = option?.option_display_data || option?.optionDisplayData || {};
  return [
    product?.name,
    product?.title,
    product?.basic_category,
    product?.category,
    product?.subcategory,
    product?.size,
    display?.name,
    display?.basic_category,
    display?.category,
    display?.size,
  ].map(normalizedText).filter(Boolean).join(' ');
}

export function parseMetroCityHiveHtml(html, candidateSource) {
  const source = canonicalSource(candidateSource);
  if (!source || source.platform !== 'cityhive' || !source.inventoryEligible) return [];
  const embeddedValues = embeddedJsonValues(html);
  const configurations = merchantConfigurations(embeddedValues);
  const rows = [];
  const seen = new Set();
  for (const payload of productPayloads(embeddedValues)) {
    for (const product of payload.products) {
      if (!product || typeof product !== 'object') continue;
      for (const merchant of productMerchants(product)) {
        const parentMerchantId = merchantId(merchant);
        for (const option of merchantOptions(merchant)) {
          const id = String(option?.merchant_id || option?.merchantId || parentMerchantId).trim();
          const configuredStore = source.stores.find((candidate) => candidate.merchantId === id);
          if (!configuredStore || parentMerchantId && parentMerchantId !== id) continue;
          if (!exactMerchantConfiguration(configurations, id, configuredStore)) continue;
          if (!exactPremises(entityAddress(merchant), configuredStore) || !exactPremises(entityAddress(option), configuredStore)) continue;
          if (!hasPickupOffer(merchant?.offer_types, merchant?.offerTypes, merchant?.fulfillment, option?.offer_types, option?.offerTypes, option?.fulfillment)) continue;
          const quantity = normalizeMetroCityHiveQuantity(option?.quantity);
          if (quantity.reportedQuantity <= 0) continue;
          const title = normalizedText(option?.option_display_data?.name || option?.optionDisplayData?.name || product.name || product.title);
          const description = productDescription(product, option);
          const explicitSize = option?.option_display_data?.size?.quantity
            ?? option?.optionDisplayData?.size?.quantity
            ?? product?.size?.quantity;
          const explicitUnit = option?.option_display_data?.size?.measure
            ?? option?.optionDisplayData?.size?.measure
            ?? product?.size?.measure;
          const packSize = option?.pack_size ?? option?.packSize ?? product?.pack_size ?? product?.packSize;
          const containerType = option?.container_type ?? option?.containerType ?? product?.container_type ?? product?.containerType;
          if (!isAllowedMetroBottle(title, { explicitSize, explicitUnit, packSize, containerType })
            || !isAllowedMetroBottle(description, { explicitSize, explicitUnit, packSize, containerType })) continue;
          const productId = String(option?.product_id || option?.productId || product?.id || product?._id || '').trim();
          const variantId = String(option?.option_id || option?.optionId || option?.id || option?._id || '').trim();
          if (!productId || !variantId) continue;
          const productUrl = exactProductUrl(option?.product_url || option?.productUrl || option?.url, source, productId, variantId);
          if (!productUrl) continue;
          const key = `${id}:${productId}:${variantId}:${productUrl}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const price = Number(option?.price);
          rows.push({
            merchantId: id,
            storeId: configuredStore.id,
            productId,
            variantId,
            title,
            productUrl,
            price: Number.isFinite(price) && price >= 0 ? price : null,
            ...quantity,
            sourceAvailabilityVerified: true,
            pickupOfferVerified: true,
            premisesVerified: true,
            inventorySemantics: quantity.binaryAvailability
              ? 'binary_retailer_orderable_no_exact_count'
              : 'exact_retailer_reported_quantity',
          });
        }
      }
    }
  }
  return rows;
}

export function verifyMetroShopifyFulfillmentPolicy(candidateSource, html) {
  const source = canonicalSource(candidateSource);
  if (!source || source.platform !== 'shopify' || !source.inventoryEligible || typeof html !== 'string' || !html.trim()) return false;
  let policyUrl;
  try { policyUrl = new URL(source.fulfillmentPolicyUrl); } catch { return false; }
  if (policyUrl.protocol !== 'https:' || policyUrl.hostname.toLowerCase() !== source.host.toLowerCase()) return false;
  if (!hasPickupOffer(html)) return false;
  const pageText = ` ${normalizeMetroPremises(html)} `;
  const premises = source.stores.length === 1 ? normalizeMetroPremises(source.stores[0].address) : '';
  return Boolean(premises) && pageText.includes(` ${premises} `);
}

function parsePayload(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' ? value : null;
}

function shopifyProductUrl(source, handle) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(handle)) return null;
  try {
    const url = new URL(`/products/${handle}`, source.baseUrl);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === source.host.toLowerCase() ? url.href : null;
  } catch {
    return null;
  }
}

export function parseMetroShopifyProducts(payload, candidateSource) {
  const source = canonicalSource(candidateSource);
  const parsed = parsePayload(payload);
  if (!source || source.platform !== 'shopify' || !source.inventoryEligible || !Array.isArray(parsed?.products) || source.stores.length !== 1) return [];
  const rows = [];
  const seen = new Set();
  for (const product of parsed.products) {
    if (!product || typeof product !== 'object' || !Array.isArray(product.variants)) continue;
    const title = normalizedText(product.title);
    const handle = String(product.handle || '').trim();
    const productUrl = shopifyProductUrl(source, handle);
    const productText = [title, handle, product.product_type, product.tags].map(normalizedText).join(' ');
    if (!productUrl || !isAllowedMetroBottle(title) || !isAllowedMetroBottle(productText)) continue;
    const productId = String(product.id || '').trim();
    if (!productId) continue;
    for (const variant of product.variants) {
      if (!variant || typeof variant !== 'object' || variant.available !== true) continue;
      const variantId = String(variant.id || '').trim();
      const variantTitle = normalizedText(variant.title);
      if ((/\brye\b/iu.test(variantTitle) && !/\bbourbon\b/iu.test(variantTitle))
        || !variantId || !isAllowedMetroBottle(`${productText} ${variantTitle}`, {
        packSize: variant.pack_size ?? variant.packSize,
        containerType: variant.container_type ?? variant.containerType,
      })) continue;
      const key = `${productId}:${variantId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const price = Number(variant.price);
      rows.push({
        merchantId: source.stores[0].merchantId,
        storeId: source.stores[0].id,
        productId,
        variantId,
        title,
        handle,
        variantTitle,
        productUrl,
        sku: String(variant.sku || '').trim() || null,
        price: Number.isFinite(price) && price >= 0 ? price : null,
        reportedQuantity: null,
        quantity: 0,
        quantityIsExact: false,
        binaryAvailability: true,
        sourceAvailabilityVerified: true,
        premisesVerified: true,
        inventorySemantics: 'binary_retailer_orderable_no_exact_count',
      });
    }
  }
  return rows;
}

export function filterFreshMetroSignals(signals, nowMs = Date.now(), maxAgeMs) {
  if (!Array.isArray(signals) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return [];
  return signals.filter((signal) => {
    const observedMs = Date.parse(String(signal?.observedAt || ''));
    const ageMs = nowMs - observedMs;
    return Number.isFinite(observedMs) && ageMs >= 0 && ageMs <= maxAgeMs;
  });
}

export function mergeMetroSourceCacheSignals(liveSignals, cachedSignals, completedSourceIds = new Set()) {
  const merged = [];
  const seen = new Set();
  for (const signal of Array.isArray(liveSignals) ? liveSignals : []) {
    if (!signal?.id || seen.has(signal.id)) continue;
    seen.add(signal.id);
    merged.push(signal);
  }
  for (const signal of Array.isArray(cachedSignals) ? cachedSignals : []) {
    if (!signal?.id || seen.has(signal.id) || completedSourceIds.has(String(signal.sourceChain || ''))) continue;
    seen.add(signal.id);
    merged.push(signal);
  }
  return merged;
}
