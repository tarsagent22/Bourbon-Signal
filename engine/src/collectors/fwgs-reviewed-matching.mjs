// These are product identities from the frozen FWGS pickup capture, not aliases
// for other sources. Availability still requires independent retail-store proof.
export const FWGS_REVIEWED_PRODUCT_CONTRACT = 'bourbon-signal-fwgs-reviewed-product-v1';
export const FWGS_REVIEWED_SOURCE_HOST = 'www.finewineandgoodspirits.com';

export const FWGS_REVIEWED_PRODUCT_IDENTITIES = Object.freeze([
  {
    sku: '000006917', name: "Booker's Straight Bourbon", brand: 'Bookers',
    category: 'Bourbon', type: 'spirit', route: '/bookers-straight-bourbon/product/000006917',
    canonicalBottleId: 'bb_8b9546b93a7fbe72', canonicalName: "Booker's Bourbon", tier: 'limited', producer: 'Jim Beam',
  },
  {
    sku: '000031835', name: 'Elijah Craig Straight Bourbon Small Batch Barrel Proof', brand: 'Elijah Craig',
    category: 'Bourbon', type: 'spirit', route: '/elijah-craig-straight-bourbon-small-batch-barrel-proof/product/000031835',
    canonicalBottleId: 'bb_be6a0afd4ba5f963', canonicalName: 'Elijah Craig Barrel Proof', tier: 'allocated', producer: 'Heaven Hill',
  },
  {
    sku: '000082899', name: 'John E Fitzgerald Larceny Straight Bourbon Barrel Proof', brand: 'Larceny',
    category: 'Bourbon', type: 'spirit', route: '/john-e-fitzgerald-larceny-straight-bourbon-barrel-proof/product/000082899',
    canonicalBottleId: 'bb_dec2c347ba378237', canonicalName: 'Larceny Barrel Proof', tier: 'standard', producer: 'Heaven Hill',
  },
  {
    sku: '000049054', name: 'Henry McKenna Single Barrel Straight Bourbon Bottled in Bond 10 Year Old', brand: 'Henry McKenna',
    category: 'Bourbon', type: 'spirit', route: '/henry-mckenna-single-barrel-straight-bourbon-bottled-in-bond-10-year-old/product/000049054',
    canonicalBottleId: 'bb_b7ca7cc4ab428ba8', canonicalName: 'Henry McKenna 10 Year', tier: 'allocated', producer: 'Heaven Hill',
  },
  {
    sku: '000098329', name: 'Knob Creek Straight Bourbon 12 Year Old', brand: 'Knob Creek',
    category: 'Bourbon', type: 'spirit', route: '/knob-creek-straight-bourbon-12-year-old/product/000098329',
    canonicalBottleId: 'bb_b9ba3c062c5338f0', canonicalName: 'Knob Creek 12 Year', tier: 'standard', producer: 'Jim Beam',
  },
  {
    sku: '100022752', name: '1792 Straight Bourbon Bottled In Bond', brand: '1792 Ridgemount',
    // The reviewed source explicitly publishes null here. Missing or changed
    // category data must not silently become equivalent to this signature.
    category: null, type: 'spirit', route: '/1792-straight-bourbon-bottled-in-bond/product/100022752',
    canonicalBottleId: 'bb_35ca289802735a45', canonicalName: '1792 Bottled in Bond', tier: 'limited', producer: 'Barton',
  },
].map(Object.freeze));

const IDENTITY_FIELDS = ['sku', 'name', 'brand', 'category', 'type', 'route'];
const UNREVIEWED_VARIANT_FIELDS = [
  'batch', 'batchCode', 'batchNumber', 'age', 'ageYears', 'proof', 'abv',
  'size', 'bottleSize', 'format', 'variant', 'variantId', 'variantTitle',
];

function rejected(reason, reviewed = true) {
  return { reviewed, match: null, record: null, reason, proof: null };
}

/**
 * Map only the six reviewed FWGS SKU/title/brand/category/type/route tuples.
 * No generic Bible matching, fuzzy aliases, online stock, quantity, or source
 * timestamp can establish this identity. A match makes no availability claim.
 */
export function reviewedFwgsBottleMatch(product, bible) {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return rejected('invalid_fwgs_product', false);
  const identity = FWGS_REVIEWED_PRODUCT_IDENTITIES.find((entry) => entry.sku === product.sku);
  if (!identity) {
    const resemblesReviewedIdentity = FWGS_REVIEWED_PRODUCT_IDENTITIES.some((entry) => entry.name === product.name || entry.route === product.route);
    return rejected('unreviewed_fwgs_product', resemblesReviewedIdentity);
  }
  if (IDENTITY_FIELDS.some((field) => !Object.hasOwn(product, field) || product[field] !== identity[field])) {
    return rejected('reviewed_fwgs_identity_mismatch');
  }
  if (UNREVIEWED_VARIANT_FIELDS.some((field) => Object.hasOwn(product, field) && product[field] != null && product[field] !== '')) {
    return rejected('unreviewed_fwgs_variant_metadata');
  }
  if (!Array.isArray(bible?.records)) return rejected('reviewed_fwgs_canonical_unavailable');
  const candidates = bible.records.filter((record) => record?.id === identity.canonicalBottleId || record?.canonical === identity.canonicalName);
  if (candidates.length !== 1) return rejected('reviewed_fwgs_canonical_ambiguous_or_missing');
  const record = candidates[0];
  if (record.id !== identity.canonicalBottleId || record.canonical !== identity.canonicalName
    || record.tier !== identity.tier || record.producer !== identity.producer) {
    return rejected('reviewed_fwgs_canonical_identity_mismatch');
  }
  const proof = {
    contractVersion: FWGS_REVIEWED_PRODUCT_CONTRACT,
    sourceHost: FWGS_REVIEWED_SOURCE_HOST,
    sku: identity.sku,
    sourceTitle: identity.name,
    sourceBrand: identity.brand,
    sourceCategory: identity.category,
    sourceType: identity.type,
    sourceRoute: identity.route,
    sourceProductUrl: `https://${FWGS_REVIEWED_SOURCE_HOST}${identity.route}`,
    canonicalBottleId: record.id,
    canonicalName: record.canonical,
  };
  return {
    reviewed: true,
    match: { record, confidence: 1, method: 'reviewed-fwgs-product-identity' },
    record,
    reason: 'reviewed_fwgs_product_identity',
    proof,
  };
}
