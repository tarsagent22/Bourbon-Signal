import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { bibleLookup } from '../engine/src/export-site-contract.mjs';
import { buildShopifyCohortDescriptors } from '../engine/src/collectors/shopify-cohort-runtime.mjs';
import { collectShopifyVariantPickup, describeShopifyVariantSource } from '../engine/src/collectors/shopify-variant-pickup.mjs';
import { SHOPIFY_PICKUP_SOURCES, createShopifyPickupPolicy } from '../engine/src/sources/shopify-pickup-policy.mjs';
import { buildShopifyPollProjection } from '../engine/src/sources/shopify-poll-projection.mjs';
import { mergePollProjection, validatePollPolicy } from '../engine/src/sources/poll-policy.mjs';

type Row = Record<string, any>;
const root = fileURLToPath(new URL('../', import.meta.url));
const original = new URL('../engine/test/fixtures/shopify-variant-pickup/', import.meta.url);
const v2 = new URL('v2/', original);
const historicalV2 = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-cohort-v2.json', import.meta.url), 'utf8')).sources;
const currentManifest = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-cohort-v3.json', import.meta.url), 'utf8'));
const configs = currentManifest.sources;
const v1Configs = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8')).sources;
const catalogText = await readFile(new URL('current-bourbon-bible.json', original), 'utf8');
const catalog = JSON.parse(catalogText), bible = new BourbonBible(catalog.records), lookup = bibleLookup(catalog.records);
const catalogSha256 = createHash('sha256').update(catalogText).digest('hex');
const collectorSha256 = createHash('sha256').update(await readFile(new URL('../engine/src/collectors/shopify-variant-pickup.mjs', import.meta.url))).digest('hex');
const bodies = new Map<string, string>(), evidence = new Map<string, Row>();
for (const directory of [original, v2, new URL('v3/', original)]) {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  for (const capture of manifest.captures) {
    const bytes = await readFile(new URL(capture.file, directory));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256, capture.file);
    assert.equal(bytes.length, capture.bytes, capture.file);
    assert.equal(capture.requestedUrl, capture.finalUrl, capture.file);
    bodies.set(capture.requestedUrl, bytes.toString('utf8')); evidence.set(capture.requestedUrl, capture);
  }
}

// Reuse the actual customer modules and Coverage server, not copied processing
// implementations. Only storage/cache/submission infrastructure is isolated.
let coverageInput: Row[] = [];
const snapshotId = 'synthetic-v2-customer-policy';
const readExports = async (names: string[]) => names.map(name => ({ source: 'remote-snapshot', snapshotId, payload:
  name === 'drops' ? { drops: coverageInput } : name === 'stats' ? { generatedAt: new Date().toISOString(), stateCoverage: { states: [] } }
    : name === 'stores' ? { stores: [] } : { locations: [] } }));
