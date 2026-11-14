import { stripHtml } from '../core/text.mjs';

const size750 = /\b750\s*ml$/iu;
const quantityText = /^In stock:\s+([1-9]\d*)\s+available$/u;
const pickupWindow = /^Pickup:\s+(?:today|tomorrow|[A-Za-z]{3,9},?\s+\d{1,2}\s+[A-Za-z]{3,9}),\s+\d{1,2}:\d{2}\s+[AP]M\s*[\u2013\u2014\ufffd-]\s*\d{1,2}:\d{2}\s+[AP]M$/iu;
const availability = /^https?:\/\/schema\.org\/(InStock|OutOfStock)$/u;

function visibleHtml(html) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '').replace(/<!--[\s\S]*?-->/gu, '');
}

function addressText(value) {
  return stripHtml(value).normalize('NFKC').replace(/,?\s+/gu, ' ').toLowerCase();
}

function assertMerchant(html, merchant) {
  const state = /\bwindow\.initialState\s*=\s*("(?:\\.|[^"\\])*")/u.exec(html)?.[1];
  if (!state) throw Error('Ecwid storefront is missing its initial state.');
  const profile = JSON.parse(JSON.parse(state)).profile?.profile;
  if (String(profile?.storeId) !== merchant.merchantId || profile?.storeName !== merchant.name
    || profile?.countryCode !== 'US' || profile?.siteUrl !== merchant.origin
    || profile?.storeClosed !== false || profile?.storeSuspended !== false) {
    throw Error('Ecwid account, host or operating status changed.');
  }
}

/** Confirm the public storefront binds the reviewed Ecwid merchant to one exact address. */
export function verifyEcwidPickupPremise(html, merchant) {
  assertMerchant(html, merchant);
  const addresses = [...visibleHtml(html).matchAll(/<div\b[^>]*\bclass="[^"]*\bins-tile__address\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gu)]
    .map(match => addressText(match[1]));
  if (!addresses.length || addresses.some(address => address !== addressText(merchant.address))) {
    throw Error('Ecwid storefront did not resolve to the reviewed physical premise.');
  }
  return true;
}

/** Return orderability for one product on a previously bound first-party merchant. */
export function parseEcwidPickupOffer(html, merchant, product) {
  assertMerchant(html, merchant);
  const blocks = [...html.matchAll(/<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu)]
    .map(match => JSON.parse(match[1])).filter(value => value?.['@type'] === 'Product');
  const [details] = blocks;
  const offer = details?.offers;
  const stock = availability.exec(offer?.availability || '')?.[1];
  const price = Number(offer?.price);
  const imageUrls = (Array.isArray(details?.image) ? details.image : [details?.image])
    .map(image => URL.parse(typeof image === 'string' ? image : image?.contentUrl));
  const expectedImagePath = `/images/${merchant.merchantId}/products/${product.productId}/`;
  if (blocks.length !== 1 || details.name !== product.name || !size750.test(details.name)
    || details.sku !== product.sku || (details.gtin12 != null && details.gtin12 !== product.sku) || offer?.['@type'] !== 'Offer'
    || offer?.url !== product.url || new URL(product.url).origin !== merchant.origin
    || offer?.seller?.name !== merchant.name || offer?.priceCurrency !== 'USD' || !Number.isFinite(price) || price <= 0
    || !stock || !imageUrls.length || imageUrls.some(url => url?.protocol !== 'https:'
      || url.hostname !== 'd2j6dbq0eux0bg.cloudfront.net' || !url.pathname.startsWith(expectedImagePath))) {
    throw Error('Ecwid exact product, price or seller evidence changed.');
  }
  const page = visibleHtml(html);
  const visibleSkus = [...page.matchAll(/<meta\s+itemprop="sku"\s+content="([0-9]+)"\s*\/?>/gu)];
  if (visibleSkus.length !== 1 || visibleSkus[0][1] !== product.sku) throw Error('Ecwid displayed SKU did not match its offer.');
  const stockText = [...page.matchAll(/<div\b[^>]*\bclass="[^"]*\bdetails-product-purchase__place\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gu)]
    .map(match => stripHtml(match[1]));
  const pickupText = [...page.matchAll(/<div\b[^>]*\bclass="[^"]*\bec-iconable-block__text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gu)]
    .map(match => stripHtml(match[1])).filter(value => value.startsWith('Pickup:'));
  const buttons = [...page.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gu)]
    .filter(match => stripHtml(match[2]) === 'Add to Bag');
  const enabled = buttons.length === 1 && !/\bdisabled\b|aria-disabled\s*=\s*["']true["']/iu.test(buttons[0][1]);
  if (stock === 'OutOfStock') {
    if (enabled || stockText.some(value => quantityText.test(value))) throw Error('Ecwid reports conflicting inventory status.');
    return null;
  }
  const quantity = stockText.length === 1 ? Number(quantityText.exec(stockText[0])?.[1]) : 0;
  if (!enabled || !Number.isSafeInteger(quantity) || quantity < 1
    || pickupText.length !== 1 || !pickupWindow.test(pickupText[0])) {
    throw Error('Ecwid did not confirm that this positive stock can be picked up.');
  }
  return { price, reportedQuantity: quantity, pickupWindow: pickupText[0], availableForPickup: true };
}
