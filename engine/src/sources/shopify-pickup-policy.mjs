import { buildShopifyCohortDescriptors } from '../collectors/shopify-cohort-runtime.mjs';

// Production authority is deliberately empty. Research manifests are never
// imported here. Changing this registry is an explicit reviewed release action.
export const SHOPIFY_PICKUP_SOURCES = Object.freeze([]);
const SEMANTICS = 'binary_retailer_orderable_no_exact_count';
const present = value => value !== undefined && value !== null && value !== '';
const normalize = value => String(value ?? '').toLowerCase().replace(/[’‘]/gu, "'").replace(/[^a-z0-9]+/gu, ' ').trim();
const same = (values, expected, convert = String) => {
  const found = values.filter(present);
  return found.length > 0 && found.every(value => convert(value) === convert(expected));
};
const coherentOptional = (values, expected, convert = String) => values.filter(present).every(value => convert(value) === convert(expected));
const tuple = row => JSON.stringify([String(row.storeId || row.store_id || ''), String(row.productId || ''), String(row.variantId || '')]);
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const denied = (owned, reason, sourceId = null) => Object.freeze({ owned, eligible: false, reason, sourceId });

/**
 * Compile once per build/read invocation. Only the caller's explicitly trusted
 * descriptor registry is consumed. This is not an admission approval service.
 * @param {{ descriptors?: any[], enabledSourceIds?: string[], collectorSha256?: string, catalogSha256?: string, lookup?: any, policySnapshotId?: string, blockedStates?: string[], now?: number }} [options]
 */
