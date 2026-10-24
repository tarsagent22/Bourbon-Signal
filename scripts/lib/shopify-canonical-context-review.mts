import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { unzipSync } from 'fflate';
import { CANONICAL_CONTEXT_CAPTURE_LIMITS, CANONICAL_CONTEXT_DEPENDENCY_FILES, CANONICAL_CONTEXT_SELECTION, CANONICAL_CONTEXT_STATE_PAIRS } from './shopify-canonical-context-capture.mts';
import { assembleShopifyAdmissionReviewPacket, SHOPIFY_ADMISSION_EVIDENCE_CONTRACT, type ShopifyAdmissionReviewInput } from './shopify-admission-review-packet.mts';
import { validateShopifyVariantSource, describeShopifyVariantSource } from '../../engine/src/collectors/shopify-variant-pickup.mjs';
import * as classificationModule from '../../src/lib/drop-classification.ts';

type Row = Record<string, any>;
type Bytes = string | Uint8Array;
export const SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS = Object.freeze({ contextBytes: 65536, archiveBytes: 262144,
  runMetadataBytes: 131072, artifactMetadataBytes: 65536, captureAgeMs: 3600000, snapshotAgeMs: 7 * 86400000, outputBytes: 768 * 1024 });
export type ShopifyCanonicalContextReviewInput = {
  packetInput: ShopifyAdmissionReviewInput;
  contextBytes: Bytes; archiveBytes: Uint8Array; runMetadataBytes: Bytes; artifactMetadataBytes: Bytes;
  expected: { producerCommit: string; runId: string; runAttempt: number; artifactId: string; artifactSha256: string;
    contextSha256: string; runMetadataSha256: string; artifactMetadataSha256: string; snapshotId: string; pointerSha256: string };
  now?: number;
};
const classification = (classificationModule as any).default || classificationModule;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const size = (value: unknown) => typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.byteLength : Infinity;
const bytes = (value: Bytes) => Buffer.from(value);
const isHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const closed = (value: unknown, keys: string[]): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const utc = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) return NaN;
  const at = Date.parse(value);
  const normalized = value.includes('.') ? value : value.slice(0, -1) + '.000Z';
  return Number.isFinite(at) && new Date(at).toISOString() === normalized ? at : NaN;
};
// REST metadata often truncates to whole seconds. Its upper bound is that
// second's final millisecond, not an exemption from the actual review clock.
const metadataUpper = (value: string) => utc(value) + (value.includes('.') ? 0 : 999);
const id = (value: unknown) => typeof value === 'string' && /^[1-9]\d{0,19}$/u.test(value);
const githubId = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0 ? String(value) : '';
const eligible = (value: unknown) => typeof value === 'string' && ['limited', 'allocated', 'unicorn'].includes(value);
const sameFields = (actual: Row, expected: Row, keys: string[]) => keys.every(key => actual[key] === expected[key]);
class ReviewError extends Error { constructor(public code: string) { super(code); } }
const fail = (code: string): never => { throw new ReviewError(code); };
async function fixed(file: string, cap = 2 * 1024 * 1024) {
  const handle = await open(new URL(`../../${file}`, import.meta.url), 'r');
  try {
    const stat = await handle.stat(); if (!stat.isFile() || stat.size < 1 || stat.size > cap) fail('fixed_file_size_invalid');
    const value = Buffer.alloc(stat.size + 1), result = await handle.read(value, 0, value.length, 0);
    if (result.bytesRead !== stat.size) fail('fixed_file_changed'); return value.subarray(0, result.bytesRead);
  } finally { await handle.close(); }
}
function parse(value: Bytes) {
  const raw = bytes(value), text = raw.toString('utf8');
  if (!Buffer.from(text).equals(raw)) fail('input_utf8_invalid');
  try { return JSON.parse(text); } catch { fail('input_json_invalid'); }
}

