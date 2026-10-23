import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { transform } from 'esbuild';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { buildShopifyCohortDescriptors } from '../engine/src/collectors/shopify-cohort-runtime.mjs';
import { collectShopifyVariantPickup, describeShopifyVariantSource } from '../engine/src/collectors/shopify-variant-pickup.mjs';
import { JENSENS_RUNTIME_SOURCE } from '../engine/src/collectors/florida-jensens-runtime-source.mjs';
import { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES } from '../engine/src/collectors/california-san-diego-surfaces.mjs';

type Row = Record<string, any>;
const fixtureRoot = new URL('../engine/test/fixtures/shopify-variant-pickup/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('current-bourbon-bible.json', fixtureRoot), 'utf8'));
const readiness = JSON.parse(await readFile(new URL('readiness.json', fixtureRoot), 'utf8'));
const config = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8')).sources.find((row: Row) => row.id === 'christies-la-crescenta');
const manifest = JSON.parse(await readFile(new URL('manifest.json', fixtureRoot), 'utf8'));
const bodies = new Map<string, string>(await Promise.all(manifest.captures.map(async (capture: Row) =>
  [capture.requestedUrl, await readFile(new URL(capture.file, fixtureRoot), 'utf8')])));
const sourceText = await readFile(new URL('../src/lib/source-scheduler.ts', import.meta.url), 'utf8');
const modules = new Map<string, any>();
for (const match of sourceText.matchAll(/from\s+['"]([^'"]+\.mjs)['"]/g)) {
  if (!match[1].includes('/collectors/') && !match[1].includes('/core/fetcher')) {
    modules.set(match[1], await import(new URL(match[1], new URL('../src/lib/source-scheduler.ts', import.meta.url)).href));
  }
}
const classificationModule = await import('../src/lib/drop-classification.ts');
const classification = (classificationModule as any).default || classificationModule;
const classificationData = JSON.parse(await readFile(new URL('../src/data/drop-feed-classification.generated.json', import.meta.url), 'utf8'));
const exporter = modules.get('../../engine/src/export-site-contract.mjs');
const policy = modules.get('../../engine/src/sources/poll-policy.mjs');
const pickupPolicy = modules.get('../../engine/src/sources/shopify-pickup-policy.mjs');
const projection = modules.get('../../engine/src/sources/shopify-poll-projection.mjs');
const snapshotId = 'synthetic-context-snapshot';
const policyNames = ['bottles', 'state-health', 'alerts'];
const collectionNames = ['bottles', 'drops', 'state-health', 'alerts'];

async function harness() {
  const plan = describeShopifyVariantSource(config, { collectorSha256: readiness.collectorSha256 });
  const canonical = new BourbonBible(catalog.records).match(config.products[0].canonicalName)!.record;
  // Synthetic approvals exercise the real predicate; they authorize no source.
  const admission = { schemaVersion: 1, sourceId: config.runtimeId, configSha256: plan.configSha256,
    collectorSha256: readiness.collectorSha256, catalogSha256: readiness.catalogSha256,
    reviewer: 'offline context regression only', reviewedAt: '2026-10-23T03:00:00Z', productionCommit: 'a'.repeat(40), policySnapshotId: snapshotId,
    reviewArtifactSha256: '1'.repeat(64), canonicalReviewSha256: '2'.repeat(64), premisesBaselineSha256: '3'.repeat(64), livePreflightSha256: '4'.repeat(64),
    baselineResult: 'net_new_confirmed', bindings: config.products.flatMap((product: Row) => config.stores.map((store: Row) =>
      ({ storeId: store.id, productId: product.productId, variantId: product.variantId, canonicalBottleId: canonical.id, tier: canonical.tier }))) };
  const source = { ...buildShopifyCohortDescriptors([config], { admissions: [admission], collectorSha256: readiness.collectorSha256, catalogSha256: readiness.catalogSha256 })[0], disabled: false };
  const state = { now: Date.now(), reads: [] as string[][], bibles: 0, collectors: 0, requests: 0, writes: [] as string[], forbidden: [] as string[],
    jobs: new Map<string, Row>(), broadDrops: [] as Row[], tweak: null as null | ((name: string, result: Row) => Row),
    readError: false, catalogAllowed: true, snapshotId, flags: {} as Row };
  const env: Row = { SOURCE_SCHEDULER_ENABLED: '1', SOURCE_LANE_STORAGE_ENABLED: '0', SOURCE_LANE_POLL_ENABLED: '0' };
  const iso = (at = state.now) => new Date(at).toISOString();
  const forbidden = (name: string) => () => { state.forbidden.push(name); throw new Error(`Unexpected ${name}`); };
  const fixtureCollect = async (bible: any, definition: Row, options: Row) => {
    state.collectors++;
    return collectShopifyVariantPickup(bible, definition, { ...options, observedAt: iso(), fetchText: async (url: string) => {
      state.requests++;
      const text = bodies.get(url); assert.ok(text, `Unexpected fixture request ${url}`);
      return { ok: true, status: 200, url, text };
    } });
  };
  const executor = { query: async (sql: string, args: any[] = []) => {
    if (sql.includes('SELECT * FROM source_poll_jobs')) return { rows: structuredClone([...state.jobs.values()]) };
    if (sql.includes('source_poll_acquire')) {
      state.writes.push('acquire');
      const job = state.jobs.get(args[0]) || { source_id: args[0], generation: 0, failures: 0, projection: null };
      Object.assign(job, { generation: job.generation + 1, lease_owner: args[1] }); state.jobs.set(args[0], job);
      return { rows: [structuredClone(job)] };
    }
    if (sql.includes('source_poll_finish')) {
      state.writes.push('finish');
      const failed = sql.includes('NULL,$4'), job = state.jobs.get(args[0])!;
      Object.assign(job, { projection: failed ? job.projection : JSON.parse(args[3]), last_reason: args[failed ? 3 : 4] });
      return { rows: [{ committed: true }] };
    }
    if (sql.includes('INSERT INTO source_poll_trace')) return { rows: [] }; // Existing consumption telemetry only.
    if (sql.includes('INSERT INTO source_scheduler_heartbeat')) { state.writes.push('heartbeat'); return { rows: [] }; }
    return forbidden(`SQL ${sql}`)();
  } };
  const readExports = async (names: string[]) => {
    state.reads.push([...names]);
    if (state.readError) throw new Error('fixture snapshot reader unavailable');
    // A single invocation is a pinned bundle. Per-member mutation tests torn
    // responses explicitly instead of reproducing policy implementation here.
    return names.map(name => {
      const payload = name === 'bottles' ? { bottles: catalog.records.filter((row: Row) => state.catalogAllowed || row.id !== canonical.id)
        .map((row: Row) => ({ ...row, canonical_id: row.id, canonical_name: row.canonical })) }
        : name === 'drops' ? { drops: state.broadDrops }
          : name === 'state-health' ? { states: [], ...state.flags.health } : { alerts: [], ...state.flags.alerts };
      const result = { snapshotId: state.snapshotId, source: 'remote-snapshot', generatedAt: iso(), payload };
      return state.tweak ? state.tweak(name, result) : result;
    });
  };
  class CountingBible extends BourbonBible { constructor(records: any[]) { super(records); state.bibles++; } }
  const dependencies = (name: string): any => {
    if (name === 'node:crypto') return crypto;
    if (name === './source-acceptance-health') return {};
    if (name === './alert-queue/runtime') return { createProductionAlertQueueSqlExecutor: () => executor };
    if (name === './site-engine-contract') return { readSiteExportResults: readExports };
    if (name === './drop-classification') return classification;
    if (name.includes('classification.generated.json')) return classificationData;
    if (name.endsWith('/core/bible.mjs')) return { BourbonBible: CountingBible };
    if (name.endsWith('/shopify-pickup-policy.mjs')) return { ...pickupPolicy, SHOPIFY_PICKUP_SOURCES: [source] };
    if (name.endsWith('/shopify-variant-pickup.mjs')) return { collectShopifyVariantPickup: fixtureCollect };
    if (name.endsWith('/florida-jensens-runtime-source.mjs')) return { JENSENS_RUNTIME_SOURCE, collectJensensSource: forbidden('Jensen collection') };
    if (name.endsWith('/california-san-diego-surfaces.mjs')) return { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES };
    if (name.includes('/collectors/') || name.includes('/core/fetcher')) return new Proxy({}, { get: (_t, key) => forbidden(`collector ${String(key)}`) });
    if (modules.has(name)) return modules.get(name);
    return new Proxy({}, { get: (_t, key) => forbidden(`${name}:${String(key)}`) });
  };
  class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? state.now : value); } static now() { return state.now; } }
  const load = async (text: string, require: (name: string) => any) => {
    const output = await transform(text, { loader: 'ts', format: 'cjs', target: 'node22' });
    const module = { exports: {} as Row };
    new Function('require', 'module', 'exports', 'process', 'Date', output.code)(require, module, module.exports, { env }, Clock);
    return module.exports;
  };
  const scheduler = await load(sourceText, dependencies);
  scheduler.POLL_SOURCES.splice(0, scheduler.POLL_SOURCES.length, source);
  const wrapper = await load(await readFile(new URL('../src/lib/source-lane-runtime.ts', import.meta.url), 'utf8'), name => {
    if (name === './source-scheduler') return scheduler;
    if (name.endsWith('/sources/poll-policy.mjs')) return policy;
    return new Proxy({}, { get: (_t, key) => forbidden(`wrapper ${name}:${String(key)}`) });
  });
  const timed = async (call: () => any) => { const prior = Date.now; Date.now = () => state.now; try { return await call(); } finally { Date.now = prior; } };
  const result = await fixtureCollect(new BourbonBible(catalog.records), config, {});
  const initial = projection.buildShopifyPollProjection({ source, ctx: { lookup: exporter.bibleLookup(catalog.records), health: { states: [] }, snapshotId, drops: [] },
    lease: { projection: { drops: [], candidates: [] }, generation: 1 }, result, owner: 'offline-seed', now: state.now });
  assert.equal(initial.candidates.length, 1, 'Real generic fixture must produce a current candidate for final-send regression');
  state.jobs.set(source.id, { source_id: source.id, generation: 1, accepted_at: iso(), last_reason: 'accepted', projection: initial.projection });
  state.collectors = 0; state.requests = 0;
  return { state, env, source, scheduler, wrapper, initial, iso, timed,
    read: (kind = 'drops') => timed(() => scheduler.readPollProjection([], kind)),
    overlay: () => timed(() => wrapper.readRuntimeSourceDropOverlay(initial.drops, snapshotId)),
    valid: (rows = initial.candidates) => timed(() => scheduler.pollCandidatesValid(rows)),
    run: () => timed(() => scheduler.runSourceScheduler({ trigger: 'offline-test' })),
    safe: () => assert.deepEqual(state.forbidden, []) };
}

