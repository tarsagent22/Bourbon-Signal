import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build, transform } from 'esbuild';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { bibleLookup } from '../engine/src/export-site-contract.mjs';
import { buildShopifyCohortDescriptors } from '../engine/src/collectors/shopify-cohort-runtime.mjs';
import { collectShopifyVariantPickup, describeShopifyVariantSource } from '../engine/src/collectors/shopify-variant-pickup.mjs';
import { buildShopifyPollProjection } from '../engine/src/sources/shopify-poll-projection.mjs';
import { mergePollProjection, validatePollPolicy } from '../engine/src/sources/poll-policy.mjs';

type Row = Record<string, any>;
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = new URL('../engine/test/fixtures/shopify-variant-pickup/', import.meta.url);
const configs = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8')).sources;
const catalog = JSON.parse(await readFile(new URL('current-bourbon-bible.json', fixture), 'utf8'));
const readiness = JSON.parse(await readFile(new URL('readiness.json', fixture), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.json', fixture), 'utf8'));
const bodies = new Map<string, string>(await Promise.all(manifest.captures.map(async (capture: Row) => [capture.requestedUrl, await readFile(new URL(capture.file, fixture), 'utf8')])));
const require = createRequire(import.meta.url);
const forbidden = () => { throw new Error('Customer fixture attempted infrastructure or live transport'); };

// Bundle the actual customer helpers in memory; only remote storage/cache I/O is
// replaced. No policy, normalizer, classification, evidence or coverage stub.
const bundled = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  stdin: { resolveDir: root, loader: 'ts', contents: `
    export {normalizeDropForSite} from './src/lib/site-engine-contract';
    export * as drops from './src/lib/drops';
    export * as classification from './src/lib/drop-classification';
    export * as evidence from './src/lib/public-drop-evidence';
    export * as coverage from './src/lib/coverage-model';
    export * as knownStores from './src/lib/coverage-known-stores';
    export * as retailerFeed from './src/lib/retailer-signal-feed';
    export * as receipt from './src/lib/nationwide-pilot-receipt';
    export * as signals from './src/lib/signals/signal-contract';
    export * as scheduled from './src/lib/scheduled-release-signals';
    export * as location from './src/lib/location-normalization';
    export {default as classificationArtifact} from './src/data/drop-feed-classification.generated.json';
    export {default as lifecycle} from './src/config/state-lifecycle.json';
    export {default as mississippiStores} from './src/config/mississippi-known-stores.json';
  ` }, plugins: [{ name: 'forbid-infrastructure', setup(builder) {
    builder.onResolve({ filter: /^next\/cache$/ }, () => ({ path: 'cache', namespace: 'offline' }));
    builder.onResolve({ filter: /vercel-blob-snapshot-storage$/ }, () => ({ path: 'storage', namespace: 'offline' }));
    builder.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: args.path === 'cache'
      ? 'export const unstable_cache=(fn)=>fn;'
      : 'export class VercelBlobSnapshotStorage { readPointer(){throw new Error("Forbidden Blob read")} readObject(){throw new Error("Forbidden Blob read")} }', loader: 'js' }));
  } }] });
const customerModule = { exports: {} as Row };
new Function('require', 'module', 'exports', 'process', 'fetch', bundled.outputFiles[0].text)(require, customerModule, customerModule.exports, { env: {}, cwd: () => root }, forbidden);
const customer = customerModule.exports;
const classification = customer.classification.getDropClassificationIndex(customer.classificationArtifact.records);
const now = Date.now(), at = new Date(now - 1000).toISOString(), snapshotId = 'synthetic-customer-policy-only';
const bible = new BourbonBible(catalog.records), lookup = bibleLookup(catalog.records);

