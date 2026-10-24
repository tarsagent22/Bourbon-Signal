import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { unzipSync } from 'fflate';
import { CANONICAL_POLICY_CAPTURE_LIMITS, CANONICAL_POLICY_DEPENDENCY_FILES } from './shopify-canonical-policy-capture.mts';
import { assembleShopifyAdmissionReviewPacket, SHOPIFY_ADMISSION_EVIDENCE_CONTRACT, type ShopifyAdmissionReviewInput } from './shopify-admission-review-packet.mts';
import { validateShopifyVariantSource, describeShopifyVariantSource } from '../../engine/src/collectors/shopify-variant-pickup.mjs';
import * as classificationModule from '../../src/lib/drop-classification.ts';

type Row = Record<string, any>;
type Bytes = string | Uint8Array;
export const SHOPIFY_CANONICAL_REVIEW_LIMITS = Object.freeze({ captureBytes: 65536, archiveBytes: 262144,
  runMetadataBytes: 131072, artifactMetadataBytes: 65536, captureAgeMs: 3600000, snapshotAgeMs: 7 * 86400000, outputBytes: 768 * 1024 });
export type ShopifyCanonicalPolicyReviewInput = {
  packetInput: ShopifyAdmissionReviewInput;
  captureBytes: Bytes; archiveBytes: Uint8Array; runMetadataBytes: Bytes; artifactMetadataBytes: Bytes;
  expected: { producerCommit: string; runId: string; runAttempt: number; artifactId: string; artifactSha256: string;
    captureSha256: string; runMetadataSha256: string; artifactMetadataSha256: string; snapshotId: string; pointerSha256: string };
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
 * upgrade that boundary. A future authenticated evidence intake is separate work.
 * Only local I/O is bounded reads of FIXED reviewed files. No caller paths, git,
 * environment, credentials, network, source fetches, storage or database adapters.
 */
export async function reviewShopifyCanonicalPolicyCapture(input: ShopifyCanonicalPolicyReviewInput) {
  const now = input?.now ?? Date.now();
  const report: Row = { contractVersion: 'bourbon-signal/shopify-canonical-policy-review@1',
    scope: 'offline_integrity_review_not_authenticated_production_authority', generatedAt: Number.isFinite(now) && Number.isFinite(new Date(now).getTime()) ? new Date(now).toISOString() : null,
    integrityVerified: false, productionAuthorityVerified: false, authentication: 'pending', canonicalEvidence: [], packet: null,
    blockers: [], admissions: [], descriptors: [], activated: false, acceptedNewStores: 0, requiresExplicitLeadReview: true,
    caveats: ['Supplied workflow metadata and expected hashes do not authenticate their own provider origin.',
      'Fixed local file comparisons reproduce reviewed dependencies; they do not attest files present in a remote producer checkout.',
      'Canonical policy is not pickup freshness, baseline reconciliation, candidate observation, newness, admission or activation.'] };
  try {
    if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) fail('review_clock_invalid');
    const caps = [SHOPIFY_CANONICAL_REVIEW_LIMITS.captureBytes, SHOPIFY_CANONICAL_REVIEW_LIMITS.archiveBytes,
      SHOPIFY_CANONICAL_REVIEW_LIMITS.runMetadataBytes, SHOPIFY_CANONICAL_REVIEW_LIMITS.artifactMetadataBytes];
    const supplied = [input.captureBytes, input.archiveBytes, input.runMetadataBytes, input.artifactMetadataBytes];
    if (supplied.some((value, index) => size(value) < 1 || size(value) > caps[index]) || !(input.archiveBytes instanceof Uint8Array)) fail('input_byte_limit_or_type');
    const expected = input.expected;
    if (!closed(expected, ['producerCommit', 'runId', 'runAttempt', 'artifactId', 'artifactSha256', 'captureSha256', 'runMetadataSha256', 'artifactMetadataSha256', 'snapshotId', 'pointerSha256'])
      || typeof expected.producerCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(expected.producerCommit) || !id(expected.runId) || !id(expected.artifactId)
      || !Number.isSafeInteger(expected.runAttempt) || expected.runAttempt < 1 || typeof expected.snapshotId !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/u.test(expected.snapshotId)
      || !['artifactSha256', 'captureSha256', 'runMetadataSha256', 'artifactMetadataSha256', 'pointerSha256'].every(key => isHash((expected as Row)[key]))) fail('expected_context_invalid');
    if (hash(input.captureBytes) !== expected.captureSha256 || hash(input.archiveBytes) !== expected.artifactSha256
      || hash(input.runMetadataBytes) !== expected.runMetadataSha256 || hash(input.artifactMetadataBytes) !== expected.artifactMetadataSha256) fail('raw_hash_mismatch');
    const run = parse(input.runMetadataBytes), artifact = parse(input.artifactMetadataBytes), capture = parse(input.captureBytes);
    if (githubId(run?.id) !== expected.runId || run.run_attempt !== expected.runAttempt || run.head_sha !== expected.producerCommit
      || run.head_branch !== 'main' || run.path !== '.github/workflows/shopify-canonical-policy-read.yml'
      || run.event !== 'workflow_dispatch' || run.status !== 'completed' || run.conclusion !== 'success'
      || run.repository?.full_name !== 'tarsagent22/Bourbon-Signal' || run.head_repository?.full_name !== 'tarsagent22/Bourbon-Signal'
      || !githubId(run.repository?.id) || run.head_repository?.id !== run.repository.id) fail('workflow_lineage_mismatch');
    if (githubId(artifact?.id) !== expected.artifactId || artifact.name !== `shopify-canonical-policy-${expected.runId}` || artifact.expired !== false
      || artifact.digest !== `sha256:${expected.artifactSha256}` || artifact.size_in_bytes !== size(input.archiveBytes)
      || githubId(artifact.workflow_run?.id) !== expected.runId || artifact.workflow_run?.head_sha !== expected.producerCommit
      || artifact.workflow_run?.head_branch !== 'main' || artifact.workflow_run?.repository_id !== run.repository.id
      || artifact.workflow_run?.head_repository_id !== run.repository.id) fail('artifact_lineage_mismatch');
    const start = utc(run.run_started_at), finish = utc(run.updated_at), created = utc(artifact.created_at), expires = utc(artifact.expires_at);
    if (![start, finish, created, expires].every(Number.isFinite) || start > finish || finish > now || created < start || created > finish || expires <= now) fail('workflow_clock_invalid_or_expired');
    let members = 0, archiveMember: Uint8Array;
    try {
      const archive = unzipSync(input.archiveBytes, { filter: entry => {
        if (++members !== 1 || entry.name !== 'shopify-canonical-policy.json' || entry.originalSize !== size(input.captureBytes)
          || entry.originalSize > SHOPIFY_CANONICAL_REVIEW_LIMITS.captureBytes || ![0, 8].includes(entry.compression)) fail('archive_member_invalid');
        return true;
      } });
      if (members !== 1 || Object.keys(archive).length !== 1) fail('archive_member_invalid');
      archiveMember = archive['shopify-canonical-policy.json'];
    } catch { fail('archive_member_invalid'); }
    if (!Buffer.from(archiveMember!).equals(bytes(input.captureBytes))) fail('archive_raw_member_mismatch');
    if (!closed(capture, ['contractVersion', 'capturedAt', 'expectedProductionCommit', 'producerCommit', 'producerRunId', 'activeSnapshotId', 'activePointerSha256', 'generatedAt', 'canonicalRows', 'bindings', 'provenance', 'accounting', 'limits', 'caveats'])
      || capture.contractVersion !== 'bourbon-signal/selected-canonical-policy@1' || capture.producerCommit !== expected.producerCommit
      || capture.expectedProductionCommit !== expected.producerCommit || capture.producerRunId !== expected.runId || capture.activeSnapshotId !== expected.snapshotId
      || capture.activePointerSha256 !== expected.pointerSha256) fail('capture_context_mismatch');
    const captured = utc(capture.capturedAt), generated = utc(capture.generatedAt);
    if (!Number.isFinite(captured) || !Number.isFinite(generated) || captured < start || captured > metadataUpper(artifact.created_at) || captured > metadataUpper(run.updated_at) || captured > now
      || now - captured > SHOPIFY_CANONICAL_REVIEW_LIMITS.captureAgeMs || generated > captured || now - generated > SHOPIFY_CANONICAL_REVIEW_LIMITS.snapshotAgeMs) fail('capture_clock_stale_or_invalid');
    const provenanceKeys = ['sourceManifestSha256', 'reviewedBindingFileSha256', 'manifestSha256', 'exports', 'collectorSha256', 'premisesIdentitySha256', 'safeMatcherSha256',
      'reviewedFixtureCatalogSha256', 'classificationArtifactSha256', 'classificationImplementationSha256', 'sourcePolicyImplementationSha256', 'beforeReleaseSha256', 'afterReleaseSha256', 'dependencyScope'];
    const p = capture.provenance;
    if (!closed(p, provenanceKeys) || provenanceKeys.filter(key => key.endsWith('Sha256')).some(key => !isHash(p[key]))
      || p.dependencyScope !== 'listed_files_only_not_exhaustive_transitive_hashes') fail('capture_provenance_invalid');
    const local: Row = {}, dependencyMap: Row = { collector: 'collectorSha256', premisesIdentity: 'premisesIdentitySha256', safeMatcher: 'safeMatcherSha256',
      catalog: 'reviewedFixtureCatalogSha256', classification: 'classificationArtifactSha256', classificationImplementation: 'classificationImplementationSha256', sourcePolicyImplementation: 'sourcePolicyImplementationSha256' };
    for (const [key, file] of Object.entries(CANONICAL_POLICY_DEPENDENCY_FILES)) {
      local[key] = await fixed(file);
      if (hash(local[key]) !== p[dependencyMap[key]]) fail('fixed_dependency_hash_mismatch');
    }
    const manifestBytes = await fixed('engine/data/shopify-pickup-next-five-review-20261023.json', 256 * 1024);
    const bindingBytes = await fixed('engine/data/shopify-next-five-policy-bindings-20261024.json', 65536);
    if (hash(manifestBytes) !== p.sourceManifestSha256 || hash(bindingBytes) !== p.reviewedBindingFileSha256) fail('fixed_selection_hash_mismatch');
    const manifest = parse(manifestBytes), reviewed = parse(bindingBytes).bindings;
    if (!Array.isArray(reviewed) || reviewed.length !== 5 || !Array.isArray(capture.bindings) || capture.bindings.length !== 5
      || !Array.isArray(capture.canonicalRows) || capture.canonicalRows.length !== 4) fail('selection_count_invalid');
    if (!Array.isArray(input.packetInput?.batchInput?.manifest?.sources) || input.packetInput.batchInput.manifest.sources.length !== 5
      || !isDeepStrictEqual(input.packetInput.batchInput.manifest, manifest)) fail('packet_selection_mismatch');
    const pins: Row = { collectorSha256: hash(local.collector), premisesIdentitySha256: hash(local.premisesIdentity), safeMatcherSha256: hash(local.safeMatcher),
      catalogSha256: hash(local.catalog), classificationSha256: hash(local.classification) };
    if (!Object.keys(pins).every(key => manifest[key] === pins[key])) fail('manifest_pin_mismatch');
    if (!bytes(input.packetInput.safeMatcherBytes).equals(local.safeMatcher) || !bytes(input.packetInput.batchInput.catalogBytes).equals(local.catalog)
      || !bytes(input.packetInput.batchInput.classificationBytes).equals(local.classification)) fail('packet_dependency_mismatch');
    const plans = manifest.sources.map((source: Row) => describeShopifyVariantSource(validateShopifyVariantSource(source), { collectorSha256: pins.collectorSha256 }));
    const selected = new Map<string, Row>(), bindings = new Map<string, Row>();
    for (const row of capture.canonicalRows) {
      if (!closed(row, ['canonicalId', 'canonicalName', 'canonicalTier']) || !reviewed.some((binding: Row) => row.canonicalId === binding.canonicalId && row.canonicalName === binding.canonicalName)
        || !eligible(row.canonicalTier) || selected.has(row.canonicalId)) fail('canonical_identity_or_tier_invalid');
      selected.set(row.canonicalId, row);
    }
    const index = classification.getDropClassificationIndex(parse(local.classification).records);
    for (const row of capture.bindings) {
      const binding = reviewed.find((item: Row) => item.sourceId === row?.sourceId), canonicalRow = selected.get(row?.canonicalId);
      const plan = plans.find((item: Row) => item.source.runtimeId === row?.sourceId);
      if (!closed(row, ['sourceId', 'configSha256', 'state', 'storeId', 'productId', 'variantId', 'canonicalId', 'marketTier']) || !binding || !canonicalRow || !plan
        || bindings.has(row.sourceId) || !sameFields(row, binding, ['sourceId', 'configSha256', 'state', 'storeId', 'productId', 'variantId', 'canonicalId'])
        || plan.configSha256 !== binding.configSha256 || plan.source.products[0].canonicalName !== canonicalRow.canonicalName) fail('source_tuple_or_canonical_mismatch');
      const market = classification.resolveDropClassification({ state: row.state, canonical_id: row.canonicalId, canonical_name: canonicalRow.canonicalName, tier: canonicalRow.canonicalTier }, index);
      if (!eligible(row.marketTier) || market.source === 'signal' || market.tier !== row.marketTier) fail('market_classification_mismatch');
      bindings.set(row.sourceId, row);
    }
    const exports = p.exports;
    if (!Array.isArray(exports) || exports.length !== 3 || new Set(exports.map((row: Row) => row?.name)).size !== 3
      || exports.some((row: Row) => !closed(row, ['name', 'descriptorBytes', 'plaintextSha256', 'encryptedObjectSha256', 'encryptedObjectBytes'])
        || !['bottles', 'state-health', 'alerts'].includes(row.name) || !isHash(row.plaintextSha256) || !isHash(row.encryptedObjectSha256)
        || !Number.isSafeInteger(row.descriptorBytes) || row.descriptorBytes < 1 || row.descriptorBytes > CANONICAL_POLICY_CAPTURE_LIMITS.plaintextObjectBytes
        || !Number.isSafeInteger(row.encryptedObjectBytes) || row.encryptedObjectBytes < 1 || row.encryptedObjectBytes > CANONICAL_POLICY_CAPTURE_LIMITS.encryptedObjectBytes)) fail('export_hash_or_bounds_invalid');
    const limitKeys = Object.keys(CANONICAL_POLICY_CAPTURE_LIMITS), a = capture.accounting;
    if (!closed(capture.limits, limitKeys) || limitKeys.some(key => !Number.isSafeInteger(capture.limits[key]) || capture.limits[key] < 1 || capture.limits[key] > (CANONICAL_POLICY_CAPTURE_LIMITS as Row)[key])
      || !closed(a, ['immutableReads', 'pointerReads', 'releaseReads', 'immutableBytes', 'declaredPlaintextBytes', 'elapsedMs'])
      || Object.values(a).some(value => !Number.isSafeInteger(value) || Number(value) < 0)
      || a.immutableReads !== 4 || a.pointerReads !== 2 || a.releaseReads !== 2 || a.immutableReads > capture.limits.immutableReads
      || a.pointerReads > capture.limits.pointerReads || a.releaseReads > capture.limits.releaseReads || a.elapsedMs > capture.limits.totalElapsedMs
      || a.declaredPlaintextBytes !== exports.reduce((sum: number, row: Row) => sum + row.descriptorBytes, 0)
      || a.declaredPlaintextBytes > capture.limits.plaintextTotalBytes || a.immutableBytes <= exports.reduce((sum: number, row: Row) => sum + row.encryptedObjectBytes, 0)
      || a.immutableBytes - exports.reduce((sum: number, row: Row) => sum + row.encryptedObjectBytes, 0) > capture.limits.manifestBytes
      || exports.some((row: Row) => row.descriptorBytes > capture.limits.plaintextObjectBytes || row.encryptedObjectBytes > capture.limits.encryptedObjectBytes)
      || size(input.captureBytes) > capture.limits.outputBytes || a.immutableBytes > capture.limits.immutableTotalBytes) fail('capture_accounting_invalid');
    if (!Array.isArray(capture.caveats) || capture.caveats.length !== 3 || capture.caveats.some((value: unknown) => typeof value !== 'string' || value.length > 500)) fail('capture_caveats_invalid');
    if ((input.packetInput.evidence || []).length > 35 || (input.packetInput.decisions || []).some(decision => decision?.gates?.canonical?.artifactSha256 !== undefined
      || !['pending', undefined].includes(decision?.gates?.canonical?.status))) fail('canonical_input_must_be_derived');
    const derived = reviewed.map((binding: Row) => {
      const row = bindings.get(binding.sourceId)!, canonicalRow = selected.get(binding.canonicalId)!;
      const body = { contractVersion: SHOPIFY_ADMISSION_EVIDENCE_CONTRACT, kind: 'canonical', sourceId: binding.sourceId, configSha256: binding.configSha256,
        dependencyPins: pins, tuples: [{ storeId: binding.storeId, productId: binding.productId, variantId: binding.variantId }],
        capturedAt: capture.capturedAt, productionCommit: expected.producerCommit, policySnapshotId: expected.snapshotId,
        details: { authority: 'production_snapshot', bindings: [{ storeId: binding.storeId, productId: binding.productId, variantId: binding.variantId,
          canonicalBottleId: binding.canonicalId, canonicalName: canonicalRow.canonicalName, canonicalTier: canonicalRow.canonicalTier, marketTier: row.marketTier }] } };
      const raw = Buffer.from(JSON.stringify(body)); return { sourceId: binding.sourceId, sha256: hash(raw), bytes: raw.length, body: raw };
    });
    const decisions = reviewed.map((binding: Row) => ({ sourceId: binding.sourceId, configSha256: binding.configSha256,
      gates: { ...(input.packetInput.decisions || []).find(row => row.sourceId === binding.sourceId)?.gates,
        canonical: { status: 'pending' as const, artifactSha256: derived.find(row => row.sourceId === binding.sourceId)!.sha256 } } }));
    const packet = await assembleShopifyAdmissionReviewPacket({ ...input.packetInput, now, evidence: [...input.packetInput.evidence || [],
      ...derived.map(({ sha256, bytes, body }) => ({ sha256, bytes, body }))], decisions });
    if (packet.blockers.length || packet.sources.length !== 5) fail('joined_packet_rejected');
    // Do not rewrite the returned packet/digest or upgrade its pending decisions.
    report.integrityVerified = true;
    report.lineage = { producerCommit: expected.producerCommit, runId: expected.runId, runAttempt: expected.runAttempt, artifactId: expected.artifactId,
      artifactSha256: expected.artifactSha256, captureSha256: expected.captureSha256, runMetadataSha256: expected.runMetadataSha256, artifactMetadataSha256: expected.artifactMetadataSha256,
      snapshotId: expected.snapshotId, pointerSha256: expected.pointerSha256, capturedAt: capture.capturedAt, generatedAt: capture.generatedAt };
    report.canonicalEvidence = derived.map(({ sourceId, sha256, bytes }) => ({ sourceId, sha256, bytes, status: 'pending', authority: 'provider_authentication_pending' }));
    report.packet = packet;
    report.blockers = ['provider_authentication_pending', 'producer_checkout_provenance_not_authenticated'];
    if (packet.sources.some((row: Row) => row.gates.canonical.blockers.length)) report.blockers.push('packet_canonical_compatibility_pending');
    if (Buffer.byteLength(JSON.stringify(report)) > SHOPIFY_CANONICAL_REVIEW_LIMITS.outputBytes) fail('output_byte_limit');
  } catch (error) {
    report.integrityVerified = false; report.packet = null; report.canonicalEvidence = [];
    delete report.lineage; report.blockers = [error instanceof ReviewError ? error.code : 'canonical_review_failed_closed'];
  }
  return report;
}