const code = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  stdin: { resolveDir: root, loader: 'ts', contents: `
    export {normalizeDropForSite} from './src/lib/site-engine-contract';
    export {classifyPublicDrop,getDropClassificationIndex,resolveDropClassification} from './src/lib/drop-classification';
    export {isPublicDropFeedEligible,isCurrentInventoryEvidence,projectInventoryEvidenceFreshness} from './src/lib/public-drop-evidence';
    export {normalizeDropSignal} from './src/lib/signals/signal-contract';
    export {readCurrentCoverageContract} from './src/lib/coverage-server';
    export {default as classificationArtifact} from './src/data/drop-feed-classification.generated.json';
  ` }, plugins: [{ name: 'offline-v2-storage', setup(builder) {
    builder.onResolve({ filter: /^next\/cache$|^server-only$/ }, args => ({ path: args.path, namespace: 'offline-v2' }));
    builder.onResolve({ filter: /vercel-blob-snapshot-storage$|retailer-public-submissions$|source-lane-runtime$/ }, args => ({ path: args.path, namespace: 'offline-v2' }));
    builder.onResolve({ filter: /^offline-v2-site$/ }, () => ({ path: 'site', namespace: 'offline-v2' }));
    builder.onLoad({ filter: /coverage-server\.ts$/ }, async args => ({ loader: 'ts', contents:
      (await readFile(args.path, 'utf8')).replace('from "@/lib/site-engine-contract"', 'from "offline-v2-site"') }));
    builder.onLoad({ filter: /.*/, namespace: 'offline-v2' }, args => {
      const contents = args.path === 'next/cache' ? 'export const unstable_cache=fn=>fn;'
        : args.path === 'server-only' ? 'export {};'
          : args.path === 'site' ? `export {normalizeDropForSite} from ${JSON.stringify(fileURLToPath(new URL('../src/lib/site-engine-contract.ts', import.meta.url)))}; export const readSiteExportResults=names=>globalThis.__readShopifyV2Exports(names);`
            : args.path.includes('source-lane-runtime') ? 'export const readRuntimeSourceDropOverlay=async rows=>({drops:rows,version:"offline-real-policy-results"});'
              : args.path.includes('retailer-public-submissions') ? 'export const readCachedPublicRetailerSubmissions=()=>{throw new Error("Forbidden submission read")};'
                : 'export class VercelBlobSnapshotStorage {readPointer(){throw new Error("Forbidden Blob read")}readObject(){throw new Error("Forbidden Blob read")}}';
      return { contents, loader: 'js', resolveDir: root };
    });
  } }] });
const customerModule = { exports: {} as Row };
const isolatedGlobal = Object.create(globalThis); isolatedGlobal.__readShopifyV2Exports = readExports;
new Function('require', 'module', 'exports', 'process', 'globalThis', 'fetch', code.outputFiles[0].text)(createRequire(import.meta.url), customerModule,
  customerModule.exports, { env: {}, cwd: () => root }, isolatedGlobal, () => { throw new Error('Forbidden live customer request'); });
const customer = customerModule.exports, index = customer.getDropClassificationIndex(customer.classificationArtifact.records);
const states = [...new Set(configs.map((source: Row) => source.state))];
const byState = Object.fromEntries(states.map(state => [String(state), bibleLookup(catalog.records.map((record: Row) => ({ ...record,
  tier: customer.resolveDropClassification({ state, canonical_id: record.id, canonical_name: record.canonical, tier: record.tier }, index).tier }))) ]));
const currentLookup = { ...lookup, byState }, now = Date.now();

function descriptor(source: Row) {
  const canonical = bible.match(source.products[0].canonicalName)?.record;
  assert.ok(canonical, `Actual catalog canonical missing for ${source.id}`);
  const plan = describeShopifyVariantSource(source, { collectorSha256 });
  // Deliberately synthetic test approvals. No actual baseline/live admission or
  // production authorization is fabricated by these placeholder proof hashes.
  const admission = { schemaVersion: 1, sourceId: source.runtimeId, configSha256: plan.configSha256, collectorSha256, catalogSha256,
    reviewer: 'synthetic v2 contract only', reviewedAt: new Date(now - 3600000).toISOString(), productionCommit: 'a'.repeat(40), policySnapshotId: 'prior-review',
    reviewArtifactSha256: '1'.repeat(64), canonicalReviewSha256: '2'.repeat(64), premisesBaselineSha256: '3'.repeat(64), livePreflightSha256: '4'.repeat(64), baselineResult: 'net_new_confirmed',
    bindings: source.stores.flatMap((store: Row) => source.products.map((product: Row) => ({ storeId: store.id, productId: product.productId,
      variantId: product.variantId, canonicalBottleId: canonical.id, tier: canonical.tier }))) };
  return { ...buildShopifyCohortDescriptors([source], { admissions: [admission], collectorSha256, catalogSha256 })[0], disabled: false };
}
async function collect(source: Row, observed: number, negative = false) {
  return collectShopifyVariantPickup(bible, source, { observedAt: new Date(observed).toISOString(), fetchText: async (url: string) => {
    assert.ok(bodies.has(url), `No reviewed fixture for ${url}`);
    const text = bodies.get(url)!;
    return { ok: true, status: 200, url, text: negative && !url.endsWith('.json') ? text.replaceAll('Pickup available', 'Pickup unavailable') : text };
  } });
}
const compiled = await Promise.all(configs.map(async (config: Row) => {
  const source = descriptor(config), firstAt = now - 1800000;
  const ctx = { bible, lookup: currentLookup, snapshotId, drops: [], health: { states: [{ state: source.state, health: 'healthy' }] } };
  const result = await collect(config, firstAt);
  const first = buildShopifyPollProjection({ source, ctx, lease: { generation: 1, projection: null }, result, owner: `synthetic-v2-${source.id}-1`, now: firstAt + 1 });
  return { config, source, ctx, result, first };
}));
function normal(row: Row, clock = now) { return customer.projectInventoryEvidenceFreshness(customer.classifyPublicDrop(customer.normalizeDropForSite(row), index), clock); }
function current(rows: Row[], clock = now) { return rows.map(row => normal(row, clock)).filter(row => customer.isPublicDropFeedEligible(row) && customer.isCurrentInventoryEvidence(row, clock)); }
async function coverage(rows: Row[]) { coverageInput = rows; return customer.readCurrentCoverageContract(); }

