import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createConnection } from 'node:net';
import path from 'node:path';
import { assertActiveCodexTaskProcess, codexCoverageHome, deferCoverageRequest, listCoverageJobs, verifyAuthority } from './codex-coverage.mjs';
const REPO = 'tarsagent22/Bourbon-Signal';
const hash = value => createHash('sha256').update(value).digest('hex');
const read = async file => JSON.parse(await readFile(file, 'utf8'));
async function optional(file) { try { return await read(file); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; } }
async function atomic(file, value) { await mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); await rename(tmp, file); }
function command(name, args, cwd) { const r = spawnSync(name, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000 }); if (r.status !== 0) throw Error(`Coverage parking ${name} failed.`); return r.stdout.trim(); }

export async function assertParkingWriterLease() {
  const metadata = await read(path.join(codexCoverageHome(), 'release-lane/release-lane.lock'));
  const token = process.env.BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN || '';
  if (!token || metadata.leaseId !== process.env.BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID || metadata.inheritanceDigest !== hash(token) || Date.parse(metadata.expiresAt) <= Date.now()) throw Error('Parking requires the live shared writer lock.');
  await new Promise((resolve, reject) => {
    const client = createConnection({ host: '127.0.0.1', port: 47683 });
    const timer = setTimeout(() => client.destroy(Error('Writer broker timed out.')), 2000);
    let response = '';
    client.setEncoding('utf8'); client.on('connect', () => client.write(`${token}\n`));
    client.on('data', chunk => { response += chunk; if (response.includes('\n')) client.end(); });
    client.on('end', () => { clearTimeout(timer); response === 'OK\n' ? resolve() : reject(Error('Writer broker refused parking.')); });
    client.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

export async function coverageParkingRequirement(jobKey, now = new Date()) {
  const context = await read(path.join(codexCoverageHome(), 'claims', `${hash(jobKey)}.json`));
  if (!context.progress?.pullRequest) return null;
  const binding = await optional(path.join(codexCoverageHome(), 'release-lane/coverage-bindings', `${context.progress.pullRequest}.json`));
  if (!binding || (binding.lease && Date.parse(binding.lease.expiresAt) > now.getTime())) return null;
  return { workspace: context.progress.workspace, controllerRoot: process.cwd(), pullRequest: context.progress.pullRequest,
    expectedHead: context.progress.headSha, reason: 'night_window_ended' };
}

export async function parkCoverageRequest(jobKey, input, dependencies = {}) {
  const { workspace, controllerRoot, pullRequest, expectedHead, reason } = input || {};
  if (!path.isAbsolute(workspace || '') || !path.isAbsolute(controllerRoot || '') || !Number.isSafeInteger(pullRequest) || pullRequest < 1
    || !/^[a-f0-9]{40}$/.test(expectedHead || '') || !['night_window_ended', 'verification_wait', 'source_wait'].includes(reason)) throw Error('Invalid coverage parking request.');
  const home = codexCoverageHome();
  const context = await read(path.join(home, 'claims', `${hash(jobKey)}.json`));
  await (dependencies.assertTask || assertActiveCodexTaskProcess)(jobKey, context.taskId);
  await (dependencies.assertLease || assertParkingWriterLease)();
  const directory = path.join(home, 'parked', hash(jobKey));
  const journalPath = path.join(directory, `${pullRequest}.json`);
  let journal = await optional(journalPath);
  if (journal && (journal.jobKey !== jobKey || journal.taskId !== context.taskId || journal.expectedHead !== expectedHead || journal.workspace !== workspace)) throw Error('Parking recovery journal changed identity.');
  if (journal?.status === 'parked' && context.status === 'deferred') return { parked: true, replayed: true, pullRequest };
  let alreadyDeferred = context.status === 'deferred' && journal?.status === 'closed';
  if (!alreadyDeferred) {
    try { await (dependencies.verify || verifyAuthority)(jobKey, context.taskId); }
    catch (error) {
      if (journal?.status !== 'closed') throw error;
      const queued = (await (dependencies.listJobs || listCoverageJobs)()).find(job => job.jobKey === jobKey);
      if (!queued || queued.status !== 'queued' || queued.taskId !== null || queued.requestVersion !== context.job?.requestVersion) throw error;
      alreadyDeferred = true; // The server accepted deferral before the local response was saved.
    }
  }
  const api = dependencies.api || (async (route, { method = 'GET', body } = {}) => {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || command('gh', ['auth', 'token']);
    const response = await fetch(`https://api.github.com${route}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw Error(`Coverage parking API returned ${response.status}.`);
    return response.json();
  });
  const git = dependencies.git || ((args, cwd = workspace) => command('git', args, cwd));
  const bindingPath = path.join(home, 'release-lane/coverage-bindings', `${pullRequest}.json`);
  const binding = await optional(bindingPath) || journal?.binding;
  const transferred = context.controllerTransfer;
  if (!binding || binding.jobKey !== jobKey || binding.prNumber !== pullRequest
    || (binding.taskId !== context.taskId && binding.taskId !== transferred?.previousTaskId)) throw Error('Coverage PR binding does not match its actual owner.');
  const activePath = path.join(controllerRoot, '.operator/coverage-active-attempt.json');
  const active = await read(activePath);
  if (active.jobKey !== jobKey || active.taskId !== context.taskId || active.pullRequest !== pullRequest || active.refreshRunId || active.productionRefresh || active.mergeCommit) throw Error('Active coverage attempt changed or entered publication; do not park it.');
  const registry = path.join(home, 'release-lane/objectives');
  const registrations = await readdir(registry).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const roots = new Set([workspace, controllerRoot]);
  for (const name of registrations.filter(name => name.endsWith('.json'))) {
    const registration = await read(path.join(registry, name));
    if (registration.repository) roots.add(registration.repository);
  }
  for (const root of roots) if (await optional(path.join(root, '.operator/objective-lock.json'))) throw Error('An objective lock needs separate guarded reconciliation; parking will not remove it.');
  if (git(['rev-parse', 'HEAD']) !== expectedHead || git(['branch', '--show-current']) !== binding.headRef
    || git(['status', '--porcelain=v1', '--untracked-files=all'])) throw Error('Coverage workspace changed or has unsaved files.');
  const pull = await api(`/repos/${REPO}/pulls/${pullRequest}`);
  if (!['open', 'closed'].includes(pull.state) || pull.merged || pull.merged_at || pull.head?.sha !== expectedHead || pull.head?.ref !== binding.headRef
    || pull.head?.repo?.full_name !== REPO || pull.base?.ref !== 'main'
    || !String(pull.body || '').replace(/\r/g, '').split('\n').some(line => line.trim() === `Authority immutable job key: ${jobKey}`)) throw Error('PR changed or merged; preserve publication protection.');
  const runs = await api(`/repos/${REPO}/actions/runs?head_sha=${expectedHead}&per_page=100`);
  if (!Array.isArray(runs.workflow_runs) || runs.total_count >= 100 || runs.workflow_runs.some(run => /(?:refresh-feed|repack-active-snapshot)\.yml(?:@.*)?$/.test(run.path || '') && run.status !== 'completed')) throw Error('Publication state is active or uncertain.');
  const refPath = `/repos/${REPO}/git/ref/heads/${binding.headRef.split('/').map(encodeURIComponent).join('/')}`;
  if ((await api(refPath)).object?.sha !== expectedHead) throw Error('Remote branch does not preserve the exact head.');
  if (!journal) {
    await mkdir(directory, { recursive: true });
    const bundle = path.join(directory, `${pullRequest}-${expectedHead}.bundle`);
    const range = /^[a-f0-9]{40}$/.test(binding.admittedMain || '') ? [binding.headRef, `^${binding.admittedMain}`] : [binding.headRef];
    git(['bundle', 'create', bundle, ...range]); git(['bundle', 'verify', bundle]);
    journal = { schemaVersion: 1, status: 'prepared', jobKey, taskId: context.taskId, pullRequest, expectedHead, workspace, controllerRoot, branch: binding.headRef, reason, binding, bundle, savedProgress: context.progress, createdAt: new Date().toISOString() };
    await atomic(journalPath, journal);
  }
  const current = await api(`/repos/${REPO}/pulls/${pullRequest}`);
  if (current.merged || current.merged_at || current.head?.sha !== expectedHead || current.head?.ref !== binding.headRef) throw Error('PR changed immediately before parking.');
  if (current.state === 'open') {
    const closed = await api(`/repos/${REPO}/pulls/${pullRequest}`, { method: 'PATCH', body: { state: 'closed' } });
    if (closed.state !== 'closed' || closed.merged || closed.merged_at) throw Error('PR closure is uncertain; retain authority.');
  }
  const final = await api(`/repos/${REPO}/pulls/${pullRequest}`);
  if (final.state !== 'closed' || final.merged || final.merged_at || (await api(refPath)).object?.sha !== expectedHead) throw Error('Parked PR/branch verification failed.');
  await atomic(journalPath, { ...journal, status: 'closed', closedAt: new Date().toISOString() });
  const deferred = alreadyDeferred ? { deferred: true } : await (dependencies.defer || deferCoverageRequest)(jobKey, reason);
  if (!deferred.deferred) throw Error('PR is saved and closed, but queue deferral still needs reconciliation.');
  const existingBinding = await optional(bindingPath);
  if (existingBinding && JSON.stringify(existingBinding) !== JSON.stringify(binding)) throw Error('Binding changed during parking.');
  if (existingBinding) await rename(bindingPath, path.join(directory, `${pullRequest}-binding.json`));
  const deferredContextPath = path.join(home, 'claims', `${hash(jobKey)}.json`);
  const deferredContext = await read(deferredContextPath);
  await atomic(deferredContextPath, { ...deferredContext, status: 'deferred', progress: { ...deferredContext.progress, stage: 'parked', workspace, branch: binding.headRef, pullRequest, headSha: expectedHead }, parkingFile: journalPath });
  await atomic(activePath, { ...active, stage: 'parked', parked: true, parkingFile: journalPath, coverageFulfilled: false, updatedAt: new Date().toISOString(), nextStep: 'Reclaim this exact pending job when the lane and overnight window permit; reconcile main, refresh source/customer baselines, rerun review/checks, then use fresh admission. Do not reopen the old PR directly.' });
  await atomic(journalPath, { ...journal, status: 'parked', parkedAt: new Date().toISOString(), deferred: true });
  return { parked: true, pullRequest, branch: binding.headRef, headSha: expectedHead, requestPending: true };
}
