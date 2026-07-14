function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function plainText(value) {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?\s*>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}

function key(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function bottleSizeMl(value) {
  const match = String(value || '').match(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount * (match[2].toLowerCase() === 'l' ? 1000 : 1);
}

export function isUsefulBourbonSize(value) {
  const sizeMl = bottleSizeMl(value);
  return sizeMl == null || sizeMl > 375;
}

export function isAllowedHttpsHost(value, expectedHostname) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname.replace(/^www\./i, '').toLowerCase() === String(expectedHostname || '').replace(/^www\./i, '').toLowerCase();
  } catch {
    return false;
  }
}

export const FLORIDA_TAMPA_TARGET_STORES = new Map([
  ['2289', { name: 'Target Tampa West', address: '11627 W Hillsborough Ave, Tampa, FL 33635-9736', city: 'Tampa', zip: '33635-9736' }],
  ['2040', { name: "Target Tampa Central Walter's Crossing", address: '1544 N Dale Mabry Hwy, Tampa, FL 33607-2551', city: 'Tampa', zip: '33607-2551' }],
  ['798', { name: 'Target Town & Country', address: '6295 W Waters Ave, Tampa, FL 33634-1100', city: 'Tampa', zip: '33634-1100' }],
  ['655', { name: 'Target North Dale Mabry', address: '15240 N Dale Mabry Hwy, Tampa, FL 33618-1809', city: 'Tampa', zip: '33618-1809' }],
  ['656', { name: 'Target University Plaza', address: '13658 University Plaza St, Tampa, FL 33613-4649', city: 'Tampa', zip: '33613-4649' }],
  ['1051', { name: 'Target Gandy', address: '3625 W Gandy Blvd, Tampa, FL 33611-2607', city: 'Tampa', zip: '33611-2607' }],
  ['1820', { name: 'Target Clearwater', address: '2747 Gulf To Bay Blvd, Clearwater, FL 33759-3945', city: 'Clearwater', zip: '33759-3945' }],
  ['654', { name: 'Target Largo', address: '10500 Ulmerton Rd, Largo, FL 33771-3544', city: 'Largo', zip: '33771-3544' }],
  ['1131', { name: 'Target St Petersburg Gateway', address: '8151 Dr Martin Luther King St N, Saint Petersburg, FL 33702-4111', city: 'Saint Petersburg', zip: '33702-4111' }],
  ['1023', { name: 'Target Park & Tyrone', address: '4450 Park St N, Saint Petersburg, FL 33709-4020', city: 'Saint Petersburg', zip: '33709-4020' }],
  ['2064', { name: 'Target Pinellas Park', address: '7150 US 19 N, Pinellas Park, FL 33781-4600', city: 'Pinellas Park', zip: '33781-4600' }],
  ['812', { name: 'Target Brandon', address: '187 Brandon Town Center Dr, Brandon, FL 33511-4754', city: 'Brandon', zip: '33511-4754' }],
  ['2235', { name: 'Target Riverview', address: '10150 Bloomingdale Ave, Riverview, FL 33578-3612', city: 'Riverview', zip: '33578-3612' }],
  ['1382', { name: 'Target New Tampa', address: '1201 County Rd 581, Wesley Chapel, FL 33544-9261', city: 'Wesley Chapel', zip: '33544-9261' }],
  ['2919', { name: 'Target Wesley Chapel Grove', address: '27920 Pink Flamingo Ln, Wesley Chapel, FL 33544-4056', city: 'Wesley Chapel', zip: '33544-4056' }],
  ['2118', { name: 'Target Lutz Dale Mabry Highway', address: '1040 Dale Mabry Hwy, Lutz, FL 33548-3004', city: 'Lutz', zip: '33548-3004' }],
]);
export const FLORIDA_TAMPA_TARGET_STORE_IDS = new Set(FLORIDA_TAMPA_TARGET_STORES.keys());