test('current shared collector replays V2 identities while V3 binds its reviewed premise fix for all stores', () => {
  assert.equal(collectorSha256, currentManifest.collectorSha256);
  assert.equal(currentManifest.previousCollectorSha256, '82ec1ede939d793f40d7a945430f49c0867fdfadf18d4004c5775c8878e39206');
  const identity = (source: Row) => ({ ...source, products: source.products.map((product: Row) => {
    const { evidence, ...fields } = product; return fields;
  }) });
  assert.deepEqual(configs.map(identity), historicalV2.map(identity), 'Only capture bindings change after the bounded fresh preflight');
  assert.equal(configs.length, 5); assert.deepEqual(states.sort(), ['CA', 'NY', 'TX']);
  for (const config of configs) {
    const previous = v1Configs.find((source: Row) => source.id === config.id);
    assert.ok(previous); assert.deepEqual({ ...config, products: [] }, { ...previous, products: [] });
    if (['remedy-glendale', 'main-street-el-cajon'].includes(config.id)) assert.notEqual(config.products[0].productId, previous.products[0].productId);
    else assert.deepEqual(identity(config).products, identity(previous).products);
    for (const capture of Object.values(config.products[0].evidence) as Row[]) assert.equal(evidence.get(capture.url)?.sha256, capture.sha256);
  }
});

test('real default registry and absent admission remain empty despite five passing offline fixtures', () => {
  assert.deepEqual(SHOPIFY_PICKUP_SOURCES, []); assert.deepEqual(buildShopifyCohortDescriptors(configs), []);
  const closed = createShopifyPickupPolicy();
  for (const item of compiled) assert.equal(closed.eligible(item.result.signals[0]), false);
});

test('all five pass actual current backend, normal Feed and actual Coverage at five premises in three states and four families', async () => {
  const rows = compiled.flatMap(item => item.first.projection.drops);
  assert.equal(rows.length, 5); assert.equal(current(rows).length, 5);
  assert.equal(new Set(rows.map(row => row.storeAddress)).size, 5);
  assert.equal(new Set(rows.map(row => row.canonicalId)).size, 4);
  const contract = await coverage(rows);
  for (const [state, count] of [['CA', 3], ['NY', 1], ['TX', 1]]) assert.equal(contract.states.find((entry: Row) => entry.code === state).freshness.currentInventoryStores, count);
  for (const item of compiled) {
    assert.equal(item.first.candidates.length, 0); assert.equal(item.result.accounting.requestCount, 2);
    const row = normal(item.first.projection.drops[0]), signal = customer.normalizeDropSignal(row);
    assert.equal(signal.location.store.id, item.config.stores[0].id); assert.equal(signal.location.store.address, item.config.stores[0].address);
    assert.equal(signal.bottle.id, item.source.admission.bindings[0].canonicalBottleId);
    assert.equal(signal.availability.quantity, undefined); assert.equal(row.quantity, undefined);
    assert.equal(row.sourceProductBinding, item.config.products[0].evidence.pickup.url);
  }
  assert.equal(rows.find(row => row.sourceRuntimeId === 'ca:remedy-glendale').tier, 'limited');
  assert.equal(rows.find(row => row.sourceRuntimeId === 'ca:main-street-el-cajon').canonicalId, 'bb_d0fe561ac45db2d5');
  assert.equal(rows.find(row => row.sourceRuntimeId === 'ca:remedy-glendale').canonicalId, 'bb_be6a0afd4ba5f963');
});

