import { describeShopifyVariantSource, validateShopifyVariantSource } from './shopify-variant-pickup.mjs';
import { shopifyPremiseAddressSignature } from './shopify-premises-identity.mjs';

// Preparation contract only: never imported by the runtime registry. No collector
// execution, environment reads, network, storage, lifecycle changes, or sends.
export const SHOPIFY_COHORT_KIND = 'shopify-variant-pickup';
const fail = message => { throw new Error(`Shopify cohort admission: ${message}`); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
const tupleKey = row => JSON.stringify([row.storeId, row.productId, row.variantId]);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

/**
 * Build only explicitly admitted descriptors; default admission list is empty.
 * All output remains disabled. Admission is reviewed evidence supplied by the
 * release lead, not inferred from a research manifest or a successful fixture.
 * @param {any[]} configurations Reviewed source configs (no implicit file read).
 * @param {{ admissions?: any[], collectorSha256?: string, catalogSha256?: string }} [options]
 */
export function buildShopifyCohortDescriptors(configurations, { admissions = [], collectorSha256, catalogSha256 } = {}) {
  if (!Array.isArray(configurations) || !Array.isArray(admissions)) fail('arrays required');
  if (admissions.length && !hash(collectorSha256)) fail('reviewed collector hash required');
  if (admissions.length && !hash(catalogSha256)) fail('reviewed catalog hash required');
  const sources = new Map(), physicalKeys = new Set();
  for (const input of configurations) {
    const source = validateShopifyVariantSource(input);
    if (sources.has(source.runtimeId)) fail('duplicate runtime source ID');
    sources.set(source.runtimeId, source);
  }
  const admitted = new Set();
  return admissions.map(admission => {
    if (!admission || admitted.has(admission.sourceId)) fail('missing or duplicate admission');
    const source = sources.get(admission.sourceId);
    if (!source) fail('unknown source admission');
    admitted.add(admission.sourceId);
    const plan = describeShopifyVariantSource(source, { collectorSha256 });
    if (admission.collectorSha256 !== collectorSha256 || admission.configSha256 !== plan.configSha256) fail('code/config hash mismatch');
    if (admission.catalogSha256 !== catalogSha256) fail('catalog hash mismatch');
    if (admission.schemaVersion !== 1 || !text(admission.reviewer) || !Number.isFinite(Date.parse(admission.reviewedAt))
      || !text(admission.policySnapshotId) || !/^[a-f0-9]{40}$/u.test(admission.productionCommit || '')) fail('review identity/policy/deployment missing');
    for (const field of ['reviewArtifactSha256', 'canonicalReviewSha256', 'premisesBaselineSha256', 'livePreflightSha256']) {
      if (!hash(admission[field])) fail(`missing ${field}`);
    }
    if (!['net_new_confirmed', 'recovery_confirmed', 'directory_reuse_confirmed'].includes(admission.baselineResult)) fail('premises baseline unresolved');
    const expected = source.stores.flatMap(store => source.products.map(product => ({ storeId: store.id, productId: product.productId, variantId: product.variantId })));
    if (!Array.isArray(admission.bindings) || admission.bindings.length !== expected.length) fail('partial product/premises admission');
    const bindings = new Map();
    for (const binding of admission.bindings) {
      if (!binding || !text(binding.canonicalBottleId) || !['limited', 'allocated', 'unicorn'].includes(binding.tier)) fail('canonical binding missing or ineligible');
      const key = tupleKey(binding);
      if (bindings.has(key) || !expected.some(item => tupleKey(item) === key)) fail('duplicate or foreign product/premises binding');
      bindings.set(key, binding);
    }
    for (const store of source.stores) {
      const key = shopifyPremiseAddressSignature(store.address, { city: store.city, state: source.state, zip: store.zip })?.key;
      if (!key) fail('physical premises syntax unresolved');
      if (physicalKeys.has(key)) fail('duplicate admitted physical premises');
      physicalKeys.add(key);
    }
    return freeze({ id: source.runtimeId, state: source.state, kind: SHOPIFY_COHORT_KIND, chain: source.chain,
      merchantId: source.merchantId, disabled: true, cadence: 1800, expiryHours: 1,
      storeIds: source.stores.map(store => store.id), productIds: [...new Set(source.products.map(product => product.productId))],
      variantIds: source.products.map(product => product.variantId), partitionBindings: expected,
      failClosedOnError: true, noImmediateRetry: true, accessDeniedPauseSeconds: 86400, rateLimitedPauseSeconds: 14400,
      definition: source, collectorVersion: plan.collectorVersion, collectorSha256, catalogSha256, configSha256: plan.configSha256,
      admission: JSON.parse(JSON.stringify(admission)), bootstrapCandidates: 0 });
  });
}

/** Exact tuple ownership for future shared-policy integration, including vetoes.
 * Canonical eligibility is deliberately separate: ownership must still suppress
 * rows whose old canonical mapping has become invalid.
 */
export function shopifyCohortScopeMatches(source, row) {
  if (!source || source.kind !== SHOPIFY_COHORT_KIND || !Array.isArray(source.partitionBindings) || !row
    || row.state !== source.state || row.sourceChain !== source.chain) return false;
  if (row.sourceRuntimeId && row.sourceRuntimeId !== source.id) return false;
  if (row.sourcePollId && row.sourcePollId !== source.id) return false;
  const candidate = { storeId: String(row.storeId || row.store_id || ''), productId: String(row.productId || ''), variantId: String(row.variantId || '') };
  return source.partitionBindings.some(binding => tupleKey(binding) === tupleKey(candidate));
}
