import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import * as receiptModule from '../src/lib/nationwide-pilot-receipt.ts';
import * as opsAuthModule from '../src/lib/ops-auth.ts';
const receipt = ((receiptModule as any).default || receiptModule) as typeof import('../src/lib/nationwide-pilot-receipt.ts');
const opsAuth = ((opsAuthModule as any).default || opsAuthModule) as typeof import('../src/lib/ops-auth.ts');

const key = 'fixture-only-pilot-receipt-key-1234567890';
const now = Date.parse('2026-10-23T02:00:00.000Z');
const sourceId = 'fl:jensens-miami';
const url = (path = '/api/drops') => new URL(`https://www.bourbonsignal.com${path}?state=FL&limit=1&source_receipt=${sourceId}&_bs_verify=${now}-abcdef`);
const row = (overrides: Record<string, unknown> = {}) => ({ sourcePollId: sourceId, sourcePollRun: 'immutable-fixture-run', sourcePollGeneration: 4,
  state: 'FL', storeId: 'jensens-liquors:1646-sw-27th', canonicalBottleId: 'elijah-craig-18-year', productId: '15414448390218', variantId: '67703590977610',
  observedAt: new Date(now - 1000).toISOString(), canAlertAsInventory: true, availabilityStatus: 'in_stock', ...overrides });

test('both allowed surfaces bind origin, full query, source, key, time, and path', () => {
  for (const path of ['/api/drops', '/api/coverage']) {
    const original = url(path), signature = receipt.signPilotReceipt(original, key, now);
    assert.equal(receipt.authorizePilotReceipt(original, signature, key, now), true);
    assert.equal(receipt.authorizePilotReceipt(original, signature, key, now + 90_000), true);
    assert.equal(receipt.authorizePilotReceipt(original, signature, key, now + 91_000), false);
    assert.equal(receipt.authorizePilotReceipt(original, signature, key, now - 6000), false);
    assert.equal(receipt.authorizePilotReceipt(original, signature, 'wrong-fixture-key-12345678901234567890', now), false);
    for (const mutate of [
      (changed: URL) => changed.hostname = 'attacker.example',
      (changed: URL) => changed.protocol = 'http:',
      (changed: URL) => changed.pathname = path === '/api/drops' ? '/api/coverage' : '/api/drops',
      (changed: URL) => { changed.searchParams.set('source_receipt', 'ca:mission-trails-wine-spirits'); changed.searchParams.set('state', 'CA'); },
      (changed: URL) => changed.searchParams.set('_bs_verify', `${now}-12345`),
    ]) { const changed = new URL(original); mutate(changed); assert.equal(receipt.authorizePilotReceipt(changed, signature, key, now), false); }
  }
});
const forbiddenQueries = [
  '&history=1', '&signalId=123', '&bottle=weller', '&state=CA', '&limit=1', '&source_receipt=fl:jensens-miami', '&_bs_verify=1234567890000-abc',
  '&cursor=123', '&offset=1', '&area=miami', '&search=elijah', '&signalOrder=canonical', '&paidcards=1',
];
for (const suffix of forbiddenQueries) test(`extra or duplicate receipt query denied: ${suffix}`, () => {
  const original = url(), signed = receipt.signPilotReceipt(original, key, now); original.search += suffix;
  assert.throws(() => receipt.signPilotReceipt(original, key, now));
  assert.equal(receipt.authorizePilotReceipt(original, signed, key, now), false);
});
test('unknown sources, invalid scopes, cards, and malformed signatures are denied', () => {
  for (const source of ['fl:abc', 'ca:del-mesa-liquor', 'arbitrary', 'constructor', '__proto__']) {
    const changed = url(); changed.searchParams.set('source_receipt', source);
    assert.throws(() => receipt.signPilotReceipt(changed, key, now));
    assert.equal(receipt.authorizePilotReceipt(changed, null, key, now), false);
  }
  for (const limit of ['100', '7', '0', '01']) { const changed = url(); changed.searchParams.set('limit', limit); assert.throws(() => receipt.signPilotReceipt(changed, key, now)); }
  for (const header of [null, '', 'malformed', 'v2:1792720800:' + 'a'.repeat(64), 'v1:1792720800:' + 'x'.repeat(64)]) assert.equal(receipt.authorizePilotReceipt(url(), header, key, now), false);
  for (const path of ['/api/stores', '/api/drops/123', '/api/coverage/requests']) assert.throws(() => receipt.signPilotReceipt(url(path), key, now));
  assert.throws(() => receipt.signPilotReceipt(url(), 'short', now));
  assert.equal(receipt.authorizePilotReceipt(url(), null, key, NaN), false);
});
test('receipt projects fixed public identities without cards, customer fields, or source raw payload', () => {
  const payload = receipt.pilotReceiptPayload('feed', sourceId, [row({ userId: 'private-member', email: 'private@example.com', memberWatchlist: ['private'],
    raw: { cookies: 'private-cookie' }, bottleName: 'public-card-name', price: 249.99, entitlement: 'private-tier' })], 'snapshot-1', now);
  assert.equal(payload.contractVersion, receipt.PILOT_RECEIPT_CONTRACT);
  assert.equal(payload.total, 1);
  assert.deepEqual(Object.keys(payload).sort(), ['contractVersion', 'surface', 'sourceId', 'snapshot', 'receivedAt', 'total', 'identities'].sort());
  assert.deepEqual(Object.keys(payload.identities[0]).sort(), ['sourceId', 'runId', 'generation', 'state', 'storeId', 'canonicalBottleId', 'productId', 'variantId', 'observedAt'].sort());
  assert.ok(!JSON.stringify(payload).includes('private'));
  assert.equal(payload.identities[0].generation, 4);
});
for (const [name, change] of Object.entries({
  foreignSource: { sourcePollId: 'fl:abc' }, foreignState: { state: 'CA' }, foreignStore: { storeId: 'other-store' },
  stale: { stale: true }, sourceStale: { sourceStale: true }, nonInventory: { canAlertAsInventory: false }, missingRun: { sourcePollRun: '' },
  missingGeneration: { sourcePollGeneration: undefined }, invalidGeneration: { sourcePollGeneration: 0 }, fractionalGeneration: { sourcePollGeneration: 1.5 },
  missingBottle: { canonicalBottleId: '' }, missingProduct: { productId: '' }, missingVariant: { variantId: '' },
  futureEvidence: { observedAt: new Date(now + 1000).toISOString() }, staleEvidence: { observedAt: new Date(now - 3600_001).toISOString() }, invalidEvidence: { observedAt: 'unknown' },
})) test(`receipt excludes invalid source/run/generation evidence: ${name}`, () => {
  assert.equal(receipt.pilotReceiptPayload('coverage', sourceId, [row(change)], 's', now).total, 0);
});
test('receipt rejects unreviewed source identities including inherited object keys', () => {
  for (const source of ['fl:abc', 'constructor', '__proto__']) assert.throws(() => receipt.pilotReceiptPayload('feed', source, [], 's', now));
});
test('receipt cannot present mixed source generations as a single current collection', () => {
  const payload = receipt.pilotReceiptPayload('feed', sourceId, [row(), row({ sourcePollGeneration: 3, sourcePollRun: 'older-run', productId: 'older-product' })], 's', now);
  assert.ok(payload.total === 0 || payload.identities.every(identity => identity.generation === 4 && identity.runId === 'immutable-fixture-run'));
});

