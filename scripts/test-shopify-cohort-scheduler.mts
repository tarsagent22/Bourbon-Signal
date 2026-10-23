import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as crypto from 'node:crypto';
import { transform } from 'esbuild';
import { buildShopifyCohortDescriptors } from '../engine/src/collectors/shopify-cohort-runtime.mjs';
import { describeShopifyVariantSource, collectShopifyVariantPickup } from '../engine/src/collectors/shopify-variant-pickup.mjs';
import * as acceptanceModule from '../src/lib/source-acceptance-health.ts';
import * as siteModule from '../src/lib/site-engine-contract.ts';
import * as evidenceModule from '../src/lib/public-drop-evidence.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as coverageModule from '../src/lib/coverage-model.ts';
import * as lifecycleModule from '../src/config/stateLifecycle.ts';
import * as coverageKnownModule from '../src/lib/coverage-known-stores.ts';
import * as retailerFeedModule from '../src/lib/retailer-signal-feed.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';

type Row = Record<string, any>;
const acceptance = (acceptanceModule as any).default || acceptanceModule;
const site = (siteModule as any).default || siteModule;
const evidence = (evidenceModule as any).default || evidenceModule;
const classification = (classificationModule as any).default || classificationModule;
const coverage = (coverageModule as any).default || coverageModule;
const lifecycle = (lifecycleModule as any).default || lifecycleModule;
const coverageKnown = (coverageKnownModule as any).default || coverageKnownModule;
const retailerFeed = (retailerFeedModule as any).default || retailerFeedModule;
const receipt = (receiptModule as any).default || receiptModule;
const classificationData = JSON.parse(await readFile(new URL('../src/data/drop-feed-classification.generated.json', import.meta.url), 'utf8'));
const fixtureRoot = new URL('../engine/test/fixtures/shopify-variant-pickup/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('current-bourbon-bible.json', fixtureRoot), 'utf8'));
const readiness = JSON.parse(await readFile(new URL('readiness.json', fixtureRoot), 'utf8'));
const configs = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8')).sources;
const manifest = JSON.parse(await readFile(new URL('manifest.json', fixtureRoot), 'utf8'));
const bodies = new Map<string, string>(await Promise.all(manifest.captures.map(async (capture: Row) => [capture.requestedUrl, await readFile(new URL(capture.file, fixtureRoot), 'utf8')])));
const snapshotId = 'offline-scheduler-policy-fixture';

// These are explicitly synthetic contract approvals, never production admission.
function descriptor(config: Row) {
  const plan = describeShopifyVariantSource(config, { collectorSha256: readiness.collectorSha256 });
  const canonical = readiness.results.find((row: Row) => row.sourceId === config.id).canonical;
  const admission = { schemaVersion: 1, sourceId: config.runtimeId, configSha256: plan.configSha256,
    collectorSha256: readiness.collectorSha256, catalogSha256: readiness.catalogSha256,
    reviewer: 'offline scheduler fixture only', reviewedAt: '2026-10-23T03:00:00Z', productionCommit: 'a'.repeat(40), policySnapshotId: snapshotId,
    reviewArtifactSha256: '1'.repeat(64), canonicalReviewSha256: '2'.repeat(64), premisesBaselineSha256: '3'.repeat(64), livePreflightSha256: '4'.repeat(64),
    baselineResult: 'net_new_confirmed', bindings: config.stores.flatMap((store: Row) => config.products.map((product: Row) => ({ storeId: store.id,
      productId: product.productId, variantId: product.variantId, canonicalBottleId: canonical.id, tier: canonical.tier }))) };
  return { ...buildShopifyCohortDescriptors([config], { admissions: [admission], collectorSha256: readiness.collectorSha256, catalogSha256: readiness.catalogSha256 })[0], disabled: false };
}

async function harness(config = configs.find((row: Row) => row.id === 'christies-la-crescenta')) {
  const source = descriptor(config);
  const state = { now: Date.now(), mode: 'positive', policySnapshotId: snapshotId, disabled: false, blocked: false, catalogAllowed: true, fenceNext: false, collectorCalls: 0, requests: 0,
    forbidden: [] as string[], acquisitions: 0, finishes: [] as Row[], jobs: new Map<string, Row>(), runs: [] as Row[], heartbeatAt: null as string | null,
    lastResult: null as Row | null, tamper: null as null | ((result: Row) => Row) };
  const env: Row = { SOURCE_SCHEDULER_ENABLED: '1', SOURCE_LANE_POLL_ENABLED: '0' };
  const iso = () => new Date(state.now).toISOString();
  const forbidden = (name: string) => () => { state.forbidden.push(name); throw new Error(`Forbidden infrastructure/collector: ${name}`); };
  const executor = { query: async (sql: string, parameters: any[] = []) => {
    if (sql.includes('source_poll_acquire')) {
      state.acquisitions++;
      const [id, owner, cadence] = parameters;
      const prior = state.jobs.get(id) || { source_id: id, cadence_seconds: cadence, generation: 0, failures: 0, next_due_at: iso(), projection: null, accepted_at: null };
      if (Date.parse(prior.next_due_at) > state.now || Date.parse(prior.paused_until || '') > state.now) return { rows: [] };
      const job = { ...prior, generation: Number(prior.generation) + 1, lease_owner: owner, last_started_at: iso() };
      state.jobs.set(id, job); state.runs.unshift({ source_id: id, run_id: owner, generation: job.generation, due_at: prior.next_due_at, started_at: iso(), status: 'running' });
      return { rows: [structuredClone(job)] };
    }
    if (sql.includes('source_poll_finish')) {
      const [id, owner, generation] = parameters, failed = sql.includes('NULL,$4');
      const projection = failed ? null : JSON.parse(parameters[3]);
      const reason = parameters[failed ? 3 : 4], backoff = parameters[failed ? 4 : 5], pause = parameters[failed ? 5 : 6];
      const accounting = JSON.parse(parameters.at(-1));
      state.finishes.push({ id, owner, generation, projection, reason, accounting });
      const previous = state.jobs.get(id)!;
      if (state.fenceNext || previous.lease_owner !== owner || previous.generation !== generation) { state.fenceNext = false; return { rows: [{ committed: false }] }; }
      state.jobs.set(id, { ...previous, lease_owner: null, projection: projection || previous.projection, failures: projection ? 0 : previous.failures + 1,
        accepted_at: projection ? iso() : previous.accepted_at, last_reason: reason, last_completed_at: iso(),
        next_due_at: new Date(state.now + (projection ? previous.cadence_seconds : backoff) * 1000).toISOString(),
        paused_until: pause ? new Date(state.now + pause * 1000).toISOString() : null });
      Object.assign(state.runs.find(row => row.run_id === owner)!, { status: reason, finished_at: iso(), accounting });
      return { rows: [{ committed: true }] };
    }
    if (sql.includes('INSERT INTO source_scheduler_heartbeat')) { state.heartbeatAt = iso(); return { rows: [] }; }
    if (sql.includes('SELECT * FROM source_poll_jobs')) return { rows: [...state.jobs.values()].map(row => structuredClone(row)) };
    if (sql.includes('FROM source_scheduler_heartbeat')) return { rows: [{ name: 'scheduler', checked_at: state.heartbeatAt || iso() }] };
    if (sql.includes('FROM source_poll_runs')) return { rows: state.runs.map(row => structuredClone(row)) };
    if (sql.includes('FROM source_poll_incidents') || sql.includes('FROM source_poll_trace')) return { rows: [] };
    if (sql.includes('INSERT INTO source_poll_trace')) return { rows: [] };
    return forbidden(`unexpected SQL ${sql.slice(0, 90)}`)();
  } };
  const schedulerSource = await readFile(new URL('../src/lib/source-scheduler.ts', import.meta.url), 'utf8');
  const modules = new Map<string, any>();
  for (const match of schedulerSource.matchAll(/from\s+['"]([^'"]+\.mjs)['"]/g)) {
    if (match[1].includes('/collectors/') || match[1].includes('/core/fetcher')) continue;
    modules.set(match[1], await import(new URL(match[1], new URL('../src/lib/source-scheduler.ts', import.meta.url)).href));
  }
  const pickupPolicy = modules.get('../../engine/src/sources/shopify-pickup-policy.mjs');
  if (!pickupPolicy) throw new Error('Scheduler generic policy integration is required for this regression');
  const collect = async (bible: any, input: Row, options: Row) => {
    state.collectorCalls++;
    const result = await collectShopifyVariantPickup(bible, input, { ...options, observedAt: iso(), fetchText: async (url: string) => {
      state.requests++;
      if (state.mode === 'denied') return { ok: false, status: 403, url, text: 'Access denied', retryAfterSeconds: 172800 };
      if (state.mode === 'failure') throw new Error('fixture transport failed');
      let body = bodies.get(url); assert.ok(body, `Unexpected fixture URL ${url}`);
      if (state.mode === 'negative' && !url.endsWith('.json')) body = body.replaceAll('Pickup available', 'Pickup unavailable');
      return { ok: true, status: 200, url, text: body };
    } });
    state.lastResult = state.tamper ? state.tamper(result) : result;
    return state.lastResult;
  };
  const readExports = async (names: string[]) => names.map(name => ({ snapshotId: state.policySnapshotId, source: 'remote-snapshot', generatedAt: iso(),
    payload: name === 'bottles' ? { bottles: catalog.records.filter((row: Row) => state.catalogAllowed || row.id !== source.admission.bindings[0].canonicalBottleId).map((row: Row) => ({ ...row, canonical_id: row.id, canonical_name: row.canonical, name: row.canonical })) }
      : name === 'drops' ? { drops: [] } : name === 'state-health' ? { states: [{ state: source.state, health: state.blocked ? 'blocked' : 'healthy' }] }
      : name === 'stores' ? { stores: [] } : name === 'locations' ? { locations: [] }
      : name === 'stats' ? { generatedAt: iso(), refreshHealth: { degradedStates: [] } } : { alerts: [] },
  }));
  const dependencies = (name: string): any => {
    if (name === 'node:crypto') return crypto;
    if (name === './source-acceptance-health') return acceptance;
    if (name === './alert-queue/runtime') return { createProductionAlertQueueSqlExecutor: () => executor };
    if (name === './site-engine-contract') return { readSiteExportResults: readExports };
    if (name === './drop-classification') return classification;
    if (name.includes('classification.generated.json')) return classificationData;
    if (name.endsWith('/shopify-pickup-policy.mjs')) return { ...pickupPolicy, SHOPIFY_PICKUP_SOURCES: [source] };
    if (name.endsWith('/shopify-variant-pickup.mjs')) return { collectShopifyVariantPickup: collect };
    if (name.endsWith('/florida-jensens-runtime-source.mjs')) return { JENSENS_RUNTIME_SOURCE: { store: { id: 'legacy-unrequested' }, products: [] }, collectJensensSource: forbidden('legacy Jensen collector') };
    if (name.endsWith('/california-san-diego-surfaces.mjs')) return { CALIFORNIA_SAN_DIEGO_SHOPIFY_SOURCES: [] };
    if (name.endsWith('/california-runtime-source.mjs')) return { collectCaliforniaSource: forbidden('legacy CA collector') };
    if (name.endsWith('/north-carolina-intelligence.mjs')) return { collectNorthCarolinaShipments: forbidden('NC collector') };
    if (name.endsWith('/florida-15-20-expansion.mjs')) return { collectFloridaAbcExpansion: forbidden('FL ABC collector') };
    if (name.endsWith('/safe-bottle-match.mjs')) return { cityHiveSafeBottleMatch: forbidden('unrequested matcher branch') };
    if (name.endsWith('/core/fetcher.mjs')) return { fetchWithMeta: forbidden('live transport') };
    if (name === './ohlq-worker-artifact-store') return { readLatestOhlqWorkerEnvelope: forbidden('OH artifact fallback') };
    if (modules.has(name)) return modules.get(name);
    return new Proxy({}, { get: (_target, key) => forbidden(`unexpected dependency ${name}:${String(key)}`) });
  };
  class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? state.now : value); } static now() { return state.now; } }
  const output = await transform(schedulerSource, { loader: 'ts', format: 'cjs', target: 'node22' });
  const module = { exports: {} as Row };
  new Function('require', 'module', 'exports', 'process', 'Date', output.code)(dependencies, module, module.exports, { env }, Clock);
  const scheduler = module.exports;
  scheduler.POLL_SOURCES.splice(0, scheduler.POLL_SOURCES.length, source);
  const coverageSource = await readFile(new URL('../src/lib/coverage-server.ts', import.meta.url), 'utf8');
  const coverageOutput = await transform(coverageSource, { loader: 'ts', format: 'cjs', target: 'node22' });
  const coverageServer = { exports: {} as Row };
  new Function('require', 'module', 'exports', 'process', 'Date', coverageOutput.code)((name: string) => {
    if (name === 'server-only') return {};
    if (name.includes('stateLifecycle')) return lifecycle;
    if (name.includes('mississippi-known-stores')) return { stores: [] };
    if (name.includes('coverage-model')) return coverage;
    if (name.includes('coverage-known-stores')) return coverageKnown;
    if (name.includes('retailer-signal-feed')) return retailerFeed;
    if (name.includes('retailer-public-submissions')) return { readCachedPublicRetailerSubmissions: async () => [] };
    if (name.includes('site-engine-contract')) return { ...site, readSiteExportResults: readExports };
    if (name.includes('public-drop-evidence')) return evidence;
    if (name.includes('nationwide-pilot-receipt')) return receipt;
    if (name.includes('source-lane-runtime')) return { readRuntimeSourceDropOverlay: async (rows: Row[]) => { const result = await scheduler.readPollProjection(rows, 'drops'); return { drops: result.rows, version: result.version }; } };
    if (name.includes('drop-classification')) return classification;
    if (name.includes('classification.generated.json')) return classificationData;
    return new Proxy({}, { get: (_target, key) => forbidden(`unexpected Coverage dependency ${name}:${String(key)}`) });
  }, coverageServer, coverageServer.exports, { env }, Clock);
  const timed = async (call: () => any) => { const previous = Date.now; Date.now = () => state.now; try { return await call(); } finally { Date.now = previous; } };
  const run = async () => timed(() => scheduler.runSourceScheduler({ trigger: 'scheduled' }));
  return { state, source, env, scheduler, run, health: () => timed(() => scheduler.sourceSchedulerHealth(false)),
    validateCandidates: (rows: Row[]) => timed(() => scheduler.pollCandidatesValid(rows)),
    customerCoverage: () => timed(() => coverageServer.exports.readCurrentCoverageContract()),
    buildProjection: modules.get('../../engine/src/sources/shopify-poll-projection.mjs').buildShopifyPollProjection,
    validatePolicy: (...args: any[]) => timed(() => modules.get('../../engine/src/sources/poll-policy.mjs').validatePollPolicy(...args)),
    lookup: () => modules.get('../../engine/src/export-site-contract.mjs').bibleLookup(structuredClone(catalog.records)),
    next: () => { state.now += source.cadence * 1000 + 1; }, job: () => state.jobs.get(source.id)!,
    projection: () => state.jobs.get(source.id)?.projection,
    inventoryCandidates: () => (state.jobs.get(source.id)?.projection?.candidates || []).filter((row: Row) => row.actionabilityClass === 'store_inventory'),
    safe: () => assert.deepEqual(state.forbidden, [], 'No live collection, artifact fallback, provider or unrecognized SQL access') };
}

