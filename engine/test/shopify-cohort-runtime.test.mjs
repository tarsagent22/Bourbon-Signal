import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildShopifyCohortDescriptors, shopifyCohortScopeMatches } from '../src/collectors/shopify-cohort-runtime.mjs';
import { collectShopifyVariantPickup, describeShopifyVariantSource } from '../src/collectors/shopify-variant-pickup.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { availabilityEpisodeIdentity, buildAvailabilityEpisodeIndex, bibleLookup, buildDrops, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
import { mergePollProjection, recoveryPolicy, sourceScopeMatches } from '../src/sources/poll-policy.mjs';

const fixtures = new URL('./fixtures/shopify-variant-pickup/', import.meta.url);
const configurations = JSON.parse(await readFile(new URL('../data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8')).sources;
const readiness = JSON.parse(await readFile(new URL('readiness.json', fixtures), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('current-bourbon-bible.json', fixtures), 'utf8'));
const bible = new BourbonBible(catalog.records), lookup = bibleLookup(catalog.records);
const manifest = JSON.parse(await readFile(new URL('manifest.json', fixtures), 'utf8'));
const bodies = new Map(await Promise.all(manifest.captures.map(async capture => [capture.requestedUrl, await readFile(new URL(capture.file, fixtures), 'utf8')])));
const transport = async url => ({ ok: true, status: 200, url, text: bodies.get(url) });
const codeHash = readiness.collectorSha256;
const catalogHash = readiness.catalogSha256;
// Synthetic admission evidence below tests the contract only. These hashes do
// not assert that real baseline/admission/live-preflight approvals exist.
function admission(source) {
  const plan = describeShopifyVariantSource(source, { collectorSha256: codeHash });
  const canonical = readiness.results.find(row => row.sourceId === source.id).canonical;
  return { schemaVersion: 1, sourceId: source.runtimeId, configSha256: plan.configSha256, collectorSha256: codeHash, catalogSha256: catalogHash,
    reviewer: 'offline contract fixture only', reviewedAt: '2026-10-23T04:00:00Z', policySnapshotId: 'offline-policy-fixture', productionCommit: 'a'.repeat(40),
    reviewArtifactSha256: '1'.repeat(64), canonicalReviewSha256: '2'.repeat(64), premisesBaselineSha256: '3'.repeat(64), livePreflightSha256: '4'.repeat(64),
    baselineResult: 'net_new_confirmed', bindings: source.stores.flatMap(store => source.products.map(product => ({ storeId: store.id, productId: product.productId, variantId: product.variantId, canonicalBottleId: canonical.id, tier: canonical.tier }))) };
}
const descriptors = () => buildShopifyCohortDescriptors(configurations, { admissions: configurations.map(admission), collectorSha256: codeHash, catalogSha256: catalogHash });

test('research manifests do not auto-admit or activate any source', () => {
  assert.deepEqual(buildShopifyCohortDescriptors(configurations), []);
  const sources = descriptors(); assert.equal(sources.length, 5);
  for (const source of sources) {
    assert.equal(source.disabled, true); assert.equal(source.bootstrapCandidates, 0); assert.equal(source.noImmediateRetry, true);
    assert.equal(source.catalogSha256, catalogHash); assert.equal(source.admission.catalogSha256, catalogHash);
    assert.ok(Object.isFrozen(source)); assert.ok(Object.isFrozen(source.definition));
    assert.throws(() => { source.disabled = false; });
  }
  assert.deepEqual(buildShopifyCohortDescriptors(configurations, { admissions: [admission(configurations[1])], collectorSha256: codeHash, catalogSha256: catalogHash }).map(source => source.id), ['ny:vino-lexington']);
});

test('admission rejects unknown, unresolved, partial, duplicate and changed configuration evidence', () => {
  for (const mutate of [a => { a.sourceId = 'unknown'; }, a => { a.baselineResult = 'ambiguous_history_or_premises'; }, a => { a.bindings = []; },
    a => { a.configSha256 = '0'.repeat(64); }, a => { a.collectorSha256 = '0'.repeat(64); }, a => { delete a.livePreflightSha256; },
    a => { a.bindings[0].variantId = '123'; }, a => { a.bindings[0].tier = 'standard'; }]) {
    const record = admission(configurations[0]); mutate(record);
    assert.throws(() => buildShopifyCohortDescriptors(configurations, { admissions: [record], collectorSha256: codeHash, catalogSha256: catalogHash }));
  }
  const record = admission(configurations[0]);
  assert.throws(() => buildShopifyCohortDescriptors(configurations, { admissions: [record, record], collectorSha256: codeHash, catalogSha256: catalogHash }));
});

test('admission requires the exact expected current catalog bytes, not only an external review artifact', () => {
  assert.equal(catalogHash, 'e5883ec9034802bff14dcae918fba4abc7d9baf2f5cc069c6013469e027e82be');
  const record = admission(configurations[0]);
  const options = { admissions: [record], collectorSha256: codeHash, catalogSha256: catalogHash };
  assert.throws(() => buildShopifyCohortDescriptors(configurations, { ...options, catalogSha256: undefined }), /catalog hash required/iu);
  assert.throws(() => buildShopifyCohortDescriptors(configurations, { ...options, catalogSha256: '0'.repeat(64) }), /catalog hash mismatch/iu);
  const missing = structuredClone(record); delete missing.catalogSha256;
  assert.throws(() => buildShopifyCohortDescriptors(configurations, { ...options, admissions: [missing] }), /catalog hash mismatch/iu);
  assert.throws(() => buildShopifyCohortDescriptors(configurations, { ...options, admissions: [{ ...record, catalogSha256: '0'.repeat(64) }] }), /catalog hash mismatch/iu);
});

test('exact partition rejects sibling stores/products/variants/states/runtime IDs; preserves legacy one-tuple compatibility', () => {
  for (const source of descriptors()) {
    const binding = source.partitionBindings[0], row = { ...binding, sourceChain: source.chain, state: source.state, sourceRuntimeId: source.id };
    assert.equal(shopifyCohortScopeMatches(source, row), true); assert.equal(sourceScopeMatches(source, row), true);
    for (const patch of [{ storeId: 'sibling' }, { productId: 'sibling' }, { variantId: 'sibling' }, { state: 'FL' }, { sourceChain: 'sibling' }, { sourceRuntimeId: 'fl:jensens-miami' }]) assert.equal(shopifyCohortScopeMatches(source, { ...row, ...patch }), false);
  }
  const source = { ...descriptors()[0], partitionBindings: [{ storeId: 'store', productId: 'product1', variantId: 'variant1' }, { storeId: 'store', productId: 'product2', variantId: 'variant2' }] };
  assert.equal(shopifyCohortScopeMatches(source, { state: source.state, sourceChain: source.chain, storeId: 'store', productId: 'product1', variantId: 'variant2' }), false);
});

test('disabled/failure/expiry/empty projections veto exact owned stock and candidates while siblings survive', () => {
  const source = descriptors()[0], at = Date.parse('2026-10-23T04:00:00Z');
  const owned = { id: 'owned', ...source.partitionBindings[0], state: source.state, sourceChain: source.chain, observedAt: new Date(at).toISOString(), canAlertAsInventory: true };
  const sibling = { ...owned, id: 'sibling', variantId: 'unowned' };
  assert.equal(mergePollProjection([owned, sibling], [], [source], 'drops', at)[0].stale, true);
  assert.deepEqual(mergePollProjection([owned, sibling], [], [source], 'candidates', at), [sibling]);
  const enabled = { ...source, disabled: false };
  for (const job of [{ source_id: source.id, last_reason: 'source_access_denied', projection: null },
    { source_id: source.id, last_reason: 'accepted', projection: { drops: [], candidates: [] } },
    { source_id: source.id, last_reason: 'accepted', projection: { drops: [{ ...owned, observedAt: new Date(at - 3600001).toISOString() }], candidates: [] } }]) {
    const rows = mergePollProjection([owned, sibling], [job], [enabled], 'drops', at);
    assert.ok(rows.filter(row => row.id === 'owned').every(row => row.stale && row.canAlertAsInventory === false));
    assert.ok(rows.some(row => row.id === 'sibling' && !row.stale));
  }
});

test('source retry policy is one attempt with full denial/rate-limit and longer Retry-After budgets', () => {
  const source = descriptors()[0];
  for (const reason of ['timeout', 'transport_failure', 'http_503']) assert.equal(recoveryPolicy(reason, 0, 0, source).retry, false);
  assert.equal(recoveryPolicy('source_access_denied', 0, 0, source).backoff, 86400);
  assert.equal(recoveryPolicy('rate_limited', 0, 0, source).backoff, 14400);
  assert.equal(recoveryPolicy('rate_limited', 0, 172800, source).backoff, 172800);
});

for (const config of configurations) test(`real exporter episode identity and current policy boundary: ${config.id}`, async () => {
  const nextTime = Date.now(), firstAt = new Date(nextTime - 1800000).toISOString(), nextAt = new Date(nextTime).toISOString();
  const first = await collectShopifyVariantPickup(bible, config, { observedAt: firstAt, fetchText: transport });
  const previous = buildDrops(first.signals, lookup, first.signals, [], first.signals);
  const next = await collectShopifyVariantPickup(bible, config, { observedAt: nextAt, fetchText: transport });
  const subject = availabilityEpisodeIdentity(first.signals[0]);
  const firstEpisode = buildAvailabilityEpisodeIndex(first.signals).get(subject);
  const nextEpisode = buildAvailabilityEpisodeIndex([...first.signals, ...next.signals]).get(subject);
  assert.equal(nextEpisode.id, firstEpisode.id); assert.equal(nextEpisode.lastConfirmedAt, nextAt);
  // The shared platform gate now fails closed before exporting any generic
  // Shopify source unless a trusted current policy explicitly admits it.
  assert.deepEqual(previous, []);
  assert.deepEqual(buildDrops(next.signals, lookup, next.signals, [], next.signals), []);
});
