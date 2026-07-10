#!/usr/bin/env node
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  assertCleanOriginMain,
  assertChangedExportPaths,
  assertExportFileSet,
  buildReleaseManifest,
  evaluateCronRegistration,
  evaluateLiveHealth,
  hashEntries,
  parseDeploymentId,
  parseDeploymentUrl,
  parsePorcelainPaths,
} from './lib/release-orchestrator-core.mjs';

const SOURCE_ROOT = process.cwd();
const EXPECTED_CRON = { path: '/api/alerts/deliver?cron=v3', schedule: '*/5 * * * *' };
const DEFAULT_DOMAINS = ['bourbonsignal.com', 'www.bourbonsignal.com'];
const RELEASE_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_RELEASE_TIMEOUT_MS || 30 * 60_000);
const HEALTH_WAIT_MS = Number(process.env.BOURBON_SIGNAL_RELEASE_HEALTH_WAIT_MS || 8 * 60_000);
const VERCEL_SCOPE = process.env.VERCEL_SCOPE || 'tarsagent22s-projects';

function argsFrom(argv) {
  const args = { apply: false, publishSiteExports: null, skipHealthWait: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--publish-site-exports') args.publishSiteExports = path.resolve(argv[++index] || '');
    else if (arg === '--skip-health-wait') args.skipHealthWait = true;
    else throw new Error(`Unknown release argument: ${arg}`);
  }
  return args;
}

function commandName(name) {
  return process.platform === 'win32' && ['vercel', 'npm'].includes(name) ? `${name}.cmd` : name;
}

function run(command, args, { cwd, timeoutMs = RELEASE_TIMEOUT_MS, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    const executable = commandName(command);
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      shell: process.platform === 'win32' && executable.endsWith('.cmd'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} ${args.join(' ')} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; if (!quiet) process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (!quiet) process.stderr.write(chunk); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = { command, args, code, startedAt, finishedAt: new Date().toISOString(), stdout, stderr };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`${command} ${args.join(' ')} exited ${code}`), { result }));
    });
  });
}

async function git(cwd, args, options = {}) {
  return run('git', args, { cwd, quiet: true, ...options });
}

async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function listJsonFiles(directory, relative = '') {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listJsonFiles(directory, child));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(child);
  }
  return files.sort();
}

async function hashJsonDirectory(directory) {
  const files = await listJsonFiles(directory);
  assertExportFileSet(files.filter((file) => !file.includes('/')));
  assertChangedExportPaths(files.map((file) => `engine/out/site/${file}`));
  const entries = await Promise.all(files.map(async (file) => ({ path: file, contents: await readFile(path.join(directory, file)) })));
  return hashEntries(entries);
}

async function copySiteExports(sourceDir, checkoutRoot) {
  const sourceStat = await stat(sourceDir).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error(`Site export source is not a directory: ${sourceDir}`);
  const files = await listJsonFiles(sourceDir);
  assertExportFileSet(files.filter((file) => !file.includes('/')));
  assertChangedExportPaths(files.map((file) => `engine/out/site/${file}`));
  const destination = path.join(checkoutRoot, 'engine', 'out', 'site');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    const output = path.join(destination, file);
    await mkdir(path.dirname(output), { recursive: true });
    await copyFile(path.join(sourceDir, file), output);
  }
  return { destination, files };
}

function parseJsonOutput(output) {
  const source = String(output || '');
  const start = source.indexOf('{');
  if (start < 0) throw new Error(`Expected JSON output, received: ${source.slice(-500)}`);
  return JSON.parse(source.slice(start));
}