test('actual scheduler bootstrap and positive confirmation retain one episode and no new delivery candidate', async () => {
  const h = await harness(); await h.run(); const first = structuredClone(h.projection());
  assert.equal(h.job().last_reason, 'accepted'); assert.equal(first.drops.length, 1); assert.equal(first.candidates.length, 0);
  h.next(); await h.run(); const next = h.projection();
  assert.equal(next.drops[0].availabilityEpisodeId, first.drops[0].availabilityEpisodeId);
  assert.equal(next.drops[0].firstSeenAt, first.drops[0].firstSeenAt); assert.notEqual(next.drops[0].lastConfirmedAt, first.drops[0].lastConfirmedAt);
  assert.equal(next.candidates.length, 0); assert.equal(h.state.collectorCalls, 2); assert.equal(h.state.requests, 4); h.safe();
});
test('actual scheduler persists an explicit negative across empty projection and emits one later restock identity', async () => {
  const h = await harness(); await h.run(); const original = h.projection().drops[0].availabilityEpisodeId;
  h.next(); h.state.mode = 'negative'; await h.run();
  assert.equal(h.job().last_reason, 'accepted'); assert.deepEqual(h.projection().drops, []); assert.deepEqual(h.projection().candidates, []);
  assert.equal(h.projection().observations.length, 1); assert.equal(h.projection().observations[0].availabilityStatus, 'out_of_stock');
  assert.equal(h.projection().episodeSeeds.length, 1);
  h.next(); h.state.mode = 'positive'; await h.run();
  assert.equal(h.projection().drops[0].availabilityEpisodeKind, 'restock'); assert.notEqual(h.projection().drops[0].availabilityEpisodeId, original);
  assert.equal(h.inventoryCandidates().length, 1); const candidate = structuredClone(h.inventoryCandidates()[0]);
  h.next(); await h.run(); assert.equal(h.inventoryCandidates().length, 1); assert.equal(h.inventoryCandidates()[0].dedupeKey, candidate.dedupeKey); h.safe();
});
test('failed collection preserves positive episode history and recovery does not fabricate a restock', async () => {
  const h = await harness(); await h.run(); const before = structuredClone(h.projection());
  h.next(); h.state.mode = 'failure'; await h.run();
  assert.notEqual(h.job().last_reason, 'accepted'); assert.deepEqual(h.projection(), before); assert.equal(h.state.collectorCalls, 2);
  h.next(); h.state.mode = 'positive'; await h.run();
  assert.equal(h.projection().drops[0].availabilityEpisodeId, before.drops[0].availabilityEpisodeId); assert.equal(h.inventoryCandidates().length, 0); h.safe();
});
test('disabled sources own old rows, do not acquire/collect and do not degrade source scheduling health', async () => {
  const h = await harness(); await h.run(); const row = structuredClone(h.projection().drops[0]);
  h.source.disabled = true; h.next(); const before = h.state.collectorCalls; const result = await h.run();
  assert.equal(result.results[0].status, 'disabled'); assert.equal(h.state.collectorCalls, before); assert.equal(h.state.acquisitions, 1);
  const health = await h.health(); assert.equal(health.schedulingHealthy, true); assert.equal(health.sourceHealth[0].status, 'disabled');
  h.env.SOURCE_SCHEDULER_ENABLED = '0'; const overlay = await h.scheduler.readPollProjection([row], 'drops'); assert.equal(overlay.rows[0].stale, true); h.safe();
});
test('unknown source kind is rejected without falling through to the Ohio probe', async () => {
  const h = await harness(); h.source.kind = 'unknown-fixture-kind'; const result = await h.run();
  assert.notEqual(result.results[0].status, 'accepted'); assert.equal(h.state.collectorCalls, 0); assert.equal(h.projection(), null); h.safe();
});
test('stale lease finish is fenced and never replaces the previously committed projection', async () => {
  const h = await harness(); await h.run(); const previous = structuredClone(h.projection());
  h.next(); h.state.mode = 'negative'; h.state.fenceNext = true; const result = await h.run();
  assert.equal(result.results[0].status, 'fenced'); assert.deepEqual(h.projection(), previous); h.safe();
});
test('denial performs one request and preserves full Retry-After and source pause budgets', async () => {
  const h = await harness(); h.state.mode = 'denied'; const result = await h.run();
  assert.equal(result.results[0].status, 'source_access_denied'); assert.equal(h.state.collectorCalls, 1); assert.equal(h.state.requests, 1);
  assert.ok(Date.parse(h.job().next_due_at) - h.state.now >= 172800000);
  assert.ok(Date.parse(h.job().paused_until) - h.state.now >= 86400000); assert.equal(h.projection(), null); h.safe();
});
for (const clock of ['older', 'equal', 'future']) test(`a later generation rejects an ${clock} explicit observation clock`, async () => {
  const h = await harness(); await h.run(); const previous = structuredClone(h.projection());
  h.next(); const invalid = new Date(clock === 'future' ? h.state.now + 1000 : Date.parse(previous.observations[0].observedAt) - (clock === 'older' ? 1000 : 0)).toISOString();
  h.state.mode = 'negative'; h.state.tamper = result => ({ ...result, observations: result.observations.map((row: Row) => ({ ...row, observedAt: invalid })) });
  await h.run(); assert.notEqual(h.job().last_reason, 'accepted'); assert.deepEqual(h.projection(), previous); h.safe();
});
test('negative-only projection must still match the current canonical name and identity', async () => {
  const h = await harness(); await h.run(); const previous = structuredClone(h.projection()); h.next(); h.state.mode = 'negative'; await h.run();
  const id = h.source.admission.bindings[0].canonicalBottleId;
  for (const mutation of ['missing', 'name', 'id', 'tier']) {
    const lookup = h.lookup(), record = lookup.byId instanceof Map ? lookup.byId.get(id) : lookup.byId[id];
    if (mutation === 'missing') { if (lookup.byId instanceof Map) lookup.byId.delete(id); else delete lookup.byId[id]; }
    if (mutation === 'name') record.canonical = 'Unrelated canonical identity';
    if (mutation === 'id') record.id = 'unrelated-bottle';
    if (mutation === 'tier') record.tier = 'regular';
    assert.throws(() => h.buildProjection({ source: h.source, ctx: { lookup, drops: [], snapshotId, health: { states: [] } },
      lease: { projection: previous, generation: 3 }, result: h.state.lastResult, owner: 'offline-negative-proof', now: h.state.now }), /canonical|identity|policy/i);
  }
  h.safe();
});
test('current final candidate policy rejects source disable, state block and canonical loss', async () => {
  const h = await harness(); await h.run(); h.next(); h.state.mode = 'negative'; await h.run(); h.next(); h.state.mode = 'positive'; await h.run();
  const candidate = structuredClone(h.inventoryCandidates()[0]); assert.ok(candidate); assert.equal(await h.validateCandidates([candidate]), true);
  h.state.blocked = true; assert.equal(await h.validateCandidates([candidate]), false); h.state.blocked = false;
  h.state.catalogAllowed = false; assert.equal(await h.validateCandidates([candidate]), false); h.state.catalogAllowed = true;
  h.source.disabled = true; assert.equal(await h.validateCandidates([candidate]), false); h.safe();
});
test('policy snapshot advance revokes old stamps until a fresh accepted generation without a fake new episode', async () => {
  const h = await harness(configs.find((config: Row) => config.state === 'NY')); await h.run(); h.next(); h.state.mode = 'negative'; await h.run(); h.next(); h.state.mode = 'positive'; await h.run();
  const candidate = structuredClone(h.inventoryCandidates()[0]), episode = h.projection().drops[0].availabilityEpisodeId;
  assert.equal(h.source.admission.bindings[0].tier, 'unicorn', 'Synthetic admission retains reviewed canonical Bible tier');
  assert.equal(h.state.lastResult!.signals[0].tier, 'unicorn', 'Raw collector retains canonical identity tier');
  assert.equal(h.projection().drops[0].tier, 'allocated', 'Public row uses current NY customer market tier');
  assert.equal(candidate.tier, 'allocated', 'Final candidate agrees with current customer market tier');
  assert.equal(await h.validateCandidates([candidate]), true);
  h.state.policySnapshotId = `${snapshotId}-next`; assert.equal(await h.validateCandidates([candidate]), false);
  const withdrawn = await h.customerCoverage(); assert.equal(withdrawn.states.find((row: Row) => row.code === 'NY').freshness.currentInventoryStores, 0);
  h.next(); await h.run(); const current = h.inventoryCandidates()[0];
  assert.equal(h.projection().drops[0].availabilityEpisodeId, episode); assert.equal(current.sourcePolicySnapshotId, h.state.policySnapshotId);
  assert.equal(await h.validateCandidates([current]), true);
  h.projection().candidates[0].sourcePolicySnapshotId = 'untrusted-stamp'; assert.equal(await h.validateCandidates([current]), false); h.safe();
});
test('disabled generic source with no projection owns matching broad rows even when scheduler is off', async () => {
  const h = await harness(); h.source.disabled = true; h.env.SOURCE_SCHEDULER_ENABLED = '0';
  const row = { id: 'old-broad-owned', ...h.source.partitionBindings[0], state: h.source.state, sourceChain: h.source.chain, canAlertAsInventory: true };
  const sibling = { ...row, id: 'sibling', variantId: 'not-owned' };
  const overlay = await h.scheduler.readPollProjection([row, sibling], 'drops'); assert.equal(overlay.rows[0].stale, true); assert.equal(overlay.rows[1].stale, undefined);
  assert.equal(h.state.acquisitions, 0); assert.equal(h.state.collectorCalls, 0); assert.equal(h.projection(), undefined); h.safe();
});

