import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { zipSync } from 'fflate';
import { InMemoryObjectStorage, publishSiteSnapshot } from '../engine/src/data-plane/site-snapshot-publisher.mjs';
import { captureShopifyCanonicalContext, CANONICAL_CONTEXT_DEPENDENCY_FILES } from './lib/shopify-canonical-context-capture.mts';
import { reviewShopifyCanonicalContext, SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS } from './lib/shopify-canonical-context-review.mts';
import { loadShopifyBatchInputs } from './prepare-shopify-onboarding.mts';
import { describeShopifyVariantSource } from '../engine/src/collectors/shopify-variant-pickup.mjs';

type Row = Record<string, any>;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sorted = (value: any): any => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const json = (value: any) => Buffer.from(JSON.stringify(value));
const reviewed = JSON.parse(await readFile(new URL('../engine/data/shopify-next-five-policy-bindings-20261024.json', import.meta.url), 'utf8')).bindings;
const dependencies: Row = {};
for (const [name, file] of Object.entries(CANONICAL_CONTEXT_DEPENDENCY_FILES)) dependencies[name] = await readFile(new URL(`../${file}`, import.meta.url));
const batch = await loadShopifyBatchInputs({ manifestFile: 'engine/data/shopify-pickup-next-five-review-20261023.json',
  captureManifestFiles: ['engine/test/fixtures/shopify-variant-pickup/next-five-20261023T1647/manifest.json'] });
dependencies.catalog = await readFile(new URL('../engine/test/fixtures/shopify-variant-pickup/current-bourbon-bible.json', import.meta.url));
dependencies.safeMatcher = await readFile(new URL('../engine/src/collectors/safe-bottle-match.mjs', import.meta.url));
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
  const capture = await captureShopifyCanonicalContext({ storage, encryptionKey, readRelease: async () => ({ release: { status: 'healthy', commit }, engine: { snapshotId: pointer.active } }),
    expectedLiveCommit: commit, producerCommit: commit, producerRunId: '123456789', expectedSnapshotId: pointer.active,
    expectedPointerSha256: sha(JSON.stringify(sorted(pointer))), dependencyBytes: { classification: dependencies.classification, classificationImplementation: dependencies.classificationImplementation } as any, now: () => Date.parse(capturedAt) });
  const run = { id: 123456789, run_attempt: 1, head_sha: commit, head_branch: 'main', path: '.github/workflows/shopify-canonical-context-read.yml',
    event: 'workflow_dispatch', status: 'completed', conclusion: 'success', repository: { id: 123, full_name: 'tarsagent22/Bourbon-Signal' },
    head_repository: { id: 123, full_name: 'tarsagent22/Bourbon-Signal' }, run_started_at: '2026-10-24T03:29:00Z', updated_at: '2026-10-24T03:30:05Z',
    actor: { privateIgnoredField: 'PRIVATE_CANARY' } };
  const artifact: Row = { id: 987654321, name: 'shopify-canonical-context-123456789', expired: false, digest: '', size_in_bytes: 0,
    workflow_run: { id: 123456789, head_sha: commit, head_branch: 'main', repository_id: 123, head_repository_id: 123 },
    created_at: '2026-10-24T03:30:01Z', expires_at: '2026-11-23T03:30:01Z' };
  const packetInput: any = { batchInput: { ...structuredClone(batch), now: Date.parse('2026-10-23T16:57:00.000Z') }, safeMatcherBytes: dependencies.safeMatcher,
    decisions: reviewed.map((row: Row) => ({ sourceId: row.sourceId, configSha256: row.configSha256,
      gates: Object.fromEntries(['baseline', 'canonical', 'preflight', 'observer'].map(kind => [kind, { status: 'pending' }])) })), evidence: [] };
  const input: any = { contextBytes: json(capture), archiveBytes: new Uint8Array(), runMetadataBytes: json(run), artifactMetadataBytes: json(artifact), packetInput, now,
    expected: { producerCommit: commit, runId: '123456789', runAttempt: 1, artifactId: '987654321', artifactSha256: '', contextSha256: '',
      runMetadataSha256: '', artifactMetadataSha256: '', snapshotId: pointer.active, pointerSha256: capture.activePointerSha256 } };
  const bind = (members?: Row) => {
    input.contextBytes = json(capture);
    input.archiveBytes = zipSync(members || { 'shopify-canonical-context.json': input.contextBytes });
    artifact.digest = `sha256:${sha(input.archiveBytes)}`; artifact.size_in_bytes = input.archiveBytes.byteLength;
    input.runMetadataBytes = json(run); input.artifactMetadataBytes = json(artifact);
    Object.assign(input.expected, { artifactSha256: sha(input.archiveBytes), contextSha256: sha(input.contextBytes),
      runMetadataSha256: sha(input.runMetadataBytes), artifactMetadataSha256: sha(input.artifactMetadataBytes) });
  };
  bind(); return { input, capture, run, artifact, bind };
}
function safe(report: Row) {
  assert.equal(report.productionAuthorityVerified, false); assert.equal(report.authentication, 'pending'); assert.equal(report.activated, false);
  assert.deepEqual(report.admissions, []); assert.deepEqual(report.descriptors, []); assert.equal(report.acceptedNewStores, 0);
  assert.equal(report.requiresExplicitLeadReview, true); assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY'));
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.outputBytes);
  if (report.packet) {
    assert.deepEqual(report.packet.admissions, []); assert.equal(report.packet.acceptedNewStores, 0);
    assert.ok(report.packet.sources.every((row: Row) => row.gates.canonical.status !== 'evidence_present' && row.reviewReady === false));
    const { packetSha256, ...body } = report.packet; assert.equal(packetSha256, sha(JSON.stringify(body)));
  }
}
async function reject(value: any, code?: string) {
  const report = await reviewShopifyCanonicalContext(value); safe(report); assert.equal(report.integrityVerified, false);
  assert.equal(report.packet, null); assert.deepEqual(report.canonicalEvidence, []);
  if (code) assert.ok(report.blockers.includes(code), JSON.stringify(report.blockers)); return report;
}

