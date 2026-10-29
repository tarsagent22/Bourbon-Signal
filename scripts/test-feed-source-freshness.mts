import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import * as policy from '../engine/src/sources/poll-policy.mjs';
import * as packModule from '../src/lib/public-feed-pack.ts';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
const pack = ((packModule as any).default || packModule) as typeof import('../src/lib/public-feed-pack.ts');
const receipt = ((receiptModule as any).default || receiptModule) as typeof import('../src/lib/nationwide-pilot-receipt.ts');
type Row = Record<string, any>;
const key = 'fixture-only-source-freshness-key-1234567890';
const sourceId = 'fl:jensens-miami';
const definition = { id: sourceId, state: 'FL', kind: 'jensens', chain: 'jensens-liquors', expiryHours: 1, failClosedOnError: true,
  storeIds: ['jensens-liquors:1646-sw-27th'], productIds: ['15414448390218'], variantIds: ['67703590977610'] };

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}
async function harness() {
  const started = Date.now();
  const state = { now: started, generation: 1, observedAt: started, accepted: true, readerError: false, catalogAllowed: true, policyBlocked: false,
    disabled: false, member: true, laneRow: null as Row | null, env: { ENGINE_SNAPSHOT_ENCRYPTION_KEY: key, SOURCE_SCHEDULER_ENABLED: '1',
      SOURCE_LANE_STORAGE_ENABLED: '0', SOURCE_LANE_POLL_ENABLED: '0', JENSENS_SOURCE_POLL_ENABLED: '1' } as Row };
  const counts = { snapshots: 0, policyReads: 0, laneReads: 0, infrastructure: 0, cacheBuilds: 0, cacheHits: 0,
    normalized: new Map<string, number>(), classified: new Map<string, number>() };
  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) || 0) + 1);
  const forbidden = (name: string) => () => { counts.infrastructure++; throw new Error(`Forbidden collector/write/infrastructure access: ${name}`); };
  const unavailable = new Proxy({}, { get(_target, name) { return forbidden(String(name)); } });
  const at = () => new Date(state.observedAt).toISOString();
  const owned = (overrides: Row = {}): Row => ({ id: 'live-jensens', state: 'FL', state_code: 'FL', sourceChain: definition.chain,
    storeId: definition.storeIds[0], storeAddress: '1646 SW 27th Ave, Miami, FL 33145', storeName: "Jensen's Liquors", city: 'Miami',
    canonicalBottleId: 'elijah-craig-18', canonicalId: 'elijah-craig-18', bottleName: 'Elijah Craig 18 Year', productId: definition.productIds[0], variantId: definition.variantIds[0],
    type: 'retailer_store_inventory_result', locationPrecision: 'store_level', canAlertAsInventory: true, canAlertAsWatch: true, availabilityStatus: 'in_stock', tier: 'unicorn',
    observedAt: at(), lastConfirmedAt: at(), sourcePollId: sourceId, sourcePollRun: `run-${state.generation}`, sourcePollGeneration: state.generation,
    availabilityEpisodeId: 'live-episode', price: 249.99 + state.generation, ...overrides });
  const base = freeze([
    owned({ id: 'snapshot-jensens', sourcePollId: undefined, sourcePollRun: undefined, sourcePollGeneration: undefined, availabilityEpisodeId: 'snapshot-episode' }),
    owned({ id: 'unrelated-fl-snapshot', sourceChain: 'another-fl-retailer', storeId: 'another-fl-store', sourcePollId: undefined }),
    owned({ id: 'unrelated-va-snapshot', state: 'VA', state_code: 'VA', sourceChain: 'va-abc', storeId: 'va-store', sourcePollId: undefined, canonicalBottleId: 'va-bottle' }),
  ]);
  const baseBefore = JSON.stringify(base);
  let current = owned();
  const registry = () => [{ ...definition, disabled: state.disabled || state.env.JENSENS_SOURCE_POLL_ENABLED === '0' }];
  const policyRead = async (rows: Row[], kind: 'drops' | 'candidates') => {
    counts.policyReads++;
    if (state.readerError) throw new Error('Fixture source reader unavailable');
    if (state.env.SOURCE_SCHEDULER_ENABLED !== '1') return { rows: policy.suppressDisabledPollSources(rows, registry(), kind), version: 'off' };
    const jobs = [{ source_id: sourceId, last_reason: state.accepted ? 'accepted' : 'source_identity_or_schema_failure',
      projection: { drops: [current], candidates: [] } }];
    const lookup = { byId: new Map(state.catalogAllowed ? [['elijah-craig-18', { tier: 'unicorn' }]] : []) };
    const permitted = policy.validatePollPolicy(jobs, registry(), lookup, { states: [{ state: 'FL', health: state.policyBlocked ? 'blocked' : 'healthy' }] });
    return { rows: policy.mergePollProjection(rows, permitted, registry(), kind, state.now), version: `generation-${state.generation}` };
  };
  const memo = () => { const entries = new Map<string, any>(); return { get(id: string, build: () => any) {
    if (entries.has(id)) { counts.cacheHits++; return entries.get(id); }
    counts.cacheBuilds++; const value = freeze(build()); entries.set(id, value); return value;
  } }; };
  const asyncMemo = () => { const entries = new Map<string, Promise<any>>(); return { async get(id: string, build: () => Promise<any>) {
    const hit = entries.has(id); if (hit) counts.cacheHits++; else { counts.cacheBuilds++; entries.set(id, Promise.resolve().then(build).then(freeze)); }
    return { value: await entries.get(id), hit };
  } }; };
  const unstable = (build: (...args: any[]) => Promise<any>) => {
    const entries = new Map<string, Promise<any>>();
    return (...args: any[]) => { const id = JSON.stringify(args); if (!entries.has(id)) { counts.cacheBuilds++; entries.set(id, Promise.resolve().then(() => build(...args)).then(freeze)); } else counts.cacheHits++; return entries.get(id)!; };
  };
  const load = async (file: string, dependencies: (name: string) => unknown) => {
    const code = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const output = await transform(code, { loader: 'ts', format: 'cjs', target: 'node22' });
    const module = { exports: {} as Row };
    class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? state.now : value); } static now() { return state.now; } }
    new Function('require', 'module', 'exports', 'process', 'Date', output.code)(dependencies, module, module.exports, { env: state.env }, Clock);
    return module.exports;
  };
  const wrapper = await load('src/lib/source-lane-runtime.ts', name => {
    if (name.endsWith('/sources/poll-policy.mjs')) return policy;
    if (name === './source-scheduler') return { readPollProjection: policyRead, POLL_SOURCES: [definition], schedulerEnabled: () => state.env.SOURCE_SCHEDULER_ENABLED === '1' };
    if (name === 'next/cache') return { unstable_cache: unstable };
    if (name === './alert-queue/runtime') return { createProductionAlertQueueSqlExecutor: () => ({ query: forbidden('SQL') }), alertQueueDatabaseConfigured: () => true };
    if (name === './source-lane') return { SOURCE_LANES: [], SourceLaneRepository: class { sql: any; constructor(sql: any) { this.sql = sql; } },
      readSourceLaneDropOverlay: async (_repo: unknown, rows: Row[]) => { counts.laneReads++; return { drops: [...rows, ...(state.laneRow ? [state.laneRow] : [])], version: `lane-${state.laneRow?.sourceLaneGeneration || 0}` }; } };
    if (name === './site-engine-contract') return { readSiteExportResults: async (names: string[]) => names.map(name => ({ snapshotId: 'immutable-snapshot-1', source: 'remote-snapshot',
      generatedAt: new Date(started).toISOString(), payload: name === 'bottles' ? { bottles: [] } : { states: [{ state: 'SC', health: 'healthy' }] } })) };
    return unavailable;
  });
  const freshness = (row: Row) => ({ startsAt: Date.parse(row.observedAt), endsAt: Date.parse(row.lastConfirmedAt || row.observedAt) + 3600_000, inclusiveEnd: true });
  const route = await load('src/app/api/drops/route.ts', name => {
    if (name === 'next/server') return { NextResponse: { json: Response.json } };
    if (name === 'next/cache') return { unstable_cache: unstable };
    if (name.includes('prepared-drop-cache')) return { createPreparedDropCache: memo, createAsyncPreparedDropCache: asyncMemo };
    if (name.includes('public-feed-pack')) return pack;
    if (name.includes('source-lane-runtime')) return wrapper;
    if (name.includes('nationwide-pilot-receipt')) return { ...receipt, pilotReceiptPayload: (surface: any, source: string, rows: Row[], snapshot: string) => receipt.pilotReceiptPayload(surface, source, rows, snapshot, state.now) };
    if (name.includes('engine-feed-verification')) return { ENGINE_FEED_VERIFICATION_HEADER: 'x-bourbon-signal-engine-verification', authorizeEngineFeedVerification: () => false };
    if (name === '@clerk/nextjs/server') return { auth: async () => ({ userId: state.member ? 'fixture-paid-member' : null }), clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }) };
    if (name.includes('server-entitlements')) return { getServerEntitlements: async () => ({ tier: state.member ? 'standard' : 'free', canUseAdvancedFilters: true, feedPreviewLimit: 7 }) };
    if (name === '@/lib/entitlements') return { getEntitlements: () => ({ tier: 'standard', canUseAdvancedFilters: true }) };
    if (name.includes('site-engine-contract')) return { readSiteExportIdentity: async () => 'immutable-snapshot-1', normalizeDropForSite: (row: Row) => { bump(counts.normalized, row.id); return { ...row }; },
      siteExportHeaders: () => ({}), readSiteExportResults: async () => { counts.snapshots++; return [
        { snapshotId: 'immutable-snapshot-1', source: 'remote-snapshot', payload: { generatedAt: new Date(started).toISOString(), drops: base } },
        { snapshotId: 'immutable-snapshot-1', source: 'remote-snapshot', payload: { generatedAt: new Date(started).toISOString(), engineGeneratedAt: new Date(started).toISOString(), refreshHealth: { degradedStates: [{ state: 'FL', status: 'degraded' }] } } },
      ]; } };
    if (name.includes('classification.generated.json')) return { records: [] };
    if (name.includes('drop-classification')) return { DROP_FEED_CLASSIFICATION_TIERS: ['limited', 'allocated', 'unicorn'], getDropClassificationIndex: () => ({ version: 'classification-1' }),
      classifyPublicDrop: (row: Row) => { bump(counts.classified, row.id); return { ...row, rarity_tier: row.tier, classification_source: 'fixture', classification_state: row.state, classification_bottle_id: row.canonicalBottleId }; } };
    if (name.includes('public-drop-evidence')) return { publicEvidenceStateCode: (value: string) => value, publicDropRarityTier: (row: Row) => row.tier,
      publicDropDegradedStateReasons: () => new Map(),
      publicDropFreshnessWindow: freshness, isFreshPublicDrop: (row: Row, now: number) => now <= freshness(row).endsAt,
      isPublicDropFeedEligible: (row: Row, options?: Row) => !row.stale && row.canAlertAsInventory === true && !options?.degradedStateCodes?.has(row.state),
      projectInventoryEvidenceFreshness: (row: Row) => ({ ...row }) };
    if (name.includes('retailer-public-submissions')) return { readCachedPublicRetailerSubmissions: async () => [] };
    if (name.includes('retailer-signal-feed')) return { retailerFeedSnapshot: () => 'none', retailerSubmissionToFeedCard: () => null, isVerifiedRetailerDrop: () => false };
    if (name.includes('signal-contract')) return { sortDropsByCanonicalSignalOrder: (rows: Row[]) => rows };
    if (name.includes('signal-market-summary')) return { buildWeeklyMarketSummaries: () => [] };
    if (name.includes('drop-feed-history')) return { scopedDropFeedHistoryEnabled: () => false, historicalDropFeedEnabled: () => false,
      selectDropFeedHistory: (rows: Row[], _historical: boolean, isFresh: (row: Row) => boolean) => rows.filter(isFresh) };
    if (name.includes('drop-feed-policy')) return { compareDropFeedNewestFirst: (a: Row, b: Row) => a.id.localeCompare(b.id), dropDisplayTime: (row: Row) => row.observedAt,
      dropFreshnessTime: (row: Row) => Date.parse(row.observedAt), resolveDropLimit: () => 100 };
    if (name.includes('drop-cursor')) return { DropCursorSnapshotError: class extends Error {}, decodeDropCursor: () => true,
      paginateDrops: (rows: Row[]) => ({ items: rows, offset: 0, nextCursor: null, hasMore: false }) };
    if (name.includes('api-cache-contract')) return { dropFeedCacheHeaders: () => ({ 'Cache-Control': 'public, s-maxage=60' }) };
    if (name.includes('location-normalization')) return { normalizeStateCodeParam: (value: string | null) => value || undefined };
    if (name.includes('california-area')) return { parseCaliforniaAreaQuery: () => ({ requested: false, valid: true, areas: [] }) };
    if (name.includes('nevada-area')) return { parseNevadaAreaQuery: () => ({ requested: false, valid: true, areas: [] }) };
    if (name.includes('new-york-area')) return { parseNewYorkAreaQuery: () => ({ requested: false, valid: true, areas: [] }), SUPPORTED_NEW_YORK_AREAS: [] };
    if (name.includes('colorado-area')) return { parseColoradoAreaQuery: () => ({ requested: false, valid: true, areas: [] }), SUPPORTED_COLORADO_AREAS: [] };
    if (name.includes('demand-metro-areas')) return { parseDemandMetroAreaQuery: () => ({ requested: false, valid: true, areas: [] }) };
    if (name.includes('activeStates')) return { ACTIVE_ENGINE_STATE_NAMES: { FL: 'Florida', VA: 'Virginia', SC: 'South Carolina' } };
    return unavailable;
  });
  const get = async (signed = false) => {
    const url = new URL('https://www.bourbonsignal.com/api/drops?limit=100');
    const headers: Record<string, string> = {};
    if (signed) { url.search = new URLSearchParams({ state: 'FL', limit: '1', source_receipt: sourceId, _bs_verify: `${Date.now()}-abc` }).toString(); headers[receipt.PILOT_RECEIPT_HEADER] = receipt.signPilotReceipt(url, key); }
    const response = await route.GET(new Request(url, { headers }));
    assert.equal(response.status, 200); return { response, body: await response.json() };
  };
  return { state, counts, base, baseBefore, get, update: () => { current = owned(); }, owned,
    assertSafe: () => { assert.equal(counts.infrastructure, 0); assert.equal(JSON.stringify(base), baseBefore, 'cached immutable snapshot must remain untouched'); } };
}

