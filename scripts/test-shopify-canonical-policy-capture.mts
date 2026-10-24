import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { InMemoryObjectStorage, publishSiteSnapshot } from '../engine/src/data-plane/site-snapshot-publisher.mjs';
import { captureShopifyCanonicalPolicy, CANONICAL_POLICY_DEPENDENCY_FILES, CANONICAL_POLICY_CAPTURE_LIMITS } from './lib/shopify-canonical-policy-capture.mts';

type Row = Record<string, any>;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hashJson = (value: any) => sha(JSON.stringify(canonical(value)));
const manifestBytes = await readFile(new URL('../engine/data/shopify-pickup-next-five-review-20261023.json', import.meta.url));
const bindings = JSON.parse(await readFile(new URL('../engine/data/shopify-next-five-policy-bindings-20261024.json', import.meta.url), 'utf8')).bindings;
const dependencyBytes: Row = {};
for (const [name, file] of Object.entries(CANONICAL_POLICY_DEPENDENCY_FILES)) dependencyBytes[name] = await readFile(new URL(`../${file}`, import.meta.url));
const fixtureCatalog = JSON.parse(dependencyBytes.catalog.toString('utf8')).records;
const commit = 'e'.repeat(40), encryptionKey = Buffer.alloc(32, 3).toString('base64url');
const clock = Date.parse('2026-10-24T03:30:00.000Z'), generatedAt = '2026-10-24T03:25:00.000Z';
async function setup(edit?: (files: Row) => void, generated = generatedAt) {
  // Explicitly synthetic production snapshot fixture. Capture must derive its
  // rows from these encrypted bytes, not use local fixture catalog as authority.
  const unique = [...new Map(bindings.map((binding: Row) => [binding.canonicalId, binding])).values()] as Row[];
  const records = unique.map(binding => ({ id: binding.canonicalId, canonical_id: binding.canonicalId, canonical_name: binding.canonicalName,
    name: binding.canonicalName, tier: fixtureCatalog.find((row: Row) => row.id === binding.canonicalId).tier, aliases: ['PRIVATE_CANARY_ALIAS'], privateAccount: 'PRIVATE_CANARY' }));
  const identity = { generatedAt: generated, engineGeneratedAt: generated, runId: 'synthetic-canonical-capture-fixture' };
  const files: Row = {
    'bottles.json': { ...identity, bottles: [...records, { id: 'bb_0000000000000000', canonical_name: 'PRIVATE_CANARY_NONSELECTED', tier: 'regular' }], notes: 'PRIVATE_CANARY' },
    'state-health.json': { ...identity, states: ['CA', 'FL', 'NY', 'TX'].map(state => ({ state, health: 'healthy', notes: 'PRIVATE_CANARY' })) },
    'alerts.json': { ...identity, alerts: [{ memberId: 'PRIVATE_CANARY', secretToken: 'PRIVATE_CANARY', notes: 'PRIVATE_CANARY' }] },
  };
  edit?.(files);
  const serialized = Object.fromEntries(Object.entries(files).map(([name, value]) => [name, JSON.stringify(value)]));
  const storage = new InMemoryObjectStorage();
  await publishSiteSnapshot(storage, serialized, { generatedAt: generated, appCommit: commit, engineCommit: commit, collectionRunId: 'synthetic-only' }, { encryptionKey });
  const pointer = await storage.readPointer(), calls: string[] = [], counts = { pointers: 0, releases: 0 };
  const options: any = { storage: { readPointer: async () => { counts.pointers++; return storage.readPointer(); }, readObject: async (key: string) => { calls.push(key); return storage.readObject(key); } },
    encryptionKey, readRelease: async () => { counts.releases++; return { release: { status: 'healthy', commit }, engine: { snapshotId: pointer.active, status: 'degraded' } }; },
    expectedLiveCommit: commit, producerCommit: commit, producerRunId: '123456789', expectedSnapshotId: pointer.active, expectedPointerSha256: hashJson(pointer),
    manifestBytes, bindings: structuredClone(bindings), dependencyBytes: { ...dependencyBytes }, now: () => clock };
  return { options, storage, pointer, calls, counts, files, serialized };
}
function safe(output: Row) {
  const encoded = JSON.stringify(output);
  assert.ok(!encoded.includes('PRIVATE_CANARY')); assert.ok(Buffer.byteLength(encoded) <= 65536);
  assert.equal(output.canonicalRows.length, 4); assert.equal(output.bindings.length, 5);
  assert.ok(!('alerts' in output)); assert.ok(!('admissions' in output)); assert.ok(!('descriptors' in output));
  assert.ok(output.canonicalRows.every((row: Row) => Object.keys(row).sort().join(',') === 'canonicalId,canonicalName,canonicalTier'));
}
async function rejected(options: any, code?: string) {
  await assert.rejects(() => captureShopifyCanonicalPolicy(options), (error: Error) => {
    assert.ok(!error.message.includes('PRIVATE_CANARY')); if (code) assert.match(error.message, new RegExp(code)); return true;
  });
}

