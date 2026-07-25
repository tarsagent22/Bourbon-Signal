import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_CDP_URL, ensureBrowserCdp, killBrowserCdp } from './core/browser-session.mjs';

const ROOT = process.cwd();
const PROJECT_ROOT = path.dirname(ROOT);
const OUT = path.resolve('out');
const LOCK = path.join(OUT, 'refresh.lock.json');
const STATUS = path.join(OUT, 'site-refresh-status.json');
const DEPLOY_STATUS = path.join(OUT, 'site-deploy-status.json');
const LOCK_STALE_MS = Number(process.env.BOURBON_SIGNAL_REFRESH_LOCK_STALE_MS || 25 * 60_000);
const REFRESH_CADENCE_MINUTES = Number(process.env.BOURBON_SIGNAL_REFRESH_CADENCE_MINUTES || 30);
const BROWSER_REFRESH_MINUTES = Number(process.env.BOURBON_SIGNAL_BROWSER_REFRESH_MINUTES || 240);
const AUTO_DEPLOY = process.env.BOURBON_SIGNAL_AUTO_DEPLOY === '1';
const AUTO_DEPLOY_MINUTES = Number(process.env.BOURBON_SIGNAL_AUTO_DEPLOY_MINUTES || 0);
const STEP_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_REFRESH_STEP_TIMEOUT_MS || 15 * 60_000);
const RUN_STEP_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_RUN_STEP_TIMEOUT_MS || 35 * 60_000);
const BROWSER_STEP_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_BROWSER_STEP_TIMEOUT_MS || 3 * 60_000);
const FWGS_BROWSER_STEP_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_FWGS_BROWSER_STEP_TIMEOUT_MS || 22 * 60_000);
const DEPLOY_TIMEOUT_MS = Number(process.env.BOURBON_SIGNAL_DEPLOY_TIMEOUT_MS || 45 * 60_000);
const DEPLOY_RETRIES = Number(process.env.BOURBON_SIGNAL_DEPLOY_RETRIES || 3);
const CDP_URL = process.env.OPENCLAW_BROWSER_CDP_URL || DEFAULT_CDP_URL;

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock() {
  await mkdir(OUT, { recursive: true });
  const lock = await readJson(LOCK);
  if (lock?.startedAt) {
    const age = Date.now() - new Date(lock.startedAt).getTime();
    const pidAlive = lock.pid ? (() => { try { process.kill(lock.pid, 0); return true; } catch { return false; } })() : false;
    if (pidAlive) {
      console.log(`Another refresh appears active (pid=${lock.pid}, age=${Math.round(age / 1000)}s). Skipping.`);
      return false;
    }
    console.warn(`Ignoring stale refresh lock from dead process (pid=${lock.pid}, age=${Math.round(age / 1000)}s, staleAfter=${Math.round(LOCK_STALE_MS / 1000)}s).`);
  }
  await writeFile(LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
  return true;
}

async function releaseLock() {
  await rm(LOCK, { force: true });
}

function terminateProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    killer.on('error', () => {});
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); }
  catch { try { child.kill('SIGTERM'); } catch {} }
}

