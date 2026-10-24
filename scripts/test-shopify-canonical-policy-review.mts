import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { InMemoryObjectStorage, publishSiteSnapshot } from '../engine/src/data-plane/site-snapshot-publisher.mjs';
import { captureShopifyCanonicalPolicy, CANONICAL_POLICY_DEPENDENCY_FILES } from './lib/shopify-canonical-policy-capture.mts';
import { reviewShopifyCanonicalPolicyCapture, SHOPIFY_CANONICAL_REVIEW_LIMITS } from './lib/shopify-canonical-policy-review.mts';
import { loadShopifyBatchInputs } from './prepare-shopify-onboarding.mts';

type Row = Record<string, any>;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sorted = (value: any): any => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const json = (value: any) => Buffer.from(JSON.stringify(value));
const manifestBytes = await readFile(new URL('../engine/data/shopify-pickup-next-five-review-20261023.json', import.meta.url));
const reviewed = JSON.parse(await readFile(new URL('../engine/data/shopify-next-five-policy-bindings-20261024.json', import.meta.url), 'utf8')).bindings;
const dependencies: Row = {};
for (const [name, file] of Object.entries(CANONICAL_POLICY_DEPENDENCY_FILES)) dependencies[name] = await readFile(new URL(`../${file}`, import.meta.url));
const batch = await loadShopifyBatchInputs({ manifestFile: 'engine/data/shopify-pickup-next-five-review-20261023.json',
  captureManifestFiles: ['engine/test/fixtures/shopify-variant-pickup/next-five-20261023T1647/manifest.json'] });
const fixtureCatalog = JSON.parse(dependencies.catalog.toString()).records;
const commit = 'e'.repeat(40), capturedAt = '2026-10-24T03:30:00.000Z', now = Date.parse('2026-10-24T03:31:00.000Z');

async function fixture() {
  // EVERY provider identity, metadata record and published snapshot in this test
  // is synthetic. Matching all supplied anchors must NEVER authenticate it.
  const storage = new InMemoryObjectStorage(), encryptionKey = Buffer.alloc(32, 9).toString('base64url');
  const canonical = [...new Map(reviewed.map((row: Row) => [row.canonicalId, row])).values()] as Row[];
  const generatedAt = '2026-10-24T03:25:00.000Z';
  await publishSiteSnapshot(storage, {
    'bottles.json': JSON.stringify({ generatedAt, bottles: canonical.map(row => ({ id: row.canonicalId, canonical_name: row.canonicalName,
      tier: fixtureCatalog.find((item: Row) => item.id === row.canonicalId).tier, aliases: ['PRIVATE_CANARY'] })) }),
    'state-health.json': JSON.stringify({ generatedAt, states: ['CA', 'FL', 'NY', 'TX'].map(state => ({ state, health: 'healthy', notes: 'PRIVATE_CANARY' })) }),
    'alerts.json': JSON.stringify({ generatedAt, alerts: [{ privateMember: 'PRIVATE_CANARY' }] }),
  }, { generatedAt, appCommit: commit, engineCommit: commit, collectionRunId: 'synthetic-review-only' }, { encryptionKey });
  const pointer = await storage.readPointer();
  const capture = await captureShopifyCanonicalPolicy({ storage, encryptionKey, readRelease: async () => ({ release: { status: 'healthy', commit }, engine: { snapshotId: pointer.active } }),
    expectedLiveCommit: commit, producerCommit: commit, producerRunId: '123456789', expectedSnapshotId: pointer.active,
    expectedPointerSha256: sha(JSON.stringify(sorted(pointer))), manifestBytes, bindings: reviewed, dependencyBytes: dependencies as any, now: () => Date.parse(capturedAt) });
  const run = { id: 123456789, run_attempt: 1, head_sha: commit, head_branch: 'main', path: '.github/workflows/shopify-canonical-policy-read.yml',
    event: 'workflow_dispatch', status: 'completed', conclusion: 'success', repository: { id: 123, full_name: 'tarsagent22/Bourbon-Signal' },
    head_repository: { id: 123, full_name: 'tarsagent22/Bourbon-Signal' }, run_started_at: '2026-10-24T03:29:00Z', updated_at: '2026-10-24T03:30:05Z',
    actor: { privateIgnoredField: 'PRIVATE_CANARY' } };
  const artifact: Row = { id: 987654321, name: 'shopify-canonical-policy-123456789', expired: false, digest: '', size_in_bytes: 0,
    workflow_run: { id: 123456789, head_sha: commit, head_branch: 'main', repository_id: 123, head_repository_id: 123 },
    created_at: '2026-10-24T03:30:01Z', expires_at: '2026-11-23T03:30:01Z' };
  const packetInput: any = { batchInput: { ...structuredClone(batch), now: Date.parse('2026-10-23T16:57:00.000Z') }, safeMatcherBytes: dependencies.safeMatcher,
    decisions: reviewed.map((row: Row) => ({ sourceId: row.sourceId, configSha256: row.configSha256,
      gates: Object.fromEntries(['baseline', 'canonical', 'preflight', 'observer'].map(kind => [kind, { status: 'pending' }])) })), evidence: [] };
  const input: any = { captureBytes: json(capture), archiveBytes: new Uint8Array(), runMetadataBytes: json(run), artifactMetadataBytes: json(artifact), packetInput, now,
    expected: { producerCommit: commit, runId: '123456789', runAttempt: 1, artifactId: '987654321', artifactSha256: '', captureSha256: '',
      runMetadataSha256: '', artifactMetadataSha256: '', snapshotId: pointer.active, pointerSha256: capture.activePointerSha256 } };
  const bind = (members?: Row) => {
    input.captureBytes = json(capture);
    input.archiveBytes = zipSync(members || { 'shopify-canonical-policy.json': input.captureBytes });
    artifact.digest = `sha256:${sha(input.archiveBytes)}`; artifact.size_in_bytes = input.archiveBytes.byteLength;
    input.runMetadataBytes = json(run); input.artifactMetadataBytes = json(artifact);
    Object.assign(input.expected, { artifactSha256: sha(input.archiveBytes), captureSha256: sha(input.captureBytes),
      runMetadataSha256: sha(input.runMetadataBytes), artifactMetadataSha256: sha(input.artifactMetadataBytes) });
  };
  bind(); return { input, capture, run, artifact, bind };
}
function safe(report: Row) {
  assert.equal(report.productionAuthorityVerified, false); assert.equal(report.authentication, 'pending'); assert.equal(report.activated, false);
  assert.deepEqual(report.admissions, []); assert.deepEqual(report.descriptors, []); assert.equal(report.acceptedNewStores, 0);
  assert.equal(report.requiresExplicitLeadReview, true); assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY'));
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= SHOPIFY_CANONICAL_REVIEW_LIMITS.outputBytes);
  if (report.packet) {
    assert.deepEqual(report.packet.admissions, []); assert.equal(report.packet.acceptedNewStores, 0);
    assert.ok(report.packet.sources.every((row: Row) => row.gates.canonical.status !== 'evidence_present' && row.reviewReady === false));
    const { packetSha256, ...body } = report.packet; assert.equal(packetSha256, sha(JSON.stringify(body)));
  }
}
async function reject(value: any, code?: string) {
  const report = await reviewShopifyCanonicalPolicyCapture(value); safe(report); assert.equal(report.integrityVerified, false);
  assert.equal(report.packet, null); assert.deepEqual(report.canonicalEvidence, []);
  if (code) assert.ok(report.blockers.includes(code), JSON.stringify(report.blockers)); return report;
}

