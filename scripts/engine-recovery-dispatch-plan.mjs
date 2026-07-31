#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function stableFailures(watchdog) {
  return (Array.isArray(watchdog?.failures) ? watchdog.failures : [])
    .map((failure) => typeof failure === 'string' ? failure : JSON.stringify(failure))
    .map((failure) => failure.trim())
    .filter(Boolean)
    .sort();
}

export function planEngineRecovery({ watchdog, runs, headSha }) {
  const states = [...new Set((watchdog?.recoveryStates || []).map((state) => String(state).trim()).filter(Boolean))].sort();
  if (states.some((state) => !/^[A-Z]{2}(?:-[A-Z]+)?$/.test(state))) throw new Error('Invalid recovery state identifier.');
  if (!/^[a-f0-9]{40}$/i.test(String(headSha || ''))) throw new Error('Invalid main revision.');
  const mode = states.length ? 'targeted' : 'full';
  const incident = {
    headSha: String(headSha).toLowerCase(),
    snapshot: String(watchdog?.snapshotId || watchdog?.generatedAt || 'unknown'),
    mode,
    states,
    failures: stableFailures(watchdog),
  };
  const incidentKey = createHash('sha256').update(JSON.stringify(incident)).digest('hex').slice(0, 20);
  const title = `Inventory recovery ${incidentKey}`;
  const active = (runs || []).find((run) => run?.status === 'queued' || run?.status === 'in_progress');
  if (active) return { dispatch: false, reason: 'active_refresh', priorRunId: active.databaseId || null, incidentKey, mode, states };
  const matchingAttempt = (runs || []).find((run) => run?.event === 'workflow_dispatch'
    && run?.status === 'completed'
    && String(run?.headSha || '').toLowerCase() === incident.headSha
    && String(run?.displayTitle || '') === title);
  if (matchingAttempt) return { dispatch: false, reason: 'matching_recovery_attempt', priorRunId: matchingAttempt.databaseId || null, incidentKey, mode, states };
  return { dispatch: true, reason: 'recovery_needed', priorRunId: null, incidentKey, mode, states };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  const watchdogPath = value('--watchdog');
  const runsPath = value('--runs');
  const headSha = value('--head-sha');
  if (!watchdogPath || !runsPath || !headSha) throw new Error('Usage: --watchdog <json> --runs <json> --head-sha <sha>');
  const watchdog = JSON.parse(await readFile(path.resolve(watchdogPath), 'utf8'));
  const runs = JSON.parse(await readFile(path.resolve(runsPath), 'utf8'));
  process.stdout.write(`${JSON.stringify(planEngineRecovery({ watchdog, runs, headSha }))}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