// Synthetic approvals exercise customer processing; none are real admissions.
function descriptor(config: Row) {
  const plan = describeShopifyVariantSource(config, { collectorSha256: readiness.collectorSha256 });
  const canonical = readiness.results.find((result: Row) => result.sourceId === config.id).canonical;
  const admission = { schemaVersion: 1, sourceId: config.runtimeId, configSha256: plan.configSha256,
    collectorSha256: readiness.collectorSha256, catalogSha256: readiness.catalogSha256, reviewer: 'synthetic customer fixture only', reviewedAt: at,
    productionCommit: 'a'.repeat(40), policySnapshotId: 'prior-review-snapshot', reviewArtifactSha256: '1'.repeat(64), canonicalReviewSha256: '2'.repeat(64),
    premisesBaselineSha256: '3'.repeat(64), livePreflightSha256: '4'.repeat(64), baselineResult: 'net_new_confirmed',
    bindings: config.stores.flatMap((store: Row) => config.products.map((product: Row) => ({ storeId: store.id, productId: product.productId,
      variantId: product.variantId, canonicalBottleId: canonical.id, tier: canonical.tier }))) };
  return { ...buildShopifyCohortDescriptors([config], { admissions: [admission], collectorSha256: readiness.collectorSha256, catalogSha256: readiness.catalogSha256 })[0], disabled: false };
}
const projections = await Promise.all(configs.map(async (config: Row) => {
  const source = descriptor(config);
  const result = await collectShopifyVariantPickup(bible, config, { observedAt: at, fetchText: async (url: string) => ({ ok: true, status: 200, url, text: bodies.get(url) }) });
  const ctx = { bible, lookup, snapshotId, drops: [], health: { states: [{ state: source.state, health: 'healthy' }] } };
  const built = buildShopifyPollProjection({ source, ctx, lease: { generation: 1, projection: null }, result, owner: `synthetic-${source.id}`, now });
  return { config, source, ctx, result, built, row: built.projection.drops[0] };
}));

function normal(row: Row, clock = now) {
  const normalized = customer.normalizeDropForSite(row);
  return customer.evidence.projectInventoryEvidenceFreshness(customer.classification.classifyPublicDrop(normalized, classification), clock);
}
function currentRows(rows: Row[], clock = now) {
  return rows.map(row => normal(row, clock)).filter(row => customer.evidence.isPublicDropFeedEligible(row) && customer.evidence.isCurrentInventoryEvidence(row, clock));
}
const coverageCode = await transform(await readFile(new URL('../src/lib/coverage-server.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs', target: 'node22' });
async function actualCoverage(rows: Row[], clock = now) {
  const module = { exports: {} as Row };
  const dependencies = (name: string): any => {
    if (name === 'server-only') return {};
    if (name === '@/config/stateLifecycle') return { STATE_LIFECYCLE_CONFIG: customer.lifecycle };
    if (name === '@/config/mississippi-known-stores.json') return customer.mississippiStores;
    if (name === '@/lib/coverage-model') return customer.coverage;
    if (name === '@/lib/coverage-known-stores') return customer.knownStores;
    if (name === '@/lib/retailer-signal-feed') return customer.retailerFeed;
    if (name === '@/lib/retailer-public-submissions') return { readCachedPublicRetailerSubmissions: forbidden };
    if (name === '@/lib/public-drop-evidence') return customer.evidence;
    if (name === '@/lib/drop-classification') return customer.classification;
    if (name === '@/data/drop-feed-classification.generated.json') return customer.classificationArtifact;
    if (name === './nationwide-pilot-receipt') return customer.receipt;
    if (name === '@/lib/source-lane-runtime') return { readRuntimeSourceDropOverlay: async (base: Row[]) => ({ drops: base, version: 'offline-real-policy-output' }) };
    if (name === '@/lib/site-engine-contract') return { normalizeDropForSite: customer.normalizeDropForSite,
      readSiteExportResults: async (names: string[]) => names.map(name => ({ source: 'remote-snapshot', snapshotId, payload:
        name === 'drops' ? { drops: rows } : name === 'stats' ? { generatedAt: new Date(clock).toISOString(), stateCoverage: { states: [] } }
          : name === 'stores' ? { stores: [] } : { locations: [] } })) };
    throw new Error(`Unreviewed coverage dependency ${name}`);
  };
  class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? clock : value); } static now() { return clock; } }
  new Function('require', 'module', 'exports', 'process', 'Date', coverageCode.code)(dependencies, module, module.exports, { env: {} }, Clock);
  return module.exports.readCurrentCoverageContract();
}
function overlay(item: Row, patch: Row = {}, sourcePatch: Row = {}, clock = now) {
  const source = { ...item.source, ...sourcePatch };
  const job = { source_id: source.id, last_reason: 'accepted', failures: 0, projection: item.built.projection, ...patch };
  const permitted = validatePollPolicy([job], [source], lookup, item.ctx.health, '', snapshotId);
  return mergePollProjection([item.row], permitted, [source], 'drops', clock);
}