test('real encrypted reader pins three production exports and emits only four selected rows/five computed market bindings', async () => {
  const value = await setup(), previous = globalThis.fetch;
  globalThis.fetch = (() => { throw Error('No default network'); }) as any;
  let output: Row;
  try { output = await captureShopifyCanonicalPolicy(value.options); } finally { globalThis.fetch = previous; }
  safe(output);
  assert.equal(value.calls.length, 4); assert.equal(new Set(value.calls).size, 4); assert.equal(value.counts.pointers, 2); assert.equal(value.counts.releases, 2);
  assert.ok(value.calls.every(key => key.endsWith('/manifest.json') || ['bottles', 'state-health', 'alerts'].some(name => key.endsWith(`/files/${name}.json.enc`))));
  assert.equal(output.activePointerSha256, hashJson(value.pointer)); assert.equal(output.provenance.reviewedFixtureCatalogSha256, sha(dependencyBytes.catalog));
  for (const item of output.provenance.exports) {
    assert.equal(item.plaintextSha256, sha(value.serialized[`${item.name}.json`]));
    assert.equal(item.encryptedObjectSha256, sha((await value.storage.readObject(`engine/snapshots/${value.pointer.active}/files/${item.name}.json.enc`))!));
  }
  assert.notEqual(output.provenance.reviewedFixtureCatalogSha256, output.provenance.exports.find((row: Row) => row.name === 'bottles').plaintextSha256);
  assert.equal(output.canonicalRows.find((row: Row) => row.canonicalName === 'Weller Single Barrel').canonicalTier, 'unicorn');
  assert.equal(output.bindings.find((row: Row) => row.state === 'NY').marketTier, 'allocated');
  assert.equal(output.bindings.find((row: Row) => row.sourceId === 'ca:remedy-glendale').marketTier, 'limited');
});

test('actual eligible production canonical tier can change without being forced back to saved fixture tier', async () => {
  const value = await setup(files => { files['bottles.json'].bottles[0].tier = 'limited'; });
  const output = await captureShopifyCanonicalPolicy(value.options); safe(output);
  assert.equal(output.canonicalRows[0].canonicalTier, 'limited');
});

for (const mode of ['producer', 'release before', 'release after', 'snapshot', 'pointer hash', 'unhealthy']) test(`release/context fails closed: ${mode}`, async () => {
  const value = await setup(); let reads = 0;
  if (mode === 'producer') value.options.producerCommit = 'a'.repeat(40);
  if (mode === 'snapshot') value.options.expectedSnapshotId = 'different-snapshot';
  if (mode === 'pointer hash') value.options.expectedPointerSha256 = '0'.repeat(64);
  if (mode.startsWith('release') || mode === 'unhealthy') value.options.readRelease = async () => ({ release: { status: mode === 'unhealthy' ? 'critical' : 'healthy',
    commit: mode === 'release after' && ++reads === 1 ? commit : 'a'.repeat(40) }, engine: { snapshotId: value.pointer.active } });
  await rejected(value.options); if (mode !== 'release after') assert.equal(value.calls.length, 0);
});

test('real mutable pointer must still match at the end; a pinned reader cannot hide drift', async () => {
  const value = await setup(); let reads = 0;
  value.options.storage.readPointer = async () => ++reads === 1 ? value.pointer : { ...value.pointer, revision: value.pointer.revision + 1 };
  await rejected(value.options, 'pointer_hash_mismatch'); assert.equal(reads, 2); assert.equal(value.calls.length, 4);
});

for (const [name, flag] of [['state-health', 'quarantine'], ['state-health', 'bootstrap'], ['alerts', 'quarantine'], ['alerts', 'bootstrap'], ['alerts', 'manualRefresh'], ['bottles', 'quarantine']]) {
  test(`policy guard rejects ${name} ${flag}`, async () => {
    const value = await setup(files => { files[`${name}.json`][flag] = true; }); await rejected(value.options, 'policy_snapshot_unavailable');
  });
}
for (const mode of ['future', 'too old']) test(`manifest policy age rejects ${mode}`, async () => {
  const generated = mode === 'future' ? '2026-10-24T03:31:00.000Z' : '2026-10-16T03:30:00.000Z';
  const value = await setup(undefined, generated); await rejected(value.options, 'policy_snapshot_unavailable');
});