test('actual customer drops, candidates and final-send read one three-export bundle each without constructing Bible or collecting', async () => {
  const h = await harness();
  assert.equal((await h.read()).rows.length, 1);
  assert.equal((await h.read('candidates')).rows.length, 1);
  assert.equal(await h.valid(), true);
  assert.deepEqual(h.state.reads, [policyNames, policyNames, policyNames]);
  assert.equal(h.state.bibles, 0); assert.equal(h.state.collectors, 0); assert.equal(h.state.requests, 0);
  assert.deepEqual(h.state.writes, []); h.safe();
});

test('unregistered current and future Shopify versions cannot take the legacy final-send fast path', async () => {
  const h = await harness(); h.scheduler.POLL_SOURCES.splice(0); h.env.SOURCE_SCHEDULER_ENABLED = '0';
  for (const version of ['shopify-variant-pickup-v1', 'shopify-variant-pickup-v2-strict-premises', 'shopify-variant-pickup-future']) {
    assert.equal(await h.valid([{ id: 'unregistered', sourceCollectorVersion: version }]), false, version);
    assert.equal(await h.valid([{ id: 'unregistered', raw: { collectorVersion: version } }]), false, `${version} raw`);
  }
  assert.equal(await h.valid([{ id: 'unrelated-legacy' }]), true);
  assert.deepEqual(h.state.reads, []); assert.deepEqual(h.state.writes, []); h.safe();
});