function refreshed(value: Row, at = Date.parse('2026-10-24T03:30:30.000Z')) {
  const batchInput = value.input.packetInput.batchInput;
  for (const capture of batchInput.captures) {
    // Actual changed bytes, not a fabricated pin-only refresh. Whitespace keeps
    // the real product/card payload and all collector semantics unchanged.
    capture.body = Buffer.concat([Buffer.from(capture.body), Buffer.from('\n')]);
    capture.sha256 = sha(capture.body); capture.bytes = capture.body.length; capture.capturedAt = new Date(at).toISOString();
    for (const source of batchInput.manifest.sources) for (const product of source.products) for (const kind of ['product', 'pickup']) {
      if (product.evidence[kind].url === capture.url) Object.assign(product.evidence[kind], { sha256: capture.sha256, capturedAt: capture.capturedAt });
    }
  }
  batchInput.now = at;
  for (const source of batchInput.manifest.sources) {
    const plan = describeShopifyVariantSource(source, { collectorSha256: batchInput.manifest.collectorSha256 });
    const decision = value.input.packetInput.decisions.find((row: Row) => row.sourceId === source.runtimeId);
    if (decision) decision.configSha256 = plan.configSha256;
  }
  return value;
}

test('actual verified encrypted fixture capture joins five real source configs/packet without authenticating synthetic GHA lineage', async () => {
  const { input } = await fixture(), prior = globalThis.fetch;
  globalThis.fetch = (() => { throw Error('Network forbidden'); }) as any;
  let report: Row;
  try { report = await reviewShopifyCanonicalContext(input); } finally { globalThis.fetch = prior; }
  safe(report); assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers));
  assert.equal(report.canonicalEvidence.length, 5); assert.equal(report.packet.sources.length, 5);
  assert.equal(report.packet.batch.fixtureRequests, 10); assert.equal(report.packet.batch.fixtureBytes, batch.captures.reduce((sum, row) => sum + row.bytes, 0));
  assert.ok(report.blockers.includes('provider_authentication_pending'));
  assert.ok(report.packet.sources.every((row: Row) => row.gates.canonical.status === 'pending' && row.captures.stale));
  assert.equal(report.lineage.contextSha256, input.expected.contextSha256);
  assert.equal(report.offlineBinding.reviewedFixtureCatalogSha256, sha(dependencies.catalog));
  assert.notEqual(report.offlineBinding.productionBottlesPlaintextSha256, sha(dependencies.catalog));
  for (const evidence of report.canonicalEvidence) {
    assert.equal(sha(evidence.body), evidence.sha256); assert.equal(Buffer.byteLength(evidence.body), evidence.bytes);
    const body = JSON.parse(evidence.body), binding = reviewed.find((row: Row) => row.sourceId === body.sourceId);
    assert.deepEqual(body.tuples, [{ storeId: binding.storeId, productId: binding.productId, variantId: binding.variantId }]);
    assert.equal(body.details.bindings[0].canonicalBottleId, binding.canonicalId);
    assert.equal(evidence.contextSha256, input.expected.contextSha256);
  }
});

