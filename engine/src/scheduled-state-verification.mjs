#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = path.resolve('out');
export const DEFAULT_LEDGER_PATH = path.join(OUT, 'scheduled-state-verification.json');
export const DEFAULT_PREVIOUS_SITE_DIR = path.join(OUT, 'last-published-site');
const DEFAULT_SITE_DIR = path.join(OUT, 'site');
const DEFAULT_SUMMARY_PATH = path.join(OUT, 'summary.json');
const STATE_ID_RE = /^[A-Z]{2}(?:-[A-Z0-9]+)*$/;

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function atomicWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}

export function scheduledVerificationRunId(env = process.env) {
  if (env.GITHUB_RUN_ID) return `github:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT || '1'}`;
  return String(env.BOURBON_SIGNAL_SCHEDULED_VERIFICATION_RUN_ID || `local:${process.pid}`);
}

export function normalizeStateIds(values = []) {
  const normalized = [...new Set(values.flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean))].sort();
  if (!normalized.length || normalized.some((state) => !STATE_ID_RE.test(state))) {
    throw new Error(`Invalid or missing state id list: ${values.join(',')}`);
  }
  return normalized;
}

export async function prepareScheduledStateVerification({
  siteDir = DEFAULT_SITE_DIR,
  previousSiteDir = DEFAULT_PREVIOUS_SITE_DIR,
  ledgerPath = DEFAULT_LEDGER_PATH,
  runId = scheduledVerificationRunId(),
  now = new Date().toISOString(),
  cacheKey = process.env.BOURBON_SIGNAL_LAST_PUBLISHED_CACHE_KEY,
} = {}) {
  if (!String(cacheKey || '').trim()) {
    throw new Error('Scheduled state isolation requires a restored last-published cache key; checked-in or freshly generated site files are not an acceptable fallback baseline.');
  }
  const source = path.resolve(siteDir);
  const destination = path.resolve(previousSiteDir);
  if (!(await exists(path.join(source, 'drops.json'))) || !(await exists(path.join(source, 'states', 'index.json')))) {
    throw new Error(`Scheduled verification requires a complete last-published site contract at ${source}.`);
  }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: false, errorOnExist: true });
  const ledger = { schemaVersion: 1, runId, preparedAt: now, lastPublishedCacheKey: String(cacheKey).trim(), failures: [] };
  await atomicWriteJson(ledgerPath, ledger);
  return ledger;
}

async function requireLedger(ledgerPath, runId) {
  const ledger = await readJson(ledgerPath, null);
  if (!ledger || ledger.schemaVersion !== 1 || ledger.runId !== runId || !ledger.lastPublishedCacheKey || !Array.isArray(ledger.failures)) {
    throw new Error(`Scheduled verification ledger is missing or belongs to another run: ${ledgerPath}.`);
  }
  return ledger;
}

export async function recordScheduledVerifierFailure({
  stateIds,
  command,
  args = [],
  exitCode = 1,
  error = null,
  ledgerPath = DEFAULT_LEDGER_PATH,
  runId = scheduledVerificationRunId(),
  now = new Date().toISOString(),
} = {}) {
  const states = normalizeStateIds(stateIds);
  const ledger = await requireLedger(ledgerPath, runId);
  ledger.failures.push({
    states,
    command: [command, ...args].filter(Boolean).join(' '),
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    error: error ? String(error).slice(0, 1000) : null,
    failedAt: now,
  });
  await atomicWriteJson(ledgerPath, ledger);
  return ledger;
}

function spawnVerifier(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    child.on('error', (error) => resolve({ ok: false, exitCode: null, error }));
    child.on('close', (code, signal) => resolve({
      ok: code === 0,
      exitCode: Number.isInteger(code) ? code : null,
      error: signal ? new Error(`Verifier terminated by ${signal}`) : null,
    }));
  });
}

export async function runScheduledStateVerifier({
  stateIds,
  command,
  args = [],
  ledgerPath = DEFAULT_LEDGER_PATH,
  runId = scheduledVerificationRunId(),
  run = spawnVerifier,
} = {}) {
  const states = normalizeStateIds(stateIds);
  if (!command) throw new Error('Scheduled state verifier command is required.');
  await requireLedger(ledgerPath, runId);
  const result = await run(command, args);
  if (result?.ok) return { ok: true, states };
  await recordScheduledVerifierFailure({
    stateIds: states,
    command,
    args,
    exitCode: result?.exitCode,
    error: result?.error?.message || result?.error,
    ledgerPath,
    runId,
  });
  console.error(`::warning title=State verifier isolated::${states.join(',')} verification failed; the last-published partition will be retained stale and non-alertable.`);
  return { ok: false, states, exitCode: result?.exitCode ?? null };
}

