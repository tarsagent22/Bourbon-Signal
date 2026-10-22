// Reviewed against Binny's public Products_Production capture on 2026-10-22.
// These are exact retailer identities, not aliases available to other sources.
const REVIEWED_PRODUCTS = new Map([
  ['982098', { name: 'Heaven Hill 7 year old Bottled in Bond Kentucky Straight Bourbon', canonical: 'Heaven Hill Bottled-in-Bond 7 Year', proof: 100 }],
  ['190801', { name: "Blanton's Single Barrel Bourbon", canonical: "Blanton's Original Single Barrel", proof: 93 }],
]);

function exactText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function reviewedBinnysBottleMatch(rawName, bible, product = null) {
  const reviewed = REVIEWED_PRODUCTS.get(String(product?.objectID || ''));
  const reviewedName = [...REVIEWED_PRODUCTS.values()].some((row) => exactText(row.name) === exactText(rawName));
  if (!reviewed && !reviewedName) return { handled: false };
  const rejected = { handled: true, match: null, record: null };
  if (!reviewed || exactText(rawName) !== exactText(reviewed.name)) return rejected;
  if (exactText(product.productName) !== exactText(reviewed.name)
    || (product.shortDescription != null && exactText(product.shortDescription) !== exactText(reviewed.name))
    || (Object.hasOwn(product, 'variantCode') && String(product.variantCode) !== String(product.objectID))
    || Number(product.proof) !== reviewed.proof
    || exactText(product.itemSize) !== '750ml'
    || exactText(product.priceUnitLabel) !== '750 ml bottle'
    || exactText(product.productVarietal) !== 'bourbon'
    || (product.designations || []).some((value) => /\b(?:gift\s*(?:pack|set)|multi[\s-]*pack|sampler|miniature)\b/i.test(String(value)))) return rejected;
  try {
    const url = new URL(product.productUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'www.binnys.com' || url.username || url.password || url.search || url.hash
      || !url.pathname.endsWith(`-${product.objectID}/`)) return rejected;
  } catch { return rejected; }
  const match = bible.match(reviewed.canonical);
  if (!match?.record || match.record.canonical !== reviewed.canonical) return rejected;
  return {
    handled: true,
    match: { ...match, confidence: 1, method: 'reviewed-binnys-product-identity' },
    record: match.record,
  };
}

export function unsafeBinnysIdentity(rawName, record) {
  const raw = exactText(rawName);
  const canonical = exactText(record?.canonical);
  if (/\bevan williams\b/.test(raw) && /\b1783\b/.test(canonical) && !/\b1783\b/.test(raw)) return true;
  for (const modifier of ['double oak', 'double barrel']) {
    if (raw.includes(modifier) && !canonical.includes(modifier)) return true;
  }
  return false;
}