test('global scheduler off vetoes enabled generic broad rows without projection or collection', async () => {
  const h = await harness(); assert.equal(h.source.disabled, false); h.env.SOURCE_SCHEDULER_ENABLED = '0';
  const row = { id: 'enabled-owned-before-global-stop', ...h.source.partitionBindings[0], state: h.source.state,
    sourceChain: h.source.chain, canAlertAsInventory: true };
  const sibling = { ...row, id: 'unrelated-variant', variantId: 'not-owned' };
  const overlay = await h.scheduler.readPollProjection([row, sibling], 'drops');
  assert.equal(overlay.rows[0].stale, true); assert.equal(overlay.rows[0].canAlertAsInventory, false);
  assert.equal(overlay.rows[1].stale, undefined);
  const candidates = await h.scheduler.readPollProjection([row, sibling], 'candidates');
  assert.deepEqual(candidates.rows, [sibling]); assert.equal(await h.validateCandidates([row]), false);
  assert.equal(h.state.acquisitions, 0); assert.equal(h.state.collectorCalls, 0); assert.equal(h.projection(), undefined); h.safe();
});
test('partial observation schema cannot become an accepted empty success', async () => {
  const h = await harness(); h.state.tamper = result => ({ ...result, observations: [] }); await h.run();
  assert.notEqual(h.job().last_reason, 'accepted'); assert.equal(h.projection(), null); h.safe();
});