function stateOf(row) {
  return String(row?.state || row?.state_code || '').trim().toUpperCase();
}

function stateIdOf(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : stateOf(value);
}

export async function validateLastPublishedPartitions({ previousSiteDir = DEFAULT_PREVIOUS_SITE_DIR, stateIds } = {}) {
  const states = normalizeStateIds(stateIds);
  const index = await readJson(path.join(previousSiteDir, 'states', 'index.json'), null);
  const drops = await readJson(path.join(previousSiteDir, 'drops.json'), null);
  const locations = await readJson(path.join(previousSiteDir, 'locations.json'), null);
  const stores = await readJson(path.join(previousSiteDir, 'stores.json'), null);
  const hasRows = (value, key) => Array.isArray(value) || Array.isArray(value?.[key]);
  if (!index || !Array.isArray(index.states) || !drops || !Array.isArray(drops.drops)
    || !hasRows(locations, 'locations') || !hasRows(stores, 'stores')) {
    throw new Error('Last-published site fallback is missing its partition index, drops, locations, or stores payload.');
  }
  for (const state of states) {
    const entry = index.states.find((candidate) => candidate?.state === state);
    if (!entry?.file) throw new Error(`${state}: last-published state partition is missing.`);
    const payload = await readJson(path.join(previousSiteDir, entry.file), null);
    if (!payload || payload.state !== state || !Array.isArray(payload.drops)
      || Number(payload.count) !== payload.drops.length || Number(entry.count) !== payload.drops.length
      || payload.drops.some((drop) => stateOf(drop) !== state)) {
      throw new Error(`${state}: last-published state partition is invalid or incoherent.`);
    }
    const publishedStateRows = drops.drops.filter((drop) => stateOf(drop) === state);
    if (publishedStateRows.length !== payload.drops.length) {
      throw new Error(`${state}: last-published state partition is not a lossless subset of drops.json.`);
    }
  }
  return states;
}

export function summaryWithScheduledVerificationFallbacks(summary, ledger, now = new Date().toISOString()) {
  const failedStates = normalizeStateIds((ledger?.failures || []).flatMap((failure) => failure.states || []));
  const failed = new Set(failedStates);
  const reasons = new Map(failedStates.map((state) => [state, (ledger.failures || [])
    .filter((failure) => (failure.states || []).includes(state))
    .map((failure) => failure.command)
    .filter(Boolean)]));
  const states = (summary.states || []).map((state) => {
    const stateId = stateOf(state);
    if (!failed.has(stateId)) return state;
    return {
      ...state,
      status: 'failed_state_verification_stale_fallback',
      stale: true,
      staleReason: `Scheduled state verification failed (${(reasons.get(stateId) || []).join('; ')}); retained the last-published partition as stale, non-alertable context.`,
      staleFallbackAt: now,
      previousFinishedAt: state.finishedAt || state.previousFinishedAt || null,
    };
  });
  for (const state of failedStates) {
    if (!states.some((row) => stateOf(row) === state)) throw new Error(`${state}: failed verifier state is missing from summary.json.`);
  }
  const degraded = states.filter((state) => state.stale || /^(?:stale_|failed_)/.test(String(state.status || '')));
  return {
    ...summary,
    fallbackStateIds: [...new Set([...(summary.fallbackStateIds || []).map(stateIdOf), ...failedStates])].sort(),
    partialFallbackStateIds: (summary.partialFallbackStateIds || []).map(stateIdOf).filter((state) => !failed.has(state)).sort(),
    freshStateIds: (summary.freshStateIds || []).map(stateIdOf).filter((state) => !failed.has(state)).sort(),
    scheduledVerificationFailureStateIds: failedStates,
    scheduledVerificationFailures: ledger.failures,
    degradedStateCount: degraded.length,
    staleStateCount: degraded.filter((state) => state.stale === true).length,
    failedStateCount: degraded.filter((state) => /^failed_/.test(String(state.status || ''))).length,
    states,
  };
}

const GENERIC_ISOLATION_ANOMALIES = new Set([
  'unexpected_zero_valid_output',
  'unexpected_zero_customer_visible_output',
  'significant_drop_count_collapse',
]);

