const PRODUCT_URL = 'https://www.oldvinewineomaha.com/product/blade-and-bow-bourbon/';
const HOST = 'www.oldvinewineomaha.com';
const PRODUCT_ID = '17823';
const BOTTLE_ID = 'bb_8924180d0cc2d853';
const CANONICAL = 'Blade and Bow Bourbon';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const NE_OLD_VINE_RESEARCH_SOURCE = Object.freeze({
  id: 'NE-old-vine-omaha',
  state: 'NE',
  label: 'Old Vine Wine & Spirits Omaha retained orderability research',
  productUrl: PRODUCT_URL,
  premise: Object.freeze({
    license: '113941', licenseClass: 'Retail C', name: 'Old Vine Wine & Spirits',
    address: '3821 N 167th Ct Suite 145', city: 'Omaha', state: 'NE', zip: '68116',
  }),
  premiseProof: Object.freeze({
    licenseRosterSha256: '26023437c231d753a31919b8c4dbac68e9a5cfb9aace5ce62f9b907390bd5e76',
    licenseRosterObservedAt: '2026-11-13',
    licenseRosterArtifact: 'ne-licensing-1113.xlsx',
  }),
  pickupPolicy: Object.freeze({
    mode: 'public_single_store_pickup',
    sourceUrls: Object.freeze(['https://www.oldvinewineomaha.com/', 'https://www.oldvinewineomaha.com/retail-shop/']),
    reviewedStoreAddress: '3821 N 167th Ct Suite 145, Omaha, NE 68116',
  }),
  status: 'research_only',
});

function parseProductJsonLd(html) {
  for (const match of String(html || '').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      const items = Array.isArray(value) ? value : [value, ...(value?.['@graph'] || [])];
      const product = items.find(item => item?.['@type'] === 'Product' && item?.offers);
      if (product) return product;
    } catch {}
  }
  return null;
}

function exactLibraryIdentity(bible) {
  const record = bible?.records?.find(item => item.id === BOTTLE_ID && item.canonical === CANONICAL);
  const identity = record?.libraryIdentities?.find(item => item.id === BOTTLE_ID
    && item.canonicalName === CANONICAL && item.nationalTier === 'limited' && item.isAlertEligible === true);
  return record && identity ? record : null;
}

/** Offline-only exact replay parser. No collector or production source registry calls this function. */
export function parseOldVineBladeAndBowResearchPage(html, bible, {
  finalUrl = PRODUCT_URL, observedAt, now = Date.now(),
} = {}) {
  const observedMs = Date.parse(observedAt || '');
  if (finalUrl !== PRODUCT_URL || !Number.isFinite(observedMs) || !Number.isFinite(now)
    || observedMs - now > 5 * 60_000 || now - observedMs > MAX_AGE_MS) return null;
  const text = String(html || '');
  const canonical = text.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]
    || text.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
  const productElement = text.match(/<div\b(?=[^>]*\bid=["']product-17823["'])([^>]*)>/i)?.[0] || '';
  const classes = productElement.match(/\bclass=["']([^"']+)["']/i)?.[1]?.split(/\s+/) || [];
  const product = parseProductJsonLd(text);
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const form = text.match(/<form\b(?=[^>]*\bclass=["']cart["'])([\s\S]*?)<\/form>/i)?.[0] || '';
  const addToCartId = form.match(/\bname=["']add-to-cart["'][^>]*\bvalue=["'](\d+)["']/i)?.[1]
    || form.match(/\bvalue=["'](\d+)["'][^>]*\bname=["']add-to-cart["']/i)?.[1];
  const description = String(product?.description || '').replace(/\s+/g, ' ');
  const exactBottleDescription = /\bOne\s+91\s+proof\s+750\s*mL\s+bottle\s+of\s+Blade and Bow Kentucky Straight Bourbon Whiskey(?=Features|\b)/i.test(description);
  const premise = NE_OLD_VINE_RESEARCH_SOURCE.premise;
  const productUrl = product?.url;
  const sellerUrl = offer?.seller?.url;
  const availability = offer?.availability;
  const price = Number(offer?.price);
  const record = exactLibraryIdentity(bible);
  if (canonical !== PRODUCT_URL || !classes.includes('status-publish') || !classes.includes('instock')
    || !classes.includes('purchasable') || !classes.includes('product-type-simple')
    || !product || product.name !== CANONICAL || String(product.sku) !== PRODUCT_ID
    || productUrl !== PRODUCT_URL || sellerUrl !== 'https://www.oldvinewineomaha.com'
    || !['https://schema.org/InStock', 'http://schema.org/InStock'].includes(availability)
    || !Number.isFinite(price) || price <= 0 || offer?.priceCurrency !== 'USD'
    || !exactBottleDescription || addToCartId !== PRODUCT_ID || !record) return null;

  return {
    id: `research:ne:old-vine:${premise.license}:${PRODUCT_ID}`,
    state: 'NE', sourceLabel: NE_OLD_VINE_RESEARCH_SOURCE.label,
    sourceUrl: PRODUCT_URL, sourceChain: 'research:ne:old-vine-woocommerce',
    storeId: `ne:retail-c:${premise.license}`, storeName: premise.name,
    storeAddress: `${premise.address}, ${premise.city}, ${premise.state} ${premise.zip}`,
    city: premise.city, zip: premise.zip, productId: PRODUCT_ID,
    rawName: product.name, canonicalBottleId: record.id, canonicalName: record.canonical,
    tier: 'limited', eventType: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    quantity: 0, quantityIsExact: false, price, observedAt, fetchedAt: observedAt,
    availabilityStatus: 'in_stock', availabilityLabel: 'Retailer reports the bottle available to order for pickup',
    inventorySemantics: 'binary_retailer_orderability', researchOnly: true,
    canAlertAsInventory: false, canAlertAsWatch: false, eligibleForDelivery: false, eligibleForOnSite: false,
    stale: false, sourceStale: false,
    sourceProductBinding: {
      host: HOST, productId: PRODUCT_ID, sku: PRODUCT_ID, sizeMl: 750, proof: 91,
      storeId: `ne:retail-c:${premise.license}`, pickupVerified: true,
      pickupPolicy: NE_OLD_VINE_RESEARCH_SOURCE.pickupPolicy.mode,
      productPageAvailability: availability, observedAt, shadowOnly: true,
    },
    premiseProof: NE_OLD_VINE_RESEARCH_SOURCE.premiseProof,
    raw: { productName: product.name, descriptionSizeProof: 'One 91 proof 750 mL bottle', quantitySemantics: 'unknown; max order quantity is not shelf count', shadowOnly: true },
  };
}

export function isOldVineNebraskaResearchRow(row) {
  return row?.state === 'NE' && row?.sourceChain === 'research:ne:old-vine-woocommerce'
    && row?.storeId === 'ne:retail-c:113941'
    && row?.storeAddress === '3821 N 167th Ct Suite 145, Omaha, NE 68116'
    && row?.productId === PRODUCT_ID && row?.canonicalBottleId === BOTTLE_ID
    && row?.canonicalName === CANONICAL && row?.tier === 'limited'
    && row?.sourceProductBinding?.host === HOST && row?.sourceProductBinding?.sizeMl === 750
    && row?.sourceProductBinding?.proof === 91 && row?.sourceProductBinding?.pickupVerified === true
    && row?.researchOnly === true && row?.canAlertAsInventory === false && row?.canAlertAsWatch === false
    && row?.eligibleForDelivery === false && row?.eligibleForOnSite === false
    && row?.quantity === 0 && row?.quantityIsExact === false && Number.isFinite(row?.price) && row.price > 0;
}