for (const mode of ['generatedAt', 'runId', 'engineGeneratedAt']) test(`mixed export clock/run identity rejects ${mode}`, async () => {
  const value = await setup(files => { files['alerts.json'][mode] = mode === 'runId' ? 'other-run' : '2026-10-24T03:24:00.000Z'; });
  await rejected(value.options, 'clock_mismatch');
});

for (const mode of ['missing', 'duplicate', 'wrong name', 'conflicting alias', 'ineligible', 'private nested']) test(`selected production canonical fails closed: ${mode}`, async () => {
  const value = await setup(files => {
    const rows = files['bottles.json'].bottles;
    if (mode === 'missing') rows.shift(); if (mode === 'duplicate') rows.push(structuredClone(rows[0]));
    if (mode === 'wrong name') rows[0].canonical_name = 'Wrong Canonical';
    if (mode === 'conflicting alias') rows[0].id = 'bb_1111111111111111';
    if (mode === 'ineligible') rows[0].tier = 'regular';
    if (mode === 'private nested') rows[0].canonical_name = { private: 'PRIVATE_CANARY' };
  }); await rejected(value.options, 'selected_canonical');
});

for (const mode of ['blocked', 'missing', 'duplicate']) test(`selected state policy rejects ${mode}`, async () => {
  const value = await setup(files => {
    const rows = files['state-health.json'].states;
    if (mode === 'blocked') rows[0].health = 'blocked'; if (mode === 'missing') rows.shift(); if (mode === 'duplicate') rows.push(structuredClone(rows[0]));
  }); await rejected(value.options, 'selected_state_policy');
});

test('missing/corrupt encrypted exports and changed manifest never fall back', async () => {
  for (const mode of ['missing', 'corrupt', 'manifest']) {
    const value = await setup(); const original = value.options.storage.readObject;
    value.options.storage.readObject = async (key: string) => {
      const raw = await original(key);
      if (mode === 'missing' && key.endsWith('bottles.json.enc')) return null;
      if (mode === 'corrupt' && key.endsWith('bottles.json.enc')) return raw.replace('ciphertext', 'corruptedciphertext');
      if (mode === 'manifest' && key.endsWith('/manifest.json')) { const body = JSON.parse(raw); body.generatedAt = '2026-10-24T03:24:00.000Z'; return JSON.stringify(body); }
      return raw;
    }; await rejected(value.options);
  }
});

test('changed manifest/dependency/binding bytes cannot substitute caller-selected code or canonicals', async () => {
  for (const mode of ['source manifest', 'dependency', 'binding']) {
    const value = await setup();
    if (mode === 'source manifest') value.options.manifestBytes = Buffer.from('PRIVATE_CANARY');
    if (mode === 'dependency') value.options.dependencyBytes.classification = Buffer.from('PRIVATE_CANARY');
    if (mode === 'binding') value.options.bindings[0].canonicalId = 'bb_1111111111111111';
    await rejected(value.options); assert.equal(value.calls.length, 0);
  }
});

test('descriptor planning caps apply before encrypted reads; postread caps and output caps fail closed', async () => {
  const planning = await setup(); planning.options.budgets = { plaintextObjectBytes: 10 };
  await rejected(planning.options, 'descriptor'); assert.equal(planning.calls.length, 1);
  for (const budgets of [{ immutableReads: 3 }, { encryptedObjectBytes: 10 }, { manifestBytes: 10 }, { plaintextTotalBytes: 10 }, { outputBytes: 10 }, { catalogRows: 4 }]) {
    const value = await setup(); value.options.budgets = budgets; await rejected(value.options);
  }
});

test('uncooperative adapter is bounded and raised/nonfinite budgets reject', async () => {
  const value = await setup(); value.options.readRelease = () => new Promise(() => {}); value.options.budgets = { readTimeoutMs: 5 };
  await rejected(value.options, 'read_timeout');
  for (const budgets of [{ immutableReads: 5 }, { plaintextObjectBytes: Infinity }, { outputBytes: 0 }]) {
    const other = await setup(); other.options.budgets = budgets; await rejected(other.options, 'budget_invalid');
  }
  assert.equal(CANONICAL_POLICY_CAPTURE_LIMITS.outputBytes, 65536);
});

test('unknown budget keys and private nested values reject before reads and cannot leak through returned limits', async () => {
  for (const budgets of [{ privateAccount: 'PRIVATE_CANARY' }, { privateAccount: { notes: 'PRIVATE_CANARY' } }]) {
    const value = await setup(); value.options.budgets = budgets;
    await rejected(value.options, 'budget_invalid');
    assert.equal(value.calls.length, 0); assert.equal(value.counts.pointers, 0); assert.equal(value.counts.releases, 0);
  }
});