test('actual verified encrypted fixture capture joins five real source configs/packet without authenticating synthetic GHA lineage', async () => {
  const { input } = await fixture(), prior = globalThis.fetch;
  globalThis.fetch = (() => { throw Error('Network forbidden'); }) as any;
  let report: Row;
  try { report = await reviewShopifyCanonicalPolicyCapture(input); } finally { globalThis.fetch = prior; }
  safe(report); assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers));
  assert.equal(report.canonicalEvidence.length, 5); assert.equal(report.packet.sources.length, 5);
  assert.equal(report.packet.batch.fixtureRequests, 10); assert.equal(report.packet.batch.fixtureBytes, batch.captures.reduce((sum, row) => sum + row.bytes, 0));
  assert.ok(report.blockers.includes('provider_authentication_pending'));
  assert.ok(report.packet.sources.every((row: Row) => row.gates.canonical.status === 'pending' && row.captures.stale));
  assert.equal(report.lineage.captureSha256, input.expected.captureSha256);
});

for (const key of ['producerCommit', 'runId', 'runAttempt', 'artifactId', 'artifactSha256', 'captureSha256', 'runMetadataSha256', 'artifactMetadataSha256', 'snapshotId', 'pointerSha256']) {
  test(`independent expected reference rejects mismatch ${key}`, async () => {
    const value = await fixture(); value.input.expected[key] = key === 'runAttempt' ? 2 : key.endsWith('Sha256') ? '0'.repeat(64)
      : key === 'producerCommit' ? 'a'.repeat(40) : key === 'snapshotId' ? 'different-snapshot' : '111';
    await reject(value.input);
  });
}
for (const mode of ['wrong workflow', 'wrong repo', 'fork', 'branch', 'event', 'failed', 'not completed', 'attempt', 'artifact source', 'artifact expired', 'artifact clock']) {
  test(`rehashing supplied metadata cannot hide lineage conflict: ${mode}`, async () => {
    const value = await fixture();
    if (mode === 'wrong workflow') value.run.path = '.github/workflows/source-scheduler-monitor.yml';
    if (mode === 'wrong repo') value.run.repository.full_name = 'foreign/Bourbon-Signal';
    if (mode === 'fork') value.run.head_repository.id = 444;
    if (mode === 'branch') value.run.head_branch = 'prep';
    if (mode === 'event') value.run.event = 'pull_request';
    if (mode === 'failed') value.run.conclusion = 'failure';
    if (mode === 'not completed') value.run.status = 'in_progress';
    if (mode === 'attempt') value.run.run_attempt = 2;
    if (mode === 'artifact source') value.artifact.workflow_run.head_sha = 'a'.repeat(40);
    if (mode === 'artifact expired') value.artifact.expired = true;
    if (mode === 'artifact clock') value.artifact.created_at = '2026-10-23T03:30:01Z';
    value.bind(); await reject(value.input);
  });
}
for (const mode of ['extra member', 'path traversal', 'wrong member', 'oversized member', 'different raw']) test(`archive member boundary: ${mode}`, async () => {
  const value = await fixture(), raw = value.input.captureBytes;
  value.bind(mode === 'extra member' ? { 'shopify-canonical-policy.json': raw, 'private.json': json({ secret: 'PRIVATE_CANARY' }) }
    : mode === 'path traversal' ? { '../shopify-canonical-policy.json': raw } : mode === 'wrong member' ? { 'foreign.json': raw }
    : mode === 'oversized member' ? { 'shopify-canonical-policy.json': Buffer.alloc(65537) } : { 'shopify-canonical-policy.json': json({ different: true }) });
  await reject(value.input);
});
for (const mode of ['stale capture', 'future capture', 'date only', 'invalid calendar', 'stale snapshot', 'future snapshot', 'capture before run']) test(`actual clock boundary: ${mode}`, async () => {
  const value = await fixture();
  if (mode === 'stale capture') value.input.now += 3600001;
  if (mode === 'future capture') value.capture.capturedAt = '2026-10-24T04:30:00.000Z';
  if (mode === 'date only') value.capture.capturedAt = '2026-10-24';
  if (mode === 'invalid calendar') value.capture.capturedAt = '2026-02-30T03:30:00.000Z';
  if (mode === 'stale snapshot') value.capture.generatedAt = '2026-10-16T03:25:00.000Z';
  if (mode === 'future snapshot') value.capture.generatedAt = '2026-10-24T04:25:00.000Z';
  if (mode === 'capture before run') value.capture.capturedAt = '2026-10-24T03:28:00.000Z';
  value.bind(); await reject(value.input);
});
for (const mode of ['collector', 'identity', 'matcher', 'fixture catalog', 'classification', 'classify code', 'source policy', 'manifest', 'bindings']) test(`fixed local provenance rejects forged ${mode} pin`, async () => {
  const value = await fixture();
  const keys: Row = { collector: 'collectorSha256', identity: 'premisesIdentitySha256', matcher: 'safeMatcherSha256', 'fixture catalog': 'reviewedFixtureCatalogSha256',
    classification: 'classificationArtifactSha256', 'classify code': 'classificationImplementationSha256', 'source policy': 'sourcePolicyImplementationSha256', manifest: 'sourceManifestSha256', bindings: 'reviewedBindingFileSha256' };
  value.capture.provenance[keys[mode]] = '0'.repeat(64); value.bind(); await reject(value.input);
});
for (const mode of ['wrong tuple', 'wrong source', 'wrong canonical', 'wrong name', 'regular', 'market mutation', 'duplicate canonical', 'duplicate source', 'unknown limits', 'unknown capture', 'unknown provenance', 'bad accounting', 'bad export hash', 'fake plaintext size']) {
  test(`capture closed schema/binding safety: ${mode}`, async () => {
    const value = await fixture(), c: Row = value.capture;
    if (mode === 'wrong tuple') c.bindings[0].variantId = '123';
    if (mode === 'wrong source') c.bindings[0].sourceId = 'ca:foreign';
    if (mode === 'wrong canonical') c.bindings[0].canonicalId = c.canonicalRows[1].canonicalId;
    if (mode === 'wrong name') c.canonicalRows[0].canonicalName = 'PRIVATE_CANARY';
    if (mode === 'regular') c.canonicalRows[0].canonicalTier = 'regular';
    if (mode === 'market mutation') c.bindings[0].marketTier = 'unicorn';
    if (mode === 'duplicate canonical') c.canonicalRows[1] = c.canonicalRows[0];
    if (mode === 'duplicate source') c.bindings[1] = c.bindings[0];
    if (mode === 'unknown limits') c.limits.privateAccount = { secret: 'PRIVATE_CANARY' };
    if (mode === 'unknown capture') c.privateAccount = { secret: 'PRIVATE_CANARY' };
    if (mode === 'unknown provenance') c.provenance.privateAccount = { secret: 'PRIVATE_CANARY' };
    if (mode === 'bad accounting') c.accounting.pointerReads = 1;
    if (mode === 'bad export hash') c.provenance.exports[0].plaintextSha256 = { secret: 'PRIVATE_CANARY' };
    if (mode === 'fake plaintext size') c.provenance.exports[0].descriptorBytes = 99999999;
    value.bind(); await reject(value.input);
  });
}
test('matching supplied hashes with fully fabricated production rows cannot gain authority even after all integrity checks pass', async () => {
  const value = await fixture();
  value.capture.provenance.exports.forEach((row: Row) => { row.plaintextSha256 = '1'.repeat(64); row.encryptedObjectSha256 = '2'.repeat(64); });
  value.bind(); const report = await reviewShopifyCanonicalPolicyCapture(value.input); safe(report);
  assert.equal(report.integrityVerified, true); assert.equal(report.productionAuthorityVerified, false);
  assert.ok(report.blockers.includes('provider_authentication_pending')); assert.ok(report.packet.sources.every((row: Row) => row.gates.canonical.status === 'pending'));
});
test('eligible production canonical tier change is preserved as pending compatibility, never silently rewritten to fixture tier', async () => {
  const value = await fixture(); value.capture.canonicalRows[0].canonicalTier = 'limited'; value.bind();
  const report = await reviewShopifyCanonicalPolicyCapture(value.input); safe(report);
  assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers));
  assert.ok(report.blockers.includes('packet_canonical_compatibility_pending'));
  assert.equal(report.packet.sources[0].gates.canonical.status, 'rejected');
  assert.ok(report.packet.sources[0].gates.canonical.blockers.includes('gate_evidence_schema_or_binding_invalid'));
});
test('missing capture member and no archive fail closed', async () => {
  const value = await fixture(); value.bind({}); await reject(value.input, 'archive_member_invalid');
  value.input.archiveBytes = Buffer.alloc(0); await reject(value.input, 'input_byte_limit_or_type');
});
test('cyclic or foreign packet manifest fails closed without serializing caller objects', async () => {
  const value = await fixture(); value.input.packetInput.batchInput.manifest.privateAccount = { secret: 'PRIVATE_CANARY' };
  value.input.packetInput.batchInput.manifest.loop = value.input.packetInput.batchInput.manifest;
  await reject(value.input, 'packet_selection_mismatch');
});
test('whole-second GitHub upper boundaries permit .999 in the same second without loosening freshness', async () => {
  const value = await fixture(); value.capture.capturedAt = '2026-10-24T03:30:00.999Z';
  value.artifact.created_at = '2026-10-24T03:30:00Z'; value.run.updated_at = '2026-10-24T03:30:00Z'; value.bind();
  const report = await reviewShopifyCanonicalPolicyCapture(value.input); safe(report); assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers));
  value.input.now = Date.parse('2026-10-24T03:30:00.998Z'); await reject(value.input, 'capture_clock_stale_or_invalid');
});
test('whole-second metadata cannot accept the next full second', async () => {
  const value = await fixture(); value.capture.capturedAt = '2026-10-24T03:30:01.000Z'; value.artifact.created_at = '2026-10-24T03:30:00Z'; value.bind();
  await reject(value.input, 'capture_clock_stale_or_invalid');
});
test('millisecond metadata keeps its exact upper bound', async () => {
  const value = await fixture(); value.capture.capturedAt = '2026-10-24T03:30:00.001Z'; value.artifact.created_at = '2026-10-24T03:30:00.000Z'; value.bind();
  await reject(value.input, 'capture_clock_stale_or_invalid');
});
test('caller cannot pre-approve canonical evidence or change selected manifest under the join', async () => {
  const value = await fixture(); value.input.packetInput.decisions[0].gates.canonical.status = 'evidence_present';
  await reject(value.input, 'canonical_input_must_be_derived');
  value.input.packetInput.decisions[0].gates.canonical.status = 'pending'; value.input.packetInput.batchInput.manifest.sources.pop();
  await reject(value.input, 'packet_selection_mismatch');
});
for (const key of ['captureBytes', 'archiveBytes', 'runMetadataBytes', 'artifactMetadataBytes']) test(`bounded raw input rejects ${key} before parse`, async () => {
  const value = await fixture(), limit = (SHOPIFY_CANONICAL_REVIEW_LIMITS as Row)[key];
  value.input[key] = Buffer.alloc(limit + 1, 65); await reject(value.input, 'input_byte_limit_or_type');
});
