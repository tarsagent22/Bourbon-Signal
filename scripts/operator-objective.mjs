#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { buildObjectiveLock, selectObjective, validateObjectiveLock } from './lib/operator-policy.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_LOCK = path.resolve('.operator', 'objective-lock.json');

function option(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

async function maybeJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function findingsFrom(file) {
  if (!file) throw new Error('select requires --file with canonical findings.');
  const payload = await maybeJson(path.resolve(file));
  const findings = Array.isArray(payload) ? payload : payload?.findings;
  if (!Array.isArray(findings)) throw new Error('Finding input must be an array or an object with a findings array.');
  return findings.map((entry) => {
    const finding = { ...(entry.finding || entry) };
    delete finding.rankScore;
    return finding;
  });
}

async function git(args, cwd = process.cwd()) {
  const { stdout = '' } = await execFileAsync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return stdout.trim();
}

async function applyLock(lock, lockFile, worktreeDir) {
  const dirty = await git(['status', '--porcelain']);
  if (dirty) throw new Error('Refusing to start an objective from a dirty worktree.');
  try {
    await git(['show-ref', '--verify', '--quiet', `refs/heads/${lock.branch}`]);
    throw new Error(`Objective branch already exists: ${lock.branch}`);
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  await mkdir(path.dirname(lockFile), { recursive: true });
  await writeFile(lockFile, `${JSON.stringify(lock, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    if (worktreeDir) await git(['worktree', 'add', '-b', lock.branch, worktreeDir, lock.baseBranch]);
    else await git(['switch', '-c', lock.branch, lock.baseBranch]);
  } catch (error) {
    await rm(lockFile, { force: true });
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const [command] = argv;
  const apply = argv.includes('--apply');
  const lockFile = path.resolve(option(argv, 'lock') || DEFAULT_LOCK);
  const worktreeDir = option(argv, 'worktree') ? path.resolve(option(argv, 'worktree')) : null;
  const existingLock = await maybeJson(lockFile);

  if (command === 'status') {
    const result = existingLock ? { locked: true, lock: existingLock, validation: validateObjectiveLock(existingLock) } : { locked: false, lock: null };
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  if (command === 'select') {
    const finding = selectObjective(await findingsFrom(option(argv, 'file')));
    const issueNumberValue = option(argv, 'issue-number');
    const lock = buildObjectiveLock({
      finding,
      issueNumber: issueNumberValue ? Number(issueNumberValue) : null,
      selectedAt: option(argv, 'at') || new Date().toISOString(),
      existingLock,
      baseBranch: option(argv, 'base') || 'main',
    });
    const result = {
      mode: apply ? 'apply' : 'dry-run',
      lock,
      worktree: worktreeDir,
      mutations: apply ? ['write-lock', 'create-branch', worktreeDir ? 'create-worktree' : 'switch-branch'] : [],
    };
    if (apply) await applyLock(lock, lockFile, worktreeDir);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  if (command === 'release') {
    if (!existingLock) throw new Error('No objective lock exists.');
    const branch = await git(['branch', '--show-current'], worktreeDir || process.cwd());
    if (branch !== existingLock.branch) throw new Error(`Release the objective from ${existingLock.branch}; current branch is ${branch || 'detached'}.`);
    const result = { mode: apply ? 'apply' : 'dry-run', action: 'release', objectiveId: existingLock.objectiveId, lockFile };
    if (apply) await rm(lockFile);
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  throw new Error('Usage: operator-objective.mjs status | select --file FILE [--issue-number N] [--base main] [--worktree PATH] [--apply] | release [--worktree PATH] [--apply]');
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invoked) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
