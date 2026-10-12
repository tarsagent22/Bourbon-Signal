import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeJob, normalizeTaskTerminalResult, terminalResultForDelivery } from './coverage-result-contract.mjs';

const SCHEMA = 'bourbon-signal/coverage-expansion-result@2';
const BASE = 'https://www.bourbonsignal.com';
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const TASK = /^cx_[a-f0-9]{32}$/;
const digest = value => createHash('sha256').update(value).digest('hex');

export function codexCoverageHome() {
  return path.join(process.env.CODEX_HOME || path.join(homedir(), '.codex'), 'operations', 'bourbon-signal');
}

export function codexCoverageTaskId(job, threadId) {
  if (!UUID.test(threadId || '')) throw new Error('A current Codex thread is required.');
  return `cx_${digest(`${threadId}|${job.jobKey}|${job.requestVersion}`).slice(0, 32)}`;
}

function contextPath(jobKey) { return path.join(codexCoverageHome(), 'claims', `${digest(jobKey)}.json`); }
function reportPath(receiptKey) {
  if (!/^[a-f0-9]{64}$/.test(receiptKey || '')) throw new Error('Invalid report receipt.');
  return path.join(codexCoverageHome(), 'reports', `${receiptKey}.json`);
}
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, file);
}
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }

async function config() {
  const value = await readJson(path.join(codexCoverageHome(), 'coverage-config.json'));
  if (value.baseUrl !== BASE || !UUID.test(value.threadId || '')
    || !/^[a-zA-Z0-9_-]{32,200}$/.test(value.claimSecret || '')
    || !/^[a-zA-Z0-9_-]{32,200}$/.test(value.outcomeSecret || '')) throw new Error('Invalid Codex coverage configuration.');
  if (process.env.CODEX_THREAD_ID !== value.threadId) throw new Error('Coverage work must run in its authorized Codex thread.');
  return value;
}

async function post(secret, payload, allowConflict = false) {
  const response = await fetch(`${BASE}/api/ops/coverage-expansion-queue`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify({ resultSchemaVersion: SCHEMA, ...payload }), redirect: 'error', signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 1_000_000) throw new Error('Coverage response exceeded its limit.');
  const value = JSON.parse(raw);
  if (!response.ok && !(allowConflict && response.status === 409)) throw new Error(`Coverage ${payload.action} returned HTTP ${response.status}.`);
  return { status: response.status, value };
}

export function validateCodexCoverageContext(record, jobKey, taskId, threadId = process.env.CODEX_THREAD_ID) {
  const job = normalizeJob(record.job);
  if (!UUID.test(threadId || '') || record.threadId !== threadId || job.jobKey !== jobKey
    || !TASK.test(taskId || '') || record.taskId !== taskId
    || codexCoverageTaskId(job, threadId) !== taskId
    || !/^[a-zA-Z0-9_-]{43}$/.test(record.authorityCapability || '')) throw new Error('Invalid or foreign Codex coverage context.');
  return record;
}

export async function assertActiveCodexTaskProcess(jobKey, taskId) {
  await config();
  return validateCodexCoverageContext(await readJson(contextPath(jobKey)), jobKey, taskId);
}

export async function verifyAuthority(jobKey, taskId) {
  const record = await assertActiveCodexTaskProcess(jobKey, taskId);
  const result = await post(null, { action: 'verify_authority', jobKey, taskId, authorityCapability: record.authorityCapability }, true);
  if (result.status !== 200 || result.value.authorized !== true) throw new Error('Production did not verify this Codex coverage authority.');
  return true;
}

export async function assertAuthorityCapabilityAbsent(jobKey, values) {
  const record = await readJson(contextPath(jobKey));
  validateCodexCoverageContext(record, jobKey, record.taskId);
  if (values.some(value => String(value || '').includes(record.authorityCapability))) throw new Error('Authority capability appears in public release content.');
}

function git(args, cwd = process.cwd()) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
}

export async function assertAuthorityCapabilityAbsentFromGit(jobKey, { baseSha, headSha, headRef, cwd = process.cwd() }) {
  if (![baseSha, headSha].every(value => /^[a-f0-9]{40}$/.test(value || '')) || !/^[A-Za-z0-9._/-]{1,160}$/.test(headRef || '')) throw new Error('Invalid release history boundary.');
  const record = await readJson(contextPath(jobKey));
  validateCodexCoverageContext(record, jobKey, record.taskId);
  const secret = record.authorityCapability;
  const messages = git(['log', '--format=%B%x00%an%x00%ae%x00%cn%x00%ce', `${baseSha}..${headSha}`], cwd);
  if (messages.status !== 0 || headRef.includes(secret) || messages.stdout.includes(secret)) throw new Error('Release metadata failed authority leakage inspection.');
  const revisions = git(['rev-list', '--reverse', `${baseSha}..${headSha}`], cwd);
  if (revisions.status !== 0) throw new Error('Unable to inspect release history.');
  const commits = revisions.stdout.split(/\r?\n/).filter(Boolean);
  if (commits.length > 200) throw new Error('Release history exceeds its inspection limit.');
  for (const commit of commits) {
    const names = git(['ls-tree', '-r', '--name-only', '-z', commit], cwd);
    const content = git(['grep', '-F', '--full-name', '-e', secret, commit, '--', '.'], cwd);
    if (names.status !== 0 || names.stdout.includes(secret) || content.status !== 1) throw new Error('Tracked release content failed authority leakage inspection.');
  }
}