for (const state of ['NY', 'TX']) test(`actual scheduler uses admitted ${state} shared policy rather than fixture-only eligibility`, async () => {
  const h = await harness(configs.find((config: Row) => config.state === state)); await h.run();
  assert.equal(h.job().last_reason, 'accepted'); assert.equal(h.projection().drops.length, 1); assert.equal(h.projection().candidates.length, 0); h.safe();
});

for (const config of configs) test(`normal customer normalization, classification and Coverage agree for ${config.id}`, async () => {
  const h = await harness(config); await h.run();
  const expected = ['remedy-glendale', 'main-street-el-cajon'].includes(config.id) ? 0 : 1;
  if (!expected) {
    assert.match(h.job().last_reason, /identity|schema|policy/);
    assert.equal(h.projection(), null, 'Current common-tier CA bottle must never be accepted before customer filtering');
    assert.equal(h.inventoryCandidates().length, 0);
  } else assert.equal(h.job().last_reason, 'accepted');
  const index = classification.getDropClassificationIndex(classificationData.records);
  const rows = (h.projection()?.drops || []).map((row: Row) => classification.classifyPublicDrop(site.normalizeDropForSite(row), index));
  const eligible = rows.filter((row: Row) => evidence.isPublicDropFeedEligible(row) && evidence.isFreshPublicDrop(row, h.state.now));
  assert.equal(eligible.length, expected, `normal customer Feed classification changed for ${config.id}`);
  const contract = await h.customerCoverage();
  const state = contract.states.find((entry: Row) => entry.code === config.state);
  assert.equal(state.capabilities.currentBottleAvailability, expected === 1, `Coverage disagrees with normal Feed for ${config.id}`);
  assert.equal(state.freshness.currentInventoryStores, expected); h.safe();
});

