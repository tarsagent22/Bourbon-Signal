import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { reviewSourceObservationTransition, OBSERVATION_TRANSITION_RUNNER_SHA256, OBSERVATION_TRANSITION_REVIEW_LIMITS } from './lib/source-observation-transition-review.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const canonical = value => JSON.stringify(sorted(value)).replace(/[\u007f-\uffff]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const parse = value => JSON.parse(Buffer.from(value).toString());
const FILES = ['installation.json', 'reservations.json', 'ticks.jsonl', 'task.xml'];
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);
const START = '2026-10-23T00:00:00.000Z', DEADLINE = '2026-10-25T00:00:00.000Z', CUTOFF = '2026-10-23T02:15:00.000Z';
const runnerBytes = await readFile(new URL('./source-observation-runner.mjs', import.meta.url));
assert.equal(sha(runnerBytes), OBSERVATION_TRANSITION_RUNNER_SHA256);
const hashes = files => Object.fromEntries(FILES.map(name => [name, sha(files[name])]));
const line = value => Buffer.from(JSON.stringify(value) + '\n');
function rawRun(row, owner) {
  return { id: row.runId, head_sha: owner, head_branch: 'main', path: '.github/workflows/source-scheduler-monitor.yml',
    event: 'workflow_dispatch', status: 'completed', conclusion: row.conclusion,
    display_title: `Source observation ${row.observationId}`, created_at: row.reservedAt, updated_at: row.reservedAt,
    html_url: `https://github.com/tarsagent22/Bourbon-Signal/actions/runs/${row.runId}`,
    repository: { full_name: 'tarsagent22/Bourbon-Signal' }, actor: { privateAccount: 'PRIVATE_CANARY' } };
}
function fixture(transitions = 2) {
  // Synthetic chain-review fixture, not output authenticated by a provider or
  // a claim that a historical Python archive fold was independently performed.
  const observationId = 'synthetic-transition';
  const config = { observationId, expectedCommit: A, startedAt: START, deadline: DEADLINE };
  const row = (slot, conclusion = 'success') => ({ slot, observationId: `${observationId}-s${slot}`,
    reservedAt: new Date(Date.parse(START) + slot * 600000 + 3000).toISOString(), status: 'completed', healthHttpStatus: 503,
    runId: 1000 + slot, conclusion });
  const installation = { version: 1, taskName: 'BourbonSignalSourceObservation818', scope: 'capture_only_no_monitor_rescue',
    maxReservations: 288, intervalMinutes: 10, runnerSha256: OBSERVATION_TRANSITION_RUNNER_SHA256, ...config };
  const first = [row(0, 'failure'), row(2)], task = Buffer.from('<Task>unchanged PRIVATE_CANARY</Task>');
  const tick = { checkedAt: '2026-10-23T00:01:00.000Z', status: 'runner_failed_closed', exitCode: 1 };
  const anchorFiles = { 'installation.json': encode(installation), 'reservations.json': encode({ version: 1, config, reservations: first }),
    'ticks.jsonl': line(tick), 'task.xml': task };
  let active = A;
  const journal = [], reviewedChain = [], commits = [B, C];
  for (let i = 0; i < transitions; i++) {
    const op = String(i + 1).padStart(32, '0'), next = commits[i];
    const at = `2026-10-23T0${i + 1}:00:05.000Z`, done = `2026-10-23T0${i + 1}:00:05.001Z`;
    const prepared = { contractVersion: 'bourbon-signal/observer-rebind@1', operationId: op, status: 'prepared', recordedAt: at,
      fromCommit: active, toCommit: next, observationId, originalStartedAt: START, originalDeadline: DEADLINE,
      scope: 'commit_binding_only_no_deadline_reset_no_task_changes', runnerSha256: OBSERVATION_TRANSITION_RUNNER_SHA256,
      beforeSha256: { 'task.xml': sha(task) }, proposedSha256: { 'installation.json': 'f'.repeat(64), 'reservations.json': 'e'.repeat(64) }, evidenceSha256: '9'.repeat(64),
      releaseProof: { url: 'https://www.bourbonsignal.com/api/ops/health', checkedAt: at, httpStatus: 503,
        release: { status: 'healthy', commit: next }, sha256: '8'.repeat(64) } };
    const completed = { ...prepared, status: 'completed', recordedAt: done, afterSha256: prepared.proposedSha256 };
    journal.push(prepared, completed); reviewedChain.push({ operationId: op, manifestSha256: '7'.repeat(64), completedReceiptSha256: sha(canonical(completed)), evidenceSha256: prepared.evidenceSha256 });
    active = next;
  }
  const reservations = [...first, row(7), ...(transitions > 1 ? [row(13)] : [])];
  const currentFiles = { ...anchorFiles, 'installation.json': encode({ ...installation, expectedCommit: active }),
    'reservations.json': encode({ version: 1, config: { ...config, expectedCommit: active }, reservations }),
    'ticks.jsonl': Buffer.concat([line(tick), line({ checkedAt: '2026-10-23T02:12:00.000Z', status: 'writer_locked', exitCode: 1 })]) };
  const journalBytes = Buffer.concat(journal.map(line));
  const owners = reservations.map(row => row.slot < 6 ? A : row.slot < 12 ? B : C);
  const outcomes = reservations.map((row, i) => ({ observationId: row.observationId, runId: row.runId,
    url: `https://github.com/tarsagent22/Bourbon-Signal/actions/runs/${row.runId}`, status: 'completed', conclusion: row.conclusion,
    event: 'workflow_dispatch', headSha: owners[i] }));
  const slotBindings = reservations.map((row, i) => ({ slot: row.slot, observationId: row.observationId, commit: owners[i], storedStatus: row.status, workflowOutcome: outcomes[i] }));
  const present = new Set(reservations.map(row => row.slot));
  const review = { contractVersion: 'bourbon-signal/observer-rebind-chain-validation@1', status: 'validated_offline_only', applied: false,
    fromCommit: active, toCommit: D, checkedAt: CUTOFF, observationId, originalStartedAt: START, originalDeadline: DEADLINE,
    transitionCount: transitions, reviewedChain, initialArchive: hashes(anchorFiles), currentSha256: hashes(currentFiles),
    journalSha256: sha(journalBytes), runnerSha256: sha(runnerBytes), reservationCount: reservations.length,
    reservationRowsSha256: sha(canonical(reservations)), ticksCount: 2, ticksSha256: sha(currentFiles['ticks.jsonl']),
    unreservedSlotsThroughCheckedSlot: Array.from({ length: 14 }, (_, i) => i).filter(i => !present.has(i)), slotBindings };
  const outcomeReceipts = reservations.map((row, i) => { const body = encode(rawRun(row, owners[i])); return { sha256: sha(body), body }; });
  const releaseBody = encode({ release: { status: 'healthy', commit: D, environment: 'production' }, privateAccount: 'PRIVATE_CANARY' });
  const input = { chainReviewBytes: encode(review), expectedChainReviewSha256: '', anchorFiles, currentFiles, journalBytes, runnerBytes, outcomeReceipts,
    proposedCommit: D, proposedRelease: { sha256: sha(releaseBody), body: releaseBody, httpStatus: 503, checkedAt: '2026-10-23T02:14:00.000Z' }, cutoff: CUTOFF, now: CUTOFF };
  const bind = () => { input.chainReviewBytes = encode(review); input.expectedChainReviewSha256 = sha(input.chainReviewBytes); };
  bind(); return { input, review, journal, reservations, bind };
}
function safe(report) {
  assert.equal(report.applied, false); assert.equal(report.executable, false); assert.equal(report.authorized, false);
  assert.equal(report.providerAuthenticationVerified, false); assert.equal(report.dispatches, 0); assert.equal(report.requiresExplicitLeadReview, true);
  assert.deepEqual(report.futureWindow, { status: 'unknown_separate_authorization_required', startedAt: null, deadline: null });
  assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY')); assert.ok(Buffer.byteLength(JSON.stringify(report)) <= OBSERVATION_TRANSITION_REVIEW_LIMITS.outputBytes);
  assert.ok(!Object.hasOwn(report, 'commands')); assert.ok(!Object.hasOwn(report, 'proposedState'));
}
function rejected(input, code) {
  const result = reviewSourceObservationTransition(input); safe(result); assert.equal(result.status, 'blocked');
  if (code) assert.ok(result.blockers.includes(code), JSON.stringify(result.blockers)); return result;
}

