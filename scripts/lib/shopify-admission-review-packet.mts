import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { reviewShopifyOnboardingBatch, type ShopifyBatchReviewInput } from './shopify-batch-onboarding.mts';
import { validateShopifyVariantSource, describeShopifyVariantSource } from '../../engine/src/collectors/shopify-variant-pickup.mjs';

type Row = Record<string, any>;
type Bytes = string | Uint8Array;
export const SHOPIFY_ADMISSION_REVIEW_GATES = Object.freeze(['baseline', 'canonical', 'preflight', 'observer'] as const);
export const SHOPIFY_ADMISSION_EVIDENCE_CONTRACT = 'bourbon-signal/shopify-admission-evidence@1';
export const SHOPIFY_ADMISSION_REVIEW_LIMITS = Object.freeze({ sources: 10, premises: 25, evidence: 40, inputBytes: 32 * 1024 * 1024, artifactBytes: 2 * 1024 * 1024, outputBytes: 512 * 1024 });
type Gate = typeof SHOPIFY_ADMISSION_REVIEW_GATES[number];
export type ShopifyAdmissionReviewInput = {
  batchInput: ShopifyBatchReviewInput;
  safeMatcherBytes: Bytes;
  evidence?: Array<{ sha256: string; bytes: number; body: Bytes }>;
  decisions?: Array<{ sourceId: string; configSha256: string; gates: Partial<Record<Gate, { status: 'pending' | 'blocked' | 'evidence_present'; artifactSha256?: string }>> }>;
  now?: number;
};
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const isHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const length = (value: unknown) => typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.byteLength : null;
const buffer = (value: Bytes) => typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
const closed = (value: unknown, keys: string[]): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key));
const publicId = (value: unknown) => typeof value === 'string' && /^[a-z0-9][a-z0-9:._-]{0,179}$/u.test(value);
const unique = <T,>(values: T[]) => [...new Set(values)];
const utc = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return NaN;
  const at = Date.parse(value);
  return Number.isFinite(at) && new Date(at).toISOString() === value ? at : NaN;
};
const tuple = (row: Row) => JSON.stringify([row.storeId, row.productId, row.variantId]);
const PIN_KEYS = ['collectorSha256', 'premisesIdentitySha256', 'safeMatcherSha256', 'catalogSha256', 'classificationSha256'];
const GAPS = new Set(['retailer_current_retained_missing', 'historical_snapshot_missing', 'older_pruned_history_unknown', 'directory_alias_unresolved',
  'prior_inventory_observed', 'deleted_submissions_unavailable', 'revoked_or_unverified_history_excluded', 'rejected_or_unsupported_history_excluded',
  'overwritten_store_identities_unavailable', 'publication_audit_unavailable', 'public_premise_identity_incomplete', 'submission_current_store_identity_conflict']);
const BOOL = (row: Row, fields: string[]) => fields.every(field => typeof row[field] === 'boolean');
const tiers = new Set(['limited', 'allocated', 'unicorn']);

/**
 * Nonexecutable review preparation. Evidence body is a CLOSED public JSON object:
 * {contractVersion,kind,sourceId,configSha256,dependencyPins,tuples,capturedAt,
 *  productionCommit,policySnapshotId,details}. `details` is gate-specific below.
 * Supplied evidence integrity is not reviewer/provider authentication. No packet
 * approves or enables anything, even when every supplied gate has evidence.
 * Only local I/O: the FIXED safe matcher file and existing batch review's two
 * fixed implementation reads. No caller paths, environment, network or database.
 */
