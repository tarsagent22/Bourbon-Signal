import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadShopifyBatchInputs } from './prepare-shopify-onboarding.mts';
import { describeShopifyVariantSource } from '../engine/src/collectors/shopify-variant-pickup.mjs';
import { assembleShopifyAdmissionReviewPacket, SHOPIFY_ADMISSION_EVIDENCE_CONTRACT, SHOPIFY_ADMISSION_REVIEW_LIMITS, type ShopifyAdmissionReviewInput } from './lib/shopify-admission-review-packet.mts';

type Row = Record<string, any>;
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const loaded = await loadShopifyBatchInputs({ manifestFile: 'engine/data/shopify-pickup-onboarding-six-candidate-preparation-20261023.json',
  captureManifestFiles: ['engine/test/fixtures/shopify-variant-pickup/v3/manifest.json', 'engine/test/fixtures/shopify-variant-pickup/spirits4less-20261023/manifest.json'] });
const safeMatcherBytes = await readFile(new URL('../engine/src/collectors/safe-bottle-match.mjs', import.meta.url));
const catalog = JSON.parse(Buffer.from(loaded.catalogBytes).toString()).records;
const pins = { collectorSha256: sha(loaded.collectorBytes), premisesIdentitySha256: sha(loaded.premisesIdentityBytes), safeMatcherSha256: sha(safeMatcherBytes),
  catalogSha256: sha(loaded.catalogBytes), classificationSha256: sha(loaded.classificationBytes) };
const freshNow = Date.parse('2026-10-23T15:02:00.000Z');
const plans = loaded.manifest.sources.map((source: Row) => describeShopifyVariantSource(source, { collectorSha256: pins.collectorSha256 }));
function input(): ShopifyAdmissionReviewInput {
  return { batchInput: { ...structuredClone(loaded), now: freshNow }, safeMatcherBytes, evidence: [], now: freshNow,
    decisions: plans.map((plan: Row) => ({ sourceId: plan.source.runtimeId, configSha256: plan.configSha256,
      gates: Object.fromEntries(['baseline', 'canonical', 'preflight', 'observer'].map(kind => [kind, { status: 'pending' }])) })) };
}
function artifact(kind: string, index = 0): Row {
  const plan = plans[index], source = plan.source;
  const tuples = source.stores.flatMap((store: Row) => source.products.map((product: Row) => ({ storeId: store.id, productId: product.productId, variantId: product.variantId })));
  const details: Row = {
    baseline: { currentInventory: false, staleInventory: false, retainedInventory: false, directoryMatch: true,
      retailerCurrentRetainedIncluded: false, historicalAbsenceProven: false, historyGaps: ['retailer_current_retained_missing'], aliasReview: 'exact', outcome: 'directory_reuse_context' },
    canonical: { authority: 'saved_fixture', bindings: tuples.map((tuple: Row) => {
      const seed = source.products.find((row: Row) => row.variantId === tuple.variantId), record = catalog.find((row: Row) => row.canonical === seed.canonicalName);
      return { ...tuple, canonicalBottleId: record.id, canonicalName: record.canonical, canonicalTier: record.tier,
        marketTier: source.state === 'NY' ? 'allocated' : record.canonical === 'Elijah Craig Barrel Proof' ? 'limited' : record.tier };
    }) },
    preflight: { captureSha256s: source.products.flatMap((product: Row) => [product.evidence.product.sha256, product.evidence.pickup.sha256]),
      access: 'permitted', requestCount: plan.requestCount, redirects: 0, retries: 0 },
    observer: { stage: 'plan_only', sourceIds: [source.runtimeId], runIds: [], normalFeedCoverageMatch: false, queueProofIncluded: false,
      bootstrapSilent: false, genuinelyDue: false, manualDueReset: false },
  };
  return { contractVersion: SHOPIFY_ADMISSION_EVIDENCE_CONTRACT, kind, sourceId: source.runtimeId, configSha256: plan.configSha256,
    dependencyPins: pins, tuples, capturedAt: '2026-10-23T15:01:00.000Z', productionCommit: 'a'.repeat(40), policySnapshotId: 'synthetic-test-only-snapshot', details: details[kind] };
}
function attach(value: ShopifyAdmissionReviewInput, body: Row, index = 0) {
  const bytes = Buffer.from(JSON.stringify(body)), digest = sha(bytes);
  value.evidence!.push({ sha256: digest, bytes: bytes.length, body: bytes });
  (value.decisions![index].gates as Row)[body.kind] = { status: 'evidence_present', artifactSha256: digest };
  return digest;
}
function safe(report: Row) {
  assert.deepEqual(report.admissions, []); assert.deepEqual(report.descriptors, []); assert.equal(report.activated, false);
  assert.equal(report.acceptedNewStores, 0); assert.equal(report.requiresExplicitLeadReview, true);
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= SHOPIFY_ADMISSION_REVIEW_LIMITS.outputBytes);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY')); assert.ok(!('body' in report));
}