for (const n of [1, 2]) test(`pure review after ${n} completed transitions preserves ownership, failures, gaps and all bytes`, () => {
  const { input, reservations } = fixture(n), before = structuredClone(input), result = reviewSourceObservationTransition(input);
  safe(result); assert.equal(result.status, 'reviewed_offline_only', JSON.stringify(result.blockers));
  assert.equal(result.continuityIntegrityVerified, true); assert.equal(result.releaseBodyVerified, true);
  assert.equal(result.preservedHistory.transitionCount, n); assert.equal(result.preservedHistory.reservationCount, reservations.length);
  assert.equal(result.preservedHistory.failureConclusions[0].conclusion, 'failure'); assert.equal(result.preservedHistory.originalTickFailureCount, 2);
  assert.ok(result.preservedHistory.unreservedSlotsThroughCheckedSlot.includes(1)); assert.equal(result.originalWindow.deadline, DEADLINE);
  assert.deepEqual(structuredClone(input), before);
});
for (const mode of ['expired now', 'expired cutoff', 'new deadline', 'new start', 'new cap', 'new cadence', 'changed task', 'changed runner', 'prior tick erased', 'prior failure success', 'prior row deleted', 'prior identity', 'unknown outcome', 'inflight', 'changed owner', 'postcutoff reservation', 'postcutoff tick', 'postcutoff outcome']) test(`fails closed: ${mode}`, () => {
  const value = fixture(), { input } = value;
  if (mode === 'expired now') input.now = DEADLINE;
  if (mode === 'expired cutoff') input.cutoff = input.now = DEADLINE;
  if (['new deadline', 'new start', 'new cap', 'new cadence'].includes(mode)) {
    const installation = parse(input.currentFiles['installation.json']), state = parse(input.currentFiles['reservations.json']);
    if (mode === 'new deadline') installation.deadline = state.config.deadline = '2026-10-25T01:00:00.000Z';
    if (mode === 'new start') installation.startedAt = state.config.startedAt = '2026-10-23T00:00:01.000Z';
    if (mode === 'new cap') installation.maxReservations = 289;
    if (mode === 'new cadence') installation.intervalMinutes = 5;
    input.currentFiles['installation.json'] = encode(installation); input.currentFiles['reservations.json'] = encode(state);
  }
  if (mode === 'changed task') input.currentFiles['task.xml'] = Buffer.from('different task');
  if (mode === 'changed runner') input.runnerBytes = Buffer.from('different runner');
  if (mode === 'prior tick erased') input.currentFiles['ticks.jsonl'] = line({ checkedAt: START, exitCode: 0, status: 'success' });
  if (['prior failure success', 'prior row deleted', 'prior identity', 'postcutoff reservation'].includes(mode)) {
    const state = parse(input.currentFiles['reservations.json']);
    if (mode === 'prior failure success') state.reservations[0].conclusion = 'success';
    if (mode === 'prior row deleted') state.reservations.shift();
    if (mode === 'prior identity') state.reservations[0].healthHttpStatus = 200;
    if (mode === 'postcutoff reservation') state.reservations.push({ slot: 14, observationId: 'synthetic-transition-s14', reservedAt: '2026-10-23T02:20:00.000Z', status: 'submitted' });
    input.currentFiles['reservations.json'] = encode(state);
  }
  if (mode === 'postcutoff tick') input.currentFiles['ticks.jsonl'] = Buffer.concat([input.currentFiles['ticks.jsonl'], line({ checkedAt: '2026-10-23T02:15:00.001Z', status: 'submitted', exitCode: 0 })]);
  if (mode === 'unknown outcome') input.outcomeReceipts.pop();
  if (mode === 'inflight' || mode === 'postcutoff outcome') {
    const receipt = input.outcomeReceipts.at(-1), run = parse(receipt.body);
    if (mode === 'inflight') run.status = 'in_progress'; else run.updated_at = '2026-10-23T02:15:00.001Z';
    receipt.body = encode(run); receipt.sha256 = sha(receipt.body);
  }
  if (mode === 'changed owner') { value.review.slotBindings[0].commit = C; value.review.slotBindings[0].workflowOutcome.headSha = C; value.bind(); }
  rejected(input);
});
for (const mode of ['missing', 'raw hash', 'wrong commit', 'unhealthy', 'nonproduction', 'future', 'after cutoff before now', 'submillisecond after cutoff', 'stale', 'old cutoff fresh then stale now', 'date only']) test(`new release proof gate: ${mode}`, () => {
  const { input } = fixture();
  if (mode === 'missing') input.proposedRelease = null;
  if (mode === 'raw hash') input.proposedRelease.sha256 = '0'.repeat(64);
  if (mode === 'future') input.proposedRelease.checkedAt = '2026-10-23T02:16:00.000Z';
  if (mode === 'after cutoff before now') { input.proposedRelease.checkedAt = '2026-10-23T02:15:00.001Z'; input.now = '2026-10-23T02:16:00.000Z'; }
  if (mode === 'submillisecond after cutoff') { input.proposedRelease.checkedAt = '2026-10-23T02:15:00.0000001Z'; input.now = '2026-10-23T02:16:00.000Z'; }
  if (mode === 'stale') input.proposedRelease.checkedAt = '2026-10-23T01:59:59.999Z';
  if (mode === 'old cutoff fresh then stale now') input.now = '2026-10-23T02:31:00.001Z';
  if (mode === 'date only') input.proposedRelease.checkedAt = '2026-10-23';
  if (['wrong commit', 'unhealthy', 'nonproduction'].includes(mode)) {
    const body = parse(input.proposedRelease.body);
    if (mode === 'wrong commit') body.release.commit = C;
    if (mode === 'unhealthy') body.release.status = 'critical';
    if (mode === 'nonproduction') body.release.environment = 'preview';
    input.proposedRelease.body = encode(body); input.proposedRelease.sha256 = sha(input.proposedRelease.body);
  }
  const result = rejected(input); assert.equal(result.continuityIntegrityVerified, true);
});
for (const mode of ['changed journal', 'prepared only', 'chain receipt', 'chain anchor', 'new gap list', 'review hash', 'current commit', 'noop', 'unknown future commit']) test(`chain and proposed context fail closed: ${mode}`, () => {
  const value = fixture(), { input } = value;
  if (mode === 'changed journal') { value.journal[0].toCommit = D; input.journalBytes = Buffer.concat(value.journal.map(line)); }
  if (mode === 'prepared only') input.journalBytes = Buffer.concat(value.journal.slice(0, -1).map(line));
  if (mode === 'chain receipt') { value.review.reviewedChain[0].completedReceiptSha256 = '0'.repeat(64); value.bind(); }
  if (mode === 'chain anchor') { value.review.initialArchive['task.xml'] = '0'.repeat(64); value.bind(); }
  if (mode === 'new gap list') { value.review.unreservedSlotsThroughCheckedSlot = []; value.bind(); }
  if (mode === 'review hash') input.expectedChainReviewSha256 = '0'.repeat(64);
  if (mode === 'current commit') { value.review.fromCommit = A; value.bind(); }
  if (mode === 'noop') input.proposedCommit = C;
  if (mode === 'unknown future commit') input.proposedCommit = null;
  rejected(input);
});
test('fresh reference/body hashes cannot turn a synthetic chain review into operational/provider authority', () => {
  const { input } = fixture(), result = reviewSourceObservationTransition(input); safe(result);
  assert.equal(result.status, 'reviewed_offline_only'); assert.ok(result.blockers.includes('independent_chain_and_provider_authentication_review_required'));
  assert.ok(result.blockers.includes('no_operational_transition_authorized'));
});
test('whole-second workflow metadata inside cutoff second is conservatively unresolved', () => {
  const { input } = fixture(), receipt = input.outcomeReceipts.at(-1), run = parse(receipt.body);
  run.updated_at = '2026-10-23T02:15:00Z'; receipt.body = encode(run); receipt.sha256 = sha(receipt.body);
  rejected(input, 'outcome_after_cutoff_or_clock_invalid');
});
test('submillisecond postcutoff tick cannot be rounded into frozen history', () => {
  const { input } = fixture(); input.currentFiles['ticks.jsonl'] = Buffer.concat([input.currentFiles['ticks.jsonl'], line({ checkedAt: '2026-10-23T02:15:00.0000001Z', exitCode: 1, status: 'writer_locked' })]);
  rejected(input, 'tick_after_cutoff_or_invalid_clock');
});
test('cutoff even100ns later than now fails before reading history', () => {
  const value = fixture(); value.input.cutoff = value.review.checkedAt = '2026-10-23T02:15:00.0000001Z'; value.bind();
  rejected(value.input, 'cutoff_or_review_clock_invalid');
});
test('15-minute release freshness boundary retains100ns precision', () => {
  const { input } = fixture(); input.proposedRelease.checkedAt = '2026-10-23T02:00:05.001Z';
  input.now = '2026-10-23T02:15:05.0010001Z'; rejected(input, 'proposed_release_after_cutoff_or_stale');
});
test('historical prepared/done chronology cannot invert within one millisecond', () => {
  const value = fixture(); value.journal[0].recordedAt = '2026-10-23T01:00:05.0000001Z'; value.journal[1].recordedAt = '2026-10-23T01:00:05.000Z';
  value.input.journalBytes = Buffer.concat(value.journal.map(line)); value.review.journalSha256 = sha(value.input.journalBytes);
  value.review.reviewedChain[0].completedReceiptSha256 = sha(canonical(value.journal[1])); value.bind();
  rejected(value.input, 'transition_after_cutoff_or_clock_invalid');
});
test('historical release proof100ns after completion cannot be rounded backward', () => {
  const value = fixture();
  for (const row of value.journal.slice(0, 2)) row.releaseProof.checkedAt = '2026-10-23T01:00:05.0010001Z';
  value.input.journalBytes = Buffer.concat(value.journal.map(line)); value.review.journalSha256 = sha(value.input.journalBytes);
  value.review.reviewedChain[0].completedReceiptSha256 = sha(canonical(value.journal[1])); value.bind();
  rejected(value.input, 'archived_release_proof_invalid');
});
test('oversized bodies, malformed dates, partial JSONL and unknown receipt fields fail closed without leaking private data', () => {
  for (const mode of ['oversized', 'calendar', 'partial ticks', 'private receipt']) {
    const { input } = fixture();
    if (mode === 'oversized') input.proposedRelease.body = Buffer.alloc(OBSERVATION_TRANSITION_REVIEW_LIMITS.releaseBytes + 1);
    if (mode === 'calendar') input.cutoff = '2026-02-30T02:15:00.000Z';
    if (mode === 'partial ticks') input.currentFiles['ticks.jsonl'] = Buffer.from('{"status":');
    if (mode === 'private receipt') input.outcomeReceipts[0].privateAccount = 'PRIVATE_CANARY';
    rejected(input);
  }
});
