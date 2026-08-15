#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const PRODUCTION_BRANCH = 'main';
const REF_NAME = 'origin/main';
const WORKFLOW = 'refresh-feed.yml';
const RUN_LIST_LIMIT = '20';
const TIMESTAMP_SKEW_MS = 5 * 60_000;

export const SOURCE_SCOUT_MANIFEST_CONTRACT_VERSION = 'bourbon-signal-source-scout-input-v1';
export const SOURCE_SCOUT_REQUIRED_FILES = Object.freeze({
  'optimization/source-run-history.json': 'updatedAt',
  'site/stats.json': 'generatedAt',
  'source-health.json': 'generatedAt',
  'source-slo-7d.json': 'generatedAt',
  'source-usefulness-roi.json': 'generatedAt',
});

function validSha(value) {
  return /^[a-f0-9]{40}$/i.test(String(value || ''));
}

function validTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function selectNewestSuccessfulMainRun(runs) {
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.headBranch === PRODUCTION_BRANCH
      && run?.status === 'completed'
      && run?.conclusion === 'success'
      && Number.isFinite(Number(run?.databaseId))
      && validTime(run?.createdAt) != null)
    .sort((left, right) => validTime(right.createdAt) - validTime(left.createdAt) || Number(right.databaseId) - Number(left.databaseId))[0] || null;
}

async function jsonFile(directory, relativePath) {
  const absolute = path.join(directory, ...relativePath.split('/'));
  let stat;
  try {
    stat = await lstat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Required source-scout file ${relativePath} is missing.`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Required source-scout file ${relativePath} must be a regular file.`);
  return parseJson(await readFile(absolute, 'utf8'), `Required source-scout file ${relativePath}`);
}