test('actual six-source offline batch binds five dependencies and prepares pending decisions without network or admission', async () => {
  const value = input(), before = sha(JSON.stringify(value.batchInput.manifest)), oldFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw Error('Network forbidden'); }) as any;
  let report: Row;
  try { report = await assembleShopifyAdmissionReviewPacket(value); } finally { globalThis.fetch = oldFetch; }
  assert.deepEqual(report.blockers, []); assert.equal(report.sources.length, 6); assert.equal(report.batch.fixtureRequests, 12);
  assert.equal(report.batch.fixtureBytes, 35334); assert.deepEqual(report.dependencyPins, pins);
  assert.ok(report.sources.every((row: Row) => Object.values(row.gates).every((gate: any) => gate.status === 'pending')));
  assert.equal(sha(JSON.stringify(value.batchInput.manifest)), before); safe(report);
  const { packetSha256, ...bytes } = report; assert.equal(packetSha256, sha(JSON.stringify(bytes)));
});

test('actual current review clock independently marks old pairs stale even when replay uses its saved fresh clock', async () => {
  const value = input(); value.now = Date.parse('2026-10-23T17:00:00.000Z');
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.batch.fixtureCompatibleSources, 6); assert.equal(report.batch.generatedAt, new Date(freshNow).toISOString());
  assert.ok(report.sources.every((row: Row) => row.captures.stale && row.gates.preflight.blockers.includes('actual_capture_clock_stale_or_invalid'))); safe(report);
});

for (const mode of ['fake bytes', 'missing pin', 'wrong pin']) test(`matcher authority rejects ${mode} independently of caller labels`, async () => {
  const value = input();
  if (mode === 'fake bytes') { value.safeMatcherBytes = Buffer.from('PRIVATE_CANARY'); value.batchInput.manifest.reuseAssessment.actualSha256 = sha(value.safeMatcherBytes); }
  if (mode === 'missing pin') delete value.batchInput.manifest.reuseAssessment;
  if (mode === 'wrong pin') value.batchInput.manifest.reuseAssessment.actualSha256 = '0'.repeat(64);
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.ok(report.blockers.some((code: string) => code.startsWith('safe_matcher_'))); assert.equal(report.sources.length, 0); safe(report);
});

test('hash-bound baseline evidence preserves directory/current/stale/retained and gap distinctions without granting newness', async () => {
  const value = input(), body = artifact('baseline'); body.details.retainedInventory = true;
  attach(value, body); const report = await assembleShopifyAdmissionReviewPacket(value), gate = report.sources[0].gates.baseline;
  assert.equal(gate.status, 'pending'); assert.equal(gate.baseline.currentInventory, false); assert.equal(gate.baseline.retainedInventory, true);
  assert.equal(gate.baseline.directoryMatch, true); assert.deepEqual(gate.baseline.historyGaps, ['retailer_current_retained_missing']);
  assert.ok(gate.caveats.includes('directory_context_is_not_newness_proof')); assert.ok(gate.blockers.includes('prior_inventory_requires_explicit_classification')); safe(report);
});

test('saved canonical artifact is fixture context and plan-only observer is not operational acceptance', async () => {
  const value = input(); attach(value, artifact('canonical')); attach(value, artifact('observer'));
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.sources[0].gates.canonical.status, 'pending'); assert.equal(report.sources[0].gates.observer.status, 'pending'); safe(report);
});

test('existing pilot observations cannot satisfy a new candidate even in a hash-valid artifact', async () => {
  const value = input(), body = artifact('observer'); body.details.stage = 'existing_pilot_only'; body.details.sourceIds = ['fl:jensens-miami'];
  attach(value, body); const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.sources[0].gates.observer.status, 'rejected'); safe(report);
});

