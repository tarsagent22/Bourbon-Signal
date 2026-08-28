#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_RECOVERY_BACKOFF_MS = 15 * 60_000;
const MAX_RECOVERY_BACKOFF_MS = 2 * 60 * 60_000;
const INCIDENT_CIRCUIT_COOLDOWN_MS = 6 * 60 * 60_000;
const MAX_MATCHING_INCIDENT_ATTEMPTS = 4;

function stableFailures(watchdog) {
  return (Array.isArray(watchdog?.failures) ? watchdog.failures : [])
    .map((failure) => typeof failure === 'string' ? failure : JSON.stringify(failure))
    .map((failure) => failure.trim())
    .filter(Boolean)
    .sort();
}

function validTime(...values) {
  for (const value of values) {
    const time = Date.parse(value || '');
    if (Number.isFinite(time)) return time;
  }
  return null;
}

function matchingIncident(run, title, headSha) {
  return run?.event === 'workflow_dispatch'
    && String(run?.headSha || '').toLowerCase() === headSha
    && String(run?.displayTitle || '') === title;
}

export function planEngineRecovery({ watchdog, runs, headSha, now = new Date().toISOString() }) {
  const states = [...new Set((watchdog?.recoveryStates || []).map((state) => String(state).trim()).filter(Boolean))].sort();
  if (states.some((state) => !/^[A-Z]{2}(?:-[A-Z]+)?$/.test(state))) throw new Error('Invalid recovery state identifier.');
  if (!/^[a-f0-9]{40}$/i.test(String(headSha || ''))) throw new Error('Invalid main revision.');
  const nowMs = validTime(now);
  if (nowMs == null) throw new Error('Invalid recovery planning time.');
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
  const matchingAttempts = (runs || [])
    .filter((run) => matchingIncident(run, title, incident.headSha))
    .map((run) => ({ ...run, observedAtMs: validTime(run?.createdAt, run?.updatedAt, run?.startedAt) }))
    .sort((left, right) => (left.observedAtMs || 0) - (right.observedAtMs || 0));
  const lastAttempt = matchingAttempts.at(-1) || null;
  if (matchingAttempts.length >= MAX_MATCHING_INCIDENT_ATTEMPTS && lastAttempt?.observedAtMs != null) {
    const nextEligibleAtMs = lastAttempt.observedAtMs + INCIDENT_CIRCUIT_COOLDOWN_MS;
    if (nowMs < nextEligibleAtMs) {
      return {
        dispatch: false,
        reason: 'incident_circuit_open',
        priorRunId: lastAttempt.databaseId || null,
        incidentKey,
        mode,
        states,
        attempt: matchingAttempts.length,
        priorAttempts: matchingAttempts.length,
        retryDelayMinutes: Math.round(INCIDENT_CIRCUIT_COOLDOWN_MS / 60_000),
        nextEligibleAt: new Date(nextEligibleAtMs).toISOString(),
      };
    }
  }
  if (lastAttempt?.observedAtMs != null) {
    const backoffMs = Math.min(BASE_RECOVERY_BACKOFF_MS * (2 ** Math.max(0, matchingAttempts.length - 1)), MAX_RECOVERY_BACKOFF_MS);
    const nextEligibleAtMs = lastAttempt.observedAtMs + backoffMs;
    if (nowMs < nextEligibleAtMs) {
      return {
        dispatch: false,
        reason: 'recovery_backoff',
        priorRunId: lastAttempt.databaseId || null,
        incidentKey,
        mode,
        states,
        attempt: matchingAttempts.length + 1,
        priorAttempts: matchingAttempts.length,
        retryDelayMinutes: Math.round(backoffMs / 60_000),
        nextEligibleAt: new Date(nextEligibleAtMs).toISOString(),
      };
    }
  }
  return {
    dispatch: true,
    reason: 'recovery_needed',
    priorRunId: lastAttempt?.databaseId || null,
    incidentKey,
    mode,
    states,
    attempt: matchingAttempts.length + 1,
    priorAttempts: matchingAttempts.length,
    retryDelayMinutes: matchingAttempts.length
      ? Math.round(Math.min(BASE_RECOVERY_BACKOFF_MS * (2 ** Math.max(0, matchingAttempts.length - 1)), MAX_RECOVERY_BACKOFF_MS) / 60_000)
      : 0,
    nextEligibleAt: new Date(nowMs).toISOString(),
  };
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
