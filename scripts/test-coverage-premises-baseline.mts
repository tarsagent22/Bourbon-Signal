import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { InMemoryObjectStorage, publishSiteSnapshot } from '../engine/src/data-plane/site-snapshot-publisher.mjs';
import { captureCoveragePremisesBaseline, projectPremise, BASELINE_FILES } from './capture-coverage-premises-baseline.mts';
const commit = 'e'.repeat(40), encryptionKey = Buffer.alloc(32, 7).toString('base64url'), clock = Date.parse('2026-10-23T03:00:00Z');
async function setup() {
  const storage = new InMemoryObjectStorage();
  const files = { 'drops.json': JSON.stringify({ drops: [{ state: 'CA', storeAddress: '12 Main Street Unit 2, San Diego CA 92101', storeName: 'Public Store', storeId: 'store-12', sourceChain: 'public-chain',
    sourceUrl: 'https://example.com/products/SECRET_BOTTLE?token=SECRET_TOKEN', locationPrecision: 'store_level', type: 'retailer_store_inventory_result', canAlertAsInventory: true,
    observedAt: '2026-10-23T02:45:00Z', canonicalName: 'SECRET_BOTTLE', canonicalBottleId: 'SECRET_BOTTLE_ID', price: 123, email: 'SECRET_MEMBER', name: 'SECRET_BOTTLE', id: 'SECRET_SIGNAL' }] }),
    'stores.json': JSON.stringify({ stores: [{ state: 'CA', address: '13 Main St, San Diego CA 92101', name: 'Directory Store', id: 'directory-13' }] }),
    'locations.json': JSON.stringify({ locations: [] }), 'state-health.json': JSON.stringify({ states: [{ state: 'CA', health: 'healthy', notes: 'SECRET_NOTES' }] }),
    'alerts.json': JSON.stringify({ alerts: ['SECRET_ALERT'] }), 'bottles.json': JSON.stringify({ bottles: ['SECRET_BOTTLE'] }) };
  await publishSiteSnapshot(storage, files, { generatedAt: '2026-10-23T02:50:00Z', appCommit: 'prior-data-release', engineCommit: 'engine', collectionRunId: 'run' }, { encryptionKey });
  const pointer = await storage.readPointer();
  const requested: string[] = [];
  const readStorage = { readPointer: () => storage.readPointer(), readObject: async (key: string) => { requested.push(key); return storage.readObject(key); } };
  const options = { storage: readStorage, encryptionKey, expectedCommit: commit, now: () => clock, health: async () => ({ release: { status: 'healthy', commit }, engine: { snapshotId: pointer.active } }) };
  return { storage, options, requested, pointer, files };
}
test('actual verified snapshot reader exports only premises/source identity and descriptor provenance', async () => {
  const { options, requested } = await setup(); const result = await captureCoveragePremisesBaseline(options);
  assert.equal(result.premises.length, 2); assert.equal(result.premises[0].currentWithinOneHour, true);
  assert.equal(result.history.exhaustiveHistoricalAbsenceProven, false);
  const serialized = JSON.stringify(result); assert.ok(!serialized.includes('SECRET_')); assert.ok(!('price' in result.premises[0]));
  assert.ok(requested.every(key => key.endsWith('/manifest.json') || BASELINE_FILES.some(name => key.endsWith(`/files/${name}.json.enc`))));
  assert.equal(result.provenance[0].files.length, 4); assert.equal(result.premises[0].sourceHost, 'example.com');
  assert.equal(result.premises[0].sourceSnapshotId, result.activeSnapshotId); assert.equal(result.premises[0].sourceObservedAt, '2026-10-23T02:45:00.000Z');
});
test('wrong live commit, unhealthy release and mismatched live snapshot fail closed', async () => {
  for (const health of [{ release: { status: 'healthy', commit: 'a'.repeat(40) } }, { release: { status: 'critical', commit } }, { release: { status: 'healthy', commit }, engine: { snapshotId: 'other' } }]) {
    const { options, requested } = await setup(); await assert.rejects(() => captureCoveragePremisesBaseline({ ...options, health: async () => health })); assert.equal(requested.length, 0);
  }
});
test('pointer is pinned across four reads and rechecked at end', async () => {
  const { options, pointer } = await setup(); let calls = 0;
  await assert.rejects(() => captureCoveragePremisesBaseline({ ...options, storage: { ...options.storage, readPointer: async () => ++calls === 1 ? pointer : { ...pointer, revision: pointer.revision + 1 } } }), /pointer changed/);
  assert.equal(calls, 2);
});
test('health is checked again after reads', async () => {
  const { options } = await setup(); let calls = 0; await assert.rejects(() => captureCoveragePremisesBaseline({ ...options, health: async () => ++calls === 1 ? options.health() : { release: { status: 'critical' } } }));
});
test('missing historical snapshot records a gap, never historical absence', async () => {
  const { options } = await setup(); const result = await captureCoveragePremisesBaseline({ ...options, history: async () => ({ ids: ['missing-snapshot'], limited: false }) });
  assert.deepEqual(result.history.gaps, ['missing-snapshot']); assert.equal(result.history.limited, true); assert.equal(result.history.exhaustiveHistoricalAbsenceProven, false);
});
test('history request is bounded and traversal identities rejected', async () => {
  const { options } = await setup(); await assert.rejects(() => captureCoveragePremisesBaseline({ ...options, history: async () => ({ ids: ['../alerts'], limited: false }) }));
  await assert.rejects(() => captureCoveragePremisesBaseline({ ...options, history: async () => ({ ids: Array.from({ length: 21 }, (_, i) => `s${i}`), limited: true }) }));
});
test('historical observations never count as current active inventory', async () => {
  const { storage, options, files, pointer } = await setup(); await publishSiteSnapshot(storage, files, { generatedAt: '2026-10-23T02:51:00Z', appCommit: 'other', engineCommit: 'engine', collectionRunId: 'run2' }, { encryptionKey });
  const active = await storage.readPointer(); const result = await captureCoveragePremisesBaseline({ ...options, health: async () => ({ release: { status: 'healthy', commit }, engine: { snapshotId: active.active } }) });
  assert.ok(result.premises.some(row => row.origin === 'retained_history')); assert.ok(result.premises.filter(row => row.origin === 'retained_history').every(row => row.currentWithinOneHour === false));
  assert.equal(result.provenance[1].snapshotId, pointer.active);
});