// Transpile the actual saved routes in memory. All infrastructure and identity
// dependencies throw on use: unauthorized verification must return first.
async function negativeRoute(path: string, coverageRead?: (source: string) => unknown) {
  const source = await readFile(new URL(`../src/app/api/${path}/route.ts`, import.meta.url), 'utf8');
  const output = await transform(source, { loader: 'ts', format: 'cjs', target: 'node22' });
  const unexpected = new Proxy({}, { get(_target, property) { return () => assert.fail(`Unauthorized route touched ${String(property)}`); } });
  const requireStub = (name: string) => {
    if (name.includes('nationwide-pilot-receipt')) return receipt;
    if (name === 'next/server') return { NextResponse: { json: Response.json }, NextRequest: Request };
    if (name === 'next/cache') return { unstable_cache: (fn: unknown) => fn };
    if (name.includes('prepared-drop-cache')) return { createPreparedDropCache: () => ({}), createAsyncPreparedDropCache: () => ({}) };
    if (name.includes('drop-classification')) return { DROP_FEED_CLASSIFICATION_TIERS: [] };
    if (name.includes('engine-feed-verification')) return { ENGINE_FEED_VERIFICATION_HEADER: 'x-bourbon-signal-engine-verification', authorizeEngineFeedVerification: () => false };
    if (name.includes('coverage-server') && coverageRead) return { readCoveragePilotReceipt: coverageRead, readCurrentCoverageContract: () => assert.fail('Receipt requested general coverage') };
    return unexpected;
  };
  const module = { exports: {} as { GET(request: Request): Promise<Response> } };
  new Function('require', 'module', 'exports', output.code)(requireStub, module, module.exports);
  return module.exports;
}
for (const path of ['drops', 'coverage']) test(`actual ${path} route rejects unauthorized verification before auth, catalog, or database access`, async () => {
  const route = await negativeRoute(path);
  const previous = process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY;
  process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY = key;
  try {
    const original = url(`/api/${path}`), signature = receipt.signPilotReceipt(original, key);
    const scenarios = [
      new Request(original),
      new Request(original, { headers: { [receipt.PILOT_RECEIPT_HEADER]: 'invalid' } }),
      new Request(original.toString() + '&limit=100', { headers: { [receipt.PILOT_RECEIPT_HEADER]: signature } }),
      new Request(original.toString() + '&signalId=private-card', { headers: { [receipt.PILOT_RECEIPT_HEADER]: signature } }),
      new Request(new URL(original.pathname + original.search, 'https://attacker.example'), { headers: { [receipt.PILOT_RECEIPT_HEADER]: signature } }),
      new Request(original, { headers: { [receipt.PILOT_RECEIPT_HEADER]: receipt.signPilotReceipt(original, key, Date.now() - 91_000) } }),
    ];
    for (const request of scenarios) { const result = await route.GET(request); assert.equal(result.status, 401); assert.match(result.headers.get('cache-control') || '', /private, no-store/); }
  } finally { if (previous === undefined) delete process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY; else process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY = previous; }
});
test('actual coverage route serves only requested signed source receipt with private cache policy', async () => {
  let reads = 0;
  const route = await negativeRoute('coverage', source => { reads++; assert.equal(source, sourceId); return receipt.pilotReceiptPayload('coverage', source, [row()], 'fixture-snapshot', now); });
  const previous = process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY;
  process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY = key;
  try {
    const original = url('/api/coverage'), signature = receipt.signPilotReceipt(original, key);
    const response = await route.GET(new Request(original, { headers: { [receipt.PILOT_RECEIPT_HEADER]: signature } }));
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') || '', /private, no-store/);
    assert.match(response.headers.get('vary') || '', /Pilot-Verification/i);
    const body = await response.json(); assert.equal(body.sourceId, sourceId); assert.equal(body.surface, 'coverage');
    assert.equal(body.identities.length, 1); assert.equal(body.drops, undefined); assert.equal(body.states, undefined); assert.equal(reads, 1);
  } finally { if (previous === undefined) delete process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY; else process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY = previous; }
});