async function cleanCheckoutAtOriginMain(tempRoot) {
  await git(SOURCE_ROOT, ['fetch', 'origin', '--prune']);
  await git(SOURCE_ROOT, ['worktree', 'add', '--detach', tempRoot, 'origin/main']);
  const head = (await git(tempRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  const originMain = (await git(tempRoot, ['rev-parse', 'origin/main'])).stdout.trim();
  const status = (await git(tempRoot, ['status', '--porcelain'])).stdout;
  assertCleanOriginMain({ head, originMain, status });
  return head;
}

async function stageExports(tempRoot, sourceDir) {
  const copied = await copySiteExports(sourceDir, tempRoot);
  await run('npm', ['--prefix', 'engine', 'run', 'quality:states'], { cwd: tempRoot });
  const status = (await git(tempRoot, ['status', '--porcelain'])).stdout.trimEnd();
  if (!status.trim()) return { changed: false, files: copied.files };
  const changedPaths = parsePorcelainPaths(status);
  assertChangedExportPaths(changedPaths);

  await run('npm', ['--prefix', 'engine', 'run', 'verify:site'], { cwd: tempRoot });
  return { changed: true, files: copied.files, changedPaths };
}

async function verifyAndBuild(tempRoot) {
  const verification = [];
  const projectLink = path.join(SOURCE_ROOT, '.vercel', 'project.json');
  const linkedProject = await stat(projectLink).catch(() => null);
  if (!linkedProject?.isFile()) throw new Error(`Missing Vercel project link: ${projectLink}`);
  await mkdir(path.join(tempRoot, '.vercel'), { recursive: true });
  await copyFile(projectLink, path.join(tempRoot, '.vercel', 'project.json'));
  await run('vercel', ['pull', '--yes', '--environment=production', '--scope', VERCEL_SCOPE], { cwd: tempRoot, timeoutMs: 5 * 60_000 });
  for (const [command, args] of [
    ['npm', ['ci']],
    ['npm', ['run', 'verify:ci']],
  ]) {
    const result = await run(command, args, { cwd: tempRoot });
    verification.push({ command: `${command} ${args.join(' ')}`, ok: true, startedAt: result.startedAt, finishedAt: result.finishedAt });
  }
  return verification;
}

async function writeBuildManifest(tempRoot, verification) {
  const commit = (await git(tempRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  const tree = (await git(tempRoot, ['rev-parse', 'HEAD^{tree}'])).stdout.trim();
  const lockfileSha256 = await sha256File(path.join(tempRoot, 'package-lock.json'));
  const siteExportSha256 = await hashJsonDirectory(path.join(tempRoot, 'engine', 'out', 'site'));
  const localVerifiedBuildId = await readFile(path.join(tempRoot, '.next', 'BUILD_ID'), 'utf8').then((value) => value.trim()).catch(() => null);
  const manifest = buildReleaseManifest({ commit, tree, lockfileSha256, siteExportSha256, localVerifiedBuildId, verifiedAt: new Date().toISOString(), verification });
  await mkdir(path.join(tempRoot, 'public'), { recursive: true });
  await writeFile(path.join(tempRoot, 'public', 'release-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function assertRemoteStillPinned(tempRoot, expectedCommit) {
  const remote = (await git(tempRoot, ['ls-remote', 'origin', 'refs/heads/main'])).stdout.split(/\s/u)[0];
  if (remote !== expectedCommit) throw new Error(`origin/main moved to ${remote} after verification; refusing to deploy verified commit ${expectedCommit}.`);
}

async function deployAndAlias(tempRoot, manifest) {
  await assertRemoteStillPinned(tempRoot, manifest.source.commit);
  const deployment = await run('vercel', ['deploy', '--prod', '--yes', '--scope', VERCEL_SCOPE], { cwd: tempRoot });
  const deploymentUrl = parseDeploymentUrl(`${deployment.stdout}\n${deployment.stderr}`);
  if (!deploymentUrl) throw new Error('Vercel deployment completed without a deployment URL.');
  const inspection = await run('vercel', ['inspect', deploymentUrl, '--scope', VERCEL_SCOPE], { cwd: tempRoot, quiet: true });
  const deploymentId = parseDeploymentId(`${inspection.stdout}\n${inspection.stderr}`);
  if (!deploymentId) throw new Error(`Could not determine deployment ID for ${deploymentUrl}.`);
  await run('vercel', ['promote', deploymentUrl, '--yes', '--scope', VERCEL_SCOPE, '--timeout', '3m'], { cwd: tempRoot, timeoutMs: 4 * 60_000 }).catch((error) => {
    const output = `${error?.result?.stdout || ''}\n${error?.result?.stderr || ''}`;
    if (!/already the current production deployment/iu.test(output)) throw error;
  });
  const domains = (process.env.BOURBON_SIGNAL_PRODUCTION_DOMAINS || DEFAULT_DOMAINS.join(','))
    .split(',').map((value) => value.trim()).filter(Boolean);
  for (const domain of domains) {
    await run('vercel', ['alias', 'set', deploymentUrl, domain, '--scope', VERCEL_SCOPE], { cwd: tempRoot });
    const aliasInspection = await run('vercel', ['inspect', `https://${domain}`, '--scope', VERCEL_SCOPE], { cwd: tempRoot, quiet: true });
    const aliasTarget = parseDeploymentUrl(`${aliasInspection.stdout}\n${aliasInspection.stderr}`);
    if (aliasTarget !== deploymentUrl) throw new Error(`Alias ${domain} points to ${aliasTarget || 'unknown'}, expected ${deploymentUrl}.`);
  }
  return { deploymentUrl, deploymentId, domains };
}

async function assertCronRegistered(tempRoot, deploymentUrl) {
  const result = await run('vercel', ['crons', 'ls', '--format', 'json', '--scope', VERCEL_SCOPE], { cwd: tempRoot, quiet: true });
  const cron = evaluateCronRegistration(parseJsonOutput(result.stdout), { ...EXPECTED_CRON, host: new URL(deploymentUrl).hostname });
  if (!cron.ok) throw new Error(`Cron registration assertion failed: ${cron.failures.join(' ')}`);
  return cron;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { response, text, json };
}

async function assertLiveManifest(manifest) {
  const { response, json } = await fetchJson('https://www.bourbonsignal.com/release-manifest.json');
  if (!response.ok || !json) throw new Error(`Live release manifest returned ${response.status}.`);
  if (json.source?.commit !== manifest.source.commit || json.artifacts?.siteExportSha256 !== manifest.artifacts.siteExportSha256) {
    throw new Error(`Live manifest does not match verified release ${manifest.source.commit}.`);
  }
}

async function waitForHealthyOps({ skipWait, expectedDeploymentId }) {
  const deadline = Date.now() + (skipWait ? 1 : HEALTH_WAIT_MS);
  let latest = null;
  do {
    latest = await fetchJson('https://www.bourbonsignal.com/api/ops/health').catch(() => null);
    if (latest?.json) {
      const evaluated = evaluateLiveHealth(latest.json, { expectedCronSchedule: EXPECTED_CRON.schedule, expectedCronStatus: 'monitoring', expectedDeploymentId });
      if (evaluated.ok) return latest.json;
    }
    if (skipWait) break;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  } while (Date.now() < deadline);
  throw new Error(`Live ops health did not become healthy within ${Math.round(HEALTH_WAIT_MS / 60_000)} minutes: ${JSON.stringify(latest?.json || latest?.text || null)}`);
}

async function runLiveSlos(tempRoot, manifest, deployment, { skipHealthWait }) {
  await assertLiveManifest(manifest);
  await run('npm', ['run', 'verify:production-live'], { cwd: tempRoot });
  await run('npm', ['run', 'verify:production-engine'], { cwd: tempRoot });
  const root = await fetch('https://www.bourbonsignal.com/', { redirect: 'manual', cache: 'no-store' });
  for (const header of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'content-security-policy-report-only']) {
    if (!root.headers.get(header)) throw new Error(`Live root is missing security header ${header}.`);
  }
  const sitemap = await fetch('https://www.bourbonsignal.com/sitemap.xml', { cache: 'no-store' }).then((response) => response.text());
  if (sitemap.includes('/bottle-check') || sitemap.includes('https://bourbonsignal.com<')) throw new Error('Live sitemap still exposes protected Bottle Check or apex canonical URLs.');
  return waitForHealthyOps({ skipWait: skipHealthWait, expectedDeploymentId: deployment.deploymentId });
}

async function saveReleaseStatus(record) {
  const output = path.join(SOURCE_ROOT, 'engine', 'out', 'release-status.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(record, null, 2));
}

async function main() {
  const options = argsFrom(process.argv.slice(2));
  const tempBase = await mkdtemp(path.join(os.tmpdir(), 'bourbon-signal-release-'));
  const tempRoot = path.join(tempBase, 'repo');
  let worktreeAdded = false;
  const record = { schemaVersion: 1, startedAt: new Date().toISOString(), apply: options.apply, ok: false };
  try {
    const baseCommit = await cleanCheckoutAtOriginMain(tempRoot);
    worktreeAdded = true;
    record.baseCommit = baseCommit;
    if (options.publishSiteExports) {
      record.exportStage = await stageExports(tempRoot, options.publishSiteExports);
    }
    const head = (await git(tempRoot, ['rev-parse', 'HEAD'])).stdout.trim();
    const originMain = (await git(tempRoot, ['ls-remote', 'origin', 'refs/heads/main'])).stdout.split(/\s/u)[0];
    const status = (await git(tempRoot, ['status', '--porcelain'])).stdout;
    assertCleanOriginMain({ head, originMain, status: options.publishSiteExports ? '' : status });

    const verification = await verifyAndBuild(tempRoot);
    const manifest = await writeBuildManifest(tempRoot, verification);
    record.manifest = manifest;
    if (!options.apply) {
      record.ok = true;
      record.dryRun = true;
      console.log(JSON.stringify(record, null, 2));
      return;
    }

    record.deployment = await deployAndAlias(tempRoot, manifest);
    record.cron = await assertCronRegistered(tempRoot, record.deployment.deploymentUrl);
    record.health = await runLiveSlos(tempRoot, manifest, record.deployment, { skipHealthWait: options.skipHealthWait });
    record.ok = true;
    record.finishedAt = new Date().toISOString();
    await saveReleaseStatus(record);
    console.log(`Bourbon Signal release complete: ${manifest.source.commit} -> ${record.deployment.deploymentUrl}`);
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    record.finishedAt = new Date().toISOString();
    await saveReleaseStatus(record).catch(() => {});
    throw error;
  } finally {
    if (worktreeAdded) await git(SOURCE_ROOT, ['worktree', 'remove', '--force', tempRoot]).catch(() => {});
    await rm(tempBase, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(`Release failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
