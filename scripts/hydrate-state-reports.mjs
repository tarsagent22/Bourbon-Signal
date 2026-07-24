import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { CUSTOMER_ACTIVE_STATE_IDS } from '../engine/src/state-lifecycle.mjs';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const STATE_DIR = path.resolve(process.env.BOURBON_SIGNAL_STATE_REPORT_DIR || path.join(ROOT, 'engine/out/states'));
const ACTIVE_STATES = [...CUSTOMER_ACTIVE_STATE_IDS].sort();
export function statesRequiredForHydration(activeStates = ACTIVE_STATES, targetedStates = process.env.BOURBON_SIGNAL_RUN_STATES || '') {
  const targeted = new Set(String(targetedStates).split(',').map((value) => value.trim().toUpperCase()).filter(Boolean));
  return [...activeStates].filter((state) => !targeted.has(state)).sort();
}
const REQUIRED_STATES = statesRequiredForHydration();
const PRODUCTION_BRANCH = process.env.BOURBON_SIGNAL_PRODUCTION_BRANCH || 'main';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function validateStateReportDirectory(directory, activeStates = ACTIVE_STATES) {
  const failures = [];
  for (const state of activeStates) {
    const file = path.join(directory, `${state}.json`);
    try {
      const report = await readJson(file);
      if (String(report.state || '').toUpperCase() !== state) failures.push(`${state}: state identity mismatch`);
      if (!Array.isArray(report.signals)) failures.push(`${state}: signals are missing`);
      const runTimestamp = report.finishedAt || report.startedAt;
      if (!Number.isFinite(Date.parse(runTimestamp || ''))) failures.push(`${state}: valid run timestamp is missing`);
    } catch (error) {
      failures.push(`${state}: ${error.code === 'ENOENT' ? 'report missing' : `invalid JSON (${error.message})`}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

async function currentReportsComplete() {
  return validateStateReportDirectory(STATE_DIR, REQUIRED_STATES);
}

export function selectTrustedRuns(runs, productionBranch = PRODUCTION_BRANCH) {
  return (Array.isArray(runs) ? runs : []).filter((run) => run?.headBranch === productionBranch && Number.isFinite(Number(run?.databaseId)));
}

async function successfulRefreshRuns() {
  const { stdout } = await execFileAsync('gh', [
    'run', 'list', '--workflow', 'refresh-feed.yml', '--status', 'success', '--branch', PRODUCTION_BRANCH, '--limit', '20',
    '--json', 'databaseId,createdAt,headBranch',
  ], { cwd: ROOT, env: process.env, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  return selectTrustedRuns(JSON.parse(stdout || '[]'));
}

async function downloadRunArtifact(runId, destination) {
  await execFileAsync('gh', [
    'run', 'download', String(runId), '-n', `inventory-refresh-${runId}`, '-D', destination,
  ], { cwd: ROOT, env: process.env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
}

async function main() {
  const current = await currentReportsComplete();
  if (current.ok) {
    console.log(`State report hydration not needed: ${REQUIRED_STATES.length} non-target active reports are complete.`);
    return;
  }

  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    throw new Error(`State reports are incomplete (${current.failures.join('; ')}) and GH_TOKEN is unavailable for recovery.`);
  }

  const runs = await successfulRefreshRuns();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'bourbon-signal-state-hydration-'));
  const attempts = [];
  try {
    for (const run of runs) {
      const destination = path.join(tempRoot, String(run.databaseId));
      await mkdir(destination, { recursive: true });
      try {
        await downloadRunArtifact(run.databaseId, destination);
        const candidate = path.join(destination, 'states');
        const validation = await validateStateReportDirectory(candidate, REQUIRED_STATES);
        if (!validation.ok) {
          attempts.push(`${run.databaseId}: ${validation.failures.slice(0, 3).join('; ')}`);
          continue;
        }
        await mkdir(STATE_DIR, { recursive: true });
        for (const state of REQUIRED_STATES) {
          await cp(path.join(candidate, `${state}.json`), path.join(STATE_DIR, `${state}.json`), { force: true });
        }
        console.log(`Hydrated ${REQUIRED_STATES.length} non-target active state reports from successful refresh ${run.databaseId} (${run.createdAt}, ${run.headBranch}).`);
        return;
      } catch (error) {
        attempts.push(`${run.databaseId}: ${error.message}`);
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  throw new Error(`Unable to hydrate complete state reports from the last ${runs.length} successful refresh runs. ${attempts.slice(0, 5).join(' | ')}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