async function artifactFiles(directory, current = directory) {
  const files = [];
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source-scout artifact contains a symbolic link: ${path.relative(directory, absolute)}.`);
    if (entry.isDirectory()) files.push(...await artifactFiles(directory, absolute));
    else if (entry.isFile()) files.push(absolute);
    else throw new Error(`Source-scout artifact contains an unsupported filesystem entry: ${path.relative(directory, absolute)}.`);
  }
  return files;
}

async function hashArtifact(directory) {
  const files = [];
  for (const absolute of await artifactFiles(directory)) {
    const content = await readFile(absolute);
    files.push({
      path: path.relative(directory, absolute).split(path.sep).join('/'),
      bytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const treeSha256 = createHash('sha256')
    .update(files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join(''))
    .digest('hex');
  return { files, treeSha256 };
}

export async function validateSourceScoutArtifact({ artifactDirectory, run, originMainSha } = {}) {
  if (!validSha(originMainSha)) throw new Error(`Resolved ${REF_NAME} is not a full Git commit SHA.`);
  if (!validSha(run?.headSha) || String(run.headSha).toLowerCase() !== String(originMainSha).toLowerCase()) {
    throw new Error(`Newest successful main refresh-feed run head SHA ${run?.headSha || 'missing'} does not match ${REF_NAME} ${originMainSha}; refusing stale scout input.`);
  }
  if (run?.headBranch !== PRODUCTION_BRANCH || run?.status !== 'completed' || run?.conclusion !== 'success') {
    throw new Error('Source-scout run must be a completed successful main refresh-feed run.');
  }
  const startedAtMs = validTime(run.createdAt);
  const finishedAtMs = validTime(run.updatedAt);
  if (startedAtMs == null || finishedAtMs == null || finishedAtMs < startedAtMs) throw new Error('Source-scout run timestamps are invalid.');

  const timestamps = {};
  for (const [relativePath, timestampField] of Object.entries(SOURCE_SCOUT_REQUIRED_FILES)) {
    const payload = await jsonFile(artifactDirectory, relativePath);
    const timestamp = payload?.[timestampField];
    const timestampMs = validTime(timestamp);
    if (timestampMs == null) throw new Error(`Required source-scout file ${relativePath} has no valid ${timestampField} timestamp.`);
    if (timestampMs < startedAtMs - TIMESTAMP_SKEW_MS || timestampMs > finishedAtMs + TIMESTAMP_SKEW_MS) {
      throw new Error(`Required source-scout file ${relativePath} timestamp is outside the selected run window.`);
    }
    timestamps[relativePath] = { field: timestampField, value: new Date(timestampMs).toISOString() };
  }

  const hashed = await hashArtifact(artifactDirectory);
  if (!hashed.files.length) throw new Error('Downloaded source-scout artifact is empty.');
  return { ...hashed, timestamps };
}

async function runCommand(execFileImpl, file, args, cwd) {
  return execFileImpl(file, args, {
    cwd,
    env: process.env,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function createFreshOutput(outputDirectory) {
  if (!outputDirectory) {
    const resolved = path.join(os.tmpdir(), 'bourbon-signal-source-scout-latest');
    await rm(resolved, { recursive: true, force: true });
    await mkdir(resolved, { recursive: false });
    return resolved;
  }
  const resolved = path.resolve(outputDirectory);
  if (await pathExists(resolved)) throw new Error(`Source-scout output directory already exists: ${resolved}`);
  await mkdir(resolved, { recursive: false });
  return resolved;
}

export async function resolveSourceScoutInput({
  cwd = process.cwd(),
  outputDirectory = null,
  execFileImpl = execFileAsync,
} = {}) {
  const repositoryRoot = path.resolve(cwd);
  const outputRoot = await createFreshOutput(outputDirectory);
  const artifactDirectory = path.join(outputRoot, 'inventory-refresh');
  const manifestPath = path.join(outputRoot, 'source-scout-provenance.json');
  let complete = false;
  try {
    // Refresh the remote-tracking ref inside the dedicated scout checkout. A
    // locally cached origin/main can be just as stale as a checked-in artifact.
    await runCommand(execFileImpl, 'git', ['fetch', 'origin', '--prune'], repositoryRoot);
    const revision = await runCommand(execFileImpl, 'git', ['rev-parse', '--verify', REF_NAME], repositoryRoot);
    const originMainSha = String(revision.stdout || '').trim();
    if (!validSha(originMainSha)) throw new Error(`Unable to resolve ${REF_NAME} to a full Git commit SHA.`);

    const listed = await runCommand(execFileImpl, 'gh', [
      'run', 'list',
      '--workflow', WORKFLOW,
      '--branch', PRODUCTION_BRANCH,
      '--status', 'success',
      '--limit', RUN_LIST_LIMIT,
      '--json', 'databaseId,headBranch,headSha,status,conclusion,createdAt,updatedAt,url',
    ], repositoryRoot);
    const run = selectNewestSuccessfulMainRun(parseJson(listed.stdout || '[]', 'GitHub refresh-feed run list'));
    if (!run) throw new Error('No completed successful main refresh-feed run is available for source-scout input.');
    if (!validSha(run.headSha) || run.headSha.toLowerCase() !== originMainSha.toLowerCase()) {
      throw new Error(`Newest successful main refresh-feed run head SHA ${run.headSha || 'missing'} does not match ${REF_NAME} ${originMainSha}; no older run or engine/out fallback is allowed.`);
    }

    await mkdir(artifactDirectory);
    const artifactName = `inventory-refresh-${run.databaseId}`;
    await runCommand(execFileImpl, 'gh', [
      'run', 'download', String(run.databaseId),
      '--name', artifactName,
      '--dir', artifactDirectory,
    ], repositoryRoot);

    const validation = await validateSourceScoutArtifact({ artifactDirectory, run, originMainSha });
    const resolvedAt = new Date().toISOString();
    const manifest = {
      contractVersion: SOURCE_SCOUT_MANIFEST_CONTRACT_VERSION,
      resolvedAt,
      ref: REF_NAME,
      originMainSha: originMainSha.toLowerCase(),
      workflow: WORKFLOW,
      run: {
        databaseId: Number(run.databaseId),
        headBranch: run.headBranch,
        headSha: run.headSha.toLowerCase(),
        status: run.status,
        conclusion: run.conclusion,
        createdAt: new Date(validTime(run.createdAt)).toISOString(),
        updatedAt: new Date(validTime(run.updatedAt)).toISOString(),
        url: String(run.url || ''),
      },
      artifact: {
        name: artifactName,
        directory: 'inventory-refresh',
        downloadedAt: resolvedAt,
        treeSha256: validation.treeSha256,
      },
      requiredTimestamps: validation.timestamps,
      files: validation.files,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    complete = true;
    return { outputDirectory: outputRoot, artifactDirectory, manifestPath, manifest };
  } finally {
    if (!complete) await rm(outputRoot, { recursive: true, force: true });
  }
}

function argValue(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
}

async function main() {
  const result = await resolveSourceScoutInput({ outputDirectory: argValue('--output') });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputDirectory: result.outputDirectory,
    artifactDirectory: result.artifactDirectory,
    manifestPath: result.manifestPath,
    runId: result.manifest.run.databaseId,
    headSha: result.manifest.run.headSha,
    artifactTreeSha256: result.manifest.artifact.treeSha256,
  }, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