test('actual paid route observes accepted source generation advances while immutable caches hit', async () => {
  const h = await harness(); const first = await h.get();
  assert.equal(first.body.drops.find((row: Row) => row.id === 'live-jensens').sourcePollGeneration, 1);
  h.state.generation = 2; h.state.observedAt += 1000; h.state.now += 1000; h.update(); const second = await h.get();
  assert.equal(second.body.drops.find((row: Row) => row.id === 'live-jensens').sourcePollGeneration, 2);
  assert.notEqual(second.body.snapshot, first.body.snapshot); assert.equal(h.counts.snapshots, 1);
  assert.equal(h.counts.normalized.get('unrelated-va-snapshot'), 1); assert.equal(h.counts.classified.get('unrelated-va-snapshot'), 1);
  assert.equal(h.counts.policyReads, 2); assert.ok(h.counts.cacheHits > 0); h.assertSafe();
});
test('concurrent reads share expensive immutable preparation while each reads current source policy', async () => {
  const h = await harness();
  const results = await Promise.all(Array.from({ length: 20 }, () => h.get()));
  assert.ok(results.every(result => result.body.drops.some((row: Row) => row.id === 'live-jensens')));
  assert.equal(h.counts.snapshots, 1, 'concurrent readers share one broad snapshot read');
  assert.equal(h.counts.normalized.get('unrelated-va-snapshot'), 1);
  assert.equal(h.counts.classified.get('unrelated-va-snapshot'), 1);
  assert.equal(h.counts.policyReads, 20, 'reuse must not cache mutable source decisions');
  assert.ok(h.counts.cacheHits >= 19); h.assertSafe();
});
for (const failure of ['failed collection', 'reader error', 'explicit disable', 'explicit disable with scheduler off', 'catalog policy loss', 'state policy loss']) test(`cached actual route vetoes ${failure} on the next read and recovers`, async () => {
  const h = await harness(); assert.ok((await h.get()).body.drops.some((row: Row) => row.id === 'live-jensens'));
  if (failure === 'failed collection') h.state.accepted = false;
  if (failure === 'reader error') h.state.readerError = true;
  if (failure.startsWith('explicit disable')) { h.state.disabled = true; h.state.env.JENSENS_SOURCE_POLL_ENABLED = '0'; }
  if (failure.endsWith('scheduler off')) h.state.env.SOURCE_SCHEDULER_ENABLED = '0';
  if (failure === 'catalog policy loss') h.state.catalogAllowed = false;
  if (failure === 'state policy loss') h.state.policyBlocked = true;
  const rejected = await h.get();
  assert.deepEqual(rejected.body.drops.map((row: Row) => row.id), ['unrelated-va-snapshot']);
  assert.equal((await h.get(true)).body.identities.length, 0, 'signed receipt must agree with normal feed veto');
  Object.assign(h.state, { accepted: true, readerError: false, disabled: false, catalogAllowed: true, policyBlocked: false, generation: 2 });
  h.state.env.SOURCE_SCHEDULER_ENABLED = '1'; h.state.env.JENSENS_SOURCE_POLL_ENABLED = '1'; h.update();
  const recovered = await h.get(); assert.equal(recovered.body.drops.find((row: Row) => row.id === 'live-jensens').sourcePollGeneration, 2);
  assert.equal(h.counts.snapshots, 1); h.assertSafe();
});
test('evidence expiry without a generation change is checked after cache reads', async () => {
  const h = await harness(); await h.get(); h.state.now += 3600_001;
  assert.equal((await h.get()).body.drops.some((row: Row) => row.id === 'live-jensens'), false);
  assert.equal(h.state.generation, 1); assert.equal(h.counts.snapshots, 1); h.assertSafe();
});
test('first request after idle reads current source state despite retained immutable cached preparation', async () => {
  const h = await harness(); await h.get(); h.state.now += 20 * 60_000; h.state.accepted = false;
  const afterIdle = await h.get(); assert.deepEqual(afterIdle.body.drops.map((row: Row) => row.id), ['unrelated-va-snapshot']);
  assert.equal(h.counts.snapshots, 1); assert.equal(h.counts.policyReads, 2); h.assertSafe();
});
test('receipt identities match the same current rows and do not resurrect unrelated degraded snapshot rows', async () => {
  const h = await harness(); const normal = await h.get(), signed = await h.get(true);
  const live = normal.body.drops.find((row: Row) => row.id === 'live-jensens');
  assert.equal(signed.body.identities.length, 1); assert.equal(signed.body.identities[0].generation, live.sourcePollGeneration);
  assert.equal(signed.body.identities[0].runId, live.sourcePollRun); assert.equal(signed.body.identities[0].canonicalBottleId, live.canonicalBottleId);
  assert.equal(normal.body.drops.some((row: Row) => row.id === 'unrelated-fl-snapshot' || row.id === 'snapshot-jensens'), false);
  assert.match(signed.response.headers.get('cache-control') || '', /private.*no-store/); h.assertSafe();
});
test('normal paid and guest feed responses prevent CDN reuse of an old source decision', async () => {
  const h = await harness();
  for (const member of [true, false]) { h.state.member = member; const result = await h.get(); assert.match(result.response.headers.get('cache-control') || '', /private.*no-store/); }
  h.assertSafe();
});
test('actual SC wrapper rereads mutable lane state on consecutive requests without changing storage-off behavior', async () => {
  const h = await harness(); h.state.env.SOURCE_LANE_STORAGE_ENABLED = '1'; h.state.env.SOURCE_LANE_POLL_ENABLED = '1';
  h.state.laneRow = h.owned({ id: 'live-sc-lane', state: 'SC', state_code: 'SC', sourceChain: 'liquor-library', storeId: 'liquor-library:45SNB155S1XMP',
    storeName: 'Fixture SC store', storeAddress: 'Fixture selected South Carolina premises', city: 'North Myrtle Beach',
    sourcePollId: undefined, sourceLaneId: 'fixture-sc-lane', sourceLaneGeneration: 1 });
  assert.equal((await h.get()).body.drops.find((row: Row) => row.id === 'live-sc-lane').sourceLaneGeneration, 1);
  h.state.laneRow = { ...h.state.laneRow, sourceLaneGeneration: 2 };
  assert.equal((await h.get()).body.drops.find((row: Row) => row.id === 'live-sc-lane').sourceLaneGeneration, 2);
  assert.equal(h.counts.laneReads, 2); h.state.env.SOURCE_LANE_STORAGE_ENABLED = '0';
  assert.equal((await h.get()).body.drops.some((row: Row) => row.id === 'live-sc-lane'), false); assert.equal(h.counts.laneReads, 2); h.assertSafe();
});
test('actual normal coverage route also forbids CDN reuse without verification headers', async () => {
  const source = await readFile(new URL('../src/app/api/coverage/route.ts', import.meta.url), 'utf8');
  const output = await transform(source, { loader: 'ts', format: 'cjs', target: 'node22' }); let generation = 1, reads = 0;
  const module = { exports: {} as Row };
  new Function('require', 'module', 'exports', output.code)((name: string) => {
    if (name === 'next/server') return { NextResponse: { json: Response.json } };
    if (name.includes('nationwide-pilot-receipt')) return receipt;
    if (name.includes('coverage-server')) return { readCurrentCoverageContract: async () => { reads++; return { generation }; } };
    throw new Error(`Unexpected coverage dependency ${name}`);
  }, module, module.exports);
  for (const expected of [1, 2]) { generation = expected; const response = await module.exports.GET(new Request('https://www.bourbonsignal.com/api/coverage'));
    assert.match(response.headers.get('cache-control') || '', /private.*no-store/); assert.equal((await response.json()).generation, expected); }
  assert.equal(reads, 2);
});
