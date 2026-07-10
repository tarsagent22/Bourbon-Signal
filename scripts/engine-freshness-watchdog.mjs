#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { classifyFreshnessState } from '../engine/src/operations/freshness-state.mjs';
import { runPublisher } from '../engine/src/data-plane/publish-site-snapshot.mjs';
import { VercelBlobObjectStorage } from '../engine/src/data-plane/vercel-blob-object-storage.mjs';

const execFileAsync = promisify(execFile);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(operation, options) {
  let lastError;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < options.maxAttempts) await options.sleep(Math.min(30_000, 500 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

export async function executeFreshnessRecovery(state, adapters, options = {}) {
  const classification = classifyFreshnessState(state);
  const retryOptions = { maxAttempts: Math.max(1, Number(options.maxAttempts ?? 3)), sleep: options.sleep || defaultSleep };
  if (classification.ok) return { status: 'healthy', action: 'none', classification };
  try {
    let result;
    if (classification.recoveryAction === 'trigger_guarded_refresh') {
      if (await adapters.isRefreshRunning()) return { status: 'refresh_already_running', action: classification.recoveryAction, classification };
      result = await retry(() => adapters.triggerRefresh(), retryOptions);
    } else if (classification.recoveryAction === 'publish_and_activate_existing_export') {
      result = await retry(() => adapters.publishExisting(), retryOptions);
    } else if (classification.recoveryAction === 'retry_snapshot_activation') {
      result = await retry(() => adapters.activateStaged(), retryOptions);
    } else if (classification.recoveryAction === 'verify_production_reader') {
      result = await retry(() => adapters.verifyProductionReader(), retryOptions);
    } else if (classification.recoveryAction === 'rerun_export_only') {
      result = await retry(() => adapters.rerunExport(), retryOptions);
    } else {
      return { status: 'manual_intervention_required', action: classification.recoveryAction, classification };
    }
    return { status: 'recovery_executed', action: classification.recoveryAction, result, classification };
  } catch (error) {
    return { status: 'recovery_failed', action: classification.recoveryAction, error: error instanceof Error ? error.message : String(error), classification };
  }
}

async function withSingleFlightLock(lockPath, operation, options = {}) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const staleAfterMs = Number(options.staleAfterMs ?? 30 * 60_000);
  try {
    const existing = await stat(lockPath);
    if (Date.now() - existing.mtimeMs > staleAfterMs) await rm(lockPath, { force: true });
  } catch {}
  let handle;
  try {
    handle = await open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  } catch (error) {
    if (error?.code === 'EEXIST') return { status: 'watchdog_already_running', action: 'none' };
    throw error;
  }
  try {
    return await operation();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}

async function taskStatus(taskName) {
  try {
    const { stdout } = await execFileAsync('schtasks.exe', ['/Query', '/TN', taskName, '/FO', 'LIST', '/V'], { windowsHide: true });
    return /Status:\s+Running/i.test(stdout);
  } catch {
    return false;
  }
}

async function productionObservation(activeSnapshotId, productionUrl) {
  try {
    const response = await fetch(productionUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { observedAt: null, health: null };
    const health = await response.json();
    const observedId = health?.engine?.snapshotId || health?.engine?.activeSnapshotId || null;
    return { observedAt: observedId && observedId === activeSnapshotId ? new Date().toISOString() : null, health };
  } catch {
    return { observedAt: null, health: null };
  }
}

async function writeIncident(outputPath, result) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temp = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2));
  await rename(temp, outputPath);
}

export async function runWatchdog(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const siteDir = path.resolve(options.siteDir || path.join(projectRoot, 'engine', 'out', 'site'));
  const stats = JSON.parse(await readFile(path.join(siteDir, 'stats.json'), 'utf8'));
  const storage = options.storage || new VercelBlobObjectStorage();
  const pointer = await storage.readPointer();
  const activeSnapshotId = pointer?.active || null;
  const productionUrl = options.productionUrl || 'https://www.bourbonsignal.com/api/ops/health';
  const observation = await productionObservation(activeSnapshotId, productionUrl);
  const state = {
    collectionFinishedAt: stats.engineGeneratedAt || stats.generatedAt,
    exportGeneratedAt: stats.generatedAt,
    snapshotUploadedAt: pointer?.snapshotUploadedAt || null,
    snapshotActivatedAt: pointer?.snapshotActivatedAt || null,
    productionObservedAt: observation.observedAt,
  };
  const taskName = options.taskName || '\\Bourbon Signal Engine Refresh';
  const adapters = options.adapters || {
    isRefreshRunning: () => taskStatus(taskName),
    triggerRefresh: async () => { await execFileAsync('schtasks.exe', ['/Run', '/TN', taskName], { windowsHide: true }); return { started: true }; },
    publishExisting: () => runPublisher(['--site-dir', siteDir]),
    activateStaged: () => runPublisher(['--site-dir', siteDir]),
    rerunExport: async () => { await execFileAsync('node', ['src/export-site-contract.mjs'], { cwd: path.join(projectRoot, 'engine'), windowsHide: true }); return { exported: true }; },
    verifyProductionReader: async () => {
      const verification = await productionObservation(activeSnapshotId, productionUrl);
      if (!verification.observedAt) throw new Error('Production is not observing the active engine snapshot');
      return { observedAt: verification.observedAt };
    },
  };
  const result = await executeFreshnessRecovery(state, adapters, options);
  const outputPath = path.join(projectRoot, 'engine', 'out', 'operations', 'freshness-watchdog.json');
  await writeIncident(outputPath, { ...result, state, activeSnapshotId });
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const root = path.resolve(process.argv[2] || process.cwd());
  const lockPath = path.join(root, 'engine', 'out', 'operations', 'freshness-watchdog.lock');
  withSingleFlightLock(lockPath, () => runWatchdog({ projectRoot: root }))
    .then((result) => { console.log(JSON.stringify(result)); if (result.status === 'recovery_failed') process.exitCode = 1; })
    .catch((error) => { console.error(JSON.stringify({ status: 'watchdog_failed', error: error.message })); process.exitCode = 1; });
}
