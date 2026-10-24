import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { observationConfig, validateObservationState, SLOT_MS, MAX_SLOTS } from '../source-observation-runner.mjs';

export const OBSERVATION_TRANSITION_RUNNER_SHA256 = 'c1e6ca5b9f29d1a08a95a1dd8d8bad4135a27a37be8e2041560289cc628c17f3';
export const OBSERVATION_TRANSITION_REVIEW_LIMITS = Object.freeze({ fileBytes: 2 * 1024 * 1024, inputBytes: 16 * 1024 * 1024,
  metadataBytes: 128 * 1024, releaseBytes: 512 * 1024, transitions: 32, releaseAgeMs: 15 * 60000, outputBytes: 256 * 1024 });
const FILES = ['installation.json', 'reservations.json', 'ticks.jsonl', 'task.xml'];
const FINALS = new Set(['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'skipped', 'stale', 'neutral']);
const sha = value => createHash('sha256').update(value).digest('hex');
const size = value => typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.byteLength : Infinity;
const buffer = value => Buffer.from(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const closed = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
// Match the existing Python chain review's canonical ASCII JSON digest exactly.
const canonical = value => JSON.stringify(sorted(value)).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const instant = value => {
  if (typeof value !== 'string') return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!match) return NaN;
  const [, y, m, d, h, minute, second] = match;
  if (+m < 1 || +m > 12 || +d < 1 || +d > new Date(Date.UTC(+y, +m, 0)).getUTCDate() || +h > 23 || +minute > 59 || +second > 59) return NaN;
  return Date.parse(value);
};
// Windows receipts retain up to seven fractional digits. Do not truncate a
// post-cutoff record into the cutoff millisecond when comparing raw evidence.
const units = value => {
  const at = instant(value);
  if (!Number.isFinite(at)) return null;
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/u.exec(value)?.[1] || '';
  return BigInt(at) * 10000n + BigInt(fraction.padEnd(7, '0').slice(3, 7));
};
const after = (value, limit) => units(value) > units(limit);
class ReviewError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new ReviewError(code); };
function parse(raw) {
  const bytes = buffer(raw), text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) fail('input_utf8_invalid');
  try { return JSON.parse(text); } catch { fail('input_json_invalid'); }
}
function jsonl(raw) {
  const text = buffer(raw).toString('utf8');
  if (text && !text.endsWith('\n')) fail('partial_history_tail');
  return text.split('\n').filter(line => line.trim()).map(parse);
}
function snapshot(files, cutoff) {
  if (!closed(files, FILES)) fail('snapshot_files_invalid');
  const installation = parse(files['installation.json']), state = parse(files['reservations.json']);
  const config = observationConfig(state.config);
  validateObservationState(state, config);
  if (state.version !== 1 || !closed(state, ['version', 'config', 'reservations'])
    || installation.version !== 1 || installation.expectedCommit !== config.expectedCommit || installation.observationId !== config.observationId
    || installation.taskName !== 'BourbonSignalSourceObservation818' || installation.scope !== 'capture_only_no_monitor_rescue'
    || installation.maxReservations !== MAX_SLOTS || installation.intervalMinutes !== SLOT_MS / 60000
    || installation.runnerSha256 !== OBSERVATION_TRANSITION_RUNNER_SHA256
    || instant(installation.startedAt) !== instant(config.startedAt) || instant(installation.deadline) !== instant(config.deadline)) fail('snapshot_authority_or_window_invalid');
  let prior = -1;
  for (const row of state.reservations) {
    const reserved = instant(row.reservedAt);
    if (row.slot <= prior || !Number.isFinite(reserved) || after(row.reservedAt, cutoff) || after(config.startedAt, row.reservedAt) || !after(config.deadline, row.reservedAt)
      || Math.floor((reserved - instant(config.startedAt)) / SLOT_MS) !== row.slot) fail('reservation_after_cutoff_or_invalid_slot');
    prior = row.slot;
  }
  const ticks = jsonl(files['ticks.jsonl']);
  if (ticks.some(row => !Number.isFinite(instant(row.checkedAt)) || after(row.checkedAt, cutoff))) fail('tick_after_cutoff_or_invalid_clock');
  return { installation, state, config, ticks };
}
function preserved(anchor, current) {
  if (!isDeepStrictEqual({ ...anchor.installation, expectedCommit: current.installation.expectedCommit }, current.installation)
    || !isDeepStrictEqual({ ...anchor.config, expectedCommit: current.config.expectedCommit }, current.config)
    || current.state.reservations.length < anchor.state.reservations.length) fail('original_context_or_history_changed');
  for (let i = 0; i < anchor.state.reservations.length; i++) {
    const before = anchor.state.reservations[i], after = current.state.reservations[i];
    const stable = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['status', 'runId', 'conclusion'].includes(key)));
    if (!isDeepStrictEqual(stable(before), stable(after)) || Object.keys(after).some(key => !Object.hasOwn(before, key) && !['runId', 'conclusion'].includes(key))) fail('prior_reservation_changed');
    if (before.status === 'completed' && !isDeepStrictEqual(before, after)) fail('prior_completed_outcome_changed');
    if (before.status !== 'completed' && !isDeepStrictEqual(before, after)
      && (after.status !== 'completed' || ['runId', 'conclusion'].some(key => Object.hasOwn(before, key) && before[key] !== after[key]))) fail('prior_outcome_enrichment_invalid');
  }
}

