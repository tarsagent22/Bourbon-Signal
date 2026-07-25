#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createFindingService } from './lib/operator-findings.mjs';
import { buildObjectiveLock, selectObjective, validateObjectiveLock } from './lib/operator-policy.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_LOCK = path.resolve('.operator', 'objective-lock.json');
const RELEASE_DISPOSITIONS = new Set(['resolved', 'dismissed', 'blocked']);

function option(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

async function maybeJson(file, read = readFile) {
  try { return JSON.parse(await read(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function objectiveEntriesFrom(file, read = readFile) {
  if (!file) throw new Error('select requires --file with canonical findings.');
  const payload = await maybeJson(path.resolve(file), read);
  const entries = Array.isArray(payload) ? payload : payload?.findings;
  if (!Array.isArray(entries)) throw new Error('Finding input must be an array or an object with a findings array.');
  return entries.map((entry) => {
    const finding = { ...(entry.finding || entry) };
    delete finding.rankScore;
    return {
      finding,
      issueNumber: Number.isInteger(entry.issueNumber) ? entry.issueNumber : null,
    };
  });
}

async function runGit(args, cwd = process.cwd()) {
  const { stdout = '' } = await execFileAsync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return stdout.trim();
}

async function runGh(args) {
  const { stdout = '' } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  const output = stdout.trim();
  if (!output) return null;
  try { return JSON.parse(output); } catch { return output; }
}

async function localBranchExists(git, branch, cwd = process.cwd()) {
  try {
    await git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], cwd);
    return true;
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
}

async function isAncestor(git, branch, baseBranch, cwd = process.cwd()) {
  try {
    await git(['merge-base', '--is-ancestor', branch, baseBranch], cwd);
    return true;
  } catch (error) {
    if (error.code === 1) return false;
    throw error;
  }
}

function parseWorktreeList(output) {
  const records = [];
  let current = null;
  for (const line of String(output || '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) records.push(current);
      current = { path: path.resolve(line.slice('worktree '.length)), branch: null, head: null };
    } else if (current && line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    }
  }
  if (current) records.push(current);
  return records;
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function archivedRemoteHead(output, branch) {
  const expectedRef = `refs/heads/${branch}`;
  for (const line of String(output || '').split(/\r?\n/)) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (ref === expectedRef && /^[a-f0-9]{40}$/i.test(sha || '')) return sha.toLowerCase();
  }
  return null;
}

async function preflightSelection({ git, lock, worktreeDir }) {
  const dirty = await git(['status', '--porcelain'], process.cwd());
  if (dirty) throw new Error('Refusing to start an objective from a dirty base worktree.');
  if (await localBranchExists(git, lock.branch)) throw new Error(`Objective branch already exists: ${lock.branch}`);
  const worktrees = parseWorktreeList(await git(['worktree', 'list', '--porcelain'], process.cwd()));
  if (worktrees.some((entry) => samePath(entry.path, worktreeDir))) {
    throw new Error(`Objective worktree is already registered: ${worktreeDir}`);
  }
}

async function rollbackSelection({ git, findingService, lock, lockFile, worktreeDir, repo, remote, canonicalClaimed, remoteClaimed, fs }) {
  const errors = [];
  if (canonicalClaimed) {
    try {
      await findingService.update({
        id: lock.objectiveId,
        status: 'backlog',
        repo,
        apply: true,
        expectedStatuses: ['selected', 'in-progress'],
        expectedIssueNumber: lock.issueNumber,
      });
    } catch (error) {
      // Preserve every claim artifact when canonical rollback fails so an operator can recover safely.
      return [error];
    }
  }
  try {
    const worktrees = parseWorktreeList(await git(['worktree', 'list', '--porcelain'], process.cwd()));
    if (worktrees.some((entry) => samePath(entry.path, worktreeDir))) {
      await git(['worktree', 'remove', '--force', worktreeDir], process.cwd());
    }
  } catch (error) { errors.push(error); }
  try {
    if (await localBranchExists(git, lock.branch)) await git(['branch', '-D', lock.branch], process.cwd());
  } catch (error) { errors.push(error); }
  if (errors.length) return errors;
  if (remoteClaimed) {
    try { await git(['push', remote, '--delete', lock.branch], process.cwd()); } catch (error) { return [error]; }
  }
  try { await fs.rm(lockFile, { force: true }); } catch (error) { errors.push(error); }
  return errors;
}

async function applySelection({ git, findingService, lock, lockFile, worktreeDir, repo, remote, fs }) {
  await preflightSelection({ git, lock, worktreeDir });
  const canonical = await findingService.read({ repo, state: 'all' });
  const issue = canonical.find((entry) => entry.finding.id === lock.objectiveId);
  if (!issue) throw new Error(`Canonical GitHub finding not found: ${lock.objectiveId}`);
  if (issue.issue.number !== lock.issueNumber) {
    throw new Error(`Finding ${lock.objectiveId} is issue #${issue.issue.number}, not expected issue #${lock.issueNumber}.`);
  }
  if (issue.finding.status !== 'backlog') {
    throw new Error(`Finding ${lock.objectiveId} cannot be claimed; canonical status is already ${issue.finding.status}.`);
  }

  let canonicalClaimed = false;
  let remoteClaimed = false;
  try {
    await git([
      'push',
      '--porcelain',
      `--force-with-lease=refs/heads/${lock.branch}:`,
      remote,
      `${lock.baseBranch}:refs/heads/${lock.branch}`,
    ], process.cwd());
    remoteClaimed = true;
    await findingService.update({
      id: lock.objectiveId,
      status: 'selected',
      repo,
      apply: true,
      expectedStatuses: ['backlog'],
      expectedIssueNumber: lock.issueNumber,
    });
    canonicalClaimed = true;
    await fs.mkdir(path.dirname(lockFile), { recursive: true });
    await fs.writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await git(['worktree', 'add', '-b', lock.branch, worktreeDir, lock.baseBranch], process.cwd());
    await findingService.update({
      id: lock.objectiveId,
      status: 'in-progress',
      repo,
      apply: true,
      expectedStatuses: ['selected'],
      expectedIssueNumber: lock.issueNumber,
    });
  } catch (error) {
    if (!canonicalClaimed && !remoteClaimed) throw error;
    const rollbackErrors = await rollbackSelection({
      git,
      findingService,
      lock,
      lockFile,
      worktreeDir,
      repo,
      remote,
      canonicalClaimed,
      remoteClaimed,
      fs,
    });
    if (!rollbackErrors.length) throw error;
    throw new AggregateError([error, ...rollbackErrors], `${error.message}; objective rollback also failed.`);
  }
}

async function releaseSafety({ git, lock, worktreeDir, remote }) {
  const worktrees = parseWorktreeList(await git(['worktree', 'list', '--porcelain'], process.cwd()));
  const registered = worktrees.find((entry) => samePath(entry.path, worktreeDir)) || null;
  if (registered && registered.branch !== lock.branch) {
    throw new Error(`Registered objective worktree is on ${registered.branch || 'a detached HEAD'}, not ${lock.branch}.`);
  }
  if (registered) {
    const dirty = await git(['status', '--porcelain'], worktreeDir);
    if (dirty) throw new Error('Refusing to release a dirty objective worktree.');
  }

  if (!(await localBranchExists(git, lock.branch))) {
    const remoteOutput = await git(['ls-remote', '--heads', remote, `refs/heads/${lock.branch}`], process.cwd());
    const remoteHead = archivedRemoteHead(remoteOutput, lock.branch);
    if (!remoteHead) throw new Error(`Objective branch ${lock.branch} is missing locally and on ${remote}; refusing release.`);
    await git(['fetch', '--no-tags', remote, `refs/heads/${lock.branch}`], process.cwd());
    const fetchedHead = await git(['rev-parse', 'FETCH_HEAD'], process.cwd());
    if (fetchedHead.toLowerCase() !== remoteHead) throw new Error(`Remote objective branch ${lock.branch} changed during release verification.`);
    const merged = await isAncestor(git, 'FETCH_HEAD', lock.baseBranch);
    if (!merged) throw new Error(`Remote objective branch ${lock.branch} is not merged into ${lock.baseBranch}; preserving archive.`);
    return { registered, merged: true, archived: false, head: remoteHead, branchExists: false };
  }
  const head = await git(['rev-parse', lock.branch], process.cwd());
  const merged = await isAncestor(git, lock.branch, lock.baseBranch);
  let archived = false;
  if (!merged) {
    const remoteOutput = await git(['ls-remote', '--heads', remote, `refs/heads/${lock.branch}`], process.cwd());
    archived = archivedRemoteHead(remoteOutput, lock.branch) === head.toLowerCase();
    if (!archived) {
      throw new Error(`Objective branch ${lock.branch} must be merged or archived at the same commit on ${remote} before release.`);
    }
  }
  return { registered, merged, archived, head, branchExists: true };
}

async function applyRelease({ git, findingService, lock, lockFile, worktreeDir, repo, disposition, remote, fs }) {
  const safety = await releaseSafety({ git, lock, worktreeDir, remote });
  await findingService.update({
    id: lock.objectiveId,
    status: disposition,
    repo,
    apply: true,
    expectedStatuses: ['in-progress', disposition],
    expectedIssueNumber: lock.issueNumber,
  });
  if (safety.registered) await git(['worktree', 'remove', worktreeDir], process.cwd());
  if (safety.branchExists && await localBranchExists(git, lock.branch)) {
    await git(['branch', safety.merged ? '-d' : '-D', lock.branch], process.cwd());
  }
  if (safety.merged) {
    const remoteOutput = await git(['ls-remote', '--heads', remote, `refs/heads/${lock.branch}`], process.cwd());
    if (archivedRemoteHead(remoteOutput, lock.branch) === safety.head) await git(['push', remote, '--delete', lock.branch], process.cwd());
  }
  await fs.rm(lockFile);
  return safety;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const [command] = argv;
  const apply = argv.includes('--apply');
  const environment = dependencies.environment || process.env;
  if (apply && !environment.BOURBON_SIGNAL_RELEASE_LANE_LEASE_ID) {
    throw new Error('Applied objective selection and release require the shared release-lane OS lock; use npm run operator:objective -- ...');
  }
  const lockFile = path.resolve(option(argv, 'lock') || DEFAULT_LOCK);
  const requestedWorktree = option(argv, 'worktree') ? path.resolve(option(argv, 'worktree')) : null;
  const repoOption = option(argv, 'repo');
  const remote = option(argv, 'remote') || 'origin';
  const git = dependencies.runGit || runGit;
  const gh = dependencies.runGh || runGh;
  const log = dependencies.log || console.log;
  const fs = {
    mkdir: dependencies.mkdir || mkdir,
    readFile: dependencies.readFile || readFile,
    rm: dependencies.rm || rm,
    writeFile: dependencies.writeFile || writeFile,
  };
  const findingService = createFindingService({ runGh: gh });
  const existingLock = await maybeJson(lockFile, fs.readFile);

  if (command === 'status') {
    const result = existingLock ? { locked: true, lock: existingLock, validation: validateObjectiveLock(existingLock) } : { locked: false, lock: null };
    log(JSON.stringify(result, null, 2));
    return result;
  }

  if (command === 'select') {
    const entries = await objectiveEntriesFrom(option(argv, 'file'), fs.readFile);
    const finding = selectObjective(entries.map((entry) => entry.finding));
    const selectedEntry = entries.find((entry) => entry.finding.id === finding.id);
    const issueNumberValue = option(argv, 'issue-number');
    const issueNumber = issueNumberValue ? Number(issueNumberValue) : selectedEntry?.issueNumber ?? null;
    if (issueNumberValue && (!Number.isInteger(issueNumber) || issueNumber <= 0)) throw new Error('--issue-number must be a positive integer.');
    if (issueNumberValue && selectedEntry?.issueNumber && selectedEntry.issueNumber !== issueNumber) {
      throw new Error(`--issue-number ${issueNumber} does not match canonical issue #${selectedEntry.issueNumber}.`);
    }
    const lock = buildObjectiveLock({
      finding,
      issueNumber,
      selectedAt: option(argv, 'at') || new Date().toISOString(),
      existingLock,
      baseBranch: option(argv, 'base') || 'main',
      repo: repoOption,
      worktree: requestedWorktree,
      remote,
    });
    if (apply && !requestedWorktree) throw new Error('Applied objective selection requires --worktree.');
    if (apply && !issueNumber) throw new Error('Applied objective selection requires a canonical GitHub issue number.');
    const result = {
      mode: apply ? 'apply' : 'dry-run',
      lock,
      worktree: requestedWorktree,
      mutations: apply ? ['claim-remote-branch', 'claim-selected', 'write-lock', 'create-branch', 'create-worktree', 'mark-in-progress'] : [],
    };
    if (apply) await applySelection({ git, findingService, lock, lockFile, worktreeDir: requestedWorktree, repo: repoOption, remote, fs });
    log(JSON.stringify(result, null, 2));
    return result;
  }

  if (command === 'release') {
    if (!existingLock) throw new Error('No objective lock exists.');
    const validation = validateObjectiveLock(existingLock);
    if (!validation.ok) throw new Error(`Invalid objective lock: ${validation.errors.join('; ')}`);
    const disposition = option(argv, 'disposition');
    if (!disposition || !RELEASE_DISPOSITIONS.has(disposition)) {
      throw new Error('Release requires --disposition resolved|dismissed|blocked.');
    }
    const worktreeDir = requestedWorktree || (existingLock.worktree ? path.resolve(existingLock.worktree) : null);
    if (!worktreeDir) throw new Error('Objective lock does not identify a worktree; pass --worktree.');
    if (existingLock.worktree && requestedWorktree && !samePath(existingLock.worktree, requestedWorktree)) {
      throw new Error(`Release worktree does not match the lock: ${existingLock.worktree}`);
    }
    if (!existingLock.issueNumber) throw new Error('Objective lock does not identify a canonical GitHub issue.');
    const repo = repoOption || existingLock.repo;
    const releaseRemote = option(argv, 'remote') || existingLock.remote || 'origin';
    const plannedSafety = await releaseSafety({ git, lock: existingLock, worktreeDir, remote: releaseRemote });
    const result = {
      mode: apply ? 'apply' : 'dry-run',
      action: 'release',
      objectiveId: existingLock.objectiveId,
      disposition,
      lockFile,
      worktree: worktreeDir,
      safety: plannedSafety,
      mutations: apply ? ['update-canonical-disposition', 'remove-worktree', 'remove-local-branch', 'remove-merged-remote-branch', 'remove-lock'] : [],
    };
    if (apply) result.safety = await applyRelease({
      git,
      findingService,
      lock: existingLock,
      lockFile,
      worktreeDir,
      repo,
      disposition,
      remote: releaseRemote,
      fs,
    });
    log(JSON.stringify(result, null, 2));
    return result;
  }

  throw new Error('Usage: operator-objective.mjs status | select --file FILE [--issue-number N] [--repo OWNER/REPO] [--base main] --worktree PATH [--apply] | release --disposition resolved|dismissed|blocked [--worktree PATH] [--repo OWNER/REPO] [--remote origin] [--apply]');
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
