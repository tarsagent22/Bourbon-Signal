#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PHASE_COMMAND_KEYS,
  PHASE_ORDER,
  acquireWriterLock,
  appendPhaseResult,
  createTaskPacket,
  runBoundedTasks,
  summarizeTimings,
  taskPacketDigest,
  validateAcceptanceEvidence,
  validateTaskPacket,
  verifyPhaseTransition,
} from './lib/engine-expansion-speed.mjs';

function option(name, fallback = '') {
  const prefix = `--${name}=`;
  const value = process.argv.slice(3).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(3).includes(`--${name}`);
}

function fail(message) {
  throw new Error(message);
}

function defaultRoot(state) {
  return path.resolve('.operator', 'engine-expansions', state);
}

async function readJson(file) {
  return JSON.parse(await readFile(path.resolve(file), 'utf8'));
}

async function readLedger(file) {
  try {
    return (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function commandResult(command, { cwd = process.cwd(), env = process.env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, env, shell: true, stdio: 'inherit', windowsHide: true });
    child.on('error', (error) => resolve({ exitCode: 1, error: error.message }));
    child.on('close', (code, signal) => resolve({ exitCode: Number(code ?? 1), signal: signal || null }));
  });
}

function commandCapture(command, args, { cwd = process.cwd() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${command} exited ${code}`)));
  });
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

async function repositoryIdentity(cwd) {
  const [headCommit, branch, diff, untracked] = await Promise.all([
    commandCapture('git', ['rev-parse', 'HEAD'], { cwd }),
    commandCapture('git', ['branch', '--show-current'], { cwd }),
    commandCapture('git', ['diff', '--binary', 'HEAD'], { cwd }),
    commandCapture('git', ['ls-files', '--others', '--exclude-standard'], { cwd }),
  ]);
  return { headCommit, branch, diffDigest: sha256(diff), untrackedFiles: untracked ? untracked.split(/\r?\n/u).filter(Boolean) : [] };
}

async function fetchOriginMain(cwd) {
  await commandCapture('git', ['fetch', 'origin', '--prune'], { cwd });
  return commandCapture('git', ['rev-parse', 'origin/main'], { cwd });
}

async function verifyMergedPullRequest(packet, expectedHead, cwd) {
  const raw = await commandCapture('gh', ['pr', 'view', packet.repository.branch, '--repo', packet.repository.repo, '--json', 'state,headRefOid,mergeCommit'], { cwd });
  const pull = JSON.parse(raw);
  const mergeCommit = pull?.mergeCommit?.oid;
  const originMain = await fetchOriginMain(cwd);
  if (pull?.state !== 'MERGED' || pull?.headRefOid !== expectedHead || !mergeCommit || mergeCommit !== originMain) {
    throw new Error('Guarded merge proof does not bind the expected feature head to current origin/main.');
  }
  return mergeCommit;
}

function boundRows(rows, packet) {
  return rows.filter((row) => row.schemaVersion === 'bourbon-signal-engine-expansion-timing-v1'
    && row.state === packet.state
    && row.runId === packet.runId
    && row.baseCommit === packet.repository?.baseCommit);
}

async function runMeasuredPhase({ packet, phase, command, commandKey, ledger, cwd = process.cwd() }) {
  const packetDigest = taskPacketDigest(packet);
  const rows = boundRows(await readLedger(ledger), packet);
  const frozen = rows.find((row) => row.phase === 'contract-freeze' && row.outcome === 'passed');
  if (frozen && frozen.packetDigest !== packetDigest) fail('Task packet changed after contract freeze; start a fresh run instead of mutating the frozen contract.');
  const currentMain = await fetchOriginMain(cwd);
  const ciResult = rows.find((row) => row.phase === 'ci-deployment' && row.outcome === 'passed' && row.recordType === 'result');
  const productionPhase = PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf('ci-deployment');
  if (!productionPhase && currentMain !== packet.repository.baseCommit) fail(`origin/main advanced from frozen base ${packet.repository.baseCommit} to ${currentMain}; rebase and start a fresh run.`);
  if (productionPhase && (!ciResult?.mergeCommit || ciResult.mergeCommit !== currentMain)) fail('Production phases require a guarded merge record bound to current origin/main.');
  const discoveryCommandKeys = { baseline: 'baseline', 'source-atlas': 'sourceAtlas', 'code-inventory': 'codeInventory', 'browser-discovery': 'browserDiscovery' };
  if (PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf('contract-freeze')) {
    for (const [discoveryPhase, key] of Object.entries(discoveryCommandKeys)) {
      const passed = rows.find((row) => row.phase === discoveryPhase && row.outcome === 'passed' && row.recordType === 'result');
      if (!passed || passed.commandDigest !== sha256(packet.discoveryCommands?.[key] || '')) fail(`${discoveryPhase} evidence does not match the frozen discovery command.`);
    }
  }
  verifyPhaseTransition({
    packet,
    phase,
    completedPhases: rows.filter((row) => row.outcome === 'passed').map((row) => row.phase),
    attemptedPhases: rows.filter((row) => ['running', 'passed', 'failed', 'aborted'].includes(row.outcome)).map((row) => row.phase),
  });
  const repository = await repositoryIdentity(cwd);
  if (repository.branch !== packet.repository.branch) fail(`Current branch ${repository.branch} does not match packet branch ${packet.repository.branch}.`);
  if (PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf('diff-freeze') && repository.untrackedFiles.length) fail(`Untracked files are forbidden at and after diff freeze: ${repository.untrackedFiles.join(', ')}`);
  const diffFreeze = rows.find((row) => row.phase === 'diff-freeze' && row.outcome === 'passed' && row.recordType === 'result');
  if (PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf('diff-freeze')
    && (!diffFreeze || diffFreeze.headCommit !== repository.headCommit || diffFreeze.diffDigest !== repository.diffDigest)) fail('Current HEAD/diff does not match the passed diff-freeze identity.');
  const root = path.dirname(ledger);
  const lockFile = path.join(root, 'writer.lock');
  const releaseLock = await acquireWriterLock(lockFile, { state: packet.state, phase, runId: packet.runId, packetDigest });
  const attemptId = randomUUID();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const binding = {
    schemaVersion: 'bourbon-signal-engine-expansion-timing-v1',
    recordType: 'reservation',
    state: packet.state,
    runId: packet.runId,
    phase,
    attemptId,
    packetDigest,
    baseCommit: packet.repository.baseCommit,
    headCommit: repository.headCommit,
    diffDigest: repository.diffDigest,
    commandKey,
    commandDigest: sha256(command),
  };
  try {
    await appendPhaseResult(ledger, { ...binding, startedAt, outcome: 'running' });
    let result;
    let acceptanceEvidenceDigest = null;
    let mergeCommit = null;
    const acceptancePhase = ['live-probe', 'production-verification'].includes(phase);
    const evidenceFile = acceptancePhase ? path.resolve(cwd, packet.artifacts.acceptanceEvidence) : null;
    let priorEvidenceDigest = null;
    if (evidenceFile) {
      priorEvidenceDigest = await readFile(evidenceFile, 'utf8').then(sha256).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    }
    try {
      result = await commandResult(command, { cwd });
      if (result.exitCode === 0 && phase === 'ci-deployment') mergeCommit = await verifyMergedPullRequest(packet, repository.headCommit, cwd);
      if (result.exitCode === 0 && acceptancePhase) {
        const evidenceText = await readFile(evidenceFile, 'utf8');
        acceptanceEvidenceDigest = sha256(evidenceText);
        const evidence = JSON.parse(evidenceText);
        const acceptance = validateAcceptanceEvidence(packet, evidence, {
          requireProductionCommit: phase === 'production-verification',
          expectedPhase: phase,
          expectedHeadCommit: repository.headCommit,
          expectedDiffDigest: repository.diffDigest,
          expectedPacketDigest: packetDigest,
          phaseStartedAt: startedAt,
        });
        if (priorEvidenceDigest && priorEvidenceDigest === acceptanceEvidenceDigest) acceptance.errors.push('acceptance artifact was not regenerated by the current phase.');
        if (phase === 'production-verification') {
          const refreshedMain = await fetchOriginMain(cwd);
          if (evidence.productionCommit !== refreshedMain) acceptance.errors.push(`productionCommit ${evidence.productionCommit || 'missing'} does not match origin/main ${refreshedMain}.`);
        }
        acceptance.ok = acceptance.errors.length === 0;
        if (!acceptance.ok) result = { exitCode: 1, error: `Acceptance floors failed: ${acceptance.errors.join(' ')}` };
      }
    } catch (error) {
      result = { exitCode: 1, error: error instanceof Error ? error.message : String(error) };
    }
    const finalRepository = await repositoryIdentity(cwd).catch(() => repository);
    if (result.exitCode === 0 && PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf('diff-freeze')
      && (finalRepository.headCommit !== repository.headCommit || finalRepository.diffDigest !== repository.diffDigest || finalRepository.untrackedFiles.length)) {
      result = { exitCode: 1, error: 'The repository identity changed during a frozen gate.' };
    }
    const record = {
      ...binding,
      recordType: 'result',
      headCommit: finalRepository.headCommit,
      diffDigest: finalRepository.diffDigest,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      outcome: result.exitCode === 0 ? 'passed' : 'failed',
      exitCode: result.exitCode,
      signal: result.signal || null,
      error: result.error || null,
      ...(acceptanceEvidenceDigest ? { acceptanceEvidenceDigest } : {}),
      ...(mergeCommit ? { mergeCommit } : {}),
    };
    await appendPhaseResult(ledger, record);
    if (record.outcome !== 'passed') fail(`${phase} failed: ${record.error || `exit code ${record.exitCode}`}.`);
    return record;
  } finally {
    await releaseLock();
  }
}

async function init() {
  const state = option('state').trim().toUpperCase();
  const objective = option('objective');
  if (!/^[A-Z]{2}$/u.test(state)) fail('--state=<two-letter code> is required.');
  if (!objective.trim()) fail('--objective=<measurable objective> is required.');
  const cwd = path.resolve(option('cwd', process.cwd()));
  const currentMain = await fetchOriginMain(cwd);
  const [headCommit, branch, status] = await Promise.all([
    commandCapture('git', ['rev-parse', 'HEAD'], { cwd }),
    commandCapture('git', ['branch', '--show-current'], { cwd }),
    commandCapture('git', ['status', '--porcelain'], { cwd }),
  ]);
  const baseCommit = currentMain;
  if (status) fail('State expansion initialization requires a clean worktree.');
  if (headCommit !== baseCommit) fail(`State expansion worktree must start at current origin/main ${baseCommit}; found ${headCommit}.`);
  if (!branch || branch === 'main') fail('State expansion requires a dedicated non-main branch.');
  const root = path.resolve(option('root', defaultRoot(state)));
  const packetFile = path.resolve(option('out', path.join(root, 'task-packet.json')));
  await mkdir(path.dirname(packetFile), { recursive: true });
  if (!hasFlag('force')) {
    try {
      await readFile(packetFile, 'utf8');
      fail(`${packetFile} already exists; use --force only after reviewing the existing packet.`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const packet = createTaskPacket({ state, objective });
  packet.runId = randomUUID();
  packet.repository = { repo: 'tarsagent22/Bourbon-Signal', baseCommit, initializedHeadCommit: headCommit, branch, worktreePath: cwd };
  packet.release = { objective: packet.objective, releaseLaneGuard: 'scripts/verify-release-lane.mjs', productionTarget: 'bourbonsignal.com' };
  packet.artifacts.acceptanceEvidence = path.posix.join('out', 'engine-expansions', state, 'acceptance.json');
  await writeFile(packetFile, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, action: 'init', state, runId: packet.runId, baseCommit, branch, packetFile }, null, 2));
}

async function verify() {
  const packetFile = option('packet');
  if (!packetFile) fail('--packet=<task-packet.json> is required.');
  const result = validateTaskPacket(await readJson(packetFile));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

async function phase() {
  const packetFile = option('packet');
  const phaseName = option('name');
  if (!packetFile || !phaseName) fail('--packet and --name are required; commands are derived from the frozen packet.');
  if (option('command')) fail('--command overrides are forbidden; update and freeze the task packet before implementation.');
  const packet = await readJson(packetFile);
  const commandKey = PHASE_COMMAND_KEYS[phaseName];
  if (!commandKey) fail(`${phaseName} is not a command-backed phase.`);
  const command = packet.commands?.[commandKey];
  if (!String(command || '').trim()) fail(`task packet commands.${commandKey} is required.`);
  const root = path.dirname(path.resolve(packetFile));
  const ledger = path.resolve(option('ledger', path.join(root, 'timings.jsonl')));
  const record = await runMeasuredPhase({ packet, phase: phaseName, command, commandKey, ledger, cwd: path.resolve(option('cwd', process.cwd())) });
  console.log(JSON.stringify({ ok: true, record, ledger }, null, 2));
}

async function discover() {
  const packetFile = option('packet');
  if (!packetFile) fail('--packet=<task-packet.json> is required.');
  const packet = await readJson(packetFile);
  const commands = packet.discoveryCommands || {};
  const required = [
    ['baseline', commands.baseline],
    ['source-atlas', commands.sourceAtlas],
    ['code-inventory', commands.codeInventory],
    ['browser-discovery', commands.browserDiscovery],
  ];
  if (required.some(([, command]) => !String(command || '').trim())) fail('task packet discoveryCommands must define baseline, sourceAtlas, codeInventory, and browserDiscovery.');
  const root = path.dirname(path.resolve(packetFile));
  const ledger = path.resolve(option('ledger', path.join(root, 'timings.jsonl')));
  const cwd = path.resolve(option('cwd', process.cwd()));
  if (!packet.runId || !packet.repository?.baseCommit || !packet.repository?.branch) fail('discovery requires an initialized packet with immutable repository binding.');
  const repository = await repositoryIdentity(cwd);
  const currentMain = await fetchOriginMain(cwd);
  if (currentMain !== packet.repository.baseCommit) fail(`origin/main advanced from initialized base ${packet.repository.baseCommit} to ${currentMain}; start a fresh run.`);
  if (repository.branch !== packet.repository.branch) fail(`Current branch ${repository.branch} does not match packet branch ${packet.repository.branch}.`);
  const results = await runBoundedTasks(required.map(([name, command]) => ({
    name,
    run: async () => {
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      const result = await commandResult(command, { cwd });
      const row = {
        schemaVersion: 'bourbon-signal-engine-expansion-timing-v1',
        recordType: 'result',
        state: packet.state,
        runId: packet.runId,
        phase: name,
        commandDigest: sha256(command),
        baseCommit: packet.repository.baseCommit,
        headCommit: repository.headCommit,
        diffDigest: repository.diffDigest,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        outcome: result.exitCode === 0 ? 'passed' : 'failed',
        exitCode: result.exitCode,
        signal: result.signal || null,
      };
      await appendPhaseResult(ledger, row);
      if (result.exitCode !== 0) throw new Error(`${name} exited ${result.exitCode}.`);
      return row;
    },
  })), { concurrency: Number(option('concurrency', '3')) });
  console.log(JSON.stringify({ ok: results.every((row) => row.outcome === 'passed'), results, ledger }, null, 2));
  if (results.some((row) => row.outcome !== 'passed')) process.exitCode = 1;
}

async function acceptance() {
  const packetFile = option('packet');
  const metricsFile = option('metrics');
  const phaseName = option('phase');
  if (!packetFile || !metricsFile || !['live-probe', 'production-verification'].includes(phaseName)) fail('acceptance requires --packet, --metrics, and --phase=live-probe|production-verification.');
  const packet = await readJson(packetFile);
  const metrics = await readJson(metricsFile);
  const cwd = path.resolve(option('cwd', process.cwd()));
  const repository = await repositoryIdentity(cwd);
  const fields = ['knownStores', 'liveStores', 'alertGradeStores', 'representedAreas', 'freshExactStoreDrops', 'alertableStaleRows'];
  const evidence = {
    schemaVersion: 'bourbon-signal-engine-expansion-acceptance-v1',
    evidenceId: randomUUID(),
    state: packet.state,
    runId: packet.runId,
    packetDigest: taskPacketDigest(packet),
    phase: phaseName,
    headCommit: repository.headCommit,
    diffDigest: repository.diffDigest,
    capturedAt: new Date().toISOString(),
    ...(phaseName === 'production-verification' ? { productionCommit: await fetchOriginMain(cwd) } : {}),
    ...Object.fromEntries(fields.map((field) => [field, Number(metrics[field])])),
  };
  const checked = validateAcceptanceEvidence(packet, evidence, {
    requireProductionCommit: phaseName === 'production-verification',
    expectedPhase: phaseName,
    expectedHeadCommit: repository.headCommit,
    expectedDiffDigest: repository.diffDigest,
  });
  if (!checked.ok) fail(`Acceptance metrics are invalid: ${checked.errors.join(' ')}`);
  const destination = path.resolve(cwd, packet.artifacts.acceptanceEvidence);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await rename(temporary, destination);
  console.log(JSON.stringify({ ok: true, action: 'acceptance', phase: phaseName, destination }, null, 2));
}

async function summary() {
  const ledger = option('ledger');
  if (!ledger) fail('--ledger=<timings.jsonl> is required.');
  console.log(JSON.stringify(summarizeTimings(await readLedger(path.resolve(ledger))), null, 2));
}

async function main() {
  const action = process.argv[2];
  if (action === 'init') return init();
  if (action === 'verify') return verify();
  if (action === 'phase') return phase();
  if (action === 'discover') return discover();
  if (action === 'acceptance') return acceptance();
  if (action === 'summary') return summary();
  fail('usage: engine-expansion-speed.mjs <init|verify|discover|phase|acceptance|summary> [options]');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { commandResult, runMeasuredPhase };