function runNode(script, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    const timeoutMs = Number(options.timeoutMs || STEP_TIMEOUT_MS);
    const env = { ...process.env };
    if (env.BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS === '1' && script.endsWith('run.mjs')) {
      env.BOURBON_SIGNAL_BROWSER_PREFLIGHT = '0';
    }
    if (script.includes('export-site-contract') && !String(env.NODE_OPTIONS || '').includes('--max-old-space-size')) {
      env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --max-old-space-size=8192`.trim();
    }
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true,
      detached: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs > 0 ? setTimeout(() => {
      const message = `${script} timed out after ${Math.round(timeoutMs / 1000)}s`;
      stderr += `\n${message}\n`;
      terminateProcessTree(child);
      reject(Object.assign(new Error(message), {
        result: { script, args, code: 'timeout', startedAt, finishedAt: new Date().toISOString(), stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) }
      }));
    }, timeoutMs) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const finishedAt = new Date().toISOString();
      const result = { script, args, code, startedAt, finishedAt, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`${script} exited ${code}`), { result }));
    });
  });
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    const timeoutMs = Number(options.timeoutMs || STEP_TIMEOUT_MS);
    const child = spawn(command, args, {
      cwd: options.cwd || ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env || process.env,
      shell: process.platform === 'win32',
      windowsHide: true,
      detached: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs > 0 ? setTimeout(() => {
      const message = `${command} ${args.join(' ')} timed out after ${Math.round(timeoutMs / 1000)}s`;
      stderr += `\n${message}\n`;
      terminateProcessTree(child);
      reject(Object.assign(new Error(message), {
        result: { script: command, args, code: 'timeout', startedAt, finishedAt: new Date().toISOString(), stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) }
      }));
    }, timeoutMs) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });
    child.on('error', (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const finishedAt = new Date().toISOString();
      const result = { script: command, args, code, startedAt, finishedAt, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`${command} ${args.join(' ')} exited ${code}`), { result }));
    });
  });
}

async function siteDeliverySignature() {
  const siteDir = path.join(OUT, 'site');
  const siteFiles = (await readdir(siteDir))
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));
  const exportHash = createHash('sha256');
  let exportBytes = 0;
  for (const file of siteFiles) {
    const contents = await readFile(path.join(siteDir, file));
    const digest = createHash('sha256').update(contents).digest('hex');
    exportBytes += contents.length;
    exportHash.update(file);
    exportHash.update('\0');
    exportHash.update(digest);
    exportHash.update('\0');
  }
  const dropsPayload = await readJson(path.join(OUT, 'site', 'drops.json'), { drops: [] });
  const alertsPayload = await readJson(path.join(OUT, 'site', 'alerts.json'), { alerts: [] });
  const statsPayload = await readJson(path.join(OUT, 'site', 'stats.json'), {});
  const inventoryRows = (dropsPayload.drops || [])
    .filter((drop) => drop.is_user_facing_drop || drop.can_alert_as_inventory || drop.canAlertAsInventory)
    .map((drop) => ({
      state: drop.state || drop.state_code || null,
      bottle: drop.canonicalId || drop.bottleId || drop.canonicalName || drop.bottleName,
      storeId: drop.storeId || drop.store_id || drop.storeName || drop.locationName,
      quantity: Number(drop.quantity || 0) || 0,
      price: Number(drop.price || 0) || 0,
      status: drop.availabilityStatus || null
    }))
    .sort((a, b) => `${a.state}|${a.bottle}|${a.storeId}`.localeCompare(`${b.state}|${b.bottle}|${b.storeId}`));
  const alertRows = (alertsPayload.alerts || [])
    .filter((alert) => alert.eligibleForDelivery)
    .map((alert) => ({
      state: alert.state || null,
      dedupeKey: alert.dedupeKey || alert.id || null,
      bottle: alert.bottle || null,
      store: alert.storeId || alert.storeName || alert.locationName || null,
      priorityClass: alert.priorityClass || null,
      recommendation: alert.sendRecommendation || null
    }))
    .sort((a, b) => `${a.state}|${a.dedupeKey}`.localeCompare(`${b.state}|${b.dedupeKey}`));
  return {
    hash: exportHash.digest('hex'),
    fileCount: siteFiles.length,
    byteCount: exportBytes,
    rowCount: inventoryRows.length,
    alertCandidateCount: alertRows.length,
    generatedAt: statsPayload.generatedAt || dropsPayload.generatedAt || alertsPayload.generatedAt || null,
    engineGeneratedAt: statsPayload.engineGeneratedAt || null
  };
}

async function maybeDeploySite() {
  const signature = await siteDeliverySignature();
  const previous = await readJson(DEPLOY_STATUS, {});
  const now = new Date().toISOString();
  const lastDeployAt = previous.lastDeployAt || null;
  const minutesSinceDeploy = lastDeployAt ? (Date.now() - new Date(lastDeployAt).getTime()) / 60_000 : Infinity;
  const changed = signature.hash !== previous.siteDeliverySignature;
  const eligible = AUTO_DEPLOY && changed && minutesSinceDeploy >= AUTO_DEPLOY_MINUTES;
  const base = {
    autoDeploy: AUTO_DEPLOY,
    checkedAt: now,
    changed,
    eligible,
    minDeployMinutes: AUTO_DEPLOY_MINUTES,
    minutesSinceDeploy: Number.isFinite(minutesSinceDeploy) ? Math.round(minutesSinceDeploy * 10) / 10 : null,
    siteDeliverySignature: signature.hash,
    userFacingDropCount: signature.rowCount,
    alertCandidateCount: signature.alertCandidateCount,
    siteExportFileCount: signature.fileCount,
    siteExportByteCount: signature.byteCount,
    engineGeneratedAt: signature.engineGeneratedAt,
    siteGeneratedAt: signature.generatedAt,
    lastDeployAt: previous.lastDeployAt || null,
    lastDeploymentUrl: previous.lastDeploymentUrl || null
  };

  if (!AUTO_DEPLOY) {
    await writeFile(DEPLOY_STATUS, JSON.stringify({ ...previous, ...base, skippedReason: 'auto_deploy_disabled' }, null, 2));
    return { ...base, skipped: true, skippedReason: 'auto_deploy_disabled' };
  }
  if (!changed) {
    await writeFile(DEPLOY_STATUS, JSON.stringify({ ...previous, ...base, skippedReason: 'site_delivery_signature_unchanged' }, null, 2));
    return { ...base, skipped: true, skippedReason: 'site_delivery_signature_unchanged' };
  }
  if (minutesSinceDeploy < AUTO_DEPLOY_MINUTES) {
    const skippedReason = `deploy_throttled_${Math.ceil(AUTO_DEPLOY_MINUTES - minutesSinceDeploy)}m_remaining`;
    await writeFile(DEPLOY_STATUS, JSON.stringify({ ...previous, ...base, skippedReason }, null, 2));
    return { ...base, skipped: true, skippedReason };
  }

  let result = null;
  const deployErrors = [];
  for (let attempt = 1; attempt <= DEPLOY_RETRIES; attempt += 1) {
    try {
      result = await runCommand(process.execPath, [
        path.join(PROJECT_ROOT, 'scripts', 'release-production.mjs'),
        '--apply',
        '--publish-site-exports',
        path.join(ROOT, 'out', 'site'),
      ], { cwd: PROJECT_ROOT, timeoutMs: DEPLOY_TIMEOUT_MS });
      break;
    } catch (error) {
      deployErrors.push({ attempt, message: error.message, result: error.result || null });
      if (attempt >= DEPLOY_RETRIES) throw Object.assign(error, { deployErrors });
      const delayMs = Math.min(120_000, 15_000 * attempt);
      console.warn(`Site auto-deploy attempt ${attempt}/${DEPLOY_RETRIES} failed; retrying in ${Math.round(delayMs / 1000)}s: ${error.message}`);
      await sleep(delayMs);
    }
  }
  const output = `${result.stdout}\n${result.stderr}`;
  const deploymentUrl = output.match(/https:\/\/[^\s]+\.vercel\.app/)?.[0] || previous.lastDeploymentUrl || null;
  const deployed = {
    ...base,
    skipped: false,
    deployedAt: new Date().toISOString(),
    lastDeployAt: new Date().toISOString(),
    lastDeploymentUrl: deploymentUrl,
    deploymentAttempts: deployErrors,
    releaseOrchestrator: 'scripts/release-production.mjs',
    deploymentResult: { code: result.code, startedAt: result.startedAt, finishedAt: result.finishedAt, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) }
  };
  await writeFile(DEPLOY_STATUS, JSON.stringify(deployed, null, 2));
  return deployed;
}

async function shouldRunBrowserCollectors() {
  if (process.env.BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS === '1') return false;
  const last = await readJson(STATUS);
  const lastSuccessMs = last?.lastBrowserRefreshAt ? new Date(last.lastBrowserRefreshAt).getTime() : NaN;
  if (!Number.isFinite(lastSuccessMs)) {
    return BROWSER_REFRESH_MINUTES < 999_000;
  }
  const ageMs = Date.now() - lastSuccessMs;
  return ageMs >= BROWSER_REFRESH_MINUTES * 60_000;
}

async function main() {
  const startedAt = new Date().toISOString();
  const locked = await acquireLock();
  if (!locked) return;

  const steps = [];
  const warnings = [];
  let publish = null;
  let lastBrowserRefreshAt = (await readJson(STATUS))?.lastBrowserRefreshAt || null;
  let lastBrowserAttemptAt = (await readJson(STATUS))?.lastBrowserAttemptAt || null;

  try {
    if (await shouldRunBrowserCollectors()) {
      // Browser-assisted sources are heavier and can take longer than the base run. Refresh them on a
      // controlled cadence, then each base run folds the newest complete artifacts into the site export.
      let browserOk = false;
      let browserOwner = null;
      lastBrowserAttemptAt = new Date().toISOString();
      try {
        browserOwner = await ensureBrowserCdp(CDP_URL);
        const browserScripts = browserOwner.started
          ? ['src/fwgs-browser-full.mjs']
          : ['src/ohlq-browser-collector.mjs', 'src/fwgs-browser-full.mjs'];
        if (browserOwner.started) {
          warnings.push('OHLQ browser collector skipped on scheduled headless Chrome because OHLQ Cloudflare requires an already-warmed interactive browser session; last known OHLQ artifact/snapshot remains in use.');
        }
        for (const script of browserScripts) {
          try {
            const timeoutMs = script.includes('fwgs-browser-full') ? FWGS_BROWSER_STEP_TIMEOUT_MS : BROWSER_STEP_TIMEOUT_MS;
            steps.push(await runNode(script, [], { timeoutMs }));
            if (script.includes('fwgs-browser-full')) browserOk = true;
          } catch (error) {
            warnings.push(`${script}: ${error.message}`);
            if (error.result) steps.push(error.result);
            console.warn(`Browser-assisted collector skipped/failed; continuing with last artifact: ${script}: ${error.message}`);
          }
        }
      } catch (error) {
        warnings.push(`browser-cdp: ${error.message}`);
        console.warn(`Browser-assisted collectors skipped; continuing with last artifacts: ${error.message}`);
      } finally {
        await killBrowserCdp(browserOwner);
      }
      if (browserOk) lastBrowserRefreshAt = new Date().toISOString();
    }

    steps.push(await runNode('src/build-bible.mjs'));
    steps.push(await runNode('src/run.mjs', [], { timeoutMs: RUN_STEP_TIMEOUT_MS }));
    steps.push(await runNode('src/rare-report.mjs'));
    steps.push(await runNode('src/location-report.mjs'));
    steps.push(await runNode('src/operational-report.mjs'));
    steps.push(await runNode('src/export-site-contract.mjs'));
    try {
      steps.push(await runNode('src/source-usefulness-report.mjs'));
    } catch (error) {
      warnings.push(`source-usefulness-report: ${error.message}`);
      if (error.result) steps.push(error.result);
      console.warn(`Source usefulness diagnostics failed non-blocking: ${error.message}`);
    }
    steps.push(await runNode('src/build-store-identity.mjs'));

    try {
      publish = await maybeDeploySite();
      if (publish.skipped) console.log(`Site auto-deploy skipped: ${publish.skippedReason}`);
      else console.log(`Site auto-deploy complete: ${publish.lastDeploymentUrl || 'production'}`);
    } catch (error) {
      warnings.push(`auto-deploy: ${error.message}`);
      await writeFile(DEPLOY_STATUS, JSON.stringify({
        autoDeploy: AUTO_DEPLOY,
        ok: false,
        checkedAt: new Date().toISOString(),
        error: error.message,
        failed: error.result || null
      }, null, 2));
      console.warn(`Site auto-deploy failed; refresh data remains local: ${error.message}`);
    }

    const finishedAt = new Date().toISOString();
    await writeFile(STATUS, JSON.stringify({
      ok: true,
      startedAt,
      finishedAt,
      cadenceMinutes: REFRESH_CADENCE_MINUTES,
      browserRefreshMinutes: BROWSER_REFRESH_MINUTES,
      autoDeploy: AUTO_DEPLOY,
      autoDeployMinutes: AUTO_DEPLOY_MINUTES,
      lastBrowserRefreshAt,
      lastBrowserAttemptAt,
      publish,
      warnings,
      steps: steps.map((s) => ({ script: s.script, args: s.args, code: s.code, startedAt: s.startedAt, finishedAt: s.finishedAt }))
    }, null, 2));
    console.log(`Bourbon Signal refresh complete: ${startedAt} -> ${finishedAt}`);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const failed = error.result || null;
    await writeFile(STATUS, JSON.stringify({
      ok: false,
      startedAt,
      finishedAt,
      cadenceMinutes: REFRESH_CADENCE_MINUTES,
      browserRefreshMinutes: BROWSER_REFRESH_MINUTES,
      autoDeploy: AUTO_DEPLOY,
      autoDeployMinutes: AUTO_DEPLOY_MINUTES,
      lastBrowserRefreshAt,
      lastBrowserAttemptAt,
      publish,
      error: error.message,
      warnings,
      failed,
      steps: steps.map((s) => ({ script: s.script, args: s.args, code: s.code, startedAt: s.startedAt, finishedAt: s.finishedAt }))
    }, null, 2));
    throw error;
  } finally {
    await releaseLock();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
