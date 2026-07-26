const MAX_BYTES = 8 * 1024 * 1024;
const MAX_NODES = 25_000;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(normalize).join(' ');
  return decodeHtml(value).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function normalizeCityHivePremises(value) {
  return normalize(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\b(?:united states of america|united states|usa)\b/gu, ' ')
    .replace(/\bmount\b/gu, 'mt')
    .replace(/\broad\b/gu, 'rd')
    .replace(/\bstreet\b/gu, 'st')
    .replace(/\bavenue\b/gu, 'ave')
    .replace(/\bboulevard\b/gu, 'blvd')
    .replace(/\bsuite\b/gu, 'ste')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function exactPremises(value, store) {
  if (!value) return false;
  const observed = normalizeCityHivePremises(value);
  const approved = [store.address, ...(Array.isArray(store.platformAddresses) ? store.platformAddresses : [])]
    .filter(Boolean)
    .map(normalizeCityHivePremises);
  return approved.includes(observed);
}

function embeddedJson(html) {
  const source = String(html || '');
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_BYTES * 2) return [];
  const values = [];
  for (const match of source.matchAll(/<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    const raw = decodeHtml(match[1]).trim();
    if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BYTES) continue;
    try { values.push(JSON.parse(raw)); } catch { /* malformed source fails closed */ }
  }
  for (const match of source.matchAll(/decodeURIComponent\(\s*(["'`])([\s\S]*?)\1\s*\)/giu)) {
    let decoded = match[2];
    try { decoded = decodeURIComponent(decoded); } catch { continue; }
    try { values.push(JSON.parse(decoded)); } catch { /* malformed source fails closed */ }
  }
  return values;
}

function nested(values, predicate) {
  const found = [];
  const seen = new Set();
  let visited = 0;
  const walk = (value) => {
    if (++visited > MAX_NODES || value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (predicate(value)) found.push(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child);
  };
  values.forEach(walk);
  return found;
}

function addressText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.full_address || value.fullAddress || value.formatted_address || value.formattedAddress || [
    value.address1 || value.address_1 || value.street || value.street_address,
    value.address2 || value.address_2 || value.unit,
    value.city,
    value.state || value.stateCode,
    value.zip || value.zipcode || value.postalCode,
  ].filter(Boolean).join(' ');
}

function entityAddress(value) {
  return addressText(value?.full_address || value?.fullAddress || value?.address || value?.address_properties || value?.addressProperties);
}

function merchantId(value) {
  return String(value?.merchant_id || value?.merchantId || value?.merchant?.id || value?.merchant?._id || value?.id || value?._id || '').trim();
}

function pickup(...values) {
  return /\b(?:pick[\s_-]*up|store[\s_-]*pickup|in[\s_-]*store[\s_-]*pickup)\b/iu.test(values.map(normalize).join(' '));
}

function exactProductUrl(value, source, productId, variantId) {
  try {
    const url = new URL(String(value || ''));
    const base = new URL(source.baseUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const query = [...url.searchParams.entries()];
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.hash) return null;
    if (parts.length !== 4 || parts[0] !== 'shop' || parts[1] !== 'product' || parts[3] !== productId) return null;
    if (query.length !== 1 || query[0][0] !== 'option-id' || query[0][1] !== variantId) return null;
    return url.href;
  } catch {
    return null;
  }
}

function canonicalSource(candidate, sources) {
  const source = (sources || []).find((entry) => entry.id === candidate?.id);
  if (!source) return null;
  return source.merchantId === candidate.merchantId
    && source.hostname === candidate.hostname
    && source.categoryUrl === candidate.categoryUrl
    && source.address === candidate.address
    ? source
    : null;
}

export function parseCityHiveProducts(html, candidateSource, {
  sources = [],
  isAllowedBottleFormat = () => true,
} = {}) {
  const source = canonicalSource(candidateSource, sources);
  if (!source || source.platform !== 'cityhive') return [];
  const values = embeddedJson(html);
  const merchantConfigurations = nested(values, (value) => Array.isArray(value.merchant_configs) || Array.isArray(value.merchantConfigs))
    .flatMap((value) => value.merchant_configs || value.merchantConfigs);
  const exactConfig = merchantConfigurations.some((entry) => {
    const merchant = entry?.merchant || entry;
    return merchantId(merchant) === source.merchantId && exactPremises(entityAddress(merchant), source);
  });
  if (!exactConfig) return [];
  const payloads = nested(values, (value) => Array.isArray(value.products));
  const rows = [];
  const seen = new Set();
  for (const payload of payloads) {
    for (const product of payload.products) {
      const merchants = [
        ...(Array.isArray(product?.merchants) ? product.merchants : []),
        ...(Array.isArray(product?.merchant_options) ? product.merchant_options : []),
      ];
      for (const merchant of merchants) {
        const parentId = merchantId(merchant);
        if (parentId !== source.merchantId || !exactPremises(entityAddress(merchant), source)) continue;
        const options = [
          ...(Array.isArray(merchant.product_options) ? merchant.product_options : []),
          ...(Array.isArray(merchant.productOptions) ? merchant.productOptions : []),
          ...(Array.isArray(merchant.options) ? merchant.options : []),
        ];
        for (const option of options) {
          const optionMerchantId = String(option.merchant_id || option.merchantId || parentId);
          if (optionMerchantId !== source.merchantId || !exactPremises(entityAddress(option), source)) continue;
          if (!pickup(merchant.offer_types, merchant.offerTypes, merchant.fulfillment, option.offer_types, option.offerTypes, option.fulfillment)) continue;
          const reportedQuantity = Number(option.quantity);
          if (!Number.isInteger(reportedQuantity) || reportedQuantity <= 0) continue;
          const productId = String(option.product_id || option.productId || product.id || product._id || '').trim();
          const variantId = String(option.option_id || option.optionId || option.id || option._id || '').trim();
          const title = normalize(option.option_display_data?.name || option.optionDisplayData?.name || product.name || product.title);
          const description = normalize([title, product.basic_category, product.category, option.option_display_data, option.optionDisplayData]);
          if (!productId || !variantId || !isAllowedBottleFormat(title) || !isAllowedBottleFormat(description)) continue;
          const productUrl = exactProductUrl(option.product_url || option.productUrl || option.url, source, productId, variantId);
          if (!productUrl) continue;
          const key = `${source.merchantId}:${productId}:${variantId}:${productUrl}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const parsedPrice = Number(option.price);
          rows.push({
            merchantId: source.merchantId,
            productId,
            variantId,
            title,
            productUrl,
            price: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : null,
            reportedQuantity,
            quantity: 0,
            quantityIsExact: false,
            sourceAvailabilityVerified: true,
            pickupOfferVerified: true,
            premisesVerified: true,
            inventorySemantics: 'binary_retailer_orderable_no_exact_count',
          });
        }
      }
    }
  }
  return rows;
}
