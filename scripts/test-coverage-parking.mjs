import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCoverageLease, coverageLeaseMarker, readCoverageLease, assertCoverageMergeLease, validateCoverageReadiness } from '../automation/bourbon-signal/coverage-release-policy.mjs';
import { parkExpiredCoveragePulls } from './park-expired-coverage-prs.mjs';
import { parkCoverageRequest } from '../automation/bourbon-signal/coverage-parking.mjs';

const jobKey = 'coverage-request:22222222-2222-4222-8222-222222222222:abcdef0123456789';
const threadId = '11111111-1111-4111-8111-111111111111';
const taskId = 'cx_' + 'a'.repeat(32);
const identity = { jobKey, taskId, headRef: 'coverage/fixture', headSha: 'b'.repeat(40), mainSha: 'c'.repeat(40) };
const now = new Date('2026-10-18T09:00:00Z'); // 5 a.m. EDT
const lease = createCoverageLease({ ...identity, now });
assert.equal(lease.expiresAt, '2026-10-18T10:00:00.000Z');
assert.throws(() => createCoverageLease({ ...identity, now: new Date('2026-10-18T10:00:01Z') }), /full hour/);
assert.throws(() => createCoverageLease({ ...identity, now: new Date('2026-10-18T03:00:00Z') }), /full hour/);
assert.equal(createCoverageLease({ ...identity, now: new Date('2026-12-18T11:00:00Z') }).expiresAt, '2026-12-18T12:00:00.000Z', 'Winter cutoff is 7 a.m. EST.');
assert.throws(() => createCoverageLease({ ...identity, now: new Date('2026-12-18T11:01:00Z') }), /full hour/);
assert.deepEqual(readCoverageLease(coverageLeaseMarker(lease)), lease);
assert.throws(() => readCoverageLease(`${coverageLeaseMarker(lease)}\n${coverageLeaseMarker(lease)}`), /Ambiguous/);
assertCoverageMergeLease(lease, now);
assert.throws(() => assertCoverageMergeLease(lease, new Date(lease.expiresAt)), /expired/);
const readiness = { schemaVersion: 1, headSha: identity.headSha, mainSha: identity.mainSha, checkedAt: now.toISOString(), localChecks: { passed: true }, review: { approved: true }, sourcePreflight: { verified: true, checkedAt: now.toISOString() } };
validateCoverageReadiness(readiness, { ...identity, now });
for (const change of [{ mainSha: 'd'.repeat(40) }, { headSha: 'e'.repeat(40) }, { checkedAt: '2026-10-17T09:00:00Z' }, { localChecks: { passed: false } }, { review: { approved: false } }, { sourcePreflight: { verified: false } }]) assert.throws(() => validateCoverageReadiness({ ...readiness, ...change }, { ...identity, now }));

const repo = 'tarsagent22/Bourbon-Signal';
const makePull = () => ({ number: 793, state: 'open', merged: false, body: `Authority immutable job key: ${jobKey}\n${coverageLeaseMarker(lease)}`, head: { ref: identity.headRef, sha: identity.headSha, repo: { full_name: repo } }, base: { ref: 'main', repo: { full_name: repo } } });
for (const scenario of ['expired', 'not_expired', 'merged', 'foreign', 'publication', 'changed_branch', 'ordinary']) {
  let pull = makePull(), mutations = 0;
  if (scenario === 'merged') pull = { ...pull, state: 'closed', merged: true };
  if (scenario === 'foreign') pull.head.repo.full_name = 'someone/other';
  if (scenario === 'ordinary') pull.body = 'ordinary app work';
  const api = async (route, options = {}) => {
    if (route.includes('?state=open')) return [pull];
    if (route.includes('/git/ref/')) return { object: { sha: scenario === 'changed_branch' ? 'f'.repeat(40) : pull.head.sha } };
    if (route.includes('/actions/runs')) return { total_count: 1, workflow_runs: scenario === 'publication' ? [{ path: '.github/workflows/refresh-feed.yml', status: 'in_progress' }] : [] };
    if (options.method === 'PATCH') { mutations++; pull.state = 'closed'; }
    return pull;
  };
  const run = () => parkExpiredCoveragePulls({ api, now: new Date(scenario === 'not_expired' ? '2026-10-18T09:30:00Z' : '2026-10-18T10:01:00Z') });
  if (['foreign', 'publication', 'changed_branch'].includes(scenario)) await assert.rejects(run);
  else await run();
  assert.equal(mutations, scenario === 'expired' ? 1 : 0, scenario);
}

