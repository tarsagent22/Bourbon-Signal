import { buildDrops, buildCurrentInventoryAlertsFromDrops, applyAlertPolicyToCandidate } from '../export-site-contract.mjs';
import { lifecycleAllowsInventoryAlert } from '../state-lifecycle.mjs';
import { createShopifyPickupPolicy } from './shopify-pickup-policy.mjs';
import { sourceScopeMatches } from './poll-policy.mjs';

const tuple = row => JSON.stringify([String(row.storeId || ''), String(row.productId || ''), String(row.variantId || '')]);
const normalize = value => String(value || '').toLowerCase().replace(/[’‘]/gu, "'").replace(/[^a-z0-9]+/gu, ' ').trim();
const fail = message => { throw new Error(`shopify_identity_or_schema_failure: ${message}`); };

/** Pure projection assembly. Evidence is persisted only by the scheduler's
 * existing fenced finish transaction, never by this helper. One current explicit
 * observation and one last-positive episode seed per admitted tuple bound size.
 */
export function buildShopifyPollProjection({ source, ctx, lease, result, owner, now = Date.now() }) {
  if (source.kind !== 'shopify-variant-pickup' || result?.metadata?.completeSnapshot !== true || result?.accounting?.completeSnapshot !== true
    || result.metadata.collectorVersion !== source.collectorVersion || result.metadata.configSha256 !== source.configSha256) fail('incomplete collection or changed collector/config');
  const blockedStates = (ctx.health?.states || []).filter(row => row.health === 'blocked').map(row => row.state);
  const shopifyPolicy = createShopifyPickupPolicy({ descriptors: [source], enabledSourceIds: source.disabled ? [] : [source.id],
    collectorSha256: source.collectorSha256, catalogSha256: source.catalogSha256, lookup: ctx.lookup,
    policySnapshotId: ctx.snapshotId, blockedStates, now });
  const bindings = new Map(source.admission.bindings.map(binding => [tuple(binding), binding]));
  const prior = lease.projection;
  const checkpoints = new Map();
  for (const row of [...(prior?.observations || []), ...(prior?.episodeSeeds || prior?.drops || [])]) {
    if (!sourceScopeMatches(source, row)) continue;
    const at = Date.parse(row.lastConfirmedAt || row.observedAt || '');
    if (Number.isFinite(at)) checkpoints.set(tuple(row), Math.max(checkpoints.get(tuple(row)) ?? Number.NEGATIVE_INFINITY, at));
  }
  const observations = new Map(), positives = new Map();
  for (const signal of result.signals || []) {
    const stamped = { ...signal, sourcePolicySnapshotId: ctx.snapshotId };
    if (!shopifyPolicy.eligible(stamped) || positives.has(tuple(stamped))) fail('unadmitted or duplicate positive');
    positives.set(tuple(stamped), stamped);
  }
  for (const row of result.observations || []) {
    const key = tuple(row), binding = bindings.get(key);
    const store = source.definition.stores.find(store => store.id === String(row.storeId));
    const seed = source.definition.products.find(seed => seed.productId === String(row.productId) && seed.variantId === String(row.variantId));
    const at = Date.parse(row.observedAt || '');
    if (!binding || !store || !seed || observations.has(key) || !Number.isFinite(at) || at > now || at <= (checkpoints.get(key) ?? Number.NEGATIVE_INFINITY) || now - at > source.expiryHours * 3600000
      || !['in_stock', 'out_of_stock'].includes(row.availabilityStatus)
      || row.sourceProductBinding !== `${source.definition.baseUrl}/variants/${seed.variantId}/?section_id=${source.definition.sectionId}`) fail('incomplete or conflicting observation identity');
    const positive = positives.get(key);
    if ((row.availabilityStatus === 'in_stock') !== Boolean(positive) || (positive && positive.observedAt !== row.observedAt)) fail('positive/negative conflict');
    const record = ctx.lookup.byId?.get?.(binding.canonicalBottleId) || ctx.lookup.byId?.[binding.canonicalBottleId];
    const marketLookup = ctx.lookup.byState === undefined ? ctx.lookup : ctx.lookup.byState?.[source.state];
    const marketRecord = marketLookup?.byId?.get?.(binding.canonicalBottleId) || marketLookup?.byId?.[binding.canonicalBottleId];
    if (!record || String(record.id || record.canonical_id || '') !== binding.canonicalBottleId
      || normalize(record.canonical || record.canonical_name || record.name) !== normalize(seed.canonicalName)
      || record.tier !== binding.tier || !['limited', 'allocated', 'unicorn'].includes(record.tier)
      || !marketRecord || String(marketRecord.id || marketRecord.canonical_id || '') !== binding.canonicalBottleId
      || normalize(marketRecord.canonical || marketRecord.canonical_name || marketRecord.name) !== normalize(seed.canonicalName)
      || !['limited', 'allocated', 'unicorn'].includes(marketRecord.tier)) fail('current canonical policy lost');
    observations.set(key, positive || {
      state: source.state, stateCode: source.state, sourceChain: source.chain, sourceRuntimeId: source.id,
      sourceLabel: source.definition.sourceLabel, merchantId: source.merchantId,
      storeId: store.id, storeName: store.name, locationName: store.name, storeAddress: store.address, city: store.city, zip: store.zip,
      productId: seed.productId, variantId: seed.variantId, canonicalBottleId: binding.canonicalBottleId, canonicalName: record.canonical,
      tier: record.tier, sourceUrl: `${source.definition.baseUrl}/products/${seed.handle}`, sourceProductBinding: row.sourceProductBinding,
      eventType: 'retailer_store_inventory_out_of_stock', locationPrecision: 'store_level', observedAt: row.observedAt,
      availabilityStatus: 'out_of_stock', sourceAvailabilityVerified: true, quantity: 0, quantityIsExact: false,
      canAlertAsInventory: false, canAlertAsWatch: false, sourcePolicySnapshotId: ctx.snapshotId,
    });
  }
  if (observations.size !== bindings.size || positives.size !== [...observations.values()].filter(row => row.availabilityStatus === 'in_stock').length) fail('partial tuple snapshot');
  const signals = [...positives.values()];
  const previous = (prior?.episodeSeeds || prior?.drops || ctx.drops || []).filter(row => sourceScopeMatches(source, row));
  const history = [...(prior?.observations || []).filter(row => sourceScopeMatches(source, row)), ...observations.values()];
  const drops = buildDrops(signals, ctx.lookup, signals, previous, history, { shopifyPolicy });
  if (signals.length !== drops.length) fail('accepted evidence missing feed');
  const priorCandidates = new Map((prior?.candidates || []).map(row => [row.dedupeKey, row]));
  const candidates = buildCurrentInventoryAlertsFromDrops(drops, { shopifyPolicy }).map(applyAlertPolicyToCandidate)
    .filter(row => row.eligibleForDelivery && lifecycleAllowsInventoryAlert(source.state))
    .filter(row => Boolean(prior) && (priorCandidates.has(row.dedupeKey) || !previous.some(drop => drop.availabilityEpisodeId && drop.availabilityEpisodeId === row.availabilityEpisodeId)))
    .slice(0, 200).map(row => ({ ...row, sourcePollId: source.id, sourcePollRun: owner, sourcePollGeneration: Number(lease.generation), sourcePolicySnapshotId: ctx.snapshotId }));
  const seeds = new Map(previous.map(row => [tuple(row), row]));
  for (const row of drops) seeds.set(tuple(row), row);
  const projection = {
    schemaVersion: 'shopify-pickup-projection@1',
    drops: drops.map(row => ({ ...row, sourcePollId: source.id, sourcePollRun: owner, sourcePollGeneration: Number(lease.generation) })),
    candidates, observations: [...observations.values()], episodeSeeds: [...seeds.values()].filter(row => bindings.has(tuple(row))),
    acceptedAt: new Date(now).toISOString(), policyId: ctx.snapshotId,
  };
  return { signals, drops, candidates, projection, observations: [...observations.values()] };
}