export async function claimCoverageRequest({ releaseLaneIsBusy } = {}) {
  const settings = await config();
  const busy = releaseLaneIsBusy || (() => {
    const result = spawnSync('gh', ['pr', 'list', '--repo', 'tarsagent22/Bourbon-Signal', '--state', 'open', '--json', 'number'], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    if (result.status !== 0) throw new Error('Release lane could not be verified. Requests remain queued.');
    const pulls = JSON.parse(result.stdout);
    if (!Array.isArray(pulls)) throw new Error('Invalid release lane response.');
    return pulls.length > 0;
  });
  let localActive = false;
  const claims = path.join(codexCoverageHome(), 'claims');
  await mkdir(claims, { recursive: true });
  for (const name of (await readdir(claims)).filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
    const record = await readJson(path.join(claims, name));
    if (record.status === 'running' && record.threadId === settings.threadId) localActive = true;
  }
  if (!localActive && await busy()) return { status: 'waiting_for_release_lane' };
  const peeked = await post(settings.claimSecret, { action: 'peek' });
  if (!peeked.value.job) return { status: 'empty' };
  const pending = normalizeJob(peeked.value.job);
  if (pending.status === 'running') {
    const taskId = codexCoverageTaskId(pending, settings.threadId);
    if (pending.taskId !== taskId) return { status: 'waiting_for_active_worker' };
    await assertActiveCodexTaskProcess(pending.jobKey, taskId);
    await verifyAuthority(pending.jobKey, taskId);
    return { status: 'running', job: pending, taskId };
  }
  if (pending.status === 'claimed') return { status: 'waiting_for_active_worker' };
  if (await busy()) return { status: 'waiting_for_release_lane' };
  const claimed = await post(settings.claimSecret, { action: 'claim' });
  if (!claimed.value.job) return { status: 'empty' };
  let job = normalizeJob(claimed.value.job);
  const taskId = codexCoverageTaskId(job, settings.threadId);
  if (job.status === 'claimed' && claimed.value.leaseToken && claimed.value.authorityCapability) {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(claimed.value.authorityCapability) || !UUID.test(claimed.value.leaseToken)) throw new Error('Invalid claimed authority.');
    const record = { schemaVersion: 1, threadId: settings.threadId, taskId, job,
      authorityCapability: claimed.value.authorityCapability, startedAt: new Date().toISOString(), status: 'running' };
    await atomicJson(contextPath(job.jobKey), record);
    const attached = await post(settings.claimSecret, { action: 'attach', jobKey: job.jobKey, taskId, leaseToken: claimed.value.leaseToken });
    job = normalizeJob(attached.value.job);
    await atomicJson(contextPath(job.jobKey), { ...record, job });
  }
  if (job.status !== 'running' || job.taskId !== taskId) throw new Error('A different worker holds the current coverage request.');
  await assertActiveCodexTaskProcess(job.jobKey, taskId);
  await verifyAuthority(job.jobKey, taskId);
  return { status: 'running', job, taskId };
}

export async function completeCoverageRequest(jobKey, rawResult, alreadyCovered = false) {
  const settings = await config();
  const record = await readJson(contextPath(jobKey));
  await verifyAuthority(jobKey, record.taskId);
  const result = alreadyCovered ? null : normalizeTaskTerminalResult(rawResult);
  if (result) await assertAuthorityCapabilityAbsent(jobKey, [JSON.stringify(result)]);
  const existing = alreadyCovered || result?.blockerCode === 'already_covered';
  const completed = await post(settings.outcomeSecret, { action: existing ? 'complete_existing' : 'complete', jobKey,
    taskId: record.taskId, ...(result ? { terminalResult: terminalResultForDelivery(rawResult, result) } : {}) }, existing);
  if (completed.status === 409) return { completed: false, status: 409 };
  await atomicJson(contextPath(jobKey), { ...record, status: 'complete', completedAt: new Date().toISOString() });
  return { completed: true, job: normalizeJob(completed.value.job, { includeResult: true }) };
}