test('actual collection keeps one four-export bundle, matching Bible, broad history and silent bootstrap', async () => {
  const h = await harness(), episode = h.initial.drops[0].availabilityEpisodeId;
  h.state.jobs.clear(); h.state.broadDrops = h.initial.drops; h.state.now += 60_000;
  const result = await h.run();
  assert.equal(result.results[0].status, 'accepted');
  assert.deepEqual(h.state.reads, [collectionNames]); assert.equal(h.state.bibles, 1);
  assert.equal(h.state.collectors, 1); assert.equal(h.state.requests, 2);
  const current = h.state.jobs.get(h.source.id)!.projection;
  assert.equal(current.drops[0].availabilityEpisodeId, episode, 'Broad fallback history preserves existing episode');
  assert.equal(current.candidates.length, 0, 'No prior source projection means bootstrap silence'); h.safe();
});

test('collection rejects a mismatched drops snapshot before Bible construction or collector access', async () => {
  const h = await harness(); h.state.tweak = (name, result) => name === 'drops' ? { ...result, snapshotId: 'other-snapshot' } : result;
  const result = await h.run();
  assert.notEqual(result.results[0].status, 'accepted');
  assert.deepEqual(h.state.reads, [collectionNames]); assert.equal(h.state.bibles, 0); assert.equal(h.state.collectors, 0); h.safe();
});