test('even internally consistent synthetic evidence for every gate remains nonexecutable', async () => {
  const value = input();
  for (const kind of ['baseline', 'canonical', 'preflight', 'observer']) {
    const body = artifact(kind);
    if (kind === 'baseline') Object.assign(body.details, { directoryMatch: false, retailerCurrentRetainedIncluded: true, historyGaps: [], outcome: 'no_match_in_captured_scope' });
    if (kind === 'canonical') body.details.authority = 'production_snapshot';
    if (kind === 'observer') Object.assign(body.details, { stage: 'candidate_runs', runIds: ['synthetic-test-run-1', 'synthetic-test-run-2'],
      normalFeedCoverageMatch: true, queueProofIncluded: true, bootstrapSilent: true, genuinelyDue: true });
    attach(value, body);
  }
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.ok(Object.values(report.sources[0].gates).every((gate: any) => gate.status === 'evidence_present'));
  assert.equal(report.sources[0].reviewReady, false); safe(report);
});

for (const mode of ['hash tamper', 'wrong bytes', 'foreign source', 'wrong config', 'wrong dependency', 'foreign tuple', 'future', 'bad UTC', 'private field', 'private nested']) {
  test(`forged/malformed supplied evidence fails closed: ${mode}`, async () => {
    const value = input(), body = artifact('preflight');
    if (mode === 'foreign source') body.sourceId = 'fl:unknown-source';
    if (mode === 'wrong config') body.configSha256 = '0'.repeat(64);
    if (mode === 'wrong dependency') body.dependencyPins = { ...pins, safeMatcherSha256: '0'.repeat(64) };
    if (mode === 'foreign tuple') body.tuples[0].variantId = '999';
    if (mode === 'future') body.capturedAt = '2027-01-01T00:00:00.000Z';
    if (mode === 'bad UTC') body.capturedAt = '2026-10-23';
    if (mode === 'private field') body.privateAccount = { note: 'PRIVATE_CANARY' };
    if (mode === 'private nested') body.details.privateContact = { note: 'PRIVATE_CANARY' };
    attach(value, body);
    if (mode === 'hash tamper') value.evidence![0].body = Buffer.from('PRIVATE_CANARY');
    if (mode === 'wrong bytes') value.evidence![0].bytes++;
    const report = await assembleShopifyAdmissionReviewPacket(value);
    assert.ok(report.blockers.length || report.sources[0].gates.preflight.status === 'rejected'); safe(report);
  });
}

test('receipt reuse across a different source or gate is rejected', async () => {
  const value = input(), digest = attach(value, artifact('preflight'));
  value.decisions![1].gates.preflight = { status: 'evidence_present', artifactSha256: digest };
  value.decisions![0].gates.canonical = { status: 'evidence_present', artifactSha256: digest };
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.sources[1].gates.preflight.status, 'rejected'); assert.equal(report.sources[0].gates.canonical.status, 'rejected'); safe(report);
});

test('duplicate receipts, duplicate decisions and unreferenced receipts are explicit blockers', async () => {
  for (const mode of ['duplicate receipt', 'duplicate decision', 'unreferenced']) {
    const value = input(); attach(value, artifact('preflight'));
    if (mode === 'duplicate receipt') value.evidence!.push(value.evidence![0]);
    if (mode === 'duplicate decision') value.decisions!.push(value.decisions![0]);
    if (mode === 'unreferenced') value.decisions![0].gates.preflight = { status: 'pending' };
    const report = await assembleShopifyAdmissionReviewPacket(value); assert.ok(report.blockers.length); safe(report);
  }
});

test('bare approvals and nested private decision data cannot become a passing gate or leak', async () => {
  const value = input(); (value.decisions![0].gates as Row).preflight = { status: 'approved', private: 'PRIVATE_CANARY' };
  (value.decisions![1] as Row).privateUser = { secret: 'PRIVATE_CANARY' };
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.sources[0].gates.preflight.status, 'rejected'); assert.equal(report.sources[1].gates.preflight.status, 'pending'); safe(report);
});

test('evidence_present without supplied bytes and stale approved-looking preflight remain pending or rejected', async () => {
  const value = input(); value.decisions![0].gates.preflight = { status: 'evidence_present', artifactSha256: 'a'.repeat(64) };
  let report = await assembleShopifyAdmissionReviewPacket(value); assert.equal(report.sources[0].gates.preflight.status, 'rejected');
  const old = input(); attach(old, artifact('preflight')); old.now = Date.parse('2026-10-23T17:00:00.000Z');
  report = await assembleShopifyAdmissionReviewPacket(old); assert.equal(report.sources[0].gates.preflight.status, 'pending'); safe(report);
});

