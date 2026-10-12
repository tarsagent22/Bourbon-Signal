import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { claimCoverageRequest, completeCoverageRequest, prepareCoverageReport, acknowledgeCoverageReport,
  codexCoverageHome, codexCoverageTaskId, validateCodexCoverageContext, validateCodexReportProof,
  assertAuthorityCapabilityAbsentFromGit, prepareNightlyReports, deferCoverageRequest } from '../automation/bourbon-signal/codex-coverage.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'bs-codex-coverage-'));
const previous = { home: process.env.CODEX_HOME, thread: process.env.CODEX_THREAD_ID, fetch: globalThis.fetch };
const threadId = '11111111-1111-4111-8111-111111111111';
const job = { jobKey: 'coverage-request:22222222-2222-4222-8222-222222222222:abcdef0123456789', coverageRequestId: '22222222-2222-4222-8222-222222222222',
  requestVersion: '2026-10-12T10:00:00.000Z', targetType: 'city', stateCode: 'VA', areaKey: 'sterling', storeId: null,
  canonicalTargetKey: 'city:VA:sterling', baselineCoverageFingerprint: 'coverage-v2|VA|available', status: 'claimed', taskId: null };
const capability = 'a'.repeat(43);
const taskId = codexCoverageTaskId(job, threadId);
const result = { schemaVersion: 'bourbon-signal/coverage-expansion-result@2', outcome: 'blocked', headline: 'No current public inventory source was verified.',
  productionFingerprint: null, pullRequest: null, ci: { status: 'not_applicable' }, refresh: null,
  metrics: { baselineExactStoreRows: 0, productionExactStoreRows: 0, baselineLiveStores: 0, productionLiveStores: 0, baselineCustomerCards: 0, productionCustomerCards: 0 },
  canonicalVerification: { verified: false, url: null }, exploration: { sourceCandidates: [{ sourceId: 'official-source', sourceClass: 'first_party', outcome: 'blocked', reasonCode: 'access_denied' }], knownSourceUniverseComplete: true, secondPass: 'not_required' },
  requesterNotification: { ready: false, reasonCode: 'blocked' }, blockerCode: 'no_verified_inventory', limitations: ['No coverage change was released.'] };