test('actual scheduler read mode never runs collectors or writes a monitor heartbeat', async () => {
  const source = await readFile(new URL('../src/app/api/ops/source-scheduler/route.ts', import.meta.url), 'utf8');
  const output = await transform(source, { loader: 'ts', format: 'cjs', target: 'node22' });
  const calls: Array<Record<string, unknown>> = [];
  const requireStub = (name: string) => {
    if (name.includes('ops-auth')) return opsAuth;
    if (name.includes('source-lane-runtime')) return { pollRuntimeSourceLanes: async (dryRun: boolean) => { calls.push({ lanePoll: dryRun }); } };
    if (name.includes('source-scheduler')) return {
      sourceSchedulerHealth: async (writeMonitor: boolean) => { calls.push({ writeMonitor }); return { enabled: true }; },
      runSourceScheduler: async (options: unknown) => { calls.push({ collection: options }); return { enabled: true }; },
    };
    assert.fail(`Unexpected scheduler dependency ${name}`);
  };
  const module = { exports: {} as { GET(request: Request): Promise<Response> } };
  new Function('require', 'module', 'exports', output.code)(requireStub, module, module.exports);
  const environment = { CRON_SECRET: 'fixture-cron-capability', SOURCE_SCHEDULER_SECRET: 'fixture-source-capability', COMPANY_SCORECARD_READ_SECRET: 'fixture-read-capability' };
  const previous = Object.fromEntries(Object.keys(environment).map(name => [name, process.env[name]]));
  Object.assign(process.env, environment);
  try {
    for (const secret of Object.values(environment)) for (const query of ['?read=1', '?read=1&monitor=1']) {
      calls.length = 0;
      const result = await module.exports.GET(new Request(`https://www.bourbonsignal.com/api/ops/source-scheduler${query}`, { headers: { authorization: `Bearer ${secret}`, 'user-agent': 'vercel-cron/1.0' } }));
      assert.equal(result.status, 200); assert.match(result.headers.get('cache-control') || '', /private, no-store/);
      assert.deepEqual(calls, [{ writeMonitor: false }]);
    }
    for (const headers of [{}, { authorization: 'Bearer wrong-capability' }]) {
      calls.length = 0;
      assert.equal((await module.exports.GET(new Request('https://www.bourbonsignal.com/api/ops/source-scheduler?read=1', { headers }))).status, 401);
      assert.deepEqual(calls, []);
    }
    calls.length = 0;
    assert.equal((await module.exports.GET(new Request('https://www.bourbonsignal.com/api/ops/source-scheduler', { headers: { authorization: `Bearer ${environment.COMPANY_SCORECARD_READ_SECRET}` } }))).status, 401);
    assert.deepEqual(calls, []);
    for (const [secret, agent, trigger] of [
      [environment.CRON_SECRET, 'vercel-cron/1.0', 'scheduled'],
      [environment.CRON_SECRET, 'fixture-manual-client', 'manual_or_rescue'],
      [environment.SOURCE_SCHEDULER_SECRET, 'vercel-cron/1.0', 'manual_or_rescue'],
    ]) {
      calls.length = 0;
      const result = await module.exports.GET(new Request('https://www.bourbonsignal.com/api/ops/source-scheduler', { headers: { authorization: `Bearer ${secret}`, 'user-agent': agent } }));
      assert.equal(result.status, 200);
      assert.deepEqual(calls, [{ collection: { trigger } }, { lanePoll: false }]);
    }
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