for (const [name, mutate] of [
  ['health quarantine', (h: Row) => { h.state.flags.health = { quarantine: true }; }],
  ['health bootstrap', (h: Row) => { h.state.flags.health = { bootstrap: true }; }],
  ['alerts quarantine', (h: Row) => { h.state.flags.alerts = { quarantine: true }; }],
  ['alerts bootstrap', (h: Row) => { h.state.flags.alerts = { bootstrap: true }; }],
  ['alerts manual refresh', (h: Row) => { h.state.flags.alerts = { manualRefresh: true }; }],
  ['mixed policy IDs', (h: Row) => { h.state.tweak = (key: string, row: Row) => key === 'alerts' ? { ...row, snapshotId: 'other' } : row; }],
  ['missing policy ID', (h: Row) => { h.state.snapshotId = ''; }],
  ['cache fallback', (h: Row) => { h.state.tweak = (_key: string, row: Row) => ({ ...row, source: 'cache-fallback', snapshotId: null }); }],
  ['shadow authority', (h: Row) => { h.state.tweak = (_key: string, row: Row) => ({ ...row, source: 'local-export' }); }],
  ['expired policy', (h: Row) => { h.state.tweak = (_key: string, row: Row) => ({ ...row, generatedAt: h.iso(h.state.now - 7 * 86400000 - 1) }); }],
  ['future policy', (h: Row) => { h.state.tweak = (_key: string, row: Row) => ({ ...row, generatedAt: h.iso(h.state.now + 1) }); }],
  ['invalid policy clock', (h: Row) => { h.state.tweak = (_key: string, row: Row) => ({ ...row, generatedAt: 'invalid' }); }],
  ['snapshot reader error', (h: Row) => { h.state.readError = true; }],
] as const) test(`actual wrapper fails closed after prior success: ${name}`, async () => {
  const h = await harness(); assert.equal((await h.overlay()).drops[0].canAlertAsInventory, true);
  mutate(h); const result = await h.overlay();
  assert.equal(result.drops[0].canAlertAsInventory, false); assert.equal(result.drops[0].stale, true);
  await assert.rejects(() => h.valid());
  assert.ok(h.state.reads.every(names => JSON.stringify(names) === JSON.stringify(policyNames)));
  assert.equal(h.state.bibles, 0); assert.equal(h.state.collectors, 0); assert.deepEqual(h.state.writes, []);
  const collection = await h.run();
  assert.notEqual(collection.results[0].status, 'accepted', 'The same existing gate must still block collection');
  assert.deepEqual(h.state.reads.at(-1), collectionNames);
  assert.equal(h.state.bibles, 0); assert.equal(h.state.collectors, 0); h.safe();
});