const calls = [];
let peekJob = { ...job, status: 'queued' };
try {
  process.env.CODEX_HOME = directory; process.env.CODEX_THREAD_ID = threadId;
  await mkdir(codexCoverageHome(), { recursive: true });
  await writeFile(path.join(codexCoverageHome(), 'coverage-config.json'), JSON.stringify({ baseUrl: 'https://www.bourbonsignal.com', threadId,
    claimSecret: 'b'.repeat(32), outcomeSecret: 'c'.repeat(32) }));
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://www.bourbonsignal.com/api/ops/coverage-expansion-queue');
    const input = JSON.parse(options.body); calls.push(input.action);
    if (input.action === 'peek') return Response.json({ job: peekJob });
    if (input.action === 'claim') return Response.json({ job, leaseToken: '33333333-3333-4333-8333-333333333333', authorityCapability: capability });
    if (input.action === 'attach') { assert.equal(input.taskId, taskId); return Response.json({ job: { ...job, status: 'running', taskId } }); }
    if (input.action === 'verify_authority') { assert.equal(input.taskId, taskId); assert.equal(input.authorityCapability, capability); return Response.json({ authorized: true }); }
    if (input.action === 'complete') return Response.json({ job: { ...job, taskId, status: 'notification_pending', terminalResult: result, deliveryUncertain: false } });
    if (input.action === 'complete_existing') return Response.json({ error: 'Exact target is not currently covered.' }, { status: 409 });
    if (input.action === 'claim_notification') return Response.json({ job: { ...job, taskId, status: 'notification_sending', terminalResult: result, deliveryUncertain: false }, notificationToken: '44444444-4444-4444-8444-444444444444' });
    if (input.action === 'ack_notification') { assert.equal(input.platformMessageId, 'codex:msg_fixture12345678'); return Response.json({ acknowledged: true }); }
    throw Error('Unexpected endpoint action.');
  };
  assert.equal((await claimCoverageRequest({ releaseLaneIsBusy: () => true })).status, 'waiting_for_release_lane');
  assert.equal(calls.length, 0);
  const claimed = await claimCoverageRequest({ releaseLaneIsBusy: () => false });
  assert.equal(claimed.taskId, taskId);
  peekJob = { ...job, status: 'running', taskId };
  assert.equal((await claimCoverageRequest({ releaseLaneIsBusy: () => true })).status, 'running', 'An active task must resume while its own PR is open.');
  assert.equal((await deferCoverageRequest(job.jobKey, 'research_budget', { releaseLaneIsBusy: () => true })).deferred, false,
    'An open PR keeps its active request and production authority.');
  assert.doesNotMatch(JSON.stringify(claimed), new RegExp(capability));
  assert.notEqual(taskId, codexCoverageTaskId({ ...job, requestVersion: '2026-10-13T10:00:00.000Z' }, threadId));
  const record = { threadId, taskId, job, authorityCapability: capability };
  assert.throws(() => validateCodexCoverageContext(record, job.jobKey, 't_oldhermes', threadId));
  assert.throws(() => validateCodexCoverageContext(record, job.jobKey, taskId, '55555555-5555-4555-8555-555555555555'));

  const repository = path.join(directory, 'repo'); await mkdir(repository);
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  await writeFile(path.join(repository, 'safe.txt'), 'safe'); git(['add', '.']); git(['commit', '-qm', 'safe base']);
  const baseSha = git(['rev-parse', 'HEAD']);
  await writeFile(path.join(repository, 'safe.txt'), 'safe changed'); git(['add', '.']); git(['commit', '-qm', 'safe change']);
  await assertAuthorityCapabilityAbsentFromGit(job.jobKey, { baseSha, headSha: git(['rev-parse', 'HEAD']), headRef: 'coverage/fixture', cwd: repository });
  git(['commit', '--allow-empty', '-qm', capability]);
  await assert.rejects(() => assertAuthorityCapabilityAbsentFromGit(job.jobKey, { baseSha, headSha: git(['rev-parse', 'HEAD']), headRef: 'coverage/fixture', cwd: repository }), /leakage/);

  assert.equal((await completeCoverageRequest(job.jobKey, null, true)).completed, false);
  assert.equal((await completeCoverageRequest(job.jobKey, result)).completed, true);
  const report = await prepareCoverageReport(); assert.match(report.text, /^Failed — Sterling, VA/);
  const claimCount = calls.filter(action => action === 'claim_notification').length;
  assert.equal((await prepareCoverageReport()).receiptKey, report.receiptKey);
  assert.equal(calls.filter(action => action === 'claim_notification').length, claimCount, 'An unacknowledged report is not claimed twice.');
  const proof = { threadId, phase: 'final', messageId: 'msg_fixture12345678', completedAt: new Date(Date.now() + 1000).toISOString(), text: report.text };
  const prepared = { threadId, text: report.text, preparedAt: '2026-10-12T00:00:00Z' };
  assert.throws(() => validateCodexReportProof(prepared, { ...proof, text: 'Unrelated final message.' }));
  assert.throws(() => validateCodexReportProof(prepared, { ...proof, phase: 'commentary' }));
  assert.throws(() => validateCodexReportProof(prepared, { ...proof, completedAt: '2026-10-11T00:00:00Z' }));
  await acknowledgeCoverageReport(report.receiptKey, proof);
  assert.equal((await acknowledgeCoverageReport(report.receiptKey, proof)).replayed, true);
  assert.equal(calls.filter(action => action === 'ack_notification').length, 1);
  const batchJobs = ['sterling', 'glen-allen'].map((area, index) => {
    const nextJob = { ...job, jobKey: job.jobKey.replace('abcdef0123456789', `abcdef012345678${index}`), areaKey: area,
      canonicalTargetKey: `city:VA:${area}`, status: 'notification_pending' };
    return { ...nextJob, taskId: codexCoverageTaskId(nextJob, threadId) };
  });
  for (const batchJob of batchJobs) {
    await writeFile(path.join(codexCoverageHome(), 'claims', `${createHash('sha256').update(batchJob.jobKey).digest('hex')}.json`),
      JSON.stringify({ threadId, job: batchJob, taskId: batchJob.taskId, authorityCapability: capability, status: 'complete' }));
  }
  let batchClaims = 0;
  const acknowledged = [];
  globalThis.fetch = async (_url, options) => {
    const input = JSON.parse(options.body);
    if (input.action === 'claim_notification') {
      const batchJob = batchJobs[batchClaims++];
      return Response.json({ job: batchJob ? { ...batchJob, terminalResult: result, deliveryUncertain: false } : null,
        notificationToken: batchJob ? `44444444-4444-4444-8444-44444444444${batchClaims}` : null });
    }
    if (input.action === 'ack_notification') { acknowledged.push(input.jobKey); return Response.json({ acknowledged: true }); }
    throw Error('Unexpected batch action');
  };
  const batch = await prepareNightlyReports();
  assert.equal(batch.reports.length, 2); assert.match(batch.text, /Sterling/); assert.match(batch.text, /Glen Allen/);
  assert.equal((await prepareNightlyReports()).reports.length, 2);
  assert.equal(batchClaims, 3, 'Replaying an unacknowledged batch does not claim or resend another report.');
  const batchProof = { ...proof, text: batch.text, messageId: 'msg_batch123456789', completedAt: new Date(Date.now() + 1000).toISOString() };
  for (const receipt of batch.reports) await acknowledgeCoverageReport(receipt.receiptKey, batchProof);
  assert.equal(new Set(acknowledged).size, 2, 'One actual final message acknowledges every contained receipt.');
  const text = await readFile(new URL('../automation/bourbon-signal/codex-coverage.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /\bhermes\b|kanban|telegram/i, 'Codex coverage has no legacy runtime or reporting dependency.');
  console.log('Codex queue binding, authority leakage, exact coverage, and final-message receipt checks passed.');
} finally {
  globalThis.fetch = previous.fetch;
  for (const [key, value] of Object.entries({ CODEX_HOME: previous.home, CODEX_THREAD_ID: previous.thread })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw Error('Unexpected test directory.');
  await rm(directory, { recursive: true, force: true });
}
