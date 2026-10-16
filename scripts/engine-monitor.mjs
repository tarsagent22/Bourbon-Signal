#!/usr/bin/env node
import { readFile, writeFile, appendFile, mkdir, open, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { assessEngineObservation, advanceEngineMonitor, planCadenceDispatch, reserveCadenceDispatch, acceptanceSummary, parseObservationRows } from './lib/engine-monitor-policy.mjs';

const execute = promisify(execFile);
const repo = 'tarsagent22/Bourbon-Signal';
const origin = 'https://www.bourbonsignal.com';
const workflow = 'refresh-feed.yml';
async function json(file, fallback = {}) { try { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
async function atomic(file, value) { const temporary = `${file}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file); }
async function appendRow(file, row) {
  let prefix = ''; let existing;
  try {
    existing = await open(file, 'r'); const size = (await existing.stat()).size;
    if (size) { const last = Buffer.alloc(1); await existing.read(last, 0, 1, size - 1); if (last[0] !== 10) prefix = '\n'; }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  finally { await existing?.close(); }
  await appendFile(file, prefix + JSON.stringify(row) + '\n');
}
async function publicJson(route) {
  try {
    const response = await fetch(`${origin}${route}?_bs_verify=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    return { status: response.status, snapshotId: response.headers.get('x-engine-snapshot'), source: response.headers.get('x-api-source'), body: await response.json() };
  } catch { return { status: 0, body: null }; }
}
async function github(command, args) {
  try { return await execute(command, args, { windowsHide: true, timeout: 25_000, maxBuffer: 2 * 1024 * 1024 }); }
  catch { throw new Error('github_request_failed'); } // Never copy credential-manager output into reports.
}
export async function desktopNotification(event, config) {
  if (!config.notificationsEnabled) return { status: 'disabled' };
  if (process.platform !== 'win32') return { status: 'unsupported_platform' };
  const script = `$ErrorActionPreference='Stop'
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime] > $null
$inputData=[Console]::In.ReadToEnd()|ConvertFrom-Json
$globalSetting=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications' -Name ToastEnabled -ErrorAction SilentlyContinue
$appSetting=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\BourbonSignal.EngineMonitor' -Name Enabled -ErrorAction SilentlyContinue
if(($null -ne $globalSetting -and $globalSetting.ToastEnabled -eq 0) -or ($null -ne $appSetting -and $appSetting.Enabled -eq 0)){throw 'Notifications disabled'}
$notifier=[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('BourbonSignal.EngineMonitor')
if($null -eq $notifier){throw 'Windows notifier unavailable'}
$xml=New-Object Windows.Data.Xml.Dom.XmlDocument
$escaped=[System.Security.SecurityElement]::Escape([string]$inputData.message)
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>Bourbon Signal</text><text>'+$escaped+'</text></binding></visual></toast>')
$toast=[Windows.UI.Notifications.ToastNotification]::new($xml)
$toast.Tag=$inputData.tag
$toast.Group='engine'
$toast.SuppressPopup=[bool]$inputData.retry
$notifier.Show($toast)`;
  return new Promise(resolve => {
    const child = spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => child.kill(), 15_000);
    child.on('error', () => { clearTimeout(timer); resolve({ status: 'notification_failed' }); });
    child.on('close', code => { clearTimeout(timer); resolve({ status: code === 0 ? 'accepted_by_windows' : 'notification_failed' }); });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ message: event.message,
      tag: createHash('sha256').update(event.id).digest('hex').slice(0, 16), retry: event.retry === true }));
  });
}