// Expose the saved actual card implementation in memory for server rendering.
// Component I/O hooks are forbidden; React, customer helpers and price lookup
// execute normally. Framer's animation wrapper is a plain DOM wrapper under SSR.
const cardSource = (await readFile(new URL('../src/components/sections/DropFeed.tsx', import.meta.url), 'utf8')).split('export default function DropFeed()')[0] + '\nexport {FeedRow as FixtureFeedRow};';
const cardCode = await transform(cardSource, { loader: 'tsx', format: 'cjs', target: 'node22', jsx: 'automatic' });
const cardModule = { exports: {} as Row };
let expandedForRender = false, stateCalls = 0;
const animation = new Proxy({}, { get: (_target, tag) => ({ children, ...props }: Row) => {
  for (const key of ['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'layout']) delete props[key];
  return React.createElement(String(tag), props, children);
} });
const cardDependency = (name: string): any => {
  if (name === 'react') return { ...React, useState: (initial: any) => React.useState(stateCalls++ === 0 && expandedForRender ? true : initial) };
  if (name === 'react/jsx-runtime' || name === 'lucide-react') return require(name);
  if (name === 'framer-motion') return { motion: animation, AnimatePresence: ({ children }: Row) => children, useReducedMotion: () => true };
  if (name === '@/lib/drops') return customer.drops;
  if (name === '@/lib/scheduled-release-signals') return customer.scheduled;
  if (name === '@/lib/location-normalization') return customer.location;
  if (name === '@/lib/statePreferences') return { AVAILABLE_STATES: customer.coverage.US_STATE_OPTIONS, useStatePreferences: forbidden };
  if (name === '@/components/CountyLink') return ({ children }: Row) => React.createElement('span', null, children);
  return new Proxy({}, { get: () => forbidden });
};
new Function('require', 'module', 'exports', 'fetch', cardCode.code)(cardDependency, cardModule, cardModule.exports, forbidden);
function renderCard(grouped: Row, expanded = false) {
  expandedForRender = expanded; stateCalls = 0;
  return renderToStaticMarkup(React.createElement(cardModule.exports.FixtureFeedRow, { drop: grouped, isNew: false, index: 0, isFreeUser: false }));
}

test('actual Feed and Coverage classification agree: three eligible sources, two regular Buffalo Trace exclusions', async () => {
  const all = projections.map(item => item.row);
  assert.equal(currentRows(all).length, 3, JSON.stringify(all.map(row => {
    const value = normal(row);
    return { source: row.sourceRuntimeId, engineTier: row.tier, customerTier: value.rarity_tier, classificationSource: value.classification_source,
      feedEligible: customer.evidence.isPublicDropFeedEligible(value), current: customer.evidence.isCurrentInventoryEvidence(value, now) };
  })));
  assert.deepEqual(currentRows(all).map(row => row.sourceRuntimeId).sort(), ['ca:christies-la-crescenta', 'ny:vino-lexington', 'tx:hot-spot-austin']);
  for (const item of projections.filter(value => ['remedy-glendale', 'main-street-el-cajon'].includes(value.config.id))) {
    assert.equal(normal(item.row).rarity_tier, 'regular'); assert.equal(currentRows([item.row]).length, 0);
  }
  const contract = await actualCoverage(all);
  for (const [state, count] of [['CA', 1], ['NY', 1], ['TX', 1]]) {
    const value = contract.states.find((entry: Row) => entry.code === state);
    assert.equal(value.freshness.currentInventoryStores, count, `${state} current premises`);
    assert.equal(value.capabilities.currentBottleAvailability, true, state);
  }
});

for (const item of projections) test(`normal customer identity, location and unknown quantity: ${item.source.id}`, () => {
  assert.equal(item.built.candidates.length, 0, 'first accepted fixture is silent bootstrap');
  const value = normal(item.row), canonical = customer.signals.normalizeDropSignal(value);
  assert.equal(value.canonical_id, item.row.canonicalId);
  assert.equal(value.store_id, item.config.stores[0].id); assert.equal(value.store_address, item.config.stores[0].address);
  assert.equal(value.quantity_in_stock, undefined); assert.equal(value.quantity, undefined);
  assert.equal(canonical.location.scope, 'exact_store'); assert.equal(canonical.location.store.address, item.config.stores[0].address);
  assert.equal(canonical.bottle.id, item.row.canonicalId); assert.equal(canonical.bottle.name, item.config.products[0].canonicalName);
  assert.equal(canonical.availability.quantity, undefined, 'binary pickup cannot become zero bottles');
  assert.equal(canonical.availability.price, Number(JSON.parse(bodies.get(item.config.products[0].evidence.product.url)!).product.variants[0].price));
  const grouped = customer.drops.groupDrops([value]); assert.equal(grouped.length, 1);
  assert.ok(grouped[0].locations.every((location: Row) => location.quantity === undefined));
  assert.ok(grouped[0].locations.some((location: Row) => location.address === item.config.stores[0].address));
});

test('New York classification keeps the reviewed canonical identity, not a hash of retailer wording', () => {
  const item = projections.find(value => value.source.state === 'NY')!, value = normal(item.row);
  assert.equal(value.canonical_id, 'bb_1fd1f694742e0a1e');
  assert.equal(value.canonical_name, 'Weller Single Barrel');
  assert.ok(value.classification_bottle_id, 'actual generated classification must resolve NY canonical');
  assert.equal(value.raw_name, item.config.products[0].title);
});

test('actual state-classified scheduler context denies CA regular seeds and exports Vino market tier', () => {
  const byState = Object.fromEntries([...new Set(configs.map((config: Row) => config.state))].map(state => [String(state),
    bibleLookup(catalog.records.map((record: Row) => ({ ...record, tier: customer.classification.resolveDropClassification({ state,
      canonical_id: record.id, canonical_name: record.canonical, tier: record.tier }, classification).tier }))) ]));
  for (const item of projections) {
    const assemble = () => buildShopifyPollProjection({ source: item.source, ctx: { ...item.ctx, lookup: { ...lookup, byState } },
      lease: { generation: 1, projection: null }, result: item.result, owner: `state-current-${item.source.id}`, now });
    if (['remedy-glendale', 'main-street-el-cajon'].includes(item.config.id)) {
      assert.throws(assemble, /unadmitted|canonical.*policy/iu, 'regular source product cannot create backend inventory or alert projection');
    } else {
      const built = assemble(); assert.equal(currentRows(built.projection.drops).length, 1);
      assert.equal(built.candidates.length, 0);
      if (item.source.state === 'NY') {
        assert.equal(item.result.signals[0].tier, 'unicorn'); assert.equal(built.projection.drops[0].tier, 'allocated');
        assert.equal(built.projection.drops[0].canonicalId, 'bb_1fd1f694742e0a1e');
      }
    }
  }
});

test('California outside San Diego retains exact city and does not claim San Diego geography', () => {
  for (const item of projections.filter(value => ['remedy-glendale', 'christies-la-crescenta'].includes(value.config.id))) {
    const value = normal(item.row), grouped = customer.drops.groupDrops([value])[0];
    const copy = [value.inventoryCaveat, value.evidence, value.area, value.display_location, grouped.inventoryCaveat, ...grouped.locations.map((location: Row) => location.label)].filter(Boolean).join(' ');
    assert.equal(value.store_city, item.config.stores[0].city);
    assert.doesNotMatch(copy, /San Diego/iu, item.source.id);
  }
});

test('Texas pickup stays Shopify variant proof and never masquerades as CityHive', () => {
  const item = projections.find(value => value.source.state === 'TX')!, value = normal(item.row);
  assert.match(value.sourceUrl, /^https:\/\/hotspot\.fun\/products\//u);
  assert.equal(value.sourceRuntimeId, item.source.id); assert.equal(value.sourceProductBinding, item.config.products[0].evidence.pickup.url);
  assert.doesNotMatch([value.source, value.evidence, value.inventoryCaveat, value.optionId || ''].join(' '), /CityHive/iu);
  assert.ok(!value.optionId, 'no invented CityHive option ID');
});

for (const item of projections) test(`actual source offer is distinctly labeled; catalog reference remains separate: ${item.source.id}`, () => {
  const value = normal(item.row), grouped = customer.drops.groupDrops([value])[0], markup = renderCard(grouped, true);
  const text = markup.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
  assert.ok(text.includes('What this means'), `expanded actual detail panel must render; React state calls ${stateCalls}`);
  const sourcePrice = Number(value.retail_price), reference = customer.drops.lookupPricing(grouped.displayName, sourcePrice);
  const mislabeledSource = new RegExp(`\\bMSRP\\s*:?\\s*\\$${Math.round(sourcePrice)}(?:\\D|$)`, 'iu').test(text);
  if (reference.msrp !== Math.round(sourcePrice)) assert.equal(mislabeledSource, false, `${item.source.id}: actual expanded card labels retailer offer ${sourcePrice} as MSRP; independent catalog MSRP is ${reference.msrp}`);
  assert.equal(/\bdeal\b|\bsave\s+\$|\bdiscount\b/iu.test(text), false, 'no unsupported deal claim');
  assert.equal(/\b0\s+(?:bottles?|units?)\b/iu.test(markup), false, 'unknown binary quantity cannot become zero bottles');
  const exactAmount = Number.isInteger(sourcePrice) ? `${sourcePrice}(?:\\.00)?` : sourcePrice.toFixed(2).replace('.', '\\.');
  assert.ok(new RegExp(`(?:(?:store|retailer|source|listed|current)\\s+)?price\\s*:?\\s*\\$${exactAmount}`, 'iu').test(text), `${item.source.id}: exact source offer needs a distinct price label; actual ${text.match(/.{0,25}MSRP.{0,60}/giu)?.join(' | ')}`);
});

test('failure, disablement, expiry and explicit veto remove current customer inventory without reviving base rows', async () => {
  for (const item of projections) {
    for (const [name, rows, clock] of [
      ['failure', overlay(item, { last_reason: 'source_access_denied', failures: 1 }), now],
      ['disabled', overlay(item, {}, { disabled: true }), now],
      ['expired', overlay(item, {}, {}, now + 3600001), now + 3600001],
      ['veto', overlay(item, { projection: { ...item.built.projection, drops: [{ ...item.row, canAlertAsInventory: false, canAlertAsWatch: false }] } }), now],
    ] as Array<[string, Row[], number]>) {
      assert.equal(currentRows(rows, clock).length, 0, `${item.source.id} ${name} current feed rows`);
      const state = (await actualCoverage(rows, clock)).states.find((value: Row) => value.code === item.source.state);
      assert.equal(state.freshness.currentInventoryStores, 0, `${item.source.id} ${name} current coverage`);
    }
  }
});