export const FLORIDA_LUEKENS_STORES = [
  { id: 'luekens:clearwater', name: 'Luekens Clearwater', address: '23025 US Highway 19 North, Clearwater, FL 33765', city: 'Clearwater', zip: '33765' },
  { id: 'luekens:dunedin', name: 'Luekens Dunedin', address: '1410 Main Street, Dunedin, FL 34698', city: 'Dunedin', zip: '34698' },
  { id: 'luekens:oldsmar', name: 'Luekens Oldsmar', address: '3163 Curlew Road, Oldsmar, FL 34677', city: 'Oldsmar', zip: '34677' },
  { id: 'luekens:east-lake', name: 'Luekens East Lake', address: '36249 E Lake Rd, Palm Harbor, FL 34685', city: 'Palm Harbor', zip: '34685' },
  { id: 'luekens:seminole', name: 'Luekens Seminole', address: '6950 Seminole Boulevard, Seminole, FL 33772', city: 'Seminole', zip: '33772' },
  { id: 'luekens:kennedy-tampa', name: 'Luekens Kennedy (Tampa)', address: '4643 West Kennedy Boulevard, Tampa, FL 33609', city: 'Tampa', zip: '33609' },
  { id: 'luekens:midtown-tampa', name: 'Luekens Midtown (Tampa)', address: '236 North Dale Mabry Highway, Tampa, FL 33609', city: 'Tampa', zip: '33609' },
  { id: 'luekens:tarpon', name: 'Luekens Tarpon', address: '41522 US Highway 19 North, Tarpon Springs, FL 34689', city: 'Tarpon Springs', zip: '34689' },
];

export function parseLuekensPickupAvailability(html) {
  const rows = [];
  for (const match of String(html || '').matchAll(/<li\b[^>]*class="[^"]*pickup-availability-list__item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    if (!/class="[^"]*alert--success/i.test(block) || !/pickup\s+available/i.test(plainText(block))) continue;
    const name = plainText(block.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '');
    const address = plainText(block.match(/<address\b[^>]*>([\s\S]*?)<\/address>/i)?.[1] || '').replace(/,?\s*United States.*$/i, '');
    const store = FLORIDA_LUEKENS_STORES.find((candidate) => key(candidate.name) === key(name));
    if (!store || !address.includes(store.zip) || !/,?\s*FL\s+\d{5}/i.test(address)) continue;
    rows.push({ ...store, observedAddress: address });
  }
  return rows;
}

export function parseLightspeedCatalogEntries(html) {
  const rows = [];
  const seen = new Set();
  const pattern = /<div\b[^>]*class="[^"]*product-block[^"]*"[^>]*data-json="([^"]+)"[\s\S]*?<img\b[^>]*alt="([^"]+)"/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    const jsonUrl = decodeHtmlEntities(match[1]);
    const title = plainText(match[2]);
    if (!title || !/^https:\/\//i.test(jsonUrl) || seen.has(jsonUrl)) continue;
    seen.add(jsonUrl);
    rows.push({ title, jsonUrl });
  }
  return rows;
}

export function parseLightspeedProductInventory(payload) {
  const product = payload?.product;
  const stock = product?.stock;
  const productId = String(product?.id || product?.vid || '').trim();
  const rawName = plainText(product?.fulltitle || product?.title || '');
  const quantity = Number(stock?.level);
  if (!productId || !rawName || stock?.available !== true || stock?.on_stock !== true || !Number.isFinite(quantity) || quantity <= 0) return null;
  const priceValue = Number(product?.price?.price || product?.price?.price_incl || 0);
  return {
    productId,
    rawName,
    quantity,
    price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
    sku: product.sku || product.code || product.ean || null,
    path: product.url || null,
  };
}

function extractJsonArrayAfter(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = text.indexOf('[', markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

export function parseSquarespaceInventoryItems(html) {
  const decoded = decodeHtmlEntities(html);
  const json = extractJsonArrayAfter(decoded, '"items":');
  if (!json) return [];
  let items = [];
  try { items = JSON.parse(json); } catch { return []; }
  if (!Array.isArray(items)) return [];
  const rows = [];
  for (const item of items) {
    if (item?.published === false || item?.soldOut === true || !Array.isArray(item?.variants)) continue;
    for (const variant of item.variants) {
      const quantity = Number(variant?.qtyInStock);
      if (variant?.soldOut === true || !Number.isFinite(quantity) || quantity <= 0) continue;
      const priceValue = Number(variant?.price?.value || item?.price?.value || 0);
      rows.push({
        productId: String(item.id || ''), variantId: String(variant.id || ''), title: plainText(item.title || ''),
        sku: variant.sku || null, quantity, price: Number.isFinite(priceValue) && priceValue > 0 ? priceValue : null,
        path: item.fullUrl || null,
      });
    }
  }
  return rows;
}