export async function runEngineMonitor(config, adapters = {}) {
  const directory = path.resolve(config.evidenceDirectory);
  await mkdir(directory, { recursive: true });
  const statePath = path.join(directory, 'deterministic-monitor-state.json');
  const lockPath = path.join(directory, 'deterministic-monitor.lock');
  let handle;
  try { handle = await open(lockPath, 'wx'); await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await json(lockPath);
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (error) { alive = error.code !== 'ESRCH'; }
    if (!alive && Date.now() - Date.parse(owner.at || '') > 10 * 60_000) { await unlink(lockPath); return runEngineMonitor(config, adapters); }
    return { status: 'already_running' };
  }
  try {
    const nowMs = adapters.nowMs ?? Date.now();
    const now = new Date(nowMs).toISOString();
    const get = adapters.publicJson || publicJson;
    const gh = adapters.github || ((args) => github(config.githubCommand, args));
    const result = await get('/api/ops/health');
    const health = result.body || {};
    const assessment = assessEngineObservation(health, { nowMs, httpStatus: result.status });
    const observation = { checkedAt: now, ...assessment, release: health.release, cron: health.cron,
      engine: health.engine, delivery: health.delivery?.alertAudit, producer: 'deterministic_monitor' };
    let state = await json(statePath);
    // Expensive aggregate enrichment runs only on snapshot change or once per hour.
    if (state.snapshotId !== health.engine?.snapshotId || state.lastAuditOk !== true || !state.lastAuditAt || nowMs - Date.parse(state.lastAuditAt) >= 3600000) {
      const [stats, coverage] = await Promise.all([get('/api/stats'), get('/api/coverage')]);
      observation.stats = { status: stats.status, snapshotId: stats.snapshotId, source: stats.source, collectedAt: stats.body?.engineGeneratedAt,
        retryStatesExcludingOhio: (stats.body?.refreshHealth?.retryStateIds || []).filter(s => s !== 'OH') };
      observation.coverage = (coverage.body?.states || []).filter(s => s.code !== 'OH').map(s => ({ code: s.code, health: s.health, freshness: s.freshness }));
      if (stats.status !== 200 || stats.snapshotId !== health.engine?.snapshotId || stats.source !== 'remote-snapshot') observation.issues.push('snapshot_audit_failed');
      if (coverage.status !== 200) observation.issues.push('coverage_audit_failed');
      observation.ok = observation.issues.length === 0;
      state.lastAuditOk = stats.status === 200 && stats.snapshotId === health.engine?.snapshotId && stats.source === 'remote-snapshot' && coverage.status === 200;
      state.lastAuditAt = now;
      state.snapshotId = health.engine?.snapshotId || null;
    }
    const transition = advanceEngineMonitor(state, observation, { nowMs });
    state = transition.state;
    const events = transition.events;
    let plan = { dispatch: false, reason: 'collection_not_due' };
    // Healthy sub-state degradation does not cause full refresh loops. This
    // controller schedules global collection only; it never targets Ohio.
    if (config.dispatchEnabled && (assessment.collectionAgeMinutes === null || assessment.collectionAgeMinutes >= 20)) {
      try {
        const response = await gh(['api', `repos/${repo}/actions/workflows/${workflow}/runs?per_page=30`]);
        const runs = JSON.parse(response.stdout).workflow_runs.map(run => ({ id: run.id, status: run.status, createdAt: run.created_at }));
        plan = planCadenceDispatch(state, observation, runs, { nowMs, enabled: true });
        if (plan.dispatch) {
          // Persist before the network mutation; an uncertain response consumes
          // the attempt and waits through backoff instead of double-dispatching.
          state = reserveCadenceDispatch(state, nowMs);
          await atomic(statePath, state);
          await gh(['api', '--method', 'POST', `repos/${repo}/actions/workflows/${workflow}/dispatches`, '-f', 'ref=main', '-f', 'inputs[incident_key]=deterministic-cadence-v1']);
          state.dispatch.status = 'submitted';
        }
        state.schedulerError = null;
      } catch {
        state.schedulerError = 'github_request_failed';
        plan = { dispatch: false, reason: 'github_request_failed_or_uncertain_dispatch' };
      }
    } else if (!config.dispatchEnabled) plan = { dispatch: false, reason: 'observation_only' };
    state.lastDispatchPlan = plan;
    state.notificationResults ||= {};
    for (const event of events) await appendFile(path.join(directory, 'incident-events.jsonl'), JSON.stringify(event) + '\n');
    await atomic(statePath, state);
    for (const event of state.events || []) {
      const prior = state.notificationResults[event.id];
      if (['accepted_by_windows', 'previously_reported_in_chat'].includes(prior?.status) || (prior?.attempts || 0) >= 3) continue;
      if (!config.notificationsEnabled) { state.notificationResults[event.id] = { status: 'disabled', attempts: prior?.attempts || 0 }; continue; }
      const attempts = (prior?.attempts || 0) + 1;
      state.notificationResults[event.id] = { status: 'reserved', attempts, at: now };
      await atomic(statePath, state);
      // A retry replaces the same Windows toast and suppresses another popup.
      const delivered = await (adapters.notify || desktopNotification)({ ...event, retry: attempts > 1 }, config);
      state.notificationResults[event.id] = { ...delivered, attempts, at: now };
    }
    const dailyDirectory = path.join(directory, 'monitor-observations');
    await mkdir(dailyDirectory, { recursive: true });
    await appendRow(path.join(dailyDirectory, now.slice(0, 10) + '.jsonl'), observation);
    await atomic(path.join(directory, 'latest-observation.json'), observation);
    const acceptance = await json(path.join(directory, 'acceptance.json'), null);
    const closedWindow = await json(path.join(directory, 'acceptance-window-closed.json'), null);
    if (acceptance?.startedAt && !closedWindow) {
      const observationsPath = path.join(directory, 'observations.jsonl');
      await appendRow(observationsPath, observation);
      const parsed = parseObservationRows(await readFile(observationsPath, 'utf8'));
      const summary = acceptanceSummary(parsed.rows, acceptance.startedAt, nowMs, parsed.invalidRows);
      await atomic(path.join(directory, 'acceptance-status.json'), summary);
      if (summary.durationHours >= 24) await atomic(path.join(directory, 'acceptance-window-closed.json'), { closedAt: now, ...summary });
    }
    await atomic(statePath, state);
    const status = { checkedAt: now, ok: observation.ok && !state.schedulerError, issues: observation.issues,
      incidentId: state.incident?.id || null, dispatch: plan, schedulerError: state.schedulerError,
      notifications: state.notificationResults, aiInvocations: 0 };
    await atomic(path.join(directory, 'monitor-last-run.json'), status);
    return status;
  } finally { await handle.close(); await unlink(lockPath); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const configFile = process.argv[process.argv.indexOf('--config') + 1];
  if (!process.argv.includes('--config') || !configFile) throw new Error('Explicit --config path required.');
  runEngineMonitor(await json(configFile)).then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Engine monitor failed; inspect local state and task status.'); process.exitCode = 1; });
}