const directory = await mkdtemp(path.join(tmpdir(), 'bs-coverage-parking-'));
const previousHome = process.env.CODEX_HOME;
try {
  process.env.CODEX_HOME = directory;
  const home = path.join(directory, 'operations/bourbon-signal');
  const workspace = path.join(directory, 'workspace');
  const controllerRoot = path.join(directory, 'controller');
  await mkdir(workspace, { recursive: true }); await mkdir(path.join(controllerRoot, '.operator'), { recursive: true });
  const git = args => execFileSync('git', args, { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  await writeFile(path.join(workspace, 'collector.mjs'), 'saved source work\n'); git(['add', '.']); git(['commit', '-qm', 'preserved collector']); git(['checkout', '-qb', identity.headRef]);
  const expectedHead = git(['rev-parse', 'HEAD']);
  const binding = { prNumber: 793, jobKey, taskId, headRef: identity.headRef };
  const claims = path.join(home, 'claims', `${createHash('sha256').update(jobKey).digest('hex')}.json`);
  const bindingPath = path.join(home, 'release-lane/coverage-bindings/793.json');
  const activePath = path.join(controllerRoot, '.operator/coverage-active-attempt.json');
  await mkdir(path.dirname(claims), { recursive: true }); await mkdir(path.dirname(bindingPath), { recursive: true });
  const reset = async () => { await writeFile(claims, JSON.stringify({ status: 'running', taskId, threadId, job: { requestVersion: '2026-10-18T00:00:00Z' } })); await writeFile(bindingPath, JSON.stringify(binding)); await writeFile(activePath, JSON.stringify({ jobKey, taskId, pullRequest: 793 })); };
  await reset();
  let pull = { ...makePull(), head: { ...makePull().head, sha: expectedHead } }, deferred = 0, closure = 0;
  const deps = { assertTask: async () => {}, assertLease: async () => {}, verify: async () => {}, defer: async () => { assert.equal(pull.state, 'closed'); deferred++; await writeFile(claims, JSON.stringify({ status: 'deferred', taskId, threadId })); return { deferred: true }; }, api: async (route, options = {}) => {
    if (route.includes('/actions/runs')) return { total_count: 0, workflow_runs: [] };
    if (route.includes('/git/ref/')) return { object: { sha: expectedHead } };
    if (options.method === 'PATCH') { closure++; pull.state = 'closed'; }
    return pull;
  } };
  const input = { workspace, controllerRoot, pullRequest: 793, expectedHead, reason: 'night_window_ended' };
  await assert.rejects(() => parkCoverageRequest(jobKey, input, { ...deps, assertLease: undefined }), /ENOENT|writer lock/i);
  await writeFile(path.join(workspace, 'unsaved.txt'), 'preserve me');
  await assert.rejects(() => parkCoverageRequest(jobKey, input, deps), /unsaved/);
  assert.equal(closure, 0);
  await rm(path.join(workspace, 'unsaved.txt'));
  await writeFile(activePath, JSON.stringify({ jobKey, taskId, pullRequest: 793, refreshRunId: '123' }));
  await assert.rejects(() => parkCoverageRequest(jobKey, input, deps), /publication/);
  await reset();
  const result = await parkCoverageRequest(jobKey, input, deps);
  assert.equal(result.parked, true); assert.equal(closure, 1); assert.equal(deferred, 1);
  assert.equal(git(['rev-parse', 'HEAD']), expectedHead);
  assert.equal(await readFile(path.join(workspace, 'collector.mjs'), 'utf8'), 'saved source work\n');
  assert.equal(JSON.parse(await readFile(activePath)).stage, 'parked');
  assert.equal((await parkCoverageRequest(jobKey, input, deps)).replayed, true);
  assert.equal(deferred, 1);
  const journalPath = path.join(home, 'parked', createHash('sha256').update(jobKey).digest('hex'), '793.json');
  const journal = JSON.parse(await readFile(journalPath));
  await writeFile(journalPath, JSON.stringify({ ...journal, status: 'closed' }));
  await writeFile(claims, JSON.stringify({ status: 'running', taskId, threadId, job: { requestVersion: '2026-10-18T00:00:00Z' } }));
  await parkCoverageRequest(jobKey, input, { ...deps, verify: async () => { throw Error('Authority retired.'); }, listJobs: async () => [{ jobKey, status: 'queued', taskId: null, requestVersion: '2026-10-18T00:00:00Z' }] });
  assert.equal(JSON.parse(await readFile(claims)).status, 'deferred', 'Recover a lost response after the server committed deferral.');
  assert.equal(deferred, 1, 'Recovery never repeats a committed deferral.');
  // The real git bundle is sufficient to recover the preserved branch.
  const bundle = path.join(home, 'parked', createHash('sha256').update(jobKey).digest('hex'), `793-${expectedHead}.bundle`);
  assert.match(git(['bundle', 'list-heads', bundle]), new RegExp(expectedHead));
  console.log('Coverage parking passed: EDT/EST deadlines, readiness, expiry, publication/identity guards, unsaved work rejection, real branch bundle, pending deferral and replay.');
} finally {
  if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome;
  if (!path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep)) throw Error('Unexpected fixture path.');
  await rm(directory, { recursive: true, force: true });
}