test('stale or disabled inventory preserves prior connection without claiming current inventory', () => {
  const row = projectPremise({ state: 'CA', storeAddress: '12 Main St', type: 'retailer_store_inventory_result', locationPrecision: 'store_level',
    canAlertAsInventory: false, observedAt: '2026-10-23T02:45:00Z' }, 'drops', 'active', clock)!;
  assert.equal(row.layer, 'retailer_inventory'); assert.equal(row.inventoryObserved, true);
  assert.equal(row.currentWithinOneHour, false); assert.equal(row.staleOrUnconfirmed, true);
});
test('manual workflow never invokes collectors, publishers, arbitrary ref interpolation or extra artifact paths', async () => {
  const workflow = await readFile(new URL('../.github/workflows/coverage-premises-baseline.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch/); assert.ok(!workflow.includes('schedule:')); assert.match(workflow, /npm ci --ignore-scripts/);
  assert.ok(!/refresh-feed|publish-site|monitor-source|workflow run/.test(workflow)); assert.match(workflow, /path: out\/coverage-premises-baseline.json/);
  assert.ok(!workflow.includes('run: ${{'));
  assert.match(workflow, /if: github.ref == 'refs\/heads\/main'/);
});

test('directory metadata never becomes an inventory connection', () => {
  for (const file of ['stores', 'locations', 'registry']) {
    const row = projectPremise({ state: 'CA', address: '12 Main St', type: 'retailer_store_inventory_result', locationPrecision: 'store_level',
      canAlertAsInventory: true, observedAt: '2026-10-23T02:45:00Z' }, file, 'active', clock)!;
    assert.equal(row.layer, 'directory'); assert.equal(row.inventoryObserved, false); assert.equal(row.currentWithinOneHour, false);
  }
});

test('active blocked state preserves connection but vetoes current inventory', async () => {
  const { storage, options, files } = await setup();
  await publishSiteSnapshot(storage, { ...files, 'state-health.json': JSON.stringify({ states: [{ state: 'CA', health: 'blocked' }] }) },
    { generatedAt: '2026-10-23T02:51:00Z', appCommit: 'other', engineCommit: 'engine', collectionRunId: 'run2' }, { encryptionKey });
  const pointer = await storage.readPointer();
  const result = await captureCoveragePremisesBaseline({ ...options, health: async () => ({ release: { status: 'healthy', commit }, engine: { snapshotId: pointer.active } }) });
  const row = result.premises.find(row => row.origin === 'active' && row.inventoryObserved)!;
  assert.equal(row.currentWithinOneHour, false); assert.equal(row.staleOrUnconfirmed, true);
});

test('partially read historical snapshot contributes no partial premise rows', async () => {
  const { storage, options, files, pointer } = await setup();
  await publishSiteSnapshot(storage, files, { generatedAt: '2026-10-23T02:51:00Z', appCommit: 'other', engineCommit: 'engine', collectionRunId: 'run2' }, { encryptionKey });
  const active = await storage.readPointer();
  const result = await captureCoveragePremisesBaseline({ ...options, storage: { ...options.storage, readObject: async key =>
    key === `engine/snapshots/${pointer.active}/files/stores.json.enc` ? null : options.storage.readObject(key) },
    health: async () => ({ release: { status: 'healthy', commit }, engine: { snapshotId: active.active } }) });
  assert.deepEqual(result.history.gaps, [pointer.active]); assert.ok(result.premises.every(row => row.origin !== 'retained_history'));
});

test('independent source premises retain separate provenance inside the pinned release/pointer capture', async () => {
  const { options } = await setup();
  const independent = { contractVersion:'bourbon-signal/source-premises-baseline@1',releaseCommit:commit,heads:[],premises:[],completeness:{historicalAbsenceProven:false} };
  const result=await captureCoveragePremisesBaseline({...options,independentSources:async()=>independent});
  assert.deepEqual(result.independentSources,independent);assert.equal(result.independentSourcesMissing,false);
  assert.equal(result.history.exhaustiveHistoricalAbsenceProven,false);
});
test('missing independent capture is explicit; wrong release, contract or read failure cannot export a mixed baseline', async () => {
  const { options } = await setup();assert.equal((await captureCoveragePremisesBaseline(options)).independentSourcesMissing,true);
  for(const value of [{contractVersion:'other',releaseCommit:commit},{contractVersion:'bourbon-signal/source-premises-baseline@1',releaseCommit:'f'.repeat(40)}])
    await assert.rejects(()=>captureCoveragePremisesBaseline({...options,independentSources:async()=>value}),/identity mismatch/);
  await assert.rejects(()=>captureCoveragePremisesBaseline({...options,independentSources:async()=>{throw Error('unavailable');}}));
});