export async function recordOperatingContractFailures({
  contractPath = path.join(DEFAULT_SITE_DIR, 'state-health.json'),
  ledgerPath = DEFAULT_LEDGER_PATH,
  runId = scheduledVerificationRunId(),
  now = new Date().toISOString(),
} = {}) {
  const ledger = await requireLedger(ledgerPath, runId);
  const contract = await readJson(contractPath, null);
  if (!contract || !Array.isArray(contract.states)) {
    throw new Error(`State operating contract is missing or invalid: ${contractPath}.`);
  }
  const existing = new Set(ledger.failures.flatMap((failure) => failure.states || []));
  const records = contract.states.filter((record) => record?.recoveryAction === 'retry_state_collection'
    && record.health !== 'blocked'
    && (record.anomalyCodes || []).some((code) => GENERIC_ISOLATION_ANOMALIES.has(code))
    && !existing.has(String(record.state).toUpperCase()));
  for (const record of records) {
    const state = String(record.state).toUpperCase();
    const anomalyCodes = (record.anomalyCodes || []).filter((code) => GENERIC_ISOLATION_ANOMALIES.has(code));
    ledger.failures.push({
      states: [state],
      command: 'generic state operating contract',
      exitCode: 1,
      error: anomalyCodes.join(', '),
      failedAt: now,
    });
  }
  if (records.length) await atomicWriteJson(ledgerPath, ledger);
  return { recordedStateIds: records.map((record) => String(record.state).toUpperCase()).sort() };
}

export async function stageScheduledVerificationFallbacks({
  summaryPath = DEFAULT_SUMMARY_PATH,
  previousSiteDir = DEFAULT_PREVIOUS_SITE_DIR,
  ledgerPath = DEFAULT_LEDGER_PATH,
  runId = scheduledVerificationRunId(),
  now = new Date().toISOString(),
} = {}) {
  const ledger = await requireLedger(ledgerPath, runId);
  if (!ledger.failures.length) return { failedStateIds: [], changed: false };
  const failedStateIds = normalizeStateIds(ledger.failures.flatMap((failure) => failure.states || []));
  await validateLastPublishedPartitions({ previousSiteDir, stateIds: failedStateIds });
  const summary = await readJson(summaryPath, null);
  if (!summary || !Array.isArray(summary.states)) throw new Error(`Refresh summary is missing or invalid: ${summaryPath}.`);
  await atomicWriteJson(summaryPath, summaryWithScheduledVerificationFallbacks(summary, ledger, now));
  return { failedStateIds, changed: true };
}

async function runExport(previousSiteDir) {
  const nodeOptions = String(process.env.NODE_OPTIONS || '');
  const child = spawn(process.execPath, ['src/export-site-contract.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BOURBON_SIGNAL_PREVIOUS_SITE_DIR: path.resolve(previousSiteDir),
      NODE_OPTIONS: nodeOptions.includes('--max-old-space-size')
        ? nodeOptions
        : `${nodeOptions} --max-old-space-size=8192`.trim(),
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`Fallback site contract export exited ${code}.`);
}

function optionValue(args, name) {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function cli() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'prepare') {
    await prepareScheduledStateVerification();
    console.log('Preserved the last-published site contract for scheduled state isolation.');
    return;
  }
  if (mode === 'verify') {
    const separator = args.indexOf('--');
    const commandArgs = separator >= 0 ? args.slice(separator + 1) : [];
    const command = commandArgs.shift();
    const states = optionValue(args.slice(0, separator >= 0 ? separator : args.length), '--state');
    await runScheduledStateVerifier({ stateIds: [states], command, args: commandArgs });
    return;
  }
  if (mode === 'apply') {
    const result = await stageScheduledVerificationFallbacks();
    if (result.changed) {
      console.warn(`Regenerating the site contract with last-published stale partitions for: ${result.failedStateIds.join(', ')}.`);
      await runExport(DEFAULT_PREVIOUS_SITE_DIR);
    } else {
      console.log('All scheduled state verifiers passed; no partition fallback regeneration is needed.');
    }
    return;
  }
  if (mode === 'reconcile') {
    const contractPath = optionValue(args, '--contract') || path.join(DEFAULT_SITE_DIR, 'state-health.json');
    const result = await recordOperatingContractFailures({ contractPath });
    if (result.recordedStateIds.length) {
      console.warn(`State operating contract isolated anomalous partitions: ${result.recordedStateIds.join(', ')}.`);
    } else {
      console.log('State operating contract found no additional partitions requiring isolation.');
    }
    return;
  }
  throw new Error('Usage: scheduled-state-verification.mjs prepare | verify --state=XX -- <command> [args...] | reconcile [--contract=path] | apply');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  cli().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