export function buildCodexCoverageReport(job, result) {
  const area = (job.areaKey || '').replace(/[-:]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const target = area ? `${area}${job.targetType === 'county' ? ' County' : ''}, ${job.stateCode}`
    : job.targetType === 'store' ? `Store ${job.storeId}, ${job.stateCode}` : job.stateCode;
  const complete = result.outcome === 'improved' && result.requesterNotification?.ready === true || result.blockerCode === 'already_covered';
  const lines = [`${complete ? 'Complete' : 'Failed'} — ${target}`, result.headline];
  if (result.outcome === 'improved') lines.push(`Current stores: ${result.metrics.productionLiveStores}.`);
  if (result.outcome === 'engine_improved') lines.push('The engine fix is live, but the coverage request is not fulfilled.');
  if (result.pullRequest) lines.push(`Change: ${result.pullRequest.url}`);
  if (result.canonicalVerification?.verified && result.canonicalVerification.url) lines.push(`Coverage: ${result.canonicalVerification.url}`);
  lines.push(...result.limitations.slice(0, 3).map(line => `• ${line}`));
  return lines.join('\n');
}

export function validateCodexReportProof(record, proof) {
  if (proof.threadId !== record.threadId || proof.phase !== 'final' || !/^msg_[a-zA-Z0-9_-]{8,100}$/.test(proof.messageId || '')
    || !Number.isFinite(Date.parse(record.preparedAt)) || !Number.isFinite(Date.parse(proof.completedAt)) || Date.parse(proof.completedAt) < Date.parse(record.preparedAt)
    || typeof proof.text !== 'string' || !proof.text.includes(record.text)) throw new Error('The final Codex message does not prove this report was delivered.');
  return `codex:${proof.messageId}`;
}

export async function prepareCoverageReport() {
  const settings = await config();
  const directory = path.join(codexCoverageHome(), 'reports');
  await mkdir(directory, { recursive: true });
  for (const name of (await readdir(directory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
    const existing = await readJson(path.join(directory, name));
    if (existing.status === 'prepared') {
      if (existing.threadId !== settings.threadId) throw new Error('A prepared report belongs to a different Codex thread.');
      return { status: 'prepared', receiptKey: name.slice(0, -5), text: existing.text, preparedAt: existing.preparedAt };
    }
  }
  const claimed = await post(settings.outcomeSecret, { action: 'claim_notification' }, true);
  if (claimed.status === 409) return { status: 'delivery_uncertain', note: 'No automatic duplicate report was sent.' };
  if (!claimed.value.job) return { status: 'empty' };
  const job = normalizeJob(claimed.value.job, { includeResult: true });
  if (!TASK.test(job.taskId || '') || !UUID.test(claimed.value.notificationToken || '')) throw new Error('Only Codex-owned coverage results may be reported.');
  const context = await readJson(contextPath(job.jobKey));
  validateCodexCoverageContext(context, job.jobKey, job.taskId, settings.threadId);
  const receiptKey = digest(`${job.jobKey}|${claimed.value.notificationToken}`);
  const text = buildCodexCoverageReport(job, job.terminalResult);
  await atomicJson(reportPath(receiptKey), { schemaVersion: 1, jobKey: job.jobKey, threadId: settings.threadId,
    notificationToken: claimed.value.notificationToken, text, preparedAt: new Date().toISOString(), status: 'prepared' });
  return { status: 'prepared', receiptKey, text };
}

export async function acknowledgeCoverageReport(receiptKey, proof) {
  const settings = await config();
  const record = await readJson(reportPath(receiptKey));
  if (record.threadId !== settings.threadId) throw new Error('Report belongs to a different Codex thread.');
  const platformMessageId = validateCodexReportProof(record, proof);
  if (record.status === 'delivered') return { acknowledged: true, replayed: true };
  await post(settings.outcomeSecret, { action: 'ack_notification', jobKey: record.jobKey,
    notificationToken: record.notificationToken, platformMessageId });
  await atomicJson(reportPath(receiptKey), { ...record, status: 'delivered', messageId: proof.messageId, deliveredAt: proof.completedAt });
  return { acknowledged: true };
}

async function commandLock() {
  const directory = codexCoverageHome(); await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'queue-command.lock');
  let handle;
  try { handle = await open(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = await readJson(file);
    let alive = false;
    if (Number.isInteger(previous.pid) && previous.pid > 0) { try { process.kill(previous.pid, 0); alive = true; } catch {} }
    if (alive && Date.now() - Date.parse(previous.startedAt) < 10 * 60_000) throw new Error('A coverage command is already active.');
    await unlink(file);
    return commandLock();
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return async () => { await handle.close(); await unlink(file); };
}

async function main() {
  const release = await commandLock();
  try {
    const [command, jobKey, file] = process.argv.slice(2);
    let result;
    if (command === 'claim') result = await claimCoverageRequest();
    else if (command === 'verify-authority') result = { authorized: await verifyAuthority(jobKey, file) };
    else if (command === 'complete') result = await completeCoverageRequest(jobKey, await readJson(path.resolve(file)));
    else if (command === 'complete-existing') result = await completeCoverageRequest(jobKey, null, true);
    else if (command === 'report') result = await prepareCoverageReport();
    else if (command === 'ack-report') result = await acknowledgeCoverageReport(jobKey, await readJson(path.resolve(file)));
    else throw new Error('Use claim, verify-authority, complete, complete-existing, report, or ack-report.');
    console.log(JSON.stringify(result));
  } finally { await release(); }
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch(() => { console.error('Codex coverage command failed. No secret or unverified result was published.'); process.exitCode = 1; });
}
