import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_CDP_URL, ensureBrowserCdp, killBrowserCdp } from './core/browser-session.mjs';
import {
  acquireRefreshControlPlane,
  checkpointRefreshStage,
  finishRefreshControlPlane,
  renewRefreshControlLease,
} from './refresh-control-plane.mjs';
import { targetedRunNeedsBrowserCollectors } from './targeted-browser-policy.mjs';

const ROOT = process.cwd();
const PROJECT_ROOT = path.dirname(ROOT);
const OUT = path.resolve('out');
const CONTROL_PLANE = path.join(OUT, 'control-plane', 'refresh-session.json');
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
const LEASE_RENEWAL_MS = Number(process.env.BOURBON_SIGNAL_REFRESH_LEASE_RENEWAL_MS || 30_000);
const CONTROL_PLANE_LEASE_MS = Math.max(
  LOCK_STALE_MS,
  RUN_STEP_TIMEOUT_MS + 120_000,
  STEP_TIMEOUT_MS + 120_000,
  FWGS_BROWSER_STEP_TIMEOUT_MS + 120_000,
  10 * 60_000,
);

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function atomicWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeStep(step) {
  if (!step) return null;
  return {
    script: step.script,
    args: step.args,
    code: step.code,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
  };
}

function summarizePublish(publish) {
  if (!publish) return null;
  return {
    skipped: Boolean(publish.skipped),
    skippedReason: publish.skippedReason || null,
    changed: publish.changed ?? null,
    eligible: publish.eligible ?? null,
    checkedAt: publish.checkedAt || null,
    deployedAt: publish.deployedAt || null,
    lastDeployAt: publish.lastDeployAt || null,
    lastDeploymentUrl: publish.lastDeploymentUrl || null,
    siteDeliverySignature: publish.siteDeliverySignature || null,
    userFacingDropCount: publish.userFacingDropCount ?? null,
    alertCandidateCount: publish.alertCandidateCount ?? null,
  };
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

async function maybeDeploySite({ assertLease = async () => {} } = {}) {
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
    await atomicWriteJson(DEPLOY_STATUS, { ...previous, ...base, skippedReason: 'auto_deploy_disabled' });
    return { ...base, skipped: true, skippedReason: 'auto_deploy_disabled' };
  }
  if (!changed) {
    await atomicWriteJson(DEPLOY_STATUS, { ...previous, ...base, skippedReason: 'site_delivery_signature_unchanged' });
    return { ...base, skipped: true, skippedReason: 'site_delivery_signature_unchanged' };
  }
  if (minutesSinceDeploy < AUTO_DEPLOY_MINUTES) {
    const skippedReason = `deploy_throttled_${Math.ceil(AUTO_DEPLOY_MINUTES - minutesSinceDeploy)}m_remaining`;
    await atomicWriteJson(DEPLOY_STATUS, { ...previous, ...base, skippedReason });
    return { ...base, skipped: true, skippedReason };
  }

  let result = null;
  const deployErrors = [];
  for (let attempt = 1; attempt <= DEPLOY_RETRIES; attempt += 1) {
    try {
      await assertLease();
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
  await atomicWriteJson(DEPLOY_STATUS, deployed);
  return deployed;
}

async function shouldRunBrowserCollectors() {
  if (process.env.BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS === '1') return false;
  if (!targetedRunNeedsBrowserCollectors(process.env.BOURBON_SIGNAL_RUN_STATES)) return false;
  const last = await readJson(STATUS);
  const lastSuccessMs = last?.lastBrowserRefreshAt ? new Date(last.lastBrowserRefreshAt).getTime() : NaN;
  if (!Number.isFinite(lastSuccessMs)) {
    return BROWSER_REFRESH_MINUTES < 999_000;
  }
  const ageMs = Date.now() - lastSuccessMs;
  return ageMs >= BROWSER_REFRESH_MINUTES * 60_000;
}

function refreshScope() {
  return {
    requestedStates: String(process.env.BOURBON_SIGNAL_RUN_STATES || '')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
      .sort(),
    autoDeploy: AUTO_DEPLOY,
    browserRefreshMinutes: BROWSER_REFRESH_MINUTES,
  };
}

function mergeWarnings(target, additions = []) {
  for (const warning of additions) {
    if (warning && !target.includes(warning)) target.push(warning);
  }
}

function appendSteps(target, additions = []) {
  for (const step of additions) {
    if (step?.script) target.push(step);
  }
}

function stageSteps(detail) {
  return (detail?.steps || []).filter((step) => step?.script);
}

function stageWarnings(detail) {
  return (detail?.warnings || []).filter(Boolean);
}

async function main() {
  const startedAt = new Date().toISOString();
  const stages = [
    'browser_collectors',
    'build_bible',
    'collect_states',
    'rare_report',
    'location_report',
    'operational_report',
    'export_site',
    'source_usefulness',
    'store_identity',
    'auto_deploy',
  ];
  const control = await acquireRefreshControlPlane({
    statePath: CONTROL_PLANE,
    scope: refreshScope(),
    stages,
    now: startedAt,
    leaseMs: CONTROL_PLANE_LEASE_MS,
  });
  if (!control.acquired) {
    const activeLease = control.session?.lease || {};
    const age = control.session?.startedAt ? Date.now() - new Date(control.session.startedAt).getTime() : 0;
    const pidAlive = Number.isInteger(activeLease.pid) && activeLease.pid > 0;
    if (pidAlive) {
      console.log(`Another refresh appears active (pid=${activeLease.pid}, age=${Math.round(age / 1000)}s). Skipping.`);
      return false;
    }
  }
  let session = control.session;
  if (control.resumed) {
    console.warn(`Resuming refresh control plane from interrupted run ${session.runId} at stage ${session.failedStage || 'next_pending_stage'}.`);
  }

  const steps = [];
  const warnings = [];
  let publish = null;
  const priorStatus = await readJson(STATUS);
  let lastBrowserRefreshAt = session.stageResults?.browser_collectors?.details?.lastBrowserRefreshAt || priorStatus?.lastBrowserRefreshAt || null;
  let lastBrowserAttemptAt = session.stageResults?.browser_collectors?.details?.lastBrowserAttemptAt || priorStatus?.lastBrowserAttemptAt || null;
  appendSteps(steps, stageSteps(session.stageResults?.browser_collectors?.details));
  mergeWarnings(warnings, stageWarnings(session.stageResults?.browser_collectors?.details));
  mergeWarnings(warnings, stageWarnings(session.stageResults?.source_usefulness?.details));
  mergeWarnings(warnings, stageWarnings(session.stageResults?.auto_deploy?.details));
  publish = session.stageResults?.auto_deploy?.details?.publish || null;

  async function renewLease() {
    session = await renewRefreshControlLease({
      statePath: CONTROL_PLANE,
      leaseId: session.lease.leaseId,
      now: new Date().toISOString(),
      leaseMs: CONTROL_PLANE_LEASE_MS,
    });
    return session;
  }

  async function assertLeaseBeforeSideEffect() {
    try {
      return await renewLease();
    } catch (error) {
      error.code = 'REFRESH_LEASE_LOST';
      throw error;
    }
  }

  async function writeRefreshStatus(payload) {
    await renewLease();
    await atomicWriteJson(STATUS, payload);
  }

  async function runStage(stage, action, { nonBlocking = false } = {}) {
    const prior = session.stageResults?.[stage]?.details || null;
    if ((session.completedStages || []).includes(stage)) {
      console.log(`Refresh control plane preserved completed stage ${stage}; resuming after interruption.`);
      return prior;
    }
    session = await checkpointRefreshStage({
      statePath: CONTROL_PLANE,
      leaseId: session.lease.leaseId,
      stage,
      status: 'running',
      now: new Date().toISOString(),
    });
    let heartbeatFailure = null;
    let heartbeatInFlight = Promise.resolve();
    const heartbeat = setInterval(() => {
      heartbeatInFlight = heartbeatInFlight.then(async () => {
        try {
          await renewLease();
        } catch (error) {
          error.code = 'REFRESH_LEASE_LOST';
          heartbeatFailure ||= error;
        }
      });
    }, Math.max(5_000, LEASE_RENEWAL_MS));
    async function stopHeartbeatAndAssertLease() {
      clearInterval(heartbeat);
      await heartbeatInFlight;
      if (heartbeatFailure) throw heartbeatFailure;
      await assertLeaseBeforeSideEffect();
    }
    try {
      const detail = await action();
      await stopHeartbeatAndAssertLease();
      session = await checkpointRefreshStage({
        statePath: CONTROL_PLANE,
        leaseId: session.lease.leaseId,
        stage,
        status: detail?.skipped ? 'skipped' : 'completed',
        now: new Date().toISOString(),
        details: detail,
      });
      return detail;
    } catch (error) {
      clearInterval(heartbeat);
      await heartbeatInFlight;
      const effectiveError = heartbeatFailure || error;
      const message = effectiveError instanceof Error ? effectiveError.message : String(effectiveError);
      session = await checkpointRefreshStage({
        statePath: CONTROL_PLANE,
        leaseId: session.lease.leaseId,
        stage,
        status: 'failed',
        now: new Date().toISOString(),
        details: { error: message },
      }).catch(() => session);
      if (nonBlocking && effectiveError?.code !== 'REFRESH_LEASE_LOST') {
        warnings.push(`${stage}: ${message}`);
        return { warning: message };
      }
      throw effectiveError;
    }
  }

  try {
    const browserDetail = await runStage('browser_collectors', async () => {
      if (!(await shouldRunBrowserCollectors())) {
        return {
          skipped: true,
          reason: 'browser_refresh_not_due',
          lastBrowserRefreshAt,
          lastBrowserAttemptAt,
          warnings: [],
          steps: [],
        };
      }
      let browserOk = false;
      let browserOwner = null;
      const browserWarnings = [];
      const browserSteps = [];
      lastBrowserAttemptAt = new Date().toISOString();
      try {
        browserOwner = await ensureBrowserCdp(CDP_URL);
        const browserScripts = browserOwner.started
          ? ['src/fwgs-browser-full.mjs']
          : ['src/ohlq-browser-collector.mjs', 'src/fwgs-browser-full.mjs'];
        if (browserOwner.started) {
          browserWarnings.push('OHLQ browser collector skipped on scheduled headless Chrome because OHLQ Cloudflare requires an already-warmed interactive browser session; last known OHLQ artifact/snapshot remains in use.');
        }
        for (const script of browserScripts) {
          try {
            const timeoutMs = script.includes('fwgs-browser-full') ? FWGS_BROWSER_STEP_TIMEOUT_MS : BROWSER_STEP_TIMEOUT_MS;
            browserSteps.push(summarizeStep(await runNode(script, [], { timeoutMs })));
            if (script.includes('fwgs-browser-full')) browserOk = true;
          } catch (error) {
            browserWarnings.push(`${script}: ${error.message}`);
            if (error.result) browserSteps.push(summarizeStep(error.result));
            console.warn(`Browser-assisted collector skipped/failed; continuing with last artifact: ${script}: ${error.message}`);
          }
        }
      } catch (error) {
        browserWarnings.push(`browser-cdp: ${error.message}`);
        console.warn(`Browser-assisted collectors skipped; continuing with last artifacts: ${error.message}`);
      } finally {
        await killBrowserCdp(browserOwner);
      }
      if (browserOk) lastBrowserRefreshAt = new Date().toISOString();
      return {
        skipped: false,
        lastBrowserRefreshAt,
        lastBrowserAttemptAt,
        warnings: browserWarnings,
        steps: browserSteps,
      };
    });
    appendSteps(steps, stageSteps(browserDetail));
    mergeWarnings(warnings, stageWarnings(browserDetail));
    lastBrowserRefreshAt = browserDetail?.lastBrowserRefreshAt || lastBrowserRefreshAt;
    lastBrowserAttemptAt = browserDetail?.lastBrowserAttemptAt || lastBrowserAttemptAt;

    const buildBible = await runStage('build_bible', async () => ({ step: summarizeStep(await runNode('src/build-bible.mjs')) }));
    appendSteps(steps, [buildBible?.step]);

    const collectStates = await runStage('collect_states', async () => ({ step: summarizeStep(await runNode('src/run.mjs', [], { timeoutMs: RUN_STEP_TIMEOUT_MS })) }));
    appendSteps(steps, [collectStates?.step]);

    const rareReport = await runStage('rare_report', async () => ({ step: summarizeStep(await runNode('src/rare-report.mjs')) }));
    appendSteps(steps, [rareReport?.step]);

    const locationReport = await runStage('location_report', async () => ({ step: summarizeStep(await runNode('src/location-report.mjs')) }));
    appendSteps(steps, [locationReport?.step]);

    const operationalReport = await runStage('operational_report', async () => ({ step: summarizeStep(await runNode('src/operational-report.mjs')) }));
    appendSteps(steps, [operationalReport?.step]);

    const exportSite = await runStage('export_site', async () => ({ step: summarizeStep(await runNode('src/export-site-contract.mjs')) }));
    appendSteps(steps, [exportSite?.step]);

    const sourceUsefulness = await runStage('source_usefulness', async () => {
      try {
        return { step: summarizeStep(await runNode('src/source-usefulness-report.mjs')), warnings: [] };
      } catch (error) {
        const step = error.result ? summarizeStep(error.result) : null;
        const warning = `source-usefulness-report: ${error.message}`;
        warnings.push(warning);
        console.warn(`Source usefulness diagnostics failed non-blocking: ${error.message}`);
        return { step, warnings: [warning] };
      }
    });
    appendSteps(steps, [sourceUsefulness?.step]);
    mergeWarnings(warnings, stageWarnings(sourceUsefulness));

    const storeIdentity = await runStage('store_identity', async () => ({ step: summarizeStep(await runNode('src/build-store-identity.mjs')) }));
    appendSteps(steps, [storeIdentity?.step]);

    const autoDeploy = await runStage('auto_deploy', async () => {
      try {
        publish = await maybeDeploySite({ assertLease: assertLeaseBeforeSideEffect });
        if (publish.skipped) console.log(`Site auto-deploy skipped: ${publish.skippedReason}`);
        else console.log(`Site auto-deploy complete: ${publish.lastDeploymentUrl || 'production'}`);
        return { publish: summarizePublish(publish), warnings: [] };
      } catch (error) {
        if (error?.code === 'REFRESH_LEASE_LOST') throw error;
        const warning = `auto-deploy: ${error.message}`;
        publish = null;
        await atomicWriteJson(DEPLOY_STATUS, {
          autoDeploy: AUTO_DEPLOY,
          ok: false,
          checkedAt: new Date().toISOString(),
          error: error.message,
          failed: error.result || null,
        });
        console.warn(`Site auto-deploy failed; refresh data remains local: ${error.message}`);
        return { publish: null, warnings: [warning], failed: true };
      }
    });
    publish = autoDeploy?.publish || publish;
    mergeWarnings(warnings, stageWarnings(autoDeploy));

    const finishedAt = new Date().toISOString();
    await writeRefreshStatus({
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
      resumed: control.resumed,
      refreshControlPlane: { statePath: path.relative(ROOT, CONTROL_PLANE).replaceAll('\\', '/'), runId: session.runId, leaseId: session.lease.leaseId },
      steps,
    });
    session = await finishRefreshControlPlane({
      statePath: CONTROL_PLANE,
      leaseId: session.lease.leaseId,
      status: 'succeeded',
      now: finishedAt,
      details: { warnings: warnings.length, steps: steps.length, publish },
    });
    console.log(`Bourbon Signal refresh complete: ${startedAt} -> ${finishedAt}`);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const failed = error.result || null;
    try {
      await writeRefreshStatus({
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
        resumed: control.resumed,
        refreshControlPlane: { statePath: path.relative(ROOT, CONTROL_PLANE).replaceAll('\\', '/'), runId: session.runId, leaseId: session.lease.leaseId, failedStage: session.failedStage || null },
        steps,
      });
    } catch (statusError) {
      console.warn(`Refresh status update skipped after lease fencing: ${statusError.message}`);
    }
    await finishRefreshControlPlane({
      statePath: CONTROL_PLANE,
      leaseId: session.lease.leaseId,
      status: 'failed',
      now: finishedAt,
      details: { error: error.message, failedStage: session.failedStage || null },
    }).catch(() => {});
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