for (const key of ['producerCommit', 'runId', 'runAttempt', 'artifactId', 'artifactSha256', 'contextSha256', 'runMetadataSha256', 'artifactMetadataSha256', 'snapshotId', 'pointerSha256']) {
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
  const value = await fixture(), raw = value.input.contextBytes;
  value.bind(mode === 'extra member' ? { 'shopify-canonical-context.json': raw, 'private.json': json({ secret: 'PRIVATE_CANARY' }) }
    : mode === 'path traversal' ? { '../shopify-canonical-context.json': raw } : mode === 'wrong member' ? { 'foreign.json': raw }
    : mode === 'oversized member' ? { 'shopify-canonical-context.json': Buffer.alloc(65537) } : { 'shopify-canonical-context.json': json({ different: true }) });
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
for (const key of ['classificationDataSha256', 'classificationImplementationSha256']) test(`fixed production classification rejects forged ${key}`, async () => {
  const value = await fixture(); value.capture.provenance[key] = '0'.repeat(64); value.bind(); await reject(value.input, 'fixed_production_classification_hash_mismatch');
});
for (const mode of ['wrong state', 'wrong pair', 'wrong canonical', 'wrong name', 'regular', 'market mutation', 'classification source', 'duplicate canonical', 'duplicate market', 'selection hash', 'unknown limits', 'unknown capture', 'unknown provenance', 'bad accounting', 'bad export hash', 'fake plaintext size', 'admissions', 'activation', 'descriptors']) {
  test(`context closed schema/binding safety: ${mode}`, async () => {
    const value = await fixture(), c: Row = value.capture;
    if (mode === 'wrong state') c.stateClassifications[0].state = 'OH';
    if (mode === 'wrong pair') c.stateClassifications[0].canonicalId = c.canonicalRows[3].canonicalId;
    if (mode === 'wrong canonical') c.canonicalRows[0].canonicalId = 'bb_unknown';
    if (mode === 'wrong name') c.canonicalRows[0].canonicalName = 'PRIVATE_CANARY';
    if (mode === 'regular') c.canonicalRows[0].canonicalTier = 'regular';
    if (mode === 'market mutation') c.stateClassifications[0].marketTier = 'unicorn';
    if (mode === 'classification source') c.stateClassifications[0].classificationSource = 'signal';
    if (mode === 'duplicate canonical') c.canonicalRows[1] = c.canonicalRows[0];
    if (mode === 'duplicate market') c.stateClassifications[1] = c.stateClassifications[0];
    if (mode === 'selection hash') c.selectionSha256 = '0'.repeat(64);
    if (mode === 'unknown limits') c.limits.privateAccount = { secret: 'PRIVATE_CANARY' };
    if (mode === 'unknown capture') c.privateAccount = { secret: 'PRIVATE_CANARY' };
    if (mode === 'unknown provenance') c.provenance.privateAccount = { secret: 'PRIVATE_CANARY' };
    if (mode === 'bad accounting') c.accounting.pointerReads = 1;
    if (mode === 'bad export hash') c.provenance.exports[0].plaintextSha256 = { secret: 'PRIVATE_CANARY' };
    if (mode === 'fake plaintext size') c.provenance.exports[0].descriptorBytes = 99999999;
    if (mode === 'admissions') c.admissions.push({ privateAccount: 'PRIVATE_CANARY' });
    if (mode === 'activation') c.activated = true;
    if (mode === 'descriptors') c.descriptors.push({ enabled: true });
    value.bind(); await reject(value.input);
  });
}
test('matching supplied hashes with fully fabricated production rows cannot gain authority even after all integrity checks pass', async () => {
  const value = await fixture();
  value.capture.provenance.exports.forEach((row: Row) => { row.plaintextSha256 = '1'.repeat(64); row.encryptedObjectSha256 = '2'.repeat(64); });
  value.bind(); const report = await reviewShopifyCanonicalContext(value.input); safe(report);
  assert.equal(report.integrityVerified, true); assert.equal(report.productionAuthorityVerified, false);
  assert.ok(report.blockers.includes('provider_authentication_pending')); assert.ok(report.packet.sources.every((row: Row) => row.gates.canonical.status === 'pending'));
});
test('eligible production canonical tier change is preserved as pending compatibility, never silently rewritten to fixture tier', async () => {
  const value = await fixture(); value.capture.canonicalRows[0].canonicalTier = 'limited'; value.bind();
  const report = await reviewShopifyCanonicalContext(value.input); safe(report);
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
  const report = await reviewShopifyCanonicalContext(value.input); safe(report); assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers));
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
for (const key of ['contextBytes', 'archiveBytes', 'runMetadataBytes', 'artifactMetadataBytes']) test(`bounded raw input rejects ${key} before parse`, async () => {
  const value = await fixture(), limit = (SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS as Row)[key];
  value.input[key] = Buffer.alloc(limit + 1, 65); await reject(value.input, 'input_byte_limit_or_type');
});

for (const mode of ['foreign', 'duplicate', 'config', 'unknown decision', 'canonical private']) test(`decision join preserves fail-closed input: ${mode}`, async () => {
  const value = await fixture(), decision = value.input.packetInput.decisions[0];
  if (mode === 'foreign') decision.sourceId = 'ca:foreign';
  if (mode === 'duplicate') value.input.packetInput.decisions[1] = decision;
  if (mode === 'config') decision.configSha256 = '0'.repeat(64);
  if (mode === 'unknown decision') decision.private = { account: 'PRIVATE_CANARY' };
  if (mode === 'canonical private') decision.gates.canonical.private = { account: 'PRIVATE_CANARY' };
  await reject(value.input);
});
for (const key of ['collectorBytes', 'premisesIdentityBytes', 'catalogBytes', 'classificationBytes']) test(`packet comparison rejects altered or oversized ${key}`, async () => {
  const value = await fixture(); value.input.packetInput.batchInput[key] = Buffer.from('PRIVATE_CANARY');
  await reject(value.input, 'packet_dependency_mismatch');
  value.input.packetInput.batchInput[key] = Buffer.alloc(2 * 1024 * 1024 + 1);
  await reject(value.input, 'packet_dependency_byte_limit');
});
test('noncanonical pending/blocked decisions survive derivation and existing-pilot evidence cannot satisfy candidate acceptance', async () => {
  const value = await fixture(), source = reviewed[0];
  value.input.packetInput.decisions[0].gates.baseline.status = 'blocked';
  const body = { contractVersion: 'bourbon-signal/shopify-admission-evidence@1', kind: 'observer', sourceId: source.sourceId,
    configSha256: source.configSha256, dependencyPins: Object.fromEntries(['collectorSha256', 'premisesIdentitySha256', 'safeMatcherSha256', 'catalogSha256', 'classificationSha256']
      .map(key => [key, value.input.packetInput.batchInput.manifest[key]])),
    tuples: [{ storeId: source.storeId, productId: source.productId, variantId: source.variantId }], capturedAt,
    productionCommit: commit, policySnapshotId: value.input.expected.snapshotId,
    details: { stage: 'existing_pilot_only', sourceIds: [source.sourceId], runIds: ['pilot-1', 'pilot-2'], normalFeedCoverageMatch: true,
      queueProofIncluded: true, bootstrapSilent: true, genuinelyDue: true, manualDueReset: false } };
  const raw = json(body), digest = sha(raw);
  value.input.packetInput.evidence.push({ sha256: digest, bytes: raw.length, body: raw });
  value.input.packetInput.decisions[0].gates.observer = { status: 'evidence_present', artifactSha256: digest };
  const report = await reviewShopifyCanonicalContext(value.input); safe(report);
  assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers));
  const row = report.packet.sources.find((row: Row) => row.sourceId === source.sourceId);
  assert.equal(row.gates.baseline.status, 'blocked'); assert.equal(row.gates.observer.status, 'pending');
  assert.ok(row.gates.observer.blockers.includes('candidate_operational_acceptance_pending'));
  assert.equal(row.gates.preflight.status, 'pending'); assert.equal(row.captures.stale, true);
});
test('saved fixture replay clock cannot refresh actual context freshness', async () => {
  const value = await fixture(); value.input.packetInput.batchInput.now = value.input.now + 7 * 86400000;
  value.input.now += 3600001; await reject(value.input, 'capture_clock_stale_or_invalid');
});
test('production plaintext hash never substitutes for saved fixture Bible pin', async () => {
  const value = await fixture(); value.input.packetInput.batchInput.manifest.catalogSha256 = value.capture.provenance.exports[0].plaintextSha256;
  await reject(value.input, 'packet_selection_mismatch');
});
test('CLI consumes explicit bounded files, reports actual stale inventory, and cannot overwrite output', async () => {
  const value = await fixture(), current = Date.now(), at = current - 2000;
  value.capture.capturedAt = new Date(at).toISOString(); value.capture.generatedAt = new Date(at - 60000).toISOString();
  value.run.run_started_at = new Date(at - 60000).toISOString(); value.run.updated_at = new Date(at + 1000).toISOString();
  value.artifact.created_at = new Date(at + 500).toISOString(); value.artifact.expires_at = new Date(at + 86400000).toISOString(); value.bind();
  const directory = await mkdtemp(join(tmpdir(), 'bs-context-review-'));
  try {
    const data: Row = { context: value.input.contextBytes, archive: value.input.archiveBytes, run: value.input.runMetadataBytes,
      artifact: value.input.artifactMetadataBytes, expected: json(value.input.expected) };
    const args = Object.keys(data).map(key => `--${key}=${join(directory, key)}`), out = join(directory, 'review.json');
    await Promise.all(Object.keys(data).map(key => writeFile(join(directory, key), data[key])));
    const script = fileURLToPath(new URL('./prepare-shopify-canonical-context-review.mts', import.meta.url));
    const cwd = resolve(fileURLToPath(new URL('..', import.meta.url)));
    const execute = (extra: string[] = [], destination = out) => spawnSync(process.execPath, ['--import', 'tsx', script, ...args, `--out=${destination}`, ...extra], { cwd, encoding: 'utf8', maxBuffer: 65536 });
    const result = execute(); assert.equal(result.status, 0, result.stderr); const raw = await readFile(out), report = JSON.parse(raw.toString()); safe(report);
    assert.equal(report.integrityVerified, true); assert.equal(report.packet.batch.fixtureRequests, 10);
    assert.ok(report.packet.sources.every((row: Row) => row.captures.stale && row.gates.preflight.status === 'pending'));
    assert.equal(execute().status, 1); assert.deepEqual(await readFile(out), raw);
    assert.equal(execute(['--allow-production-authority=true']).status, 1); assert.deepEqual(await readFile(out), raw);
    assert.equal(execute(['--context=duplicate']).status, 1); assert.deepEqual(await readFile(out), raw);
    refreshed(value, current - 1000);
    const freshManifest = join(directory, 'fresh-config.json'), capturesFile = join(directory, 'fresh-captures.json');
    await writeFile(freshManifest, json(value.input.packetInput.batchInput.manifest));
    const entries = [];
    for (const [i, capture] of value.input.packetInput.batchInput.captures.entries()) {
      const file = `capture-${i}.body.raw`; await writeFile(join(directory, file), capture.body);
      entries.push({ file, requestedUrl: capture.url, finalUrl: capture.finalUrl, status: capture.status, capturedAt: capture.capturedAt,
        sha256: capture.sha256, bytes: capture.bytes });
    }
    await writeFile(capturesFile, json({ captures: entries }));
    const freshOut = join(directory, 'fresh-review.json');
    const refreshedRun = execute([`--manifest=${freshManifest}`, `--captures=${capturesFile}`], freshOut);
    assert.equal(refreshedRun.status, 0, refreshedRun.stderr);
    const freshReport = JSON.parse(await readFile(freshOut, 'utf8')); safe(freshReport);
    assert.equal(freshReport.integrityVerified, true); assert.equal(freshReport.packet.batch.fixtureRequests, 10);
    assert.ok(freshReport.packet.sources.every((row: Row) => !row.captures.stale && row.gates.preflight.status === 'pending'));
    assert.ok(freshReport.offlineBinding.configurations.every((row: Row) => row.captureEvidenceRefreshed));
    const partialOut = join(directory, 'partial-review.json');
    assert.equal(execute([`--manifest=${freshManifest}`], partialOut).status, 1);
    await assert.rejects(readFile(partialOut), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('ten refreshed real capture bodies/clocks bind new config hashes without changing reviewed identity or granting authority', async () => {
  const value = refreshed(await fixture()); value.input.packetInput.decisions[0].gates.baseline.status = 'blocked';
  const report = await reviewShopifyCanonicalContext(value.input); safe(report);
  assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers)); assert.equal(report.packet.batch.fixtureRequests, 10);
  assert.ok(report.packet.sources.every((row: Row) => !row.captures.stale && row.gates.preflight.status === 'pending' && row.gates.observer.status === 'pending'));
  assert.equal(report.packet.sources[0].gates.baseline.status, 'blocked');
  assert.ok(report.offlineBinding.configurations.every((row: Row) => row.captureEvidenceRefreshed && row.configSha256 !== row.reviewedConfigSha256));
  for (const evidence of report.canonicalEvidence) {
    const body = JSON.parse(evidence.body), source = value.input.packetInput.batchInput.manifest.sources.find((row: Row) => row.runtimeId === body.sourceId);
    assert.equal(body.configSha256, describeShopifyVariantSource(source, { collectorSha256: batch.manifest.collectorSha256 }).configSha256);
    assert.notEqual(body.configSha256, reviewed.find((row: Row) => row.sourceId === body.sourceId).configSha256);
    assert.equal(sha(evidence.body), evidence.sha256);
  }
});
for (const mode of ['host', 'variant', 'product', 'canonical', 'title', 'address', 'store', 'pickup name', 'section', 'merchant', 'chain', 'exception', 'new source', 'collector pin', 'helper pin', 'matcher pin', 'catalog pin', 'classification pin', 'evidence URL', 'evidence status', 'evidence private']) {
  test(`evidence refresh cannot alter reviewed identity/dependencies: ${mode}`, async () => {
    const value = refreshed(await fixture()), manifest = value.input.packetInput.batchInput.manifest, source = manifest.sources[0], product = source.products[0];
    if (mode === 'host') source.baseUrl = 'https://foreign.example';
    if (mode === 'variant') product.variantId = '123';
    if (mode === 'product') product.productId = '123';
    if (mode === 'canonical') product.canonicalName = 'Weller Single Barrel';
    if (mode === 'title') product.title = 'A new title';
    if (mode === 'address') source.stores[0].address += ' Unit 2';
    if (mode === 'store') source.stores[0].id = 'foreign-store';
    if (mode === 'pickup name') source.stores[0].pickupName = 'Foreign premise';
    if (mode === 'section') source.sectionId = 'store-availability';
    if (mode === 'merchant') source.merchantId = 'foreign-merchant';
    if (mode === 'chain') source.chain = 'foreign-chain';
    if (mode === 'exception') product.titleMapping.allowedUnsafeReasons.push('missing_age:10');
    if (mode === 'new source') manifest.sources.push(structuredClone(source));
    const pin: Row = { 'collector pin': 'collectorSha256', 'helper pin': 'premisesIdentitySha256', 'matcher pin': 'safeMatcherSha256', 'catalog pin': 'catalogSha256', 'classification pin': 'classificationSha256' };
    if (pin[mode]) manifest[pin[mode]] = '0'.repeat(64);
    if (mode === 'evidence URL') product.evidence.product.url += '?refresh=1';
    if (mode === 'evidence status') product.evidence.pickup.status = 403;
    if (mode === 'evidence private') product.evidence.pickup.private = { account: 'PRIVATE_CANARY' };
    await reject(value.input);
  });
}
test('every refreshed source capture clock is checked against actual review time despite future replay clock', async () => {
  const value = refreshed(await fixture()); const batchInput = value.input.packetInput.batchInput;
  batchInput.now = value.input.now + 86400000;
  batchInput.manifest.sources[4].products[0].evidence.pickup.capturedAt = new Date(value.input.now + 1).toISOString();
  await reject(value.input, 'source_capture_clock_invalid_or_future');
});
test('changing evidence bytes does not manufacture freshness for stale capture clocks', async () => {
  const value = refreshed(await fixture(), Date.parse('2026-10-23T16:57:00.000Z'));
  const report = await reviewShopifyCanonicalContext(value.input); safe(report); assert.equal(report.integrityVerified, true, JSON.stringify(report.blockers));
  assert.ok(report.packet.sources.every((row: Row) => row.captures.stale && row.gates.preflight.status === 'pending'));
});
test('old decision config hash cannot be silently relabeled as fresh evidence scope', async () => {
  const value = refreshed(await fixture()); value.input.packetInput.decisions[0].configSha256 = reviewed[0].configSha256;
  await reject(value.input, 'packet_decision_invalid_duplicate_or_foreign');
});