export async function assembleShopifyAdmissionReviewPacket({ batchInput, safeMatcherBytes, evidence = [], decisions = [], now = Date.now() }: ShopifyAdmissionReviewInput) {
  const at = Number.isFinite(now) && Number.isFinite(new Date(now).getTime()) ? now : NaN;
  const report: Row = { contractVersion: 'bourbon-signal/shopify-admission-review-packet@1', scope: 'nonexecutable_review_preparation',
    generatedAt: Number.isFinite(at) ? new Date(at).toISOString() : null, dependencyPins: {}, sources: [], evidence: [], blockers: [],
    admissions: [], descriptors: [], activated: false, acceptedNewStores: 0, requiresExplicitLeadReview: true,
    caveats: ['Receipt hashes prove supplied byte integrity, not reviewer/provider approval.',
      'Saved catalog/classification and fixture replay are not current production authority.',
      'Directory context, retained reports and missing history do not prove new inventory connections.',
      'Existing pilot observation is not candidate acceptance; no source admission or activation is emitted.'] };
  const fail = (code: string) => { report.blockers.push(code); return report; };
  if (!Number.isFinite(at)) return fail('review_clock_invalid');
  const sources = batchInput?.manifest?.sources;
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 10 || sources.some((source: Row) => !Array.isArray(source?.stores)
    || source.stores.length > 5 || !Array.isArray(source?.products) || source.products.length > 2)
    || sources.reduce((sum: number, source: Row) => sum + source.stores.length, 0) > 25
    || !Array.isArray(evidence) || evidence.length > 40 || !Array.isArray(decisions) || decisions.length > 10
    || !Array.isArray(batchInput.captures) || batchInput.captures.length > 40) return fail('input_shape_or_count_limit');
  const context = [batchInput.collectorBytes, batchInput.premisesIdentityBytes, safeMatcherBytes, batchInput.catalogBytes, batchInput.classificationBytes];
  const contextCaps = [128 * 1024, 128 * 1024, 128 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024];
  const contexts = context.map(length), bodies = [...batchInput.captures.map(capture => length(capture?.body)), ...evidence.map(item => length(item?.body))];
  if (contexts.some((size, index) => size === null || size > contextCaps[index]) || bodies.some(size => size === null || size > 2 * 1024 * 1024)
    || [...contexts, ...bodies].reduce<number>((sum, size) => sum + (size || 0), 0) > SHOPIFY_ADMISSION_REVIEW_LIMITS.inputBytes) return fail('input_byte_limit_or_type');
  const matcher = buffer(safeMatcherBytes), manifest = batchInput.manifest;
  try {
    const actual = await readFile(new URL('../../engine/src/collectors/safe-bottle-match.mjs', import.meta.url));
    if (actual.length > 128 * 1024 || !actual.equals(matcher)) return fail('safe_matcher_implementation_mismatch');
  } catch { return fail('safe_matcher_implementation_unavailable'); }
  const matcherPin = manifest.safeMatcherSha256 ?? (manifest.reuseAssessment?.dependency === 'engine/src/collectors/safe-bottle-match.mjs' ? manifest.reuseAssessment.actualSha256 : undefined);
  if (!isHash(matcherPin) || matcherPin !== hash(matcher)) return fail('safe_matcher_pin_mismatch');
  // Existing batch bounds and checks actual manifest/config/capture bytes. Its
  // supplied replay clock remains unchanged; capture freshness below uses NOW.
  let batch: Row;
  try { batch = await reviewShopifyOnboardingBatch(batchInput); } catch { return fail('batch_review_failed'); }
  if (batch.blockers.length) return fail('batch_review_rejected');
  const pins = { ...batch.hashes, safeMatcherSha256: hash(matcher) };
  report.dependencyPins = Object.fromEntries(PIN_KEYS.map(key => [key, pins[key]]));
  report.batch = { generatedAt: batch.generatedAt, fixtureCompatibleSources: batch.counts.fixtureCompatibleSources,
    eligibleFixturePremises: batch.counts.eligibleFixturePremises, fixtureRequests: batch.counts.fixtureReplayRequests,
    fixtureBytes: batch.counts.fixtureBodyBytes, manifestSha256: batch.hashes.manifestSha256 };
  const planned = new Map<string, Row>();
  for (const raw of sources) {
    try {
      const source = validateShopifyVariantSource(raw), plan = describeShopifyVariantSource(source, { collectorSha256: pins.collectorSha256 });
      if (!publicId(source.runtimeId) || !source.stores.every((store: Row) => publicId(store.id))) throw Error();
      const output = batch.sources.find((row: Row) => row.sourceId === source.runtimeId);
      const tuples = source.stores.flatMap((store: Row) => source.products.map((product: Row) => ({ storeId: store.id, productId: product.productId, variantId: product.variantId })));
      const captureTimes = source.products.flatMap((product: Row) => ['product', 'pickup'].map(kind => utc(product.evidence[kind].capturedAt)));
      const oldest = Math.min(...captureTimes), ageMs = at - oldest;
      planned.set(source.runtimeId, { source, plan, output, tuples, ageMs, oldest,
        captureClockInvalid: captureTimes.some(clock => !Number.isFinite(clock) || clock > at),
        captureHashes: unique(source.products.flatMap((product: Row) => ['product', 'pickup'].map(kind => product.evidence[kind].sha256))) });
    } catch { report.blockers.push('source_configuration_rejected'); }
  }
  const receipts = new Map<string, Row>();
  for (const item of evidence) {
    try {
      if (!closed(item, ['sha256', 'bytes', 'body']) || !isHash(item.sha256)) throw Error();
      const bytes = buffer(item.body), text = bytes.toString('utf8');
      if (item.bytes !== bytes.length || hash(bytes) !== item.sha256 || !Buffer.from(text).equals(bytes) || receipts.has(item.sha256)) throw Error();
      const body = JSON.parse(text);
      if (!closed(body, ['contractVersion', 'kind', 'sourceId', 'configSha256', 'dependencyPins', 'tuples', 'capturedAt', 'productionCommit', 'policySnapshotId', 'details'])
        || body.contractVersion !== SHOPIFY_ADMISSION_EVIDENCE_CONTRACT || !SHOPIFY_ADMISSION_REVIEW_GATES.includes(body.kind)
        || !planned.has(body.sourceId) || !isHash(body.configSha256) || body.configSha256 !== planned.get(body.sourceId)!.plan.configSha256
        || !closed(body.dependencyPins, PIN_KEYS) || !PIN_KEYS.every(key => body.dependencyPins[key] === pins[key])
        || !Array.isArray(body.tuples) || body.tuples.length !== planned.get(body.sourceId)!.tuples.length
        || body.tuples.some((row: Row) => !closed(row, ['storeId', 'productId', 'variantId']) || !planned.get(body.sourceId)!.tuples.some((expected: Row) => tuple(expected) === tuple(row)))
        || new Set(body.tuples.map(tuple)).size !== body.tuples.length
        || !Number.isFinite(utc(body.capturedAt)) || utc(body.capturedAt) > at
        || typeof body.productionCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(body.productionCommit)
        || typeof body.policySnapshotId !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/u.test(body.policySnapshotId)) throw Error();
      receipts.set(item.sha256, { ...body, digest: item.sha256 });
    } catch { report.blockers.push('evidence_invalid_duplicate_or_foreign'); }
  }
  const decisionsBySource = new Map<string, Row>();
  for (const decision of decisions) {
    if (!closed(decision, ['sourceId', 'configSha256', 'gates']) || !planned.has(decision.sourceId)
      || decision.configSha256 !== planned.get(decision.sourceId)!.plan.configSha256 || decisionsBySource.has(decision.sourceId)
      || !closed(decision.gates, [...SHOPIFY_ADMISSION_REVIEW_GATES])) { report.blockers.push('decision_invalid_duplicate_or_foreign'); continue; }
    decisionsBySource.set(decision.sourceId, decision);
  }
  const referenced = new Set<string>();
  for (const [sourceId, entry] of planned) {
    const row: Row = { sourceId, state: entry.source.state, configSha256: entry.plan.configSha256, tuples: entry.tuples,
      captures: { oldestAt: Number.isFinite(entry.oldest) ? new Date(entry.oldest).toISOString() : null, ageMs: Number.isFinite(entry.ageMs) ? entry.ageMs : null,
        stale: entry.captureClockInvalid || !Number.isFinite(entry.ageMs) || entry.ageMs < 0 || entry.ageMs > 3600000 }, gates: {}, blockers: [] };
    const contexts = new Set<string>();
    if (entry.output?.replayStatus !== 'complete' || !entry.output?.stores.every((store: Row) => store.eligibleFixtureBottles > 0)) row.blockers.push('fixture_compatibility_or_eligibility_missing');
    for (const kind of SHOPIFY_ADMISSION_REVIEW_GATES) {
      const decision = decisionsBySource.get(sourceId)?.gates[kind];
      const gate: Row = { status: 'pending', artifactSha256: null, blockers: [], caveats: [] };
      row.gates[kind] = gate;
      if (!decision) { gate.blockers.push('gate_decision_missing'); continue; }
      if (!closed(decision, ['status', 'artifactSha256']) || !['pending', 'blocked', 'evidence_present'].includes(decision.status)) { gate.status = 'rejected'; gate.blockers.push('gate_decision_invalid'); continue; }
      gate.status = decision.status;
      if (decision.artifactSha256 === undefined && decision.status !== 'evidence_present') { gate.blockers.push('gate_pending_or_blocked'); continue; }
      const receipt = isHash(decision.artifactSha256) ? receipts.get(decision.artifactSha256) : null;
      if (!receipt || receipt.sourceId !== sourceId || receipt.kind !== kind) { gate.status = 'rejected'; gate.blockers.push('referenced_evidence_missing_or_foreign'); continue; }
      referenced.add(receipt.digest); gate.artifactSha256 = receipt.digest;
      contexts.add(JSON.stringify([receipt.productionCommit, receipt.policySnapshotId]));
      const detail = receipt.details;
      let valid = false;
      if (kind === 'baseline') {
        const flags = ['currentInventory', 'staleInventory', 'retainedInventory', 'directoryMatch', 'retailerCurrentRetainedIncluded', 'historicalAbsenceProven'];
        valid = closed(detail, [...flags, 'historyGaps', 'aliasReview', 'outcome']) && BOOL(detail, flags)
          && detail.historicalAbsenceProven === false && Array.isArray(detail.historyGaps) && detail.historyGaps.length <= 20 && detail.historyGaps.every((gap: unknown) => GAPS.has(gap as string))
          && ['pending', 'exact', 'reviewed_alias'].includes(detail.aliasReview) && ['unresolved', 'prior_inventory', 'recovery_context', 'directory_reuse_context', 'no_match_in_captured_scope'].includes(detail.outcome);
        if (valid) {
          gate.baseline = Object.fromEntries([...flags, 'historyGaps', 'aliasReview', 'outcome'].map(key => [key, detail[key]]));
          if (!detail.retailerCurrentRetainedIncluded || detail.historyGaps.includes('retailer_current_retained_missing')) gate.blockers.push('retailer_current_retained_scope_pending');
          if (detail.aliasReview === 'pending' || detail.historyGaps.includes('directory_alias_unresolved')) gate.blockers.push('baseline_alias_pending');
          if (detail.outcome === 'unresolved') gate.blockers.push('baseline_classification_pending');
          if (detail.historyGaps.some((gap: string) => ['public_premise_identity_incomplete', 'submission_current_store_identity_conflict'].includes(gap))) gate.blockers.push('baseline_identity_scope_pending');
          if ((detail.currentInventory || detail.staleInventory || detail.retainedInventory) && detail.outcome !== 'recovery_context') gate.blockers.push('prior_inventory_requires_explicit_classification');
          if (detail.directoryMatch) gate.caveats.push('directory_context_is_not_newness_proof');
          if (detail.historyGaps.length) gate.caveats.push('bounded_history_gaps_retained_for_lead_review');
        }
      } else if (kind === 'canonical') {
        valid = closed(detail, ['authority', 'bindings']) && ['saved_fixture', 'production_snapshot'].includes(detail.authority)
          && Array.isArray(detail.bindings) && detail.bindings.length === entry.tuples.length && new Set(detail.bindings.map(tuple)).size === detail.bindings.length
          && detail.bindings.every((binding: Row) => {
            if (!closed(binding, ['storeId', 'productId', 'variantId', 'canonicalBottleId', 'canonicalName', 'canonicalTier', 'marketTier'])) return false;
            const store = entry.output?.stores.find((item: Row) => item.storeId === binding.storeId);
            const bottle = store?.bottles.find((item: Row) => item.productId === binding.productId && item.variantId === binding.variantId);
            return bottle && bottle.canonicalId === binding.canonicalBottleId && bottle.canonicalName === binding.canonicalName
              && bottle.canonicalTier === binding.canonicalTier && bottle.marketTier === binding.marketTier && tiers.has(binding.canonicalTier) && tiers.has(binding.marketTier);
          });
        if (valid && detail.authority !== 'production_snapshot') gate.blockers.push('production_canonical_authority_pending');
      } else if (kind === 'preflight') {
        valid = closed(detail, ['captureSha256s', 'access', 'requestCount', 'redirects', 'retries']) && Array.isArray(detail.captureSha256s)
          && unique(detail.captureSha256s).length === detail.captureSha256s.length && detail.captureSha256s.length === entry.captureHashes.length
          && detail.captureSha256s.every((digest: unknown) => entry.captureHashes.includes(digest)) && ['permitted', 'pending', 'denied'].includes(detail.access)
          && Number.isInteger(detail.requestCount) && detail.requestCount === entry.plan.requestCount && detail.redirects === 0 && detail.retries === 0;
        if (valid && detail.access !== 'permitted') gate.blockers.push('preflight_access_not_established');
      } else {
        valid = closed(detail, ['stage', 'sourceIds', 'runIds', 'normalFeedCoverageMatch', 'queueProofIncluded', 'bootstrapSilent', 'genuinelyDue', 'manualDueReset'])
          && ['plan_only', 'candidate_runs', 'existing_pilot_only'].includes(detail.stage) && Array.isArray(detail.sourceIds)
          && detail.sourceIds.length === 1 && detail.sourceIds[0] === sourceId && Array.isArray(detail.runIds) && detail.runIds.length <= 288
          && detail.runIds.every((id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/u.test(id)) && unique(detail.runIds).length === detail.runIds.length
          && BOOL(detail, ['normalFeedCoverageMatch', 'queueProofIncluded', 'bootstrapSilent', 'genuinelyDue', 'manualDueReset']);
        if (valid && (detail.stage !== 'candidate_runs' || detail.runIds.length < 2 || !detail.normalFeedCoverageMatch || !detail.queueProofIncluded || !detail.bootstrapSilent
          || !detail.genuinelyDue || detail.manualDueReset)) gate.blockers.push('candidate_operational_acceptance_pending');
      }
      if (!valid) { gate.status = 'rejected'; gate.blockers.push('gate_evidence_schema_or_binding_invalid'); }
      else if (gate.blockers.length && gate.status === 'evidence_present') gate.status = 'pending';
    }
    if (row.captures.stale) { if (row.gates.preflight.status === 'evidence_present') row.gates.preflight.status = 'pending'; row.gates.preflight.blockers.push('actual_capture_clock_stale_or_invalid'); }
    if (contexts.size > 1) row.blockers.push('candidate_production_context_conflict');
    row.reviewReady = false;
    row.blockers = unique([...row.blockers, ...SHOPIFY_ADMISSION_REVIEW_GATES.filter(kind => row.gates[kind].status !== 'evidence_present').map(kind => `${kind}_gate_pending_or_rejected`)]);
    report.sources.push(row);
  }
  for (const receipt of receipts.values()) report.evidence.push({ sha256: receipt.digest, kind: receipt.kind, sourceId: receipt.sourceId,
    configSha256: receipt.configSha256, capturedAt: receipt.capturedAt, referenced: referenced.has(receipt.digest) });
  if ([...receipts.keys()].some(digest => !referenced.has(digest))) report.blockers.push('unreferenced_evidence');
  report.blockers = unique(report.blockers);
  const packetBytes = JSON.stringify(report);
  if (Buffer.byteLength(packetBytes) > SHOPIFY_ADMISSION_REVIEW_LIMITS.outputBytes) {
    report.sources = []; report.evidence = []; report.blockers = ['output_byte_limit'];
    return report;
  }
  report.packetSha256 = hash(packetBytes); // Detached digest: excludes its own field.
  return report;
}