/**
 * Offline, nonexecutable join, never a provider-authentication or admission API.
 * Expected hashes and downloaded GHA JSON can check integrity against a separately
 * obtained reference, but supplied bytes cannot authenticate their own origin.
 * Therefore EVEN a coherent synthetic bundle stays authentication_pending and its
 * derived canonical decisions stay pending. No boolean supplied by a caller can
 * upgrade that boundary. Authenticated GitHub acquisition and explicit lead review remain outside this pure offline join. Exact derived UTF-8 receipt bodies are returned for that review; they are never operational authority.
 * Only local I/O is bounded reads of FIXED reviewed files. No caller paths, git,
 * environment, credentials, network, source fetches, storage or database adapters.
 */
export async function reviewShopifyCanonicalContext(input: ShopifyCanonicalContextReviewInput) {
  const now = input?.now ?? Date.now();
  const report: Row = { contractVersion: 'bourbon-signal/shopify-canonical-context-review@2',
    scope: 'offline_integrity_review_not_authenticated_production_authority', generatedAt: Number.isFinite(now) && Number.isFinite(new Date(now).getTime()) ? new Date(now).toISOString() : null,
    integrityVerified: false, productionAuthorityVerified: false, authentication: 'pending', canonicalEvidence: [], packet: null,
    blockers: [], admissions: [], descriptors: [], activated: false, acceptedNewStores: 0, requiresExplicitLeadReview: true,
    caveats: ['Supplied workflow metadata and expected hashes do not authenticate their own provider origin.',
      'Fixed local file comparisons reproduce reviewed dependencies; they do not attest files present in a remote producer checkout.',
      'Canonical policy is not pickup freshness, baseline reconciliation, candidate observation, newness, admission or activation.'] };
  try {
    if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) fail('review_clock_invalid');
    const caps = [SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.contextBytes, SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.archiveBytes,
      SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.runMetadataBytes, SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.artifactMetadataBytes];
    const supplied = [input.contextBytes, input.archiveBytes, input.runMetadataBytes, input.artifactMetadataBytes];
    if (supplied.some((value, index) => size(value) < 1 || size(value) > caps[index]) || !(input.archiveBytes instanceof Uint8Array)) fail('input_byte_limit_or_type');
    const expected = input.expected;
    if (!closed(expected, ['producerCommit', 'runId', 'runAttempt', 'artifactId', 'artifactSha256', 'contextSha256', 'runMetadataSha256', 'artifactMetadataSha256', 'snapshotId', 'pointerSha256'])
      || typeof expected.producerCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(expected.producerCommit) || !id(expected.runId) || !id(expected.artifactId)
      || !Number.isSafeInteger(expected.runAttempt) || expected.runAttempt < 1 || typeof expected.snapshotId !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/u.test(expected.snapshotId)
      || !['artifactSha256', 'contextSha256', 'runMetadataSha256', 'artifactMetadataSha256', 'pointerSha256'].every(key => isHash((expected as Row)[key]))) fail('expected_context_invalid');
    if (hash(input.contextBytes) !== expected.contextSha256 || hash(input.archiveBytes) !== expected.artifactSha256
      || hash(input.runMetadataBytes) !== expected.runMetadataSha256 || hash(input.artifactMetadataBytes) !== expected.artifactMetadataSha256) fail('raw_hash_mismatch');
    const run = parse(input.runMetadataBytes), artifact = parse(input.artifactMetadataBytes), capture = parse(input.contextBytes);
    if (githubId(run?.id) !== expected.runId || run.run_attempt !== expected.runAttempt || run.head_sha !== expected.producerCommit
      || run.head_branch !== 'main' || run.path !== '.github/workflows/shopify-canonical-context-read.yml'
      || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success'
      || run.repository?.full_name !== 'tarsagent22/Bourbon-Signal' || run.head_repository?.full_name !== 'tarsagent22/Bourbon-Signal'
      || !githubId(run.repository?.id) || run.head_repository?.id !== run.repository.id) fail('workflow_lineage_mismatch');
    if (githubId(artifact?.id) !== expected.artifactId || artifact.name !== `shopify-canonical-context-${expected.runId}` || artifact.expired !== false
      || artifact.digest !== `sha256:${expected.artifactSha256}` || artifact.size_in_bytes !== size(input.archiveBytes)
      || githubId(artifact.workflow_run?.id) !== expected.runId || artifact.workflow_run?.head_sha !== expected.producerCommit
      || artifact.workflow_run?.head_branch !== 'main' || artifact.workflow_run?.repository_id !== run.repository.id
      || artifact.workflow_run?.head_repository_id !== run.repository.id) fail('artifact_lineage_mismatch');
    const start = utc(run.run_started_at), finish = utc(run.updated_at), created = utc(artifact.created_at), expires = utc(artifact.expires_at);
    if (![start, finish, created, expires].every(Number.isFinite) || start > finish || finish > now || created < start || created > finish || expires <= now) fail('workflow_clock_invalid_or_expired');
    let members = 0, archiveMember: Uint8Array;
    try {
      const archive = unzipSync(input.archiveBytes, { filter: entry => {
        if (++members !== 1 || entry.name !== 'shopify-canonical-context.json' || entry.originalSize !== size(input.contextBytes)
          || entry.originalSize > SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.contextBytes || ![0, 8].includes(entry.compression)) fail('archive_member_invalid');
        return true;
      } });
      if (members !== 1 || Object.keys(archive).length !== 1) fail('archive_member_invalid');
      archiveMember = archive['shopify-canonical-context.json'];
    } catch { fail('archive_member_invalid'); }
    if (!Buffer.from(archiveMember!).equals(bytes(input.contextBytes))) fail('archive_raw_member_mismatch');
    if (!closed(capture, ['contractVersion', 'scope', 'capturedAt', 'expectedProductionCommit', 'producerCommit', 'producerRunId', 'activeSnapshotId', 'activePointerSha256', 'generatedAt', 'selectionSha256', 'canonicalRows', 'stateClassifications', 'provenance', 'accounting', 'limits', 'admissions', 'descriptors', 'activated', 'acceptedNewStores', 'requiresExplicitLeadReview', 'caveats'])
      || capture.contractVersion !== 'bourbon-signal/selected-canonical-context@2' || capture.scope !== 'read_only_canonical_context_no_inventory_or_admission'
      || capture.activated !== false || capture.acceptedNewStores !== 0 || capture.requiresExplicitLeadReview !== true
      || !Array.isArray(capture.admissions) || capture.admissions.length !== 0 || !Array.isArray(capture.descriptors) || capture.descriptors.length !== 0 || capture.producerCommit !== expected.producerCommit
      || capture.expectedProductionCommit !== expected.producerCommit || capture.producerRunId !== expected.runId || capture.activeSnapshotId !== expected.snapshotId
      || capture.activePointerSha256 !== expected.pointerSha256) fail('capture_context_mismatch');
    const captured = utc(capture.capturedAt), generated = utc(capture.generatedAt);
    if (!Number.isFinite(captured) || !Number.isFinite(generated) || captured < start || captured > metadataUpper(artifact.created_at) || captured > metadataUpper(run.updated_at) || captured > now
      || now - captured > SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.captureAgeMs || generated > captured || now - generated > SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.snapshotAgeMs) fail('capture_clock_stale_or_invalid');
    const provenanceKeys = ['manifestSha256', 'exports', 'classificationDataSha256', 'classificationImplementationSha256',
      'beforeReleaseSha256', 'afterReleaseSha256', 'dependencyScope'];
    const p = capture.provenance;
    if (!closed(p, provenanceKeys) || provenanceKeys.filter(key => key.endsWith('Sha256')).some(key => !isHash(p[key]))
      || p.dependencyScope !== 'classification_data_and_implementation_only_not_all_transitive_hashes') fail('capture_provenance_invalid');
    // These two hashes establish reproducibility of the production classification
    // proof. Planned connector/config/fixture hashes are SEPARATE offline inputs.
    const local: Row = {};
    for (const [key, file] of Object.entries(CANONICAL_CONTEXT_DEPENDENCY_FILES)) local[key] = await fixed(file);
    if (hash(local.classification) !== p.classificationDataSha256 || hash(local.classificationImplementation) !== p.classificationImplementationSha256)
      fail('fixed_production_classification_hash_mismatch');
    const preparationFiles = { collector: 'engine/src/collectors/shopify-variant-pickup.mjs', premisesIdentity: 'engine/src/collectors/shopify-premises-identity.mjs',
      safeMatcher: 'engine/src/collectors/safe-bottle-match.mjs', catalog: 'engine/test/fixtures/shopify-variant-pickup/current-bourbon-bible.json' };
    for (const [key, file] of Object.entries(preparationFiles)) local[key] = await fixed(file);
    const manifestBytes = await fixed('engine/data/shopify-pickup-next-five-review-20261023.json', 256 * 1024);
    const bindingBytes = await fixed('engine/data/shopify-next-five-policy-bindings-20261024.json', 65536);
    const manifest = parse(manifestBytes), bindingFile = parse(bindingBytes), reviewed = bindingFile?.bindings;
    if (!closed(bindingFile, ['schemaVersion', 'scope', 'bindings']) || bindingFile.schemaVersion !== 1
      || bindingFile.scope !== 'read_only_policy_capture_bindings_no_admission_or_activation'
      || !Array.isArray(reviewed) || reviewed.length !== 5 || !Array.isArray(capture.stateClassifications) || capture.stateClassifications.length !== 5
      || !Array.isArray(capture.canonicalRows) || capture.canonicalRows.length !== 4) fail('selection_count_invalid');
    const submittedManifest = input.packetInput?.batchInput?.manifest;
    if (!Array.isArray(submittedManifest?.sources) || submittedManifest.sources.length !== 5) fail('packet_selection_mismatch');
    // @2 production capture deliberately has no merchant tuple/config binding.
    // Refresh ONLY the two evidence hashes/clocks for each reviewed product.
    // URL/status and every other config, exception and dependency field retain
    // exact equality to the fixed reviewed preparation manifest. A new capture
    // changes configSha256; it is not the old reviewed source's byte identity.
    const identityOnly = { ...submittedManifest, sources: submittedManifest.sources.map((source: Row, i: number) => {
      const original = manifest.sources[i];
      if (!source || !Array.isArray(source.products) || source.products.length !== original.products.length) fail('packet_selection_mismatch');
      return { ...source, products: source.products.map((product: Row, j: number) => {
        if (!product || !closed(product.evidence, ['product', 'pickup'])) fail('packet_capture_evidence_invalid');
        for (const kind of ['product', 'pickup']) {
          const receipt = product.evidence[kind], fixedReceipt = original.products[j].evidence[kind];
          if (!closed(receipt, ['url', 'sha256', 'capturedAt', 'status']) || receipt.url !== fixedReceipt.url || receipt.status !== fixedReceipt.status
            || !isHash(receipt.sha256)) fail('packet_capture_evidence_invalid');
          if (typeof receipt.capturedAt !== 'string' || !/\.\d{3}Z$/u.test(receipt.capturedAt)
            || !Number.isFinite(utc(receipt.capturedAt)) || utc(receipt.capturedAt) > now) fail('source_capture_clock_invalid_or_future');
        }
        return { ...product, evidence: original.products[j].evidence };
      }) };
    }) };
    if (!isDeepStrictEqual(identityOnly, manifest)) fail('packet_selection_mismatch');
    const pins: Row = { collectorSha256: hash(local.collector), premisesIdentitySha256: hash(local.premisesIdentity), safeMatcherSha256: hash(local.safeMatcher),
      catalogSha256: hash(local.catalog), classificationSha256: hash(local.classification) };
    if (!Object.keys(pins).every(key => manifest[key] === pins[key])) fail('manifest_pin_mismatch');
    const contextInputs = [input.packetInput.safeMatcherBytes, input.packetInput.batchInput.catalogBytes, input.packetInput.batchInput.classificationBytes,
      input.packetInput.batchInput.collectorBytes, input.packetInput.batchInput.premisesIdentityBytes];
    const contextCaps = [128 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024, 128 * 1024, 128 * 1024];
    if (contextInputs.some((value, i) => size(value) < 1 || size(value) > contextCaps[i])) fail('packet_dependency_byte_limit');
    if (!bytes(input.packetInput.safeMatcherBytes).equals(local.safeMatcher) || !bytes(input.packetInput.batchInput.catalogBytes).equals(local.catalog)
      || !bytes(input.packetInput.batchInput.classificationBytes).equals(local.classification) || !bytes(input.packetInput.batchInput.collectorBytes).equals(local.collector)
      || !bytes(input.packetInput.batchInput.premisesIdentityBytes!).equals(local.premisesIdentity)) fail('packet_dependency_mismatch');
    const reviewedPlans = manifest.sources.map((source: Row) => describeShopifyVariantSource(validateShopifyVariantSource(source), { collectorSha256: pins.collectorSha256 }));
    const plans = submittedManifest.sources.map((source: Row) => describeShopifyVariantSource(validateShopifyVariantSource(source), { collectorSha256: pins.collectorSha256 }));
    const selected = new Map<string, Row>(), markets = new Map<string, Row>(), bindings = new Map<string, Row>();
    const sorted = (value: any): any => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
    if (capture.selectionSha256 !== hash(JSON.stringify(sorted({ canonicalRows: CANONICAL_CONTEXT_SELECTION, statePairs: CANONICAL_CONTEXT_STATE_PAIRS })))) fail('selection_hash_mismatch');
    for (const row of capture.canonicalRows) {
      if (!closed(row, ['canonicalId', 'canonicalName', 'canonicalTier']) || !CANONICAL_CONTEXT_SELECTION.some(binding => row.canonicalId === binding.canonicalId && row.canonicalName === binding.canonicalName)
        || !eligible(row.canonicalTier) || selected.has(row.canonicalId)) fail('canonical_identity_or_tier_invalid');
      selected.set(row.canonicalId, row);
    }
    const index = classification.getDropClassificationIndex(parse(local.classification).records);
    for (const row of capture.stateClassifications) {
      if (!closed(row, ['state', 'canonicalId', 'marketTier', 'classificationSource'])
        || !CANONICAL_CONTEXT_STATE_PAIRS.some(pair => pair.state === row.state && pair.canonicalId === row.canonicalId)
        || markets.has(`${row.state}:${row.canonicalId}`)) fail('state_classification_selection_invalid');
      const canonicalRow = selected.get(row.canonicalId)!;
      const market = classification.resolveDropClassification({ state: row.state, canonical_id: row.canonicalId, canonical_name: canonicalRow.canonicalName, tier: canonicalRow.canonicalTier }, index);
      if (!eligible(row.marketTier) || market.source === 'signal' || market.tier !== row.marketTier || market.source !== row.classificationSource) fail('market_classification_mismatch');
      markets.set(`${row.state}:${row.canonicalId}`, row);
    }
    for (const binding of reviewed) {
      const plan = plans.find((item: Row) => item.source.runtimeId === binding?.sourceId), canonicalRow = selected.get(binding?.canonicalId);
      const reviewedPlan = reviewedPlans.find((item: Row) => item.source.runtimeId === binding?.sourceId);
      if (!closed(binding, ['sourceId', 'configSha256', 'state', 'storeId', 'productId', 'variantId', 'canonicalId', 'canonicalName'])
        || !plan || !canonicalRow || !markets.has(`${binding.state}:${binding.canonicalId}`) || bindings.has(binding.sourceId)
        || reviewedPlan?.configSha256 !== binding.configSha256 || plan.source.state !== binding.state || plan.source.stores.length !== 1 || plan.source.products.length !== 1
        || plan.source.stores[0].id !== binding.storeId || plan.source.products[0].productId !== binding.productId || plan.source.products[0].variantId !== binding.variantId
        || plan.source.products[0].canonicalName !== binding.canonicalName || canonicalRow.canonicalName !== binding.canonicalName) fail('offline_source_tuple_or_canonical_mismatch');
      bindings.set(binding.sourceId, { ...binding, configSha256: plan.configSha256, reviewedConfigSha256: binding.configSha256,
        marketTier: markets.get(`${binding.state}:${binding.canonicalId}`)!.marketTier });
    }
    const exports = p.exports;
    if (!Array.isArray(exports) || exports.length !== 3 || new Set(exports.map((row: Row) => row?.name)).size !== 3
      || exports.some((row: Row) => !closed(row, ['name', 'descriptorBytes', 'plaintextSha256', 'encryptedObjectSha256', 'encryptedObjectBytes'])
        || !['bottles', 'state-health', 'alerts'].includes(row.name) || !isHash(row.plaintextSha256) || !isHash(row.encryptedObjectSha256)
        || !Number.isSafeInteger(row.descriptorBytes) || row.descriptorBytes < 1 || row.descriptorBytes > CANONICAL_CONTEXT_CAPTURE_LIMITS.plaintextObjectBytes
        || !Number.isSafeInteger(row.encryptedObjectBytes) || row.encryptedObjectBytes < 1 || row.encryptedObjectBytes > CANONICAL_CONTEXT_CAPTURE_LIMITS.encryptedObjectBytes)) fail('export_hash_or_bounds_invalid');
    const limitKeys = Object.keys(CANONICAL_CONTEXT_CAPTURE_LIMITS), a = capture.accounting;
    if (!closed(capture.limits, limitKeys) || limitKeys.some(key => !Number.isSafeInteger(capture.limits[key]) || capture.limits[key] < 1 || capture.limits[key] > (CANONICAL_CONTEXT_CAPTURE_LIMITS as Row)[key])
      || !closed(a, ['immutableReads', 'pointerReads', 'releaseReads', 'immutableBytes', 'declaredPlaintextBytes', 'elapsedMs'])
      || Object.values(a).some(value => !Number.isSafeInteger(value) || Number(value) < 0)
      || a.immutableReads !== 4 || a.pointerReads !== 2 || a.releaseReads !== 2 || a.immutableReads > capture.limits.immutableReads
      || a.pointerReads > capture.limits.pointerReads || a.releaseReads > capture.limits.releaseReads || a.elapsedMs > capture.limits.totalElapsedMs
      || a.declaredPlaintextBytes !== exports.reduce((sum: number, row: Row) => sum + row.descriptorBytes, 0)
      || a.declaredPlaintextBytes > capture.limits.plaintextTotalBytes || a.immutableBytes <= exports.reduce((sum: number, row: Row) => sum + row.encryptedObjectBytes, 0)
      || a.immutableBytes - exports.reduce((sum: number, row: Row) => sum + row.encryptedObjectBytes, 0) > capture.limits.manifestBytes
      || exports.some((row: Row) => row.descriptorBytes > capture.limits.plaintextObjectBytes || row.encryptedObjectBytes > capture.limits.encryptedObjectBytes)
      || size(input.contextBytes) > capture.limits.outputBytes || a.immutableBytes > capture.limits.immutableTotalBytes) fail('capture_accounting_invalid');
    if (!Array.isArray(capture.caveats) || capture.caveats.length !== 3 || capture.caveats.some((value: unknown) => typeof value !== 'string' || value.length > 500)) fail('capture_caveats_invalid');
    if (!Array.isArray(input.packetInput.evidence ?? []) || (input.packetInput.evidence || []).length > 35
      || !Array.isArray(input.packetInput.decisions ?? []) || (input.packetInput.decisions || []).length > 5) fail('packet_input_count_invalid');
    const seenDecisions = new Set<string>();
    for (const decision of input.packetInput.decisions || []) {
      const binding = bindings.get(decision?.sourceId);
      if (!closed(decision, ['sourceId', 'configSha256', 'gates']) || !binding || decision.configSha256 !== binding.configSha256
        || seenDecisions.has(decision.sourceId) || !decision.gates || typeof decision.gates !== 'object' || Array.isArray(decision.gates)
        || Object.keys(decision.gates).some(key => !['baseline', 'canonical', 'preflight', 'observer'].includes(key))) fail('packet_decision_invalid_duplicate_or_foreign');
      seenDecisions.add(decision.sourceId);
    }
    if ((input.packetInput.decisions || []).some(decision => decision.gates.canonical !== undefined
      && (!closed(decision.gates.canonical, ['status']) || decision.gates.canonical.status !== 'pending'))) fail('canonical_input_must_be_derived');
    const derived = reviewed.map((binding: Row) => {
      const row = bindings.get(binding.sourceId)!, canonicalRow = selected.get(binding.canonicalId)!;
      const body = { contractVersion: SHOPIFY_ADMISSION_EVIDENCE_CONTRACT, kind: 'canonical', sourceId: binding.sourceId, configSha256: row.configSha256,
        dependencyPins: pins, tuples: [{ storeId: binding.storeId, productId: binding.productId, variantId: binding.variantId }],
        capturedAt: capture.capturedAt, productionCommit: expected.producerCommit, policySnapshotId: expected.snapshotId,
        details: { authority: 'production_snapshot', bindings: [{ storeId: binding.storeId, productId: binding.productId, variantId: binding.variantId,
          canonicalBottleId: binding.canonicalId, canonicalName: canonicalRow.canonicalName, canonicalTier: canonicalRow.canonicalTier, marketTier: row.marketTier }] } };
      const raw = Buffer.from(JSON.stringify(body)); return { sourceId: binding.sourceId, sha256: hash(raw), bytes: raw.length, body: raw };
    });
    const decisions = reviewed.map((binding: Row) => ({ sourceId: binding.sourceId, configSha256: bindings.get(binding.sourceId)!.configSha256,
      gates: { ...(input.packetInput.decisions || []).find(row => row.sourceId === binding.sourceId)?.gates,
        canonical: { status: 'pending' as const, artifactSha256: derived.find(row => row.sourceId === binding.sourceId)!.sha256 } } }));
    const packet = await assembleShopifyAdmissionReviewPacket({ ...input.packetInput, now, evidence: [...input.packetInput.evidence || [],
      ...derived.map(({ sha256, bytes, body }) => ({ sha256, bytes, body }))], decisions });
    if (packet.blockers.length || packet.sources.length !== 5) fail('joined_packet_rejected');
    // Do not rewrite the returned packet/digest or upgrade its pending decisions.
    report.integrityVerified = true;
    report.lineage = { producerCommit: expected.producerCommit, runId: expected.runId, runAttempt: expected.runAttempt, artifactId: expected.artifactId,
      artifactSha256: expected.artifactSha256, contextSha256: expected.contextSha256, runMetadataSha256: expected.runMetadataSha256, artifactMetadataSha256: expected.artifactMetadataSha256,
      snapshotId: expected.snapshotId, pointerSha256: expected.pointerSha256, capturedAt: capture.capturedAt, generatedAt: capture.generatedAt };
    report.canonicalEvidence = derived.map(({ sourceId, sha256, bytes, body }) => ({ sourceId, sha256, bytes, body: body.toString('utf8'), status: 'pending', authority: 'external_provider_verification_required', contextSha256: expected.contextSha256 }));
    report.offlineBinding = { sourceManifestSha256: hash(manifestBytes), reviewedBindingFileSha256: hash(bindingBytes), dependencyPins: pins,
      submittedSourceManifestObjectSha256: hash(JSON.stringify(submittedManifest)),
      configurations: [...bindings.values()].map(row => ({ sourceId: row.sourceId, reviewedConfigSha256: row.reviewedConfigSha256, configSha256: row.configSha256,
        captureEvidenceRefreshed: row.reviewedConfigSha256 !== row.configSha256 })),
      productionClassificationDataSha256: p.classificationDataSha256, productionBottlesPlaintextSha256: exports.find((row: Row) => row.name === 'bottles').plaintextSha256,
      reviewedFixtureCatalogSha256: pins.catalogSha256 };
    report.canonicalContext = { canonicalRows: capture.canonicalRows, stateClassifications: capture.stateClassifications }; 
    report.packet = packet;
    report.blockers = ['provider_authentication_pending', 'producer_checkout_provenance_not_authenticated'];
    if (packet.sources.some((row: Row) => row.gates.canonical.blockers.length)) report.blockers.push('packet_canonical_compatibility_pending');
    if (Buffer.byteLength(JSON.stringify(report)) > SHOPIFY_CANONICAL_CONTEXT_REVIEW_LIMITS.outputBytes) fail('output_byte_limit');
  } catch (error) {
    report.integrityVerified = false; report.packet = null; report.canonicalEvidence = [];
    delete report.lineage; delete report.offlineBinding; delete report.canonicalContext; report.blockers = [error instanceof ReviewError ? error.code : 'canonical_review_failed_closed'];
  }
  return report;
}