test('state-specific canonical policy loss vetoes persisted candidates and negative-only history despite allowed global catalog', async () => {
  const h = await harness(); await h.run(); const original = structuredClone(h.projection());
  h.next(); h.state.mode = 'negative'; await h.run();
  const negative = structuredClone(h.state.lastResult);
  h.next(); h.state.mode = 'positive'; await h.run(); assert.equal(h.inventoryCandidates().length, 1);
  const id = h.source.admission.bindings[0].canonicalBottleId;
  const baseline = await h.validatePolicy([...h.state.jobs.values()], [h.source], h.lookup(), { states: [] }, '', snapshotId);
  assert.equal(baseline[0].projection.candidates.length, 1, 'Current unchanged authority permits the real persisted restock candidate');
  for (const mutation of ['missing', 'common', 'name']) {
    const lookup = h.lookup(), regional = h.lookup();
    const record = regional.byId.get(id); assert.ok(record);
    if (mutation === 'missing') regional.byId.delete(id);
    if (mutation === 'common') record.tier = 'common';
    if (mutation === 'name') record.canonical = 'Unrelated current regional identity';
    assert.ok(['limited', 'allocated', 'unicorn'].includes(lookup.byId.get(id).tier), 'Global lookup remains eligible');
    lookup.byState = { [h.source.state]: regional };
    const policy = await h.validatePolicy([...h.state.jobs.values()], [h.source], lookup, { states: [] }, '', snapshotId);
    assert.equal(policy[0].projection.candidates.length, 0, `Regional ${mutation} must veto final candidate policy`);
    assert.equal(policy[0].projection.drops[0].stale, true, `Regional ${mutation} must withdraw owned positives`);
    assert.throws(() => h.buildProjection({ source: h.source, ctx: { lookup, drops: [], snapshotId, health: { states: [] } },
      lease: { projection: original, generation: 2 }, result: negative, owner: 'offline-regional-negative', now: h.state.now }), /canonical|identity|policy/i);
  }
  h.safe();
});
