import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SHOPIFY_PICKUP_SOURCES, createShopifyPickupPolicy } from '../src/sources/shopify-pickup-policy.mjs';
import { buildShopifyCohortDescriptors } from '../src/collectors/shopify-cohort-runtime.mjs';
import { collectShopifyVariantPickup, describeShopifyVariantSource } from '../src/collectors/shopify-variant-pickup.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { bibleLookup, publicSignal } from '../src/export-site-contract.mjs';

const directory = new URL('./fixtures/shopify-variant-pickup/', import.meta.url);
const configurations = JSON.parse(await readFile(new URL('../data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8')).sources;
const readiness = JSON.parse(await readFile(new URL('readiness.json', directory), 'utf8'));
const records = JSON.parse(await readFile(new URL('current-bourbon-bible.json', directory), 'utf8')).records;
const bible = new BourbonBible(records), lookup = bibleLookup(records);
const captures = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8')).captures;
const bodies = new Map(await Promise.all(captures.map(async capture => [capture.requestedUrl, await readFile(new URL(capture.file, directory), 'utf8')])));
const now = Date.now(), observedAt = new Date(now - 60000).toISOString(), policySnapshotId = 'actual-policy-test-context';
const hashes = { collectorSha256: readiness.collectorSha256, catalogSha256: readiness.catalogSha256 };
const syntheticAdmissions = configurations.map(source => {
  const plan = describeShopifyVariantSource(source, hashes), canonical = readiness.results.find(row => row.sourceId === source.id).canonical;
  return { schemaVersion: 1, sourceId: source.runtimeId, ...hashes, configSha256: plan.configSha256,
    reviewer: 'synthetic test authority only', reviewedAt: new Date(now - 3600000).toISOString(), policySnapshotId: 'older-admission-review-snapshot', productionCommit: 'a'.repeat(40),
    reviewArtifactSha256: '1'.repeat(64), canonicalReviewSha256: '2'.repeat(64), premisesBaselineSha256: '3'.repeat(64), livePreflightSha256: '4'.repeat(64), baselineResult: 'net_new_confirmed',
    bindings: source.stores.flatMap(store => source.products.map(product => ({ storeId: store.id, productId: product.productId, variantId: product.variantId, canonicalBottleId: canonical.id, tier: canonical.tier }))) };
});
// These are injected fixture authorities, not real production admissions.
const disabled = buildShopifyCohortDescriptors(configurations, { ...hashes, admissions: syntheticAdmissions });
const enabled = disabled.map(source => ({ ...source, disabled: false }));
const options = { descriptors: enabled, enabledSourceIds: enabled.map(source => source.id), ...hashes, lookup, policySnapshotId, now };
const policy = createShopifyPickupPolicy(options);
const signals = await Promise.all(configurations.map(async source => {
  const result = await collectShopifyVariantPickup(bible, source, { observedAt, fetchText: async url => ({ ok: true, status: 200, url, text: bodies.get(url) }) });
  return { ...result.signals[0], sourcePolicySnapshotId: policySnapshotId };
}));
const row = () => structuredClone(signals[0]);

test('production registry is frozen empty; default policy never admits research signals', () => {
  assert.deepEqual(SHOPIFY_PICKUP_SOURCES, []); assert.ok(Object.isFrozen(SHOPIFY_PICKUP_SOURCES));
  const empty = createShopifyPickupPolicy();
  for (const signal of signals) assert.deepEqual(empty.evaluate(signal), { owned: false, eligible: false, reason: 'not_admitted', sourceId: null });
});

for (const signal of signals) test(`one shared policy accepts exact captured signal under synthetic explicit authority: ${signal.sourceRuntimeId}`, () => {
  assert.deepEqual(policy.evaluate(signal), { owned: true, eligible: true, reason: 'accepted_exact_variant_pickup', sourceId: signal.sourceRuntimeId, marketTier: signal.tier });
});

for (const signal of signals) test(`actual public exporter row shape retains required exact pickup identity: ${signal.sourceRuntimeId}`, () => {
  const exported = publicSignal(signal, lookup, null, { shopifyPolicy: policy });
  // Current exporter does not preserve this new scheduler stamp yet; the lead's
  // central integration must carry it unchanged, never infer it on consumption.
  const projected = { ...exported, sourcePolicySnapshotId: signal.sourcePolicySnapshotId };
  assert.equal(projected.raw, undefined); assert.equal(projected.variantAvailable, true);
  assert.equal(projected.sourceProductBinding, signal.sourceProductBinding);
  assert.equal(projected.pickupOfferVerified, true); assert.equal(projected.premisesVerified, true);
  // Existing NY identity policy may veto before central integration; this policy
  // must preserve that explicit false rather than resurrect the row.
  assert.equal(policy.eligible(projected), projected.canAlertAsInventory !== false);
  assert.equal(policy.eligible({ ...projected, canAlertAsInventory: true }), true);
});

test('default disabled descriptors, absent runtime enablement and blocked states independently veto eligibility', () => {
  assert.equal(createShopifyPickupPolicy({ ...options, descriptors: disabled }).evaluate(row()).reason, 'source_disabled');
  assert.equal(createShopifyPickupPolicy({ ...options, enabledSourceIds: [] }).evaluate(row()).reason, 'source_disabled');
  const blocked = createShopifyPickupPolicy({ ...options, blockedStates: ['CA'] });
  assert.equal(blocked.owns(row()), true); assert.equal(blocked.evaluate(row()).reason, 'state_blocked');
  assert.throws(() => createShopifyPickupPolicy({ ...options, enabledSourceIds: ['not-admitted'] }), /not admitted/iu);
});

for (const [name, change, expectedOwned = true] of [
  ['wrong host', value => { value.sourceUrl = value.sourceUrl.replace('www.remedyliquor.com', 'evil.example'); }],
  ['query on product URL', value => { value.sourceUrl += '?variant=1'; }],
  ['wrong product path', value => { value.sourceUrl += '-other'; }],
  ['wrong pickup host', value => { value.sourceProductBinding = value.sourceProductBinding.replace('www.remedyliquor.com', 'evil.example'); }],
  ['wrong section ID', value => { value.sourceProductBinding = value.sourceProductBinding.replace('pickup-availability', 'other'); }],
  ['wrong runtime authority', value => { value.sourceRuntimeId = 'fl:jensens-miami'; }],
  ['missing runtime authority', value => { delete value.sourceRuntimeId; }],
  ['wrong source poll authority', value => { value.sourcePollId = 'other'; }],
  ['wrong merchant', value => { value.merchantId = 'other'; }],
  ['wrong state code', value => { value.stateCode = 'TX'; }],
  ['wrong source label', value => { value.sourceLabel = 'other'; }],
  ['conflicting raw product', value => { value.raw.product.id = 'other'; }],
  ['conflicting raw variant', value => { value.raw.variant.id = 'other'; }],
  ['wrong product handle', value => { value.raw.product.handle += '-other'; }],
  ['sibling product tuple', value => { value.productId = 'other'; }, false],
  ['sibling variant tuple', value => { value.variantId = 'other'; }, false],
  ['sibling store tuple', value => { value.storeId = 'other'; }, false],
  ['wrong chain partition', value => { value.sourceChain = 'other'; }, false],
  ['wrong state partition', value => { value.state = 'TX'; }, false],
  ['wrong street', value => { value.storeAddress = '1701 W Glenoaks Blvd Glendale CA 91201'; }],
  ['wrong premises name', value => { value.storeName = 'Other merchant'; }],
  ['wrong postal code', value => { value.zip = '91202'; }],
  ['wrong canonical ID', value => { value.canonicalBottleId = 'bb_1fd1f694742e0a1e'; }],
  ['wrong canonical name', value => { value.canonicalName = 'Weller Single Barrel'; }],
  ['wrong canonical tier', value => { value.tier = 'unicorn'; }],
  ['changed product title', value => { value.rawName += ' Rye'; }],
  ['missing current policy stamp', value => { delete value.sourcePolicySnapshotId; }],
  ['old policy stamp', value => { value.sourcePolicySnapshotId = 'old-policy'; }],
  ['modified row code hash', value => { value.collectorSha256 = '0'.repeat(64); }],
  ['modified row config hash', value => { value.configSha256 = '0'.repeat(64); }],
  ['modified row catalog hash', value => { value.catalogSha256 = '0'.repeat(64); }],
  ['catalog-only available flag', value => { delete value.pickupOfferVerified; delete value.raw.pickupOfferVerified; delete value.raw.variantPickupVerified; }],
  ['negative pickup', value => { value.availabilityStatus = 'out_of_stock'; }],
  ['conflicting pickup proof', value => { value.raw.pickupOfferVerified = false; }],
  ['premises proof missing', value => { delete value.premisesVerified; delete value.raw.premisesVerified; }],
  ['variant availability missing', value => { delete value.raw.variant.available; }],
  ['variant unavailable', value => { value.raw.variant.available = false; }],
  ['exact count claim', value => { value.quantityIsExact = true; }],
  ['invented quantity', value => { value.quantity = 5; }],
  ['general shipping semantics', value => { value.inventorySemantics = 'online_catalog'; }],
  ['stale row', value => { value.stale = true; }],
  ['explicit veto', value => { value.canAlertAsInventory = false; }],
  ['hidden evidence flag', value => { value.hidden = true; }],
  ['excluded volume retained', value => { value.raw.sizeMl = 375; }],
]) test(`rejects ${name}; ownership remains independent of eligibility`, () => {
  const value = row(); change(value);
  assert.equal(policy.owns(value), expectedOwned); assert.equal(policy.eligible(value), false);
});

test('policy stamp refers to current consumption snapshot, not immutable admission review provenance', () => {
  assert.notEqual(disabled[0].admission.policySnapshotId, policySnapshotId);
  assert.equal(policy.eligible(row()), true);
  assert.equal(createShopifyPickupPolicy({ ...options, policySnapshotId: 'new-snapshot' }).eligible(row()), false);
});

test('expiry uses current clock even without a new source generation and rejects future clocks', () => {
  assert.equal(createShopifyPickupPolicy({ ...options, now: now + 3600000 }).evaluate(row()).reason, 'observation_expired');
  assert.equal(policy.eligible({ ...row(), observedAt: new Date(now + 1).toISOString() }), false);
  assert.equal(policy.eligible({ ...row(), lastConfirmedAt: 'not-a-clock' }), false);
  assert.equal(policy.eligible({ ...row(), observedAt: new Date(now - 7200000).toISOString(), lastConfirmedAt: observedAt }), true);
});

test('current canonical removal, ID/name/tier changes remain fail closed', () => {
  const signal = row(), current = lookup.byId.get(signal.canonicalBottleId);
  for (const replacement of [null, { ...current, id: 'other' }, { ...current, canonical: 'Other Bourbon' }, { ...current, tier: 'standard' }]) {
    const changed = { ...lookup, byId: new Map(lookup.byId) };
    if (replacement) changed.byId.set(signal.canonicalBottleId, replacement); else changed.byId.delete(signal.canonicalBottleId);
    const check = createShopifyPickupPolicy({ ...options, lookup: changed });
    assert.equal(check.owns(signal), true); assert.equal(check.evaluate(signal).reason, 'current_canonical_mismatch');
  }
});

test('current state classification vetoes regular inventory despite an allocated engine baseline', () => {
  const signal = row(), baseline = lookup.byId.get(signal.canonicalBottleId);
  assert.equal(baseline.tier, 'allocated');
  const stateLookup = { ...lookup, byId: new Map(lookup.byId) };
  stateLookup.byId.set(signal.canonicalBottleId, { ...baseline, tier: 'regular' });
  const check = createShopifyPickupPolicy({ ...options, lookup: { ...lookup, byState: { CA: stateLookup } } });
  assert.equal(check.owns(signal), true); assert.equal(check.evaluate(signal).reason, 'current_market_mismatch');
  assert.equal(lookup.byId.get(signal.canonicalBottleId).tier, 'allocated');
  assert.equal(check.eligible(signals.find(value => value.state === 'NY')), true);
});

test('Vino retains canonical unicorn authority while current market allocated tier governs flat rows', () => {
  const signal = structuredClone(signals.find(value => value.state === 'NY'));
  const canonical = lookup.byId.get(signal.canonicalBottleId);
  assert.equal(canonical.tier, 'unicorn'); assert.equal(signal.tier, 'unicorn');
  const stateLookup = { ...lookup, byId: new Map(lookup.byId) };
  stateLookup.byId.set(signal.canonicalBottleId, { ...canonical, tier: 'allocated' });
  const current = { ...lookup, byState: { NY: stateLookup } };
  const check = createShopifyPickupPolicy({ ...options, lookup: current });
  assert.equal(check.eligible(signal), true); assert.equal(check.evaluate(signal).marketTier, 'allocated');
  const exported = publicSignal(signal, current, null, { shopifyPolicy: check });
  assert.equal(exported.tier, 'allocated'); assert.equal(check.eligible(exported), true);
  assert.equal(check.eligible({ ...exported, tier: 'unicorn' }), false);
  const badCanonical = { ...current, byId: new Map(lookup.byId) };
  badCanonical.byId.set(signal.canonicalBottleId, { ...canonical, tier: 'allocated' });
  assert.equal(createShopifyPickupPolicy({ ...options, lookup: badCanonical }).evaluate(signal).reason, 'current_canonical_mismatch');
  assert.equal(check.eligible({ ...signal, raw: { ...signal.raw, collectorVersion: 'wrong' } }), false);
  const missingMarket = { ...lookup, byState: { NY: { ...stateLookup, byId: new Map() } } };
  assert.equal(createShopifyPickupPolicy({ ...options, lookup: missingMarket }).evaluate(signal).reason, 'current_market_mismatch');
});

test('descriptor authority is revalidated once and cannot be mutated after compilation', () => {
  for (const mutate of [value => { value.definition.baseUrl = 'https://evil.example'; }, value => { value.chain = 'other'; },
    value => { value.partitionBindings[0].variantId = 'other'; }, value => { value.collectorSha256 = '0'.repeat(64); }, value => { value.catalogSha256 = '0'.repeat(64); }]) {
    const changed = structuredClone(enabled); mutate(changed[0]);
    assert.throws(() => createShopifyPickupPolicy({ ...options, descriptors: changed }));
  }
  const mutable = structuredClone(enabled), compiled = createShopifyPickupPolicy({ ...options, descriptors: mutable });
  mutable[0].definition.baseUrl = 'https://evil.example'; mutable[0].disabled = true;
  assert.equal(compiled.eligible(row()), true);
});

test('hidden real source response and genuine negative do not create eligible signals', async () => {
  const source = configurations[0];
  await assert.rejects(() => collectShopifyVariantPickup(bible, source, { observedAt, fetchText: async url => ({ ok: true, status: 200, url, text: url.endsWith('.json') ? bodies.get(url) : bodies.get(url).replace('<li class=', '<li hidden class=') }) }), /hidden/iu);
  const negative = await collectShopifyVariantPickup(bible, source, { observedAt, fetchText: async url => ({ ok: true, status: 200, url, text: url.endsWith('.json') ? bodies.get(url) : bodies.get(url).replaceAll('Pickup available', 'Pickup unavailable') }) });
  assert.deepEqual(negative.signals, []); assert.equal(negative.metadata.completeSnapshot, true);
  for (const observation of negative.observations) assert.equal(policy.eligible(observation), false);
});