/**
 * Pure, bounded second-or-later release REVIEW. No file reads/writes, credentials,
 * environment, subprocess, network, locks, task operations or dispatch adapter.
 * Reuses the existing offline Python N-transition validator's hash-bound result;
 * it does NOT reimplement or claim independent verification of its archive fold.
 * Adds current raw-byte/anchor/cutoff checks and a new proposed release BODY/hash/
 * clock check, absent from that helper's prospective evidence contract.
 * Caller-supplied hashes cannot authenticate themselves. All results are
 * nonexecutable, unapproved and require independent review, even on test success.
 *
 * input = {chainReviewBytes,expectedChainReviewSha256,anchorFiles,currentFiles,
 * journalBytes,runnerBytes,outcomeReceipts:[{sha256,body}],proposedCommit,
 * proposedRelease:{sha256,body,httpStatus,checkedAt}|null,cutoff:ISO,now:ISO}.
 * Files are exactly installation.json/reservations.json/ticks.jsonl/task.xml.
 * Metadata bodies are raw single GHA runs or the saved {run,...} wrapper.
 */
export function reviewSourceObservationTransition(input) {
  const report = { contractVersion: 'bourbon-signal/observer-transition-review@1', status: 'blocked',
    continuityIntegrityVerified: false, releaseBodyVerified: false, providerAuthenticationVerified: false,
    applied: false, executable: false, authorized: false, dispatches: 0, requiresExplicitLeadReview: true,
    originalWindow: null, preservedHistory: null, proposedRelease: null, blockers: [],
    futureWindow: { status: 'unknown_separate_authorization_required', startedAt: null, deadline: null },
    limitations: ['Depends on the existing independently reviewed offline N-transition archive validator; no duplicate archive-fold authority is asserted.',
      'Supplied raw bytes and reference hashes prove consistency, not provider authenticity or permission to rebind.',
      'A PR head is not a known future merged production commit; no new window, catchup, operational command or apply capability is emitted.'] };
  try {
    const cutoff = instant(input?.cutoff), now = instant(input?.now);
    if (!Number.isFinite(cutoff) || !Number.isFinite(now) || after(input.cutoff, input.now)) fail('cutoff_or_review_clock_invalid');
    if (!closed(input.anchorFiles, FILES) || !closed(input.currentFiles, FILES) || !Array.isArray(input.outcomeReceipts) || input.outcomeReceipts.length > MAX_SLOTS) fail('input_schema_or_count_invalid');
    const raw = [input.chainReviewBytes, input.journalBytes, ...FILES.map(name => input.anchorFiles[name]), ...FILES.map(name => input.currentFiles[name])];
    const receipts = input.outcomeReceipts.map(row => row?.body), release = input.proposedRelease?.body;
    if (raw.some(value => size(value) > OBSERVATION_TRANSITION_REVIEW_LIMITS.fileBytes) || size(input.runnerBytes) > 65536
      || receipts.some(value => size(value) > OBSERVATION_TRANSITION_REVIEW_LIMITS.metadataBytes)
      || (release !== undefined && size(release) > OBSERVATION_TRANSITION_REVIEW_LIMITS.releaseBytes)
      || [...raw, input.runnerBytes, ...receipts, ...release === undefined ? [] : [release]].reduce((sum, value) => sum + size(value), 0) > OBSERVATION_TRANSITION_REVIEW_LIMITS.inputBytes) fail('input_byte_limit_or_type');
    if (!hash(input.expectedChainReviewSha256) || sha(input.chainReviewBytes) !== input.expectedChainReviewSha256) fail('chain_review_raw_hash_mismatch');
    if (sha(input.runnerBytes) !== OBSERVATION_TRANSITION_RUNNER_SHA256) fail('reviewed_runner_changed');
    const review = parse(input.chainReviewBytes), journal = jsonl(input.journalBytes);
    const anchor = snapshot(input.anchorFiles, input.cutoff), current = snapshot(input.currentFiles, input.cutoff);
    report.originalWindow = { observationId: current.config.observationId, startedAt: current.config.startedAt, deadline: current.config.deadline,
      intervalMinutes: 10, maxReservations: MAX_SLOTS };
    const start = instant(current.config.startedAt), deadline = instant(current.config.deadline);
    if (after(current.config.startedAt, input.cutoff) || after(current.config.startedAt, input.now) || !after(current.config.deadline, input.cutoff)) fail('original_window_expired_or_not_started');
    preserved(anchor, current);
    if (!buffer(input.anchorFiles['task.xml']).equals(buffer(input.currentFiles['task.xml']))
      || !buffer(input.currentFiles['ticks.jsonl']).subarray(0, size(input.anchorFiles['ticks.jsonl'])).equals(buffer(input.anchorFiles['ticks.jsonl']))) fail('task_or_prior_tick_gap_history_changed');
    const currentHashes = Object.fromEntries(FILES.map(name => [name, sha(input.currentFiles[name])]));
    const anchorHashes = Object.fromEntries(FILES.map(name => [name, sha(input.anchorFiles[name])]));
    if (review.contractVersion !== 'bourbon-signal/observer-rebind-chain-validation@1' || review.status !== 'validated_offline_only' || review.applied !== false
      || !isDeepStrictEqual(review.currentSha256, currentHashes) || !isDeepStrictEqual(review.initialArchive, anchorHashes)
      || review.journalSha256 !== sha(input.journalBytes) || review.runnerSha256 !== OBSERVATION_TRANSITION_RUNNER_SHA256
      || review.reservationCount !== current.state.reservations.length || review.reservationRowsSha256 !== sha(canonical(current.state.reservations))
      || review.ticksSha256 !== currentHashes['ticks.jsonl'] || review.ticksCount !== current.ticks.length
      || units(review.checkedAt) !== units(input.cutoff) || review.observationId !== current.config.observationId
      || instant(review.originalStartedAt) !== start || instant(review.originalDeadline) !== deadline || review.fromCommit !== current.config.expectedCommit) fail('review_raw_context_or_scope_mismatch');
    if (!Array.isArray(review.reviewedChain) || review.reviewedChain.length < 1 || review.reviewedChain.length > OBSERVATION_TRANSITION_REVIEW_LIMITS.transitions
      || review.transitionCount !== review.reviewedChain.length || journal.length !== 2 * review.transitionCount) fail('transition_chain_count_or_partial_journal');
    let old = anchor.config.expectedCommit, completedClock = current.config.startedAt;
    const seen = new Set();
    for (let i = 0; i < review.transitionCount; i++) {
      const prepared = journal[i * 2], completed = journal[i * 2 + 1], link = review.reviewedChain[i];
      if (prepared.status !== 'prepared' || completed.status !== 'completed' || !/^[a-f0-9]{32}$/u.test(prepared.operationId || '') || seen.has(prepared.operationId)
        || prepared.fromCommit !== old || !commit(prepared.toCommit) || prepared.toCommit === old
        || prepared.contractVersion !== 'bourbon-signal/observer-rebind@1' || prepared.scope !== 'commit_binding_only_no_deadline_reset_no_task_changes'
        || prepared.observationId !== current.config.observationId || instant(prepared.originalStartedAt) !== start || instant(prepared.originalDeadline) !== deadline
        || prepared.runnerSha256 !== OBSERVATION_TRANSITION_RUNNER_SHA256 || prepared.beforeSha256?.['task.xml'] !== currentHashes['task.xml']
        || !isDeepStrictEqual(completed, { ...prepared, status: 'completed', recordedAt: completed.recordedAt, afterSha256: prepared.proposedSha256 })
        || !closed(link, ['operationId', 'manifestSha256', 'completedReceiptSha256', 'evidenceSha256']) || link.operationId !== prepared.operationId
        || !hash(link.manifestSha256) || link.completedReceiptSha256 !== sha(canonical(completed)) || link.evidenceSha256 !== prepared.evidenceSha256) fail('completed_transition_chain_changed');
      const preparedAt = instant(prepared.recordedAt), done = instant(completed.recordedAt);
      if (!Number.isFinite(preparedAt) || !Number.isFinite(done) || after(completedClock, prepared.recordedAt) || after(prepared.recordedAt, completed.recordedAt)
        || after(completed.recordedAt, input.cutoff) || !after(current.config.deadline, completed.recordedAt)) fail('transition_after_cutoff_or_clock_invalid');
      const proof = prepared.releaseProof;
      if (proof?.url !== 'https://www.bourbonsignal.com/api/ops/health' || ![200, 503].includes(proof.httpStatus) || proof.release?.status !== 'healthy'
        || proof.release.commit !== prepared.toCommit || !hash(proof.sha256) || !Number.isFinite(instant(proof.checkedAt))
        || after(completedClock, proof.checkedAt) || after(proof.checkedAt, completed.recordedAt)) fail('archived_release_proof_invalid');
      seen.add(prepared.operationId); old = prepared.toCommit; completedClock = completed.recordedAt;
    }
    if (old !== current.config.expectedCommit) fail('chain_does_not_end_at_current_commit');
    const slot = Math.min(MAX_SLOTS - 1, Math.floor((cutoff - start) / SLOT_MS)), present = new Set(current.state.reservations.map(row => row.slot));
    const gaps = Array.from({ length: slot + 1 }, (_, i) => i).filter(i => !present.has(i));
    if (!isDeepStrictEqual(review.unreservedSlotsThroughCheckedSlot, gaps) || !Array.isArray(review.slotBindings) || review.slotBindings.length !== current.state.reservations.length) fail('prior_gap_or_slot_history_changed');
    const metadata = new Map();
    for (const receipt of input.outcomeReceipts) {
      if (!closed(receipt, ['sha256', 'body']) || !hash(receipt.sha256) || sha(receipt.body) !== receipt.sha256) fail('outcome_raw_hash_invalid');
      const value = parse(receipt.body), run = value.run || value;
      if (!Number.isSafeInteger(run.id) || run.id < 1 || metadata.has(run.id)) fail('outcome_duplicate_or_id_invalid');
      metadata.set(run.id, { run, sha256: receipt.sha256 });
    }
    const outcomes = [], ids = new Set();
    for (let i = 0; i < current.state.reservations.length; i++) {
      const row = current.state.reservations[i], binding = review.slotBindings[i], outcome = binding?.workflowOutcome;
      if (binding?.slot !== row.slot || binding.observationId !== row.observationId || binding.storedStatus !== row.status || !commit(binding.commit)
        || !closed(outcome, ['observationId', 'runId', 'url', 'status', 'conclusion', 'event', 'headSha']) || outcome.observationId !== row.observationId
        || outcome.headSha !== binding.commit || outcome.status !== 'completed' || outcome.event !== 'workflow_dispatch' || !FINALS.has(outcome.conclusion)
        || !Number.isSafeInteger(outcome.runId) || outcome.runId < 1 || ids.has(outcome.runId)
        || outcome.url !== `https://github.com/tarsagent22/Bourbon-Signal/actions/runs/${outcome.runId}`
        || ['runId', 'conclusion'].some(key => Object.hasOwn(row, key) && row[key] !== outcome[key])) fail('slot_owner_or_prior_outcome_changed');
      // Derive historical owner from completed journal boundaries, independently
      // of the supplied slot label. A transition in progress is ambiguous.
      let owner = anchor.config.expectedCommit;
      const reservedAt = instant(row.reservedAt);
      for (let n = 0; n < journal.length; n += 2) {
        const p = journal[n], c = journal[n + 1];
        if (!after(p.recordedAt, row.reservedAt) && after(c.recordedAt, row.reservedAt)) fail('reservation_crosses_transition_transaction');
        if (!after(c.recordedAt, row.reservedAt)) owner = c.toCommit;
      }
      if (owner !== binding.commit) fail('historical_commit_ownership_changed');
      const entry = metadata.get(outcome.runId), run = entry?.run;
      if (!run || run.status !== 'completed' || !FINALS.has(run.conclusion)) fail('prior_outcome_unknown_or_inflight');
      if (run.id !== outcome.runId || run.conclusion !== outcome.conclusion || run.head_sha !== owner || run.head_branch !== 'main'
        || run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/source-scheduler-monitor.yml'
        || run.display_title !== `Source observation ${row.observationId}`
        || run.html_url !== outcome.url || run.repository?.full_name !== 'tarsagent22/Bourbon-Signal') fail('workflow_outcome_identity_mismatch');
      const created = instant(run.created_at), finished = instant(run.updated_at);
      // A whole-second GHA updated_at cannot prove completion before a cutoff
      // inside that same second. Keep it unresolved rather than backdating it.
      if (!Number.isFinite(created) || !Number.isFinite(finished)) fail('outcome_after_cutoff_or_clock_invalid');
      const finishUpper = units(run.updated_at) + (!run.updated_at.includes('.') ? 9999999n : 0n);
      if (units(run.created_at) + 10000000n < units(row.reservedAt) || after(run.created_at, run.updated_at)
        || after(run.created_at, input.cutoff) || after(run.updated_at, input.cutoff) || finishUpper > units(input.cutoff)) fail('outcome_after_cutoff_or_clock_invalid');
      ids.add(outcome.runId); outcomes.push({ slot: row.slot, commit: owner, storedStatus: row.status, runId: outcome.runId,
        conclusion: outcome.conclusion, metadataSha256: entry.sha256 });
    }
    if (metadata.size !== outcomes.length) fail('unreferenced_outcome_receipts');
    report.continuityIntegrityVerified = true;
    report.preservedHistory = { chainReviewSha256: input.expectedChainReviewSha256, currentSha256: currentHashes, anchorSha256: anchorHashes,
      journalSha256: review.journalSha256, transitionCount: review.transitionCount, reservationCount: outcomes.length,
      failureConclusions: outcomes.filter(row => row.conclusion !== 'success'), unreservedSlotsThroughCheckedSlot: gaps,
      ticksCount: current.ticks.length, ticksSha256: currentHashes['ticks.jsonl'], originalTickFailureCount: current.ticks.filter(row => row.exitCode !== 0).length,
      outcomes, openSlotIncludedInGaps: gaps.includes(slot) };
    if (!after(current.config.deadline, input.now)) fail('original_window_expired_or_not_started');
    if (!commit(input.proposedCommit)) fail('proposed_production_commit_unavailable_or_invalid');
    if (input.proposedCommit === current.config.expectedCommit || review.toCommit !== input.proposedCommit) fail('proposed_commit_context_mismatch');
    const proposed = input.proposedRelease;
    if (!closed(proposed, ['sha256', 'body', 'httpStatus', 'checkedAt']) || !hash(proposed.sha256) || sha(proposed.body) !== proposed.sha256 || ![200, 503].includes(proposed.httpStatus)) fail('proposed_release_body_unavailable_or_hash_invalid');
    const checked = instant(proposed.checkedAt);
    if (!Number.isFinite(checked) || after(proposed.checkedAt, input.cutoff) || after(proposed.checkedAt, input.now) || after(completedClock, proposed.checkedAt)
      || units(input.cutoff) - units(proposed.checkedAt) > BigInt(OBSERVATION_TRANSITION_REVIEW_LIMITS.releaseAgeMs) * 10000n
      || units(input.now) - units(proposed.checkedAt) > BigInt(OBSERVATION_TRANSITION_REVIEW_LIMITS.releaseAgeMs) * 10000n) fail('proposed_release_after_cutoff_or_stale');
    const health = parse(proposed.body);
    if (health.release?.status !== 'healthy' || health.release.commit !== input.proposedCommit || health.release.environment !== 'production') fail('proposed_release_not_exact_healthy_production');
    report.releaseBodyVerified = true;
    report.proposedRelease = { commit: input.proposedCommit, checkedAt: proposed.checkedAt, sha256: proposed.sha256, httpStatus: proposed.httpStatus };
    report.status = 'reviewed_offline_only';
    report.blockers = ['independent_chain_and_provider_authentication_review_required', 'no_operational_transition_authorized'];
    if (Buffer.byteLength(JSON.stringify(report)) > OBSERVATION_TRANSITION_REVIEW_LIMITS.outputBytes) fail('output_byte_limit');
  } catch (error) { report.status = 'blocked'; report.releaseBodyVerified = false; report.proposedRelease = null; report.blockers = [error instanceof ReviewError ? error.code : 'transition_review_failed_closed']; }
  return report;
}