test('cross-artifact production contexts must agree for a candidate', async () => {
  const value = input(); attach(value, artifact('preflight')); const other = artifact('canonical'); other.productionCommit = 'b'.repeat(40); attach(value, other);
  const report = await assembleShopifyAdmissionReviewPacket(value); assert.ok(report.sources[0].blockers.includes('candidate_production_context_conflict')); safe(report);
});

test('oversized body and total input reject before parsing or hashing; oversized counts are bounded', async () => {
  for (const mode of ['artifact', 'total', 'sources', 'premises']) {
    const value = input();
    if (mode === 'artifact') value.evidence!.push({ sha256: '0'.repeat(64), bytes: 2 * 1024 * 1024 + 1, body: Buffer.alloc(2 * 1024 * 1024 + 1) });
    if (mode === 'total') value.evidence = Array.from({ length: 17 }, () => ({ sha256: '0'.repeat(64), bytes: 2 * 1024 * 1024, body: Buffer.alloc(2 * 1024 * 1024) }));
    if (mode === 'sources') value.batchInput.manifest.sources = Array(11).fill(value.batchInput.manifest.sources[0]);
    if (mode === 'premises') value.batchInput.manifest.sources[0].stores = Array(26).fill(value.batchInput.manifest.sources[0].stores[0]);
    const report = await assembleShopifyAdmissionReviewPacket(value); assert.ok(report.blockers.length); assert.equal(report.sources.length, 0); safe(report);
  }
});


test('an eligible but incorrect state market tier cannot replace the hash-bound classification', async () => {
  const value = input(), body = artifact('canonical');
  body.details.authority = 'production_snapshot'; body.details.bindings[0].marketTier = 'unicorn'; attach(value, body);
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.sources[0].gates.canonical.status, 'rejected'); safe(report);
});

test('a later saved replay clock cannot hide one future pickup behind an earlier product capture', async () => {
  const value = input(), source = value.batchInput.manifest.sources[0];
  const productAt = Date.parse(source.products[0].evidence.product.capturedAt), pickupAt = Date.parse(source.products[0].evidence.pickup.capturedAt);
  assert.ok(pickupAt > productAt); value.now = productAt + 1;
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.batch.fixtureCompatibleSources, 6); assert.ok(report.sources[0].captures.ageMs >= 0);
  assert.equal(report.sources[0].captures.stale, true); assert.ok(report.sources[0].gates.preflight.blockers.includes('actual_capture_clock_stale_or_invalid')); safe(report);
});


test('directory reuse and older/pruned history are review caveats, while missing retailer scope still blocks evidence readiness', async () => {
  const value = input(), body = artifact('baseline');
  Object.assign(body.details, { retailerCurrentRetainedIncluded: true, aliasReview: 'reviewed_alias',
    historyGaps: ['older_pruned_history_unknown', 'deleted_submissions_unavailable'], outcome: 'directory_reuse_context' });
  attach(value, body);
  let report = await assembleShopifyAdmissionReviewPacket(value), gate = report.sources[0].gates.baseline;
  assert.equal(gate.status, 'evidence_present'); assert.deepEqual(gate.blockers, []);
  assert.ok(gate.caveats.includes('directory_context_is_not_newness_proof'));
  assert.ok(gate.caveats.includes('bounded_history_gaps_retained_for_lead_review')); safe(report);
  const missing = input(), pending = structuredClone(body); pending.details.retailerCurrentRetainedIncluded = false; attach(missing, pending);
  report = await assembleShopifyAdmissionReviewPacket(missing); gate = report.sources[0].gates.baseline;
  assert.equal(gate.status, 'pending'); assert.ok(gate.blockers.includes('retailer_current_retained_scope_pending')); safe(report);
});

test('explicit recovery context can represent prior inventory without inventing a net-new connection', async () => {
  const value = input(), body = artifact('baseline');
  Object.assign(body.details, { retainedInventory: true, retailerCurrentRetainedIncluded: true,
    historyGaps: ['older_pruned_history_unknown'], outcome: 'recovery_context' }); attach(value, body);
  const report = await assembleShopifyAdmissionReviewPacket(value);
  assert.equal(report.sources[0].gates.baseline.status, 'evidence_present');
  assert.equal(report.sources[0].gates.baseline.baseline.retainedInventory, true); safe(report);
});
