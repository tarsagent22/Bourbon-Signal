function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&nbsp;/giu, ' ');
}

function plainText(value) {
  return decodeHtml(value).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function attribute(tag, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return decodeHtml(tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'iu'))?.[2]
    || tag.match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, 'iu'))?.[1]
    || '');
}

function sameHttpsHost(value, store) {
  try {
    const url = new URL(decodeHtml(value), store.baseUrl);
    return url.protocol === 'https:'
      && url.hostname.toLowerCase() === String(store.hostname || '').toLowerCase()
      && !url.username
      && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function hidden(tag) {
  const classes = attribute(tag, 'class').split(/\s+/u).filter(Boolean);
  return /<input\b[^>]*\btype\s*=\s*["']?hidden\b/iu.test(tag)
    || /\s(?:hidden|disabled)(?:\s|=|>)/iu.test(tag)
    || /aria-hidden\s*=\s*["']?true/iu.test(tag)
    || /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(tag)
    || classes.some((value) => ['hidden', 'd-none', 'sr-only'].includes(value.toLowerCase()));
}

function hiddenAncestor(html, index) {
  const stack = [];
  const prefix = String(html || '').slice(0, index)
    .replace(/<!--[\s\S]*?-->/gu, (value) => ' '.repeat(value.length))
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, (value) => ' '.repeat(value.length));
  for (const match of prefix.matchAll(/<\/?(div|li|article|section|ul|ol)\b[^>]*>/giu)) {
    const tag = match[0];
    const name = match[1].toLowerCase();
    if (/^<\//u.test(tag)) {
      for (let cursor = stack.length - 1; cursor >= 0; cursor -= 1) {
        if (stack[cursor].name !== name) continue;
        stack.splice(cursor);
        break;
      }
    } else {
      stack.push({ name, hidden: hidden(tag) || stack.some((entry) => entry.hidden) });
    }
  }
  return stack.some((entry) => entry.hidden);
}

function productBlocks(html) {
  const source = String(html || '');
  const starts = [...source.matchAll(/<(?:div|li|article)\b[^>]*class\s*=\s*["'][^"']*\bproduct-item\b[^"']*["'][^>]*>/giu)]
    .map((match) => ({ index: match.index, tag: match[0] }));
  return starts
    .map((start, index) => ({ ...start, block: source.slice(start.index, starts[index + 1]?.index ?? source.length) }))
    .filter((entry) => !hidden(entry.tag) && !hiddenAncestor(source, entry.index))
    .map((entry) => entry.block);
}

function price(block) {
  const value = Number(String(block).match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/u)?.[1] || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function productAnchor(block, store) {
  for (const match of block.matchAll(/<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/giu)) {
    const tag = match[0].slice(0, match[0].indexOf('>') + 1);
    if (hidden(tag)) continue;
    const url = sameHttpsHost(match[2], store);
    if (!url || url.search || url.hash || !/^\/p\/[^/]+\/\d+\/?$/iu.test(url.pathname)) continue;
    const title = plainText(match[3]) || plainText(attribute(tag, 'title'));
    if (title) return { url, title };
  }
  return null;
}

function escaped(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function canonicalStore(candidate, stores) {
  const store = (stores || []).find((entry) => entry.id === candidate?.id);
  if (!store) return null;
  return store.merchantId === candidate.merchantId
    && String(store.controlStoreId || store.cartStoreId || store.platformStoreId || '') === String(candidate.controlStoreId || candidate.cartStoreId || candidate.platformStoreId || '')
    && store.hostname === candidate.hostname
    && store.categoryUrl === candidate.categoryUrl
    && store.baseUrl === candidate.baseUrl
    ? store
    : null;
}

function displayedMerchantIdentity(block, productId, store) {
  const assignment = String(block).match(new RegExp(
    `(?:var|let|const)\\s+product_${escaped(productId)}\\s*=\\s*(\\{[^;]+\\})\\s*;`,
    'iu',
  ))?.[1];
  if (!assignment) return false;
  let product;
  try { product = JSON.parse(assignment); } catch { return false; }
  if (String(product.productId || '') !== String(productId)) return false;
  const identity = plainText(product.storeDisplayName).match(/\(([^()]*)\)\(([^,()]+),\s*(\d{5})\)\s*$/u);
  const displayedMerchantId = identity?.[1]?.match(/(?:^|-\s*)(\d+)\s*$/u)?.[1] || '';
  return Boolean(identity)
    && displayedMerchantId === String(store.merchantId)
    && plainText(identity[2]).toLowerCase() === plainText(store.city).toLowerCase()
    && identity[3] === String(store.zip);
}

export function parseGoToLiquorStoreProducts(html, candidateStore, {
  stores = [],
  isAllowedBottleFormat = () => true,
} = {}) {
  const store = canonicalStore(candidateStore, stores);
  if (!store || typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 8 * 1024 * 1024) return [];
  const rows = [];
  const seen = new Set();
  for (const block of productBlocks(html)) {
    const orderableProductIds = new Set();
    for (const match of block.matchAll(/<(a|button)\b[^>]*>[\s\S]*?<\/\1>|<input\b[^>]*>/giu)) {
      const control = match[0];
      if (hidden(control) || !/Add\s+to\s+Cart|GaAddtoCart|addproducttocart_list/iu.test(control)) continue;
      const controlStoreId = String(store.controlStoreId || store.cartStoreId || store.platformStoreId || store.merchantId);
      const storeId = escaped(controlStoreId);
      const listProductId = control.match(new RegExp(`addproducttocart_list\\(\\s*(\\d+)\\s*,\\s*['"]?${storeId}['"]?(?:\\s*,|\\s*\\))`, 'iu'))?.[1];
      const simpleProductId = control.match(new RegExp(`GaAddtoCart\\([\\s\\S]*?['"](\\d+)['"]\\s*,\\s*['"]${storeId}['"](?:\\s*,|\\s*\\))`, 'iu'))?.[1];
      const dataProductId = control.match(/\bdata-(?:product-?id|product)\s*=\s*["'](\d+)["']/iu)?.[1];
      const dataStoreId = control.match(/\bdata-store-?id\s*=\s*["'](\d+)["']/iu)?.[1];
      const explicitlyBoundDataId = dataStoreId === controlStoreId ? dataProductId : null;
      const productId = listProductId || simpleProductId || explicitlyBoundDataId;
      if (productId) orderableProductIds.add(productId);
    }
    if (!orderableProductIds.size) continue;
    const product = productAnchor(block, store);
    if (!product || !isAllowedBottleFormat(product.title)) continue;
    const productId = product.url.pathname.match(/\/(\d+)\/?$/u)?.[1] || '';
    if (!productId || !orderableProductIds.has(productId) || seen.has(product.url.href)) continue;
    if ((store.controlStoreId || store.cartStoreId) && !displayedMerchantIdentity(block, productId, store)) continue;
    seen.add(product.url.href);
    rows.push({
      productId,
      variantId: null,
      title: product.title,
      productUrl: product.url.href,
      price: price(block),
      reportedQuantity: null,
      quantity: 0,
      quantityIsExact: false,
      sourceAvailabilityVerified: true,
      pickupOfferVerified: true,
      premisesVerified: true,
      inventorySemantics: 'binary_retailer_orderable_no_exact_count',
    });
  }
  return rows;
}
