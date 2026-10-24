import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encryptSnapshotObject } from '../engine/src/data-plane/site-snapshot-contract.mjs';
import { InMemoryObjectStorage, publishSiteSnapshot } from '../engine/src/data-plane/site-snapshot-publisher.mjs';
import { captureShopifyCanonicalContext, CANONICAL_CONTEXT_CAPTURE_LIMITS, CANONICAL_CONTEXT_DEPENDENCY_FILES,
  CANONICAL_CONTEXT_SELECTION, CANONICAL_CONTEXT_STATE_PAIRS } from './lib/shopify-canonical-context-capture.mts';

type Row = Record<string, any>;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sorted = (value: any): any => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const hashJson = (value: any) => sha(JSON.stringify(sorted(value)));
const dependencyBytes: Row = {};
for (const [key, file] of Object.entries(CANONICAL_CONTEXT_DEPENDENCY_FILES)) dependencyBytes[key] = await readFile(new URL(`../${file}`, import.meta.url));
const commit = 'e'.repeat(40), key = Buffer.alloc(32, 7).toString('base64url');
const clock = Date.parse('2026-10-24T21:10:00.000Z'), generatedAt = '2026-10-24T21:05:00.000Z';
async function setup(edit?: (files: Row) => void, generated = generatedAt) {
  // Synthetic production export bytes only. No planned source config or fixture
  // Bible is imported; canonical tiers are read back from these encrypted files.
  const tiers = ['allocated', 'allocated', 'unicorn', 'limited'];
  const identity = { generatedAt: generated, engineGeneratedAt: generated, runId: 'synthetic-context-capture' };
  const files: Row = {
    'bottles.json': { ...identity, bottles: [...CANONICAL_CONTEXT_SELECTION.map((row, i) => ({ id: row.canonicalId, canonical_id: row.canonicalId,
      canonical_name: row.canonicalName, name: row.canonicalName, tier: tiers[i], aliases: ['PRIVATE_CANARY_ALIAS'], privateAccount: 'PRIVATE_CANARY' })),
      { id: 'bb_0000000000000000', canonical_name: 'PRIVATE_CANARY_NONSELECTED', tier: 'regular' }] },
    'state-health.json': { ...identity, states: ['CA', 'FL', 'NY', 'TX'].map(state => ({ state, health: 'healthy', privateAccount: 'PRIVATE_CANARY' })) },
    'alerts.json': { ...identity, alerts: [{ member: 'PRIVATE_CANARY', notes: 'PRIVATE_CANARY' }], extraPrivate: 'PRIVATE_CANARY' },
  };
  edit?.(files);
  const serialized = Object.fromEntries(Object.entries(files).map(([name, value]) => [name, JSON.stringify(value)]));
  const storage = new InMemoryObjectStorage();
  await publishSiteSnapshot(storage, serialized, { generatedAt: generated, appCommit: commit, engineCommit: commit, collectionRunId: 'synthetic-only' }, { encryptionKey: key });
  const pointer = await storage.readPointer(), calls: string[] = [], counts = { pointers: 0, releases: 0 };
  const input: any = { storage: { readPointer: async () => { counts.pointers++; return storage.readPointer(); }, readObject: async (name: string) => { calls.push(name); return storage.readObject(name); } },
    encryptionKey: key, readRelease: async () => { counts.releases++; return { release: { status: 'healthy', commit }, engine: { snapshotId: pointer.active, status: 'degraded' }, privateAccount: 'PRIVATE_CANARY' }; },
    expectedLiveCommit: commit, producerCommit: commit, producerRunId: '123456789', expectedSnapshotId: pointer.active,
    expectedPointerSha256: hashJson(pointer), dependencyBytes: { ...dependencyBytes }, now: () => clock };
  return { input, storage, pointer, calls, counts, files, serialized };
}
function safe(output: Row) {
  assert.equal(output.contractVersion, 'bourbon-signal/selected-canonical-context@2');
  assert.deepEqual(output.admissions, []); assert.deepEqual(output.descriptors, []); assert.equal(output.activated, false);
  assert.equal(output.acceptedNewStores, 0); assert.equal(output.requiresExplicitLeadReview, true);
  assert.equal(output.canonicalRows.length, 4); assert.equal(output.stateClassifications.length, 5);
  const encoded = JSON.stringify(output); assert.ok(!encoded.includes('PRIVATE_CANARY')); assert.ok(Buffer.byteLength(encoded) <= 65536);
  assert.ok(!('bindings' in output)); assert.ok(!('alerts' in output));
  assert.ok(!Object.keys(output.provenance).some(key => /collector|fixture|premises|sourcePolicy|sourceManifest|reviewedBinding/u.test(key)));
  assert.ok(output.canonicalRows.every((row: Row) => Object.keys(row).sort().join(',') === 'canonicalId,canonicalName,canonicalTier'));
  assert.ok(output.stateClassifications.every((row: Row) => Object.keys(row).sort().join(',') === 'canonicalId,classificationSource,marketTier,state'));
}
async function rejected(input: any, code?: string) {
  await assert.rejects(() => captureShopifyCanonicalContext(input), (error: Error & Row) => {
    assert.ok(!error.message.includes('PRIVATE_CANARY')); if (code) assert.equal(error.code, code); return true;
  });
}
test('minimal producer imports only unchanged snapshot/classification dependencies and fixed two production files', async () => {
  const source = await readFile(new URL('./lib/shopify-canonical-context-capture.mts', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map(row => row[1]);
  assert.deepEqual(imports, ['node:crypto', 'node:fs/promises', '../../src/lib/remote-site-snapshot.ts', '../../src/lib/remote-site-snapshot.ts', '../../src/lib/drop-classification.ts']);
  assert.deepEqual(CANONICAL_CONTEXT_DEPENDENCY_FILES, { classification: 'src/data/drop-feed-classification.generated.json', classificationImplementation: 'src/lib/drop-classification.ts' });
  assert.ok(!/\.\.\/engine\/|source-scheduler|test\/fixtures|manifest\.sources|validateShopifyVariantSource|describeShopifyVariantSource/u.test(source));
  assert.ok(Object.isFrozen(CANONICAL_CONTEXT_SELECTION) && CANONICAL_CONTEXT_SELECTION.every(Object.isFrozen));
  assert.ok(Object.isFrozen(CANONICAL_CONTEXT_STATE_PAIRS) && CANONICAL_CONTEXT_STATE_PAIRS.every(Object.isFrozen));
});
test('actual encrypted reader emits four production rows/five current classifications with exact logical read accounting', async () => {
  const value = await setup(), prior = globalThis.fetch; globalThis.fetch = (() => { throw Error('No network'); }) as any;
  let output: Row; try { output = await captureShopifyCanonicalContext(value.input); } finally { globalThis.fetch = prior; }
  safe(output); assert.equal(value.calls.length, 4); assert.equal(new Set(value.calls).size, 4); assert.equal(value.counts.pointers, 2); assert.equal(value.counts.releases, 2);
  assert.ok(value.calls.every(path => path.endsWith('/manifest.json') || ['bottles', 'state-health', 'alerts'].some(name => path.endsWith(`/files/${name}.json.enc`))));
  assert.equal(output.accounting.immutableReads, 4); assert.equal(output.activePointerSha256, hashJson(value.pointer));
  assert.equal(output.provenance.classificationDataSha256, sha(dependencyBytes.classification));
  assert.equal(output.provenance.classificationImplementationSha256, sha(dependencyBytes.classificationImplementation));
  for (const row of output.provenance.exports) {
    assert.equal(row.plaintextSha256, sha(value.serialized[`${row.name}.json`]));
    assert.equal(row.encryptedObjectSha256, sha((await value.storage.readObject(`engine/snapshots/${value.pointer.active}/files/${row.name}.json.enc`))!));
  }
  assert.equal(output.canonicalRows.find((row: Row) => row.canonicalName === 'Weller Single Barrel').canonicalTier, 'unicorn');
  assert.equal(output.stateClassifications.find((row: Row) => row.state === 'NY').marketTier, 'allocated');
  assert.equal(output.stateClassifications.find((row: Row) => row.canonicalId === 'bb_be6a0afd4ba5f963').marketTier, 'limited');
  assert.ok(output.stateClassifications.every((row: Row) => row.classificationSource !== 'signal'));
});
test('eligible current production tier change is captured without forcing a saved fixture category', async () => {
  const value = await setup(files => { files['bottles.json'].bottles[0].tier = 'limited'; });
  const output = await captureShopifyCanonicalContext(value.input); safe(output); assert.equal(output.canonicalRows[0].canonicalTier, 'limited');
});
for (const mode of ['producer', 'wrong run', 'pointer hash', 'snapshot', 'release before', 'release after']) test(`exact producer/release/pointer context: ${mode}`, async () => {
  const value = await setup(); let reads = 0;
  if (mode === 'producer') value.input.producerCommit = 'a'.repeat(40);
  if (mode === 'wrong run') value.input.producerRunId = 'PRIVATE_CANARY';
  if (mode === 'pointer hash') value.input.expectedPointerSha256 = '0'.repeat(64);
  if (mode === 'snapshot') value.input.expectedSnapshotId = 'wrong-snapshot';
  if (mode.startsWith('release')) value.input.readRelease = async () => ({ release: { status: 'healthy', commit: mode === 'release after' && ++reads === 1 ? commit : 'a'.repeat(40) }, engine: { snapshotId: value.pointer.active } });
  await rejected(value.input); if (mode !== 'release after') assert.equal(value.calls.length, 0);
});
test('real active pointer drift and unhealthy release cannot be hidden by pinned reader', async () => {
  const value = await setup(); let reads = 0;
  value.input.storage.readPointer = async () => ++reads === 1 ? value.pointer : { ...value.pointer, revision: value.pointer.revision + 1 };
  await rejected(value.input, 'pointer_hash_mismatch'); assert.equal(value.calls.length, 4);
  const other = await setup(); other.input.readRelease = async () => ({ release: { status: 'critical', commit }, engine: { snapshotId: other.pointer.active } });
  await rejected(other.input, 'release_identity_unhealthy_or_changed');
});
for (const name of ['bottles', 'state-health', 'alerts']) for (const flag of ['quarantine', 'bootstrap', 'manualRefresh']) test(`${name} ${flag} refuses all output`, async () => {
  const value = await setup(files => { files[`${name}.json`][flag] = true; }); await rejected(value.input, 'policy_snapshot_unavailable');
});
for (const mode of ['future', 'older than7days', 'mixed payload time', 'mixed run', 'missing optional run', 'missing state', 'duplicate state', 'blocked state']) test(`policy clocks/health: ${mode}`, async () => {
  const generated = mode === 'future' ? '2026-10-24T21:11:00.000Z' : mode === 'older than7days' ? '2026-10-17T21:09:59.999Z' : generatedAt;
  const value = await setup(files => {
    if (mode === 'mixed payload time') files['alerts.json'].generatedAt = '2026-10-24T21:04:00.000Z';
    if (mode === 'mixed run') files['alerts.json'].runId = 'other-run';
    if (mode === 'missing optional run') delete files['alerts.json'].runId;
    if (mode === 'missing state') files['state-health.json'].states.pop();
    if (mode === 'duplicate state') files['state-health.json'].states.push(files['state-health.json'].states[0]);
    if (mode === 'blocked state') files['state-health.json'].states[0].health = 'blocked';
  }, generated); await rejected(value.input);
});
for (const mode of ['missing', 'duplicate', 'name mismatch', 'name alias conflict', 'id conflict', 'regular', 'nested private tier', 'duplicate name']) test(`production canonical authority: ${mode}`, async () => {
  const value = await setup(files => {
    const rows = files['bottles.json'].bottles;
    if (mode === 'missing') rows.shift(); if (mode === 'duplicate') rows.push(rows[0]);
    if (mode === 'name mismatch') rows[0].canonical_name = 'Wrong bottle';
    if (mode === 'name alias conflict') rows[0].name = 'Wrong bottle';
    if (mode === 'id conflict') rows[0].id = 'bb_0000000000000001';
    if (mode === 'regular') rows[0].tier = 'regular';
    if (mode === 'nested private tier') rows[0].tier = { privateAccount: 'PRIVATE_CANARY' };
    if (mode === 'duplicate name') rows.push({ id: 'bb_0000000000000001', canonical_name: rows[0].canonical_name, tier: 'limited' });
  }); await rejected(value.input);
});
for (const mode of ['missing encrypted', 'corrupt encrypted', 'bad manifest digest', 'wrong key', 'bad state payload']) test(`verified reader fails closed without fallback: ${mode}`, async () => {
  const value = await setup(mode === 'bad state payload' ? files => { files['state-health.json'] = []; } : undefined);
  const original = value.input.storage.readObject;
  value.input.storage.readObject = async (path: string) => {
    const raw = await original(path);
    if (path.endsWith('bottles.json.enc') && mode === 'missing encrypted') return null;
    if (path.endsWith('bottles.json.enc') && mode === 'corrupt encrypted') return raw.slice(0, -3) + 'bad';
    if (path.endsWith('/manifest.json') && mode === 'bad manifest digest') { const object = JSON.parse(raw); object.manifestHash = '0'.repeat(64); return JSON.stringify(object); }
    return raw;
  };
  if (mode === 'wrong key') value.input.encryptionKey = Buffer.alloc(32, 9).toString('base64url');
  await rejected(value.input); assert.ok(value.calls.every(path => !/cache|fallback|history/u.test(path)));
});
for (const dependency of ['classification', 'classificationImplementation']) test(`caller cannot replace actual ${dependency} with self-pinned bytes`, async () => {
  const value = await setup(); value.input.dependencyBytes[dependency] = Buffer.from('PRIVATE_CANARY');
  await rejected(value.input, 'dependency_bytes_mismatch'); assert.equal(value.calls.length, 0); assert.equal(value.counts.pointers, 0);
});
test('missing/extra dependencies and unknown private budgets reject before any storage or release read', async () => {
  for (const mode of ['missing', 'extra', 'scalar budget', 'nested budget']) {
    const value = await setup();
    if (mode === 'missing') delete value.input.dependencyBytes.classification;
    if (mode === 'extra') value.input.dependencyBytes.privateAccount = 'PRIVATE_CANARY';
    if (mode === 'scalar budget') value.input.budgets = { privateAccount: 'PRIVATE_CANARY' };
    if (mode === 'nested budget') value.input.budgets = { privateAccount: { secret: 'PRIVATE_CANARY' } };
    await rejected(value.input); assert.equal(value.calls.length, 0); assert.deepEqual(value.counts, { pointers: 0, releases: 0 });
  }
});
for (const [name, value] of [['immutableReads', 3], ['pointerReads', 1], ['releaseReads', 1], ['manifestBytes', 1], ['plaintextTotalBytes', 1], ['encryptedObjectBytes', 1], ['immutableTotalBytes', 1], ['outputBytes', 1], ['bottleRows', 4]] as const) {
  test(`lowered logical budget enforced: ${name}`, async () => { const fixture = await setup(); fixture.input.budgets = { [name]: value }; await rejected(fixture.input); });
}
test('plaintext planning cap rejects before reading any encrypted object', async () => {
  const value = await setup(); value.input.budgets = { plaintextObjectBytes: 1 }; await rejected(value.input, 'export_descriptor_invalid_or_oversized');
  assert.equal(value.calls.length, 1); assert.ok(value.calls[0].endsWith('/manifest.json'));
});
test('invalid budgets and uncooperative adapter timeout fail closed with sanitized errors', async () => {
  for (const bound of [NaN, Infinity, 0, CANONICAL_CONTEXT_CAPTURE_LIMITS.immutableReads + 1]) {
    const value = await setup(); value.input.budgets = { immutableReads: bound }; await rejected(value.input, 'budget_invalid');
  }
  const value = await setup(); value.input.storage.readPointer = async () => new Promise(() => {}); value.input.budgets = { readTimeoutMs: 1 };
  await rejected(value.input, 'read_timeout');
  const other = await setup(); other.input.readRelease = async () => { throw Error('PRIVATE_CANARY'); }; await rejected(other.input, 'adapter_read_failed');
});
test('invalid or throwing injected clocks fail before remote reads without leaking callback errors', async () => {
  for (const mode of ['nan', 'throw']) {
    const value = await setup(); value.input.now = mode === 'nan' ? () => NaN : () => { throw Error('PRIVATE_CANARY'); };
    await rejected(value.input, 'capture_clock_invalid'); assert.equal(value.calls.length, 0); assert.equal(value.counts.pointers, 0);
  }
});
test('final capture clock cannot precede the verified snapshot', async () => {
  const value = await setup(); let calls = 0;
  value.input.now = () => ++calls < 5 ? clock : Date.parse(generatedAt) - 1;
  await rejected(value.input, 'capture_clock_invalid');
});

// Exact selected health scalars from authenticated inventory-refresh40139706129,
// artifact12578531473, site/state-health.json plaintext SHA
// 7eafeec5364056df19ef8304fcf2080440cf0c38e06ed0652a4c989dc94c9bb0.
// Encrypted snapshot/provenance below remain synthetic offline fixtures.
test('verified stale_useful broad state preserves canonical classifications without fresh inventory authority', async () => {
  const healthy = await setup(), control = await captureShopifyCanonicalContext(healthy.input);
  const value = await setup(files => {
    const health = { CA: 'degraded', FL: 'healthy', NY: 'stale_useful', TX: 'degraded' };
    for (const row of files['state-health.json'].states) row.health = health[row.state as keyof typeof health];
  });
  const output = await captureShopifyCanonicalContext(value.input); safe(output);
  assert.deepEqual(output.canonicalRows, control.canonicalRows);
  assert.deepEqual(output.stateClassifications, control.stateClassifications);
  assert.ok(output.caveats.some(text => text.includes('does not establish fresh state inventory')));
  assert.equal(output.accounting.immutableReads, 4); assert.equal(output.accounting.pointerReads, 2); assert.equal(output.accounting.releaseReads, 2);
});
for (const health of ['blocked', 'unknown', { privateAccount: 'PRIVATE_CANARY' }]) test(`selected noneligible/unknown health still fails closed: ${typeof health === 'string' ? health : 'nested'}`, async () => {
  const value = await setup(files => { files['state-health.json'].states.find((row: Row) => row.state === 'NY').health = health; });
  await rejected(value.input, 'selected_state_policy_missing_or_blocked');
});
test('changing encrypted raw state policy cannot reuse the old plaintext descriptor proof', async () => {
  const value = await setup(files => { files['state-health.json'].states.find((row: Row) => row.state === 'NY').health = 'blocked'; });
  const original = value.input.storage.readObject;
  value.input.storage.readObject = async (path: string) => {
    if (path.endsWith('/files/state-health.json.enc')) {
      const forged = structuredClone(value.files['state-health.json']); forged.states.find((row: Row) => row.state === 'NY').health = 'stale_useful';
      return encryptSnapshotObject(JSON.stringify(forged), key);
    }
    return original(path);
  };
  await rejected(value.input); // actual AES/hash reader, not a policy stub
});
