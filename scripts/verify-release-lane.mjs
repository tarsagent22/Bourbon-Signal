import { assertCurrentMain, validateReleaseAdmission } from './lib/release-lane-policy.mjs';
import { assertAuthorityCapabilityAbsent, assertAuthorityCapabilityAbsentFromGit, verifyAuthority } from '../automation/bourbon-signal/coverage-request-agent.mjs';
import { mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import path from 'node:path';

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function fail(message) {
  console.error(`Release lane guard failed: ${message}`);
  process.exit(1);
}

const CANONICAL_REPOSITORY = 'tarsagent22/Bourbon-Signal';
const repository = option('repo', process.env.GITHUB_REPOSITORY || CANONICAL_REPOSITORY);
if (repository !== CANONICAL_REPOSITORY) fail(`release operations are restricted to ${CANONICAL_REPOSITORY}.`);
function commandOutput(command, args) {
  try {
    return execFileSync(command, args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function commandSucceeds(command, args) {
  try {
    execFileSync(command, args, { cwd: process.cwd(), stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function canonicalHermesHome() {
  return process.platform === 'win32'
    ? path.join(homedir(), 'AppData', 'Local', 'hermes')
    : path.join(homedir(), '.hermes');
}

function parentProcessId(pid) {
  const output = process.platform === 'win32'
    ? commandOutput('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").ParentProcessId`])
    : commandOutput('ps', ['-o', 'ppid=', '-p', String(pid)]);
  const parent = Number(output.trim());
  return Number.isInteger(parent) && parent > 0 && parent !== pid ? parent : null;
}

function isDescendantProcess(descendantPid, ancestorPid) {
  let current = descendantPid;
  for (let depth = 0; depth < 64 && current; depth += 1) {
    if (current === ancestorPid) return true;
    current = parentProcessId(current);
  }
  return false;
}

function assertActiveKanbanTaskProcess(taskId) {
  const board = process.env.HERMES_KANBAN_BOARD || '';
  if (board !== 'bourbon-signal-coverage' || process.env.HERMES_KANBAN_TASK !== taskId || !process.env.HERMES_KANBAN_TASK) {
    fail('coverage merge requires broker-injected Kanban worker context.');
  }
  const database = path.join(canonicalHermesHome(), 'kanban', 'boards', 'bourbon-signal-coverage', 'kanban.db');
  const brokerDatabase = process.env.HERMES_KANBAN_DB || '';
  try {
    const canonical = realpathSync(database);
    const injected = realpathSync(brokerDatabase);
    const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
    if (normalize(canonical) !== normalize(injected)) fail('coverage release requires the canonical broker-pinned Kanban database.');
  } catch {
    fail('coverage release requires the canonical broker-pinned Kanban database.');
  }
  if (!commandSucceeds('hermes', ['kanban', '--board', 'bourbon-signal-coverage', 'heartbeat', taskId, '--note', 'coverage release authority check'])) {
    fail('coverage release could not refresh the authenticated Kanban worker heartbeat.');
  }
  const query = [
    'import json,sqlite3,sys',
    'connection=sqlite3.connect(sys.argv[1])',
    'row=connection.execute("SELECT status, worker_pid, claim_expires, last_heartbeat_at FROM tasks WHERE id=?", (sys.argv[2],)).fetchone()',
    'print(json.dumps({"status":row[0],"workerPid":row[1],"claimExpires":row[2],"heartbeat":row[3]}) if row else "")',
  ].join(';');
  const raw = commandOutput('python', ['-c', query, database, taskId]);
  let task;
  try { task = JSON.parse(raw); } catch { fail('coverage merge could not verify the active Kanban worker claim.'); }
  const workerPid = Number(task?.workerPid);
  const claimExpires = Number(task?.claimExpires) * 1_000;
  const heartbeat = Number(task?.heartbeat) * 1_000;
  if (task?.status !== 'running' || !Number.isInteger(workerPid) || workerPid <= 0
    || !Number.isFinite(claimExpires) || claimExpires <= Date.now()
    || !Number.isFinite(heartbeat) || heartbeat < Date.now() - 15 * 60_000
    || !isDescendantProcess(process.pid, workerPid)) {
    fail('coverage merge caller is not a live descendant of the task worker holding the current Kanban claim.');
  }
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || commandOutput('gh', ['auth', 'token']);
const phase = option('phase', 'ci');

function sharedReleaseLaneDirectory() {
  return path.join(canonicalHermesHome(), 'automation', 'bourbon-signal-release-lane');
}

function coverageBindingPath(prNumber) {
  return path.join(sharedReleaseLaneDirectory(), 'coverage-bindings', `${prNumber}.json`);
}

function coveragePendingPath(jobKey) {
  const suffix = createHash('sha256').update(jobKey).digest('hex');
  return path.join(sharedReleaseLaneDirectory(), 'coverage-bindings', 'pending', `${suffix}.json`);
}

async function writeCoveragePending(jobKey, intent) {
  const target = coveragePendingPath(jobKey);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(intent, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}

async function removeCoveragePending(jobKey) {
  try {
    await unlink(coveragePendingPath(jobKey));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function writeCoverageBinding(prNumber, binding) {
  const target = coverageBindingPath(prNumber);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(binding, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, target);
}

async function removeCoverageBinding(prNumber) {
  try {
    await unlink(coverageBindingPath(prNumber));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function registeredWorktrees() {
  const listing = commandOutput('git', ['worktree', 'list', '--porcelain']);
  return listing.split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim())
    .filter(Boolean);
}

function knownObjectiveRoots() {
  const roots = new Set(registeredWorktrees().map((entry) => path.resolve(entry)));
  const dedicated = process.env.BOURBON_SIGNAL_OPERATOR_REPO
    || (process.platform === 'win32' ? 'C:\\c\\Users\\chand\\projects\\Bourbon-Signal-operator-base' : '');
  if (dedicated) roots.add(path.resolve(dedicated));
  return [...roots];
}

async function registeredObjectives() {
  const objectives = [];
  const repositories = new Set();
  const registry = path.join(sharedReleaseLaneDirectory(), 'objectives');
  let entries = [];
  try {
    entries = await readdir(registry);
  } catch (error) {
    if (error?.code !== 'ENOENT') fail(`could not read the host objective registry: ${error instanceof Error ? error.message : String(error)}.`);
  }
  for (const entry of entries.filter((name) => name.endsWith('.json'))) {
    const registryFile = path.join(registry, entry);
    const record = await readJsonFile(registryFile);
    const repositoryPath = typeof record?.repository === 'string' ? path.resolve(record.repository) : '';
    if (!repositoryPath || record?.contractVersion !== 'bourbon-signal/objective-registry@1') fail(`invalid host objective registry record ${entry}.`);
    const objective = await readJsonFile(path.join(repositoryPath, '.operator', 'objective-lock.json'), { optional: true });
    if (!objective) {
      await unlink(registryFile).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
      continue;
    }
    repositories.add(process.platform === 'win32' ? repositoryPath.toLowerCase() : repositoryPath);
    objectives.push({ repository: repositoryPath, objective });
  }
  for (const repositoryPath of knownObjectiveRoots()) {
    const identity = process.platform === 'win32' ? repositoryPath.toLowerCase() : repositoryPath;
    if (repositories.has(identity)) continue;
    const objective = await readJsonFile(path.join(repositoryPath, '.operator', 'objective-lock.json'), { optional: true });
    if (objective) objectives.push({ repository: repositoryPath, objective });
  }
  return objectives;
}

async function githubRequest(apiPath, { method = 'GET', body = null } = {}) {
  if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required.');
  const response = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'BourbonSignalReleaseLane/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`GitHub API ${method} ${apiPath} returned ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

async function github(apiPath, options = {}) {
  try {
    return await githubRequest(apiPath, options);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

async function githubAllPages(apiPath) {
  const separator = apiPath.includes('?') ? '&' : '?';
  const rows = [];
  for (let page = 1; page <= 100; page += 1) {
    const batch = await github(`${apiPath}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(batch)) fail(`GitHub pagination expected an array for ${apiPath}.`);
    rows.push(...batch);
    if (batch.length < 100) return rows;
  }
  fail(`GitHub pagination exceeded the safety bound for ${apiPath}.`);
}

async function assertPullDiscussionCapabilityAbsent(jobKey, prNumber) {
  const [issueComments, reviews, reviewComments] = await Promise.all([
    githubAllPages(`/repos/${repository}/issues/${prNumber}/comments`),
    githubAllPages(`/repos/${repository}/pulls/${prNumber}/reviews`),
    githubAllPages(`/repos/${repository}/pulls/${prNumber}/comments`),
  ]);
  await assertAuthorityCapabilityAbsent(jobKey, [
    ...issueComments.map((entry) => entry?.body),
    ...reviews.map((entry) => entry?.body),
    ...reviewComments.map((entry) => entry?.body),
  ]);
}

function pullMetadataValues(pull) {
  return [
    pull?.title,
    pull?.body,
    pull?.head?.ref,
    pull?.head?.label,
    pull?.base?.ref,
    pull?.base?.label,
    pull?.milestone?.title,
    pull?.milestone?.description,
    ...(pull?.labels || []).map((label) => label?.name),
    ...(pull?.assignees || []).map((assignee) => assignee?.login),
    ...(pull?.requested_reviewers || []).map((reviewer) => reviewer?.login),
    ...(pull?.requested_teams || []).flatMap((team) => [team?.name, team?.slug]),
  ];
}

async function openPullRequests() {
  return github(`/repos/${repository}/pulls?state=open&per_page=100`);
}

async function currentMainSha() {
  const ref = await github(`/repos/${repository}/git/ref/heads/main`);
  return String(ref?.object?.sha || '');
}

async function readJsonFile(filePath, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (optional && error?.code === 'ENOENT') return null;
    fail(`could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}.`);
  }
}

async function assertInheritedReleaseLaneLease() {
  const inherited = process.env.BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID || '';
  if (!/^[a-f0-9]{16}$/.test(inherited)) fail('release admission must run under the shared release-lane writer lock.');
  const metadata = await readJsonFile(path.join(sharedReleaseLaneDirectory(), 'release-lane.lock'));
  if (metadata?.leaseId !== inherited) fail('inherited release-lane lease does not match the shared writer metadata.');
  const inheritanceToken = process.env.BOURBON_SIGNAL_RELEASE_LANE_INHERITANCE_TOKEN || '';
  const inheritanceDigest = inheritanceToken ? createHash('sha256').update(inheritanceToken).digest('hex') : '';
  if (!inheritanceToken || metadata?.inheritanceDigest !== inheritanceDigest) fail('inherited release-lane lease lacks the non-forgeable parent capability.');
  await new Promise((resolve, reject) => {
    const client = createConnection({ host: '127.0.0.1', port: 47683 });
    const timeout = setTimeout(() => client.destroy(new Error('release-lane broker timed out')), 2_000);
    let reply = '';
    client.setEncoding('utf8');
    client.on('connect', () => client.write(`${inheritanceToken}\n`));
    client.on('data', (chunk) => {
      reply += chunk;
      if (reply.includes('\n')) client.end();
    });
    client.on('end', () => {
      clearTimeout(timeout);
      if (reply === 'OK\n') resolve();
      else reject(new Error('release-lane broker rejected the child capability'));
    });
    client.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  }).catch(() => fail('inherited release-lane lease is not backed by the active OS-lock broker.'));
  if (!Number.isInteger(metadata?.pid) || metadata.pid <= 0) fail('inherited release-lane lease has no valid owner process.');
  try { process.kill(metadata.pid, 0); } catch { fail('inherited release-lane lease owner is not active.'); }
  const expiresAt = Date.parse(String(metadata?.expiresAt || ''));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) fail('inherited release-lane lease is expired.');
}

function bodyHasJobKey(body, jobKey) {
  const expected = `Authority immutable job key: ${jobKey}`;
  return String(body || '').replace(/\r\n?/g, '\n').split('\n').some((line) => line.trim() === expected);
}

function isMatchingCoveragePull(pull, { head, expectedHead, expectedMain, jobKey, title, body = null }) {
  return pull?.head?.ref === head
    && pull?.head?.sha === expectedHead
    && pull?.base?.ref === 'main'
    && pull?.base?.sha === expectedMain
    && pull?.draft === true
    && pull?.title === title
    && bodyHasJobKey(pull?.body, jobKey)
    && (body === null || pull.body === body);
}

function isMatchingPendingIntent(intent, expected) {
  return intent?.contractVersion === 'bourbon-signal/coverage-release-pending@1'
    && intent.jobKey === expected.jobKey
    && intent.taskId === expected.taskId
    && intent.headRef === expected.head
    && intent.admittedHead === expected.expectedHead
    && intent.admittedMain === expected.expectedMain
    && intent.title === expected.title
    && intent.bodyDigest === createHash('sha256').update(expected.body).digest('hex');
}

async function createCoveragePullRequest({ expectedMain, mainSha, pulls }) {
  await assertInheritedReleaseLaneLease();
  const head = option('head');
  const title = option('title');
  const bodyFile = option('body-file');
  const jobKey = option('job-key');
  const taskId = option('task-id', process.env.HERMES_KANBAN_TASK || '');
  const expectedHead = option('expected-head');
  if (!/^[a-zA-Z0-9._/-]{1,180}$/.test(head)) fail('--head=<branch> is invalid.');
  if (!title || title.length > 200 || /[\u0000-\u001f\u007f]/.test(title)) fail('--title=<text> is invalid.');
  if (!/^coverage-request:[a-zA-Z0-9:|._/@+-]{20,320}$/.test(jobKey)) fail('--job-key=<immutable job key> is invalid.');
  if (!/^t_[a-zA-Z0-9]{4,80}$/.test(taskId)) fail('release admission requires the authenticated Kanban task ID.');
  assertActiveKanbanTaskProcess(taskId);
  if (!/^[a-f0-9]{40}$/.test(expectedHead)) fail('--expected-head=<40-character SHA> is required.');
  if (!bodyFile || path.isAbsolute(bodyFile) || bodyFile.split(/[\\/]+/).includes('..')) fail('--body-file must be a repository-relative path.');
  const bodyPath = await realpath(path.resolve(bodyFile));
  const repositoryRoot = `${await realpath(path.resolve('.'))}${path.sep}`;
  const comparableBody = process.platform === 'win32' ? bodyPath.toLowerCase() : bodyPath;
  const comparableRoot = process.platform === 'win32' ? repositoryRoot.toLowerCase() : repositoryRoot;
  if (!comparableBody.startsWith(comparableRoot)) fail('--body-file escaped the repository root through a link or junction.');
  const body = (await readFile(bodyPath, 'utf8')).replace(/\r\n?/g, '\n');
  if (!body || Buffer.byteLength(body) > 50_000 || !bodyHasJobKey(body, jobKey)) fail('pull-request body is empty, oversized, or missing the exact immutable job-key line.');
  await assertAuthorityCapabilityAbsent(jobKey, [title, body]);
  await assertAuthorityCapabilityAbsentFromGit(jobKey, {
    baseSha: expectedMain,
    headSha: expectedHead,
    headRef: head,
    cwd: process.cwd(),
  });
  const registered = await registeredObjectives();
  const objectives = registered.map((entry) => entry.objective);
  if (objectives.length > 1) fail('multiple objective locks exist in the host objective registry.');
  if (objectives[0] && String(objectives[0].branch || '') !== head) fail(`objective lock belongs to ${objectives[0].branch || 'an unknown branch'}, not ${head}.`);
  await verifyAuthority(jobKey, taskId);
  const [latestMain, localHead] = await Promise.all([
    currentMainSha(),
    Promise.resolve(commandOutput('git', ['rev-parse', 'HEAD'])),
  ]);
  if (expectedMain !== mainSha || latestMain !== expectedMain) fail('current main changed before pull-request creation.');
  if (localHead !== expectedHead) fail('the local branch changed after review and before pull-request creation.');
  if (commandOutput('git', ['status', '--porcelain=v1', '--untracked-files=all'])) fail('release admission requires a clean reviewed worktree.');
  if (!commandSucceeds('git', ['merge-base', '--is-ancestor', expectedMain, expectedHead])) fail('the reviewed head does not contain current main.');
  const expected = { head, expectedHead, expectedMain, jobKey, taskId, title, body };
  const intent = {
    contractVersion: 'bourbon-signal/coverage-release-pending@1',
    jobKey,
    taskId,
    headRef: head,
    admittedHead: expectedHead,
    admittedMain: expectedMain,
    title,
    bodyDigest: createHash('sha256').update(body).digest('hex'),
  };
  let created;
  if (pulls.length === 0) {
    const admission = validateReleaseAdmission(pulls, { expectedMainSha: expectedMain, currentMainSha: mainSha });
    if (!admission.ok) fail(admission.reason);
    const remoteHeadPath = head.split('/').map(encodeURIComponent).join('/');
    const [latestPulls, latestMain, remoteHead] = await Promise.all([
      openPullRequests(),
      currentMainSha(),
      github(`/repos/${repository}/git/ref/heads/${remoteHeadPath}`),
    ]);
    if (latestPulls.length !== 0) fail('release lane changed immediately before pull-request creation.');
    if (latestMain !== expectedMain) fail('current main changed immediately before pull-request creation.');
    if (remoteHead?.object?.sha !== expectedHead) fail(`remote head ${head} does not match the reviewed head ${expectedHead}.`);
    await writeCoveragePending(jobKey, intent);
    try {
      created = await githubRequest(`/repos/${repository}/pulls`, {
        method: 'POST',
        body: { title, head, base: 'main', body, draft: true },
      });
    } catch (error) {
      const reconciled = await openPullRequests();
      created = reconciled.find((pull) => isMatchingCoveragePull(pull, expected)) || null;
      if (!created) fail(`pull-request creation was uncertain and no matching draft could be recovered during the same locked admission: ${error instanceof Error ? error.message : String(error)}.`);
    }
  } else {
    const pending = await readJsonFile(coveragePendingPath(jobKey), { optional: true });
    if (pulls.length !== 1 || !isMatchingPendingIntent(pending, expected) || !isMatchingCoveragePull(pulls[0], expected)) {
      fail(`release admission found an open pull request without an exact recoverable lock-held pending intent.`);
    }
    created = pulls[0];
  }
  const post = await openPullRequests();
  if (post.length !== 1 || Number(post[0].number) !== Number(created?.number)
    || !isMatchingCoveragePull(post[0], expected)) {
    fail('created pull request did not remain the sole exact draft; it was left open with its pending intent for owner reconciliation.');
  }
  try {
    await writeCoverageBinding(Number(created.number), {
      contractVersion: 'bourbon-signal/coverage-release-binding@1',
      prNumber: Number(created.number),
      jobKey,
      taskId,
      headRef: head,
      admittedHead: expectedHead,
      admittedMain: expectedMain,
    });
  } catch (error) {
    fail(`coverage binding persistence failed; PR #${created.number} and its pending intent were left for owner reconciliation: ${error instanceof Error ? error.message : String(error)}.`);
  }
  try { await removeCoveragePending(jobKey); } catch (error) {
    console.error(`Warning: durable coverage binding succeeded but pending-intent cleanup failed: ${error instanceof Error ? error.message : String(error)}.`);
  }
  return created;
}

async function assertProtectedReleaseLane() {
  const protection = await github(`/repos/${repository}/branches/main/protection`);
  const requiredChecks = protection?.required_status_checks?.checks || [];
  const actionsBound = (context) => requiredChecks.some((check) => check.context === context && Number(check.app_id) === 15368);
  const reviews = protection?.required_pull_request_reviews;
  const bypass = reviews?.bypass_pull_request_allowances || {};
  const bypassEmpty = ['users', 'teams', 'apps'].every((key) => !Array.isArray(bypass[key]) || bypass[key].length === 0);
  const valid = protection?.required_status_checks?.strict === true
    && protection?.enforce_admins?.enabled === true
    && reviews?.required_approving_review_count === 0
    && bypassEmpty
    && protection?.required_conversation_resolution?.enabled === true
    && protection?.allow_force_pushes?.enabled === false
    && actionsBound('build-and-verify')
    && actionsBound('single-release-lane');
  if (!valid) fail('main branch protection does not enforce strict, non-bypassable PR checks and the persistent single-release-lane status.');
  return protection;
}

if (phase === 'admission') {
  const expectedMain = option('expected-main');
  if (!expectedMain || !/^[a-f0-9]{40}$/.test(expectedMain)) fail('--expected-main=<40-character SHA> is required for release admission.');
  const [pulls, mainSha] = await Promise.all([openPullRequests(), currentMainSha()]);
  if (!hasFlag('create-pr')) fail('release admission must atomically create or recover the exact pending pull request with --create-pr.');
  const created = await createCoveragePullRequest({ expectedMain, mainSha, pulls });
  console.log(JSON.stringify({ ok: true, phase, expectedMain, currentMainSha: mainSha, pullRequest: { number: created.number, url: created.html_url, head: created.head?.sha } }));
} else if (phase === 'ci') {
  const currentPr = Number(option('pr', process.env.PR_NUMBER || '0'));
  const pulls = await openPullRequests();
  if (pulls.length > 1) fail(`exactly one active release PR is allowed; found ${pulls.length}: ${pulls.map((pr) => `#${pr.number}`).join(', ')}.`);
  if (pulls.some((pull) => pull.base?.ref !== 'main')) fail('the sole active pull request must target main.');
  if (currentPr && (pulls.length !== 1 || Number(pulls[0].number) !== currentPr)) fail(`PR #${currentPr} is not the sole active release PR.`);
  console.log(JSON.stringify({ ok: true, phase, openPullRequests: pulls.map((pr) => pr.number) }));
} else if (phase === 'reconcile-statuses') {
  const pulls = await openPullRequests();
  const laneValid = pulls.length === 1 && pulls[0].base?.ref === 'main';
  const state = laneValid ? 'success' : 'failure';
  const description = laneValid
    ? `PR #${pulls[0].number} is the sole active release lane.`
    : `Expected one open PR targeting main; found ${pulls.length}.`;
  await Promise.all(pulls.map((pull) => github(`/repos/${repository}/check-runs`, {
    method: 'POST',
    body: {
      name: 'single-release-lane',
      head_sha: pull.head.sha,
      status: 'completed',
      conclusion: state,
      output: { title: laneValid ? 'Single release lane clear' : 'Release lane blocked', summary: description },
    },
  })));
  console.log(JSON.stringify({ ok: laneValid || pulls.length === 0, phase, state, openPullRequests: pulls.map((pull) => pull.number) }));
  if (pulls.length > 1 || (pulls.length === 1 && !laneValid)) process.exit(1);
} else if (phase === 'publish') {
  const runSha = option('sha', process.env.GITHUB_SHA || '');
  const mainSha = await currentMainSha();
  try {
    assertCurrentMain({ runSha, currentMainSha: mainSha });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (process.env.GITHUB_REF && process.env.GITHUB_REF !== 'refs/heads/main') fail(`publication requires refs/heads/main, found ${process.env.GITHUB_REF}.`);
  console.log(JSON.stringify({ ok: true, phase, runSha, currentMainSha: mainSha }));
} else if (phase === 'merge') {
  const prNumber = Number(option('pr'));
  const expectedHead = option('expected-head');
  if (!Number.isInteger(prNumber) || prNumber <= 0) fail('--pr=<number> is required for merge validation.');
  const [pulls, pull, mainSha] = await Promise.all([
    openPullRequests(),
    github(`/repos/${repository}/pulls/${prNumber}`),
    currentMainSha(),
    assertProtectedReleaseLane(),
  ]);
  if (pulls.length !== 1 || Number(pulls[0].number) !== prNumber) fail(`PR #${prNumber} is not the sole active release PR.`);
  if (pull.draft) fail(`PR #${prNumber} is still a draft.`);
  if (pull.base?.ref !== 'main' || pull.base?.sha !== mainSha) fail(`PR #${prNumber} was not validated against current main ${mainSha}.`);
  if (!expectedHead || pull.head?.sha !== expectedHead) fail(`PR #${prNumber} head changed; expected ${expectedHead || 'an explicit SHA'}, found ${pull.head?.sha || 'unknown'}.`);
  const binding = await readJsonFile(coverageBindingPath(prNumber), { optional: true });
  const coverageBranch = String(pull.head?.ref || '').startsWith('coverage/');
  const coverageWorker = process.env.HERMES_KANBAN_BOARD === 'bourbon-signal-coverage';
  if (binding || coverageBranch || coverageWorker) {
    if (!binding) fail(`PR #${prNumber} is a coverage release without a durable lock-held admission binding.`);
    if (binding.contractVersion !== 'bourbon-signal/coverage-release-binding@1'
      || Number(binding.prNumber) !== prNumber
      || binding.headRef !== pull.head?.ref
      || !/^coverage-request:[a-zA-Z0-9:|._/@+-]{20,320}$/.test(String(binding.jobKey || ''))
      || !/^t_[a-zA-Z0-9]{4,80}$/.test(String(binding.taskId || ''))) {
      fail(`PR #${prNumber} has an invalid durable coverage release binding.`);
    }
    if (!/^[a-f0-9]{40}$/i.test(String(binding.admittedHead || ''))
      || !commandSucceeds('git', ['merge-base', '--is-ancestor', binding.admittedHead, expectedHead])) {
      fail(`PR #${prNumber} no longer contains its admitted reviewed head.`);
    }
    const jobKey = binding.jobKey;
    if (!bodyHasJobKey(pull.body, jobKey)) fail(`PR #${prNumber} body no longer matches its durable coverage authority binding.`);
    const taskId = option('task-id', process.env.HERMES_KANBAN_TASK || '');
    if (!/^t_[a-zA-Z0-9]{4,80}$/.test(taskId) || binding.taskId !== taskId) fail('coverage merge requires the authenticated bound Kanban task ID.');
    assertActiveKanbanTaskProcess(taskId);
    if (!commandSucceeds('git', ['merge-base', '--is-ancestor', mainSha, expectedHead])) fail('the final coverage head does not contain current main.');
    await assertAuthorityCapabilityAbsent(jobKey, pullMetadataValues(pull));
    await assertPullDiscussionCapabilityAbsent(jobKey, prNumber);
    await assertAuthorityCapabilityAbsentFromGit(jobKey, {
      baseSha: mainSha,
      headSha: expectedHead,
      headRef: pull.head?.ref || '',
      cwd: process.cwd(),
    });
    await verifyAuthority(jobKey, taskId);
  }
  if (pull.mergeable !== true || String(pull.mergeable_state || '').toLowerCase() !== 'clean') fail(`PR #${prNumber} is not cleanly mergeable (${pull.mergeable_state || 'unknown'}).`);
  if (!hasFlag('apply')) {
    console.log(JSON.stringify({ ok: true, phase, applied: false, prNumber, headSha: pull.head.sha, baseSha: mainSha }));
  } else {
    const result = await github(`/repos/${repository}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: { sha: expectedHead, merge_method: 'squash' },
    });
    if (!result?.merged) fail(`GitHub refused the guarded merge for PR #${prNumber}: ${result?.message || 'unknown reason'}.`);
    console.log(JSON.stringify({ ok: true, phase, applied: true, prNumber, headSha: expectedHead, mergeCommitSha: result.sha }));
    if (binding) {
      try { await removeCoverageBinding(prNumber); } catch (error) {
        console.error(`Release lane guard warning: merged PR #${prNumber}, but stale local binding cleanup failed: ${error instanceof Error ? error.message : String(error)}.`);
      }
    }
  }
} else {
  fail(`unsupported phase ${phase}.`);
}