for (const item of compiled) test(`silent bootstrap, stable reconfirmation and explicit negative/restock: ${item.source.id}`, async () => {
  const secondAt = now - 1200000, negativeAt = now - 600000, restockAt = now - 60000;
  const buildNext = (result: Row, prior: Row, generation: number, clock: number) => buildShopifyPollProjection({ source: item.source, ctx: item.ctx,
    lease: { generation, projection: prior }, result, owner: `synthetic-v2-${item.source.id}-${generation}`, now: clock + 1 });
  const second = buildNext(await collect(item.config, secondAt), item.first.projection, 2, secondAt);
  assert.equal(second.candidates.length, 0); assert.equal(second.drops[0].availabilityEpisodeId, item.first.drops[0].availabilityEpisodeId);
  assert.equal(second.drops[0].firstSeenAt, item.first.drops[0].firstSeenAt); assert.equal(second.drops[0].lastConfirmedAt, new Date(secondAt).toISOString());
  const negative = buildNext(await collect(item.config, negativeAt, true), second.projection, 3, negativeAt);
  assert.deepEqual(negative.projection.drops, []); assert.deepEqual(negative.candidates, []);
  assert.equal(negative.observations[0].availabilityStatus, 'out_of_stock');
  const ownedBase = second.projection.drops;
  const empty = mergePollProjection(ownedBase, [{ source_id: item.source.id, last_reason: 'accepted', projection: negative.projection }], [item.source], 'drops', negativeAt + 1);
  assert.equal(current(empty, negativeAt + 1).length, 0);
  const restock = buildNext(await collect(item.config, restockAt), negative.projection, 4, restockAt);
  assert.notEqual(restock.drops[0].availabilityEpisodeId, second.drops[0].availabilityEpisodeId);
  assert.equal(restock.drops[0].availabilityEpisodeKind, 'restock'); assert.equal(restock.candidates.length, 1);
  const againAt = restockAt + 1000;
  const again = buildNext(await collect(item.config, againAt), restock.projection, 5, againAt);
  assert.equal(again.candidates[0].dedupeKey, restock.candidates[0].dedupeKey);
});

test('v2 current customer results respect failure, disable, expiry and current policy loss', async () => {
  for (const item of compiled) {
    const base = item.first.projection.drops;
    for (const mode of ['failure', 'disabled', 'expired', 'policy']) {
      const source = { ...item.source, disabled: mode === 'disabled' }, clock = mode === 'expired' ? now + 3600001 : now;
      const job = { source_id: source.id, last_reason: mode === 'failure' ? 'source_access_denied' : 'accepted', projection: item.first.projection };
      const jobs = validatePollPolicy([job], [source], currentLookup, item.ctx.health, '', mode === 'policy' ? 'different-policy' : snapshotId);
      const rows = mergePollProjection(base, jobs, [source], 'drops', clock);
      assert.equal(current(rows, clock).length, 0, `${source.id} ${mode}`);
      assert.equal((await coverage(rows)).states.find((entry: Row) => entry.code === source.state).freshness.currentInventoryStores, 0, `${source.id} ${mode} coverage`);
    }
  }
});