export function createShopifyPickupPolicy({ descriptors = SHOPIFY_PICKUP_SOURCES, enabledSourceIds = [], collectorSha256, catalogSha256,
  lookup, policySnapshotId, blockedStates = [], now = Date.now() } = {}) {
  if (!Array.isArray(descriptors) || !Array.isArray(enabledSourceIds) || !Array.isArray(blockedStates) || !Number.isFinite(now)) throw new Error('Invalid Shopify pickup policy context');
  // Reconstruct and validate once; a copied descriptor cannot replace its host,
  // tuple, admission hash, budgets or canonical scope without detection.
  const rebuilt = buildShopifyCohortDescriptors(descriptors.map(source => source?.definition), {
    admissions: descriptors.map(source => source?.admission), collectorSha256, catalogSha256,
  });
  const compiled = new Map(), enabled = new Set(enabledSourceIds), blocked = new Set(blockedStates), ownedPartitions = new Set();
  if (enabled.size !== enabledSourceIds.length) throw new Error('Duplicate Shopify enabled source');
  for (const expected of rebuilt) {
    const input = descriptors.find(source => source.id === expected.id);
    if (!input || typeof input.disabled !== 'boolean') throw new Error('Invalid Shopify descriptor activation state');
    for (const key of Object.keys(expected).filter(key => key !== 'disabled')) {
      if (stable(input[key]) !== stable(expected[key])) throw new Error(`Modified Shopify descriptor authority: ${key}`);
    }
    const definition = expected.definition;
    const bindings = new Map(expected.admission.bindings.map(binding => [tuple(binding), Object.freeze({ ...binding })]));
    for (const key of bindings.keys()) {
      const partition = JSON.stringify([expected.state, expected.chain, key]);
      if (ownedPartitions.has(partition)) throw new Error('Overlapping Shopify source authority');
      ownedPartitions.add(partition);
    }
    compiled.set(expected.id, { descriptor: expected, disabled: input.disabled, bindings,
      stores: new Map(definition.stores.map(store => [store.id, store])),
      products: new Map(definition.products.map(product => [product.variantId, product])) });
  }
  for (const id of enabled) if (!compiled.has(id)) throw new Error('Enabled Shopify source is not admitted');

  function owner(row) {
    if (!row || typeof row !== 'object') return null;
    // Ownership deliberately does not trust host, runtime ID, canonical, status
    // or fulfillment proof. Invalid old rows in the exact partition still veto.
    for (const item of compiled.values()) if (row.state === item.descriptor.state && row.sourceChain === item.descriptor.chain && item.bindings.has(tuple(row))) return item;
    return null;
  }
  function evaluate(row) {
    const item = owner(row);
    if (!item) return denied(false, 'not_admitted');
    const source = item.descriptor, definition = source.definition, reject = reason => denied(true, reason, source.id);
    if (item.disabled || !enabled.has(source.id)) return reject('source_disabled');
    if (blocked.has(source.state)) return reject('state_blocked');
    if (typeof policySnapshotId !== 'string' || !policySnapshotId.trim() || row.sourcePolicySnapshotId !== policySnapshotId) return reject('current_policy_mismatch');
    const binding = item.bindings.get(tuple(row)), seed = item.products.get(String(row.variantId)), store = item.stores.get(String(row.storeId || row.store_id));
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    if (!seed || !store) return reject('identity_missing');
    if (row.sourceRuntimeId !== source.id || !same([row.sourceRuntimeId, row.leafSourceRuntimeId, raw.sourceRuntimeId], source.id)
      || !coherentOptional([row.sourcePollId], source.id)
      || !same([row.state, row.stateCode], source.state)
      || !same([row.sourceChain, raw.chain], source.chain)
      || !same([row.merchantId, raw.merchantId], source.merchantId)
      || !same([row.sourceLabel, row.source], definition.sourceLabel)) return reject('source_identity_mismatch');
    if (!present(row.productId) || !present(row.variantId)
      || !same([row.productId, raw.productId, raw.product?.id], seed.productId)
      || !same([row.variantId, raw.variantId, raw.variant?.id], seed.variantId)
      || !coherentOptional([row.productHandle, raw.product?.handle], seed.handle)) return reject('product_identity_mismatch');
    const productUrl = `${definition.baseUrl}/products/${seed.handle}`;
    const pickupUrl = `${definition.baseUrl}/variants/${seed.variantId}/?section_id=${definition.sectionId}`;
    if (row.sourceUrl !== productUrl || row.sourceProductBinding !== pickupUrl
      || !coherentOptional([raw.variantPickupUrl, raw.productBinding], pickupUrl)) return reject('product_or_pickup_url_mismatch');
    if (!same([row.storeId, row.store_id], store.id)
      || !same([row.storeName, row.locationName], store.name, normalize)
      || !present(row.storeAddress) || !same([row.storeAddress, row.address, raw.pickupAddress], store.address, normalize)
      || !same([row.city, row.storeCity], store.city, normalize)
      || !same([row.zip, row.postalCode, row.storePostalCode], store.zip)) return reject('premises_mismatch');
    const record = lookup?.byId?.get?.(binding.canonicalBottleId) || lookup?.byId?.[binding.canonicalBottleId];
    const canonical = record?.canonical || record?.canonical_name || record?.name;
    const marketLookup = lookup?.byState?.[source.state];
    const marketRecord = marketLookup
      ? marketLookup.byId?.get?.(binding.canonicalBottleId) || marketLookup.byId?.[binding.canonicalBottleId]
      : record;
    const marketName = marketRecord?.canonical || marketRecord?.canonical_name || marketRecord?.name;
    const flattened = present(row.sourceCollectorVersion) || !present(raw.collectorVersion);
    if (!record || !same([record.id, record.canonical_id], binding.canonicalBottleId)
      || !['limited', 'allocated', 'unicorn'].includes(record.tier) || record.tier !== binding.tier
      || normalize(canonical) !== normalize(seed.canonicalName)
      || !same([row.canonicalBottleId, row.canonicalId, row.bottleId], binding.canonicalBottleId)
      || !same([row.canonicalName, row.bottleName], canonical, normalize)
      || normalize(row.rawName) !== normalize(seed.title)) return reject('current_canonical_mismatch');
    if (!marketRecord || !same([marketRecord.id, marketRecord.canonical_id], binding.canonicalBottleId)
      || normalize(marketName) !== normalize(canonical) || !['limited', 'allocated', 'unicorn'].includes(marketRecord.tier)
      || row.tier !== (flattened ? marketRecord.tier : record.tier)) return reject('current_market_mismatch');
    if (!coherentOptional([row.collectorSha256, row.sourceCollectorSha256], source.collectorSha256)
      || !coherentOptional([row.configSha256, row.sourceConfigSha256], source.configSha256)
      || !coherentOptional([row.catalogSha256], source.catalogSha256)
      || !coherentOptional([raw.collectorVersion, row.sourceCollectorVersion], source.collectorVersion)) return reject('row_authority_mismatch');
    if (!same([row.eventType, row.type], 'retailer_store_inventory_result') || row.locationPrecision !== 'store_level'
      || row.availabilityStatus !== 'in_stock' || row.sourceAvailabilityVerified !== true
      || row.quantity !== 0 || row.quantityIsExact !== false
      || !same([row.inventorySemantics, row.sourceInventorySemantics], SEMANTICS)
      || row.canAlertAsInventory === false || row.stale === true || row.sourceStale === true
      || row.hidden === true || row.inert === true || raw.hidden === true || raw.inert === true
      || raw.staleFallback === true || raw.cacheFallback === true || raw.sourceRuntimeNonAlertable === true) return reject('not_current_binary_inventory');
    const proof = values => { const found = values.filter(value => value !== undefined && value !== null); return found.length > 0 && found.every(value => value === true); };
    if (!proof([row.pickupOfferVerified, raw.pickupOfferVerified, raw.variantPickupVerified])
      || !proof([row.premisesVerified, raw.premisesVerified])
      || !proof([row.variantAvailable, raw.variant?.available])
      || !coherentOptional([raw.pickupVerified], true, value => value)) return reject('exact_pickup_proof_missing');
    // Signals retain validated size metadata; existing public rows flatten that
    // proof away. Size validation remains collector-owned, never inferred from
    // online availability. Reject contradictions wherever fields are retained.
    if ((present(raw.sizeMetadataVerified) && raw.sizeMetadataVerified !== true)
      || (present(raw.sizeMl) && (!Number.isFinite(raw.sizeMl) || raw.sizeMl <= 375 || raw.sizeMl > 1750))) return reject('size_proof_conflict');
    const clock = row.lastConfirmedAt || row.observedAt;
    const timestamp = Date.parse(clock || '');
    if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > source.expiryHours * 3600000) return reject('observation_expired');
    if (present(row.observedAt) && (!Number.isFinite(Date.parse(row.observedAt)) || Date.parse(row.observedAt) > now)) return reject('invalid_observation_clock');
    return Object.freeze({ owned: true, eligible: true, reason: 'accepted_exact_variant_pickup', sourceId: source.id, marketTier: marketRecord.tier });
  }
  return Object.freeze({ owns: row => Boolean(owner(row)), evaluate, eligible: row => evaluate(row).eligible });
}