test('fresh heads, current canonical/state policy, clock expiry and recovery remain authoritative with unchanged snapshot', async () => {
  const h = await harness(), job = h.state.jobs.get(h.source.id)!;
  for (const failure of ['head', 'canonical', 'blocked', 'environment', 'expiry']) {
    job.last_reason = 'accepted'; h.state.catalogAllowed = true; h.state.flags.health = {}; h.env.BOURBON_SIGNAL_QUARANTINED_STATES = '';
    h.state.now = Date.parse(h.initial.drops[0].observedAt);
    if (failure === 'head') job.last_reason = 'source_access_denied';
    if (failure === 'canonical') h.state.catalogAllowed = false;
    if (failure === 'blocked') h.state.flags.health = { states: [{ state: h.source.state, health: 'blocked' }] };
    if (failure === 'environment') h.env.BOURBON_SIGNAL_QUARANTINED_STATES = h.source.state;
    if (failure === 'expiry') h.state.now += 3600001;
    assert.equal((await h.overlay()).drops[0].canAlertAsInventory, false, failure);
    assert.equal(await h.valid(), false, failure);
  }
  job.last_reason = 'accepted'; h.state.catalogAllowed = true; h.state.flags.health = {}; h.env.BOURBON_SIGNAL_QUARANTINED_STATES = '';
  h.state.now = Date.parse(h.initial.drops[0].observedAt);
  assert.equal(await h.valid(), true);
  assert.equal(await h.valid([{ ...h.initial.candidates[0], price: 0.01 }]), false, 'Final field equality must remain exact');
  h.env.SOURCE_SCHEDULER_ENABLED = '0'; assert.equal(await h.valid(), false);
  assert.equal((await h.overlay()).drops[0].canAlertAsInventory, false);
  assert.equal(h.state.bibles, 0); assert.equal(h.state.collectors, 0); h.safe();
});

test('released Jensen and Mission Trails consumer rows retain current policy and narrow global-off Jensen veto', async () => {
  const h = await harness(); h.state.jobs.clear();
  const registry = h.scheduler.POLL_SOURCES;
  const jensen = { id: 'fl:jensens-miami', state: 'FL', kind: 'jensens', chain: JENSENS_RUNTIME_SOURCE.chain, expiryHours: 1, failClosedOnError: true,
    storeIds: [JENSENS_RUNTIME_SOURCE.store.id], productIds: JENSENS_RUNTIME_SOURCE.products.map(row => row.productId), variantIds: JENSENS_RUNTIME_SOURCE.products.map(row => row.variantId) };
  const ca = { id: 'ca:mission-trails-wine-spirits', state: 'CA', kind: 'ca', chain: 'mission-trails-wine-spirits', expiryHours: 1 };
  registry.splice(0, registry.length, jensen, ca);
  const seed = JENSENS_RUNTIME_SOURCE.products[0], record = catalog.records.find((row: Row) => row.tier === 'allocated');
  const rows = [jensen, ca].map((source: Row) => ({ id: source.id, state: source.state, sourceChain: source.chain,
    storeId: source === jensen ? jensen.storeIds[0] : 'mission-trails-fixture', productId: seed.productId, variantId: seed.variantId,
    canonicalId: record.id, observedAt: h.iso(), lastConfirmedAt: h.iso(), canAlertAsInventory: true, sourcePollId: source.id }));
  rows.forEach(row => h.state.jobs.set(row.id, { source_id: row.id, generation: 1, last_reason: 'accepted', projection: { drops: [row], candidates: [] } }));
  assert.equal((await h.read()).rows.filter((row: Row) => row.canAlertAsInventory).length, 2);
  h.env.SOURCE_SCHEDULER_ENABLED = '0'; h.env.JENSENS_SOURCE_POLL_ENABLED = '0';
  const result = await h.timed(() => h.scheduler.readPollProjection(rows, 'drops'));
  assert.equal(result.rows.find((row: Row) => row.id === jensen.id).canAlertAsInventory, false);
  assert.equal(result.rows.find((row: Row) => row.id === ca.id).canAlertAsInventory, true);
  assert.deepEqual(h.state.reads, [policyNames]); assert.equal(h.state.bibles, 0); h.safe();
});
