#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { selectRotatingStateCohort } from '../../engine/src/discovery/state-source-discovery.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_OUTPUT = path.join(SCRIPT_DIR, 'reports', 'source-expansion-collector-latest.json');
const DEFAULT_PROBE_OUTPUT = path.join(SCRIPT_DIR, 'reports', 'known-source-probe-latest.json');
const CANDIDATE_REGISTRY = path.join(ROOT, 'engine', 'data', 'state-expansion-candidates.json');
const STATE_PATTERN = /^(?:[A-Z]{2}|MD-MONTGOMERY)$/;
const MAX_STATES_PER_RUN = 5;

function option(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

export function normalizeStates(value) {
  const states = String(value || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  const unique = [...new Set(states)];
  if (!unique.length) throw new Error('Provide at least one --states=AA,BB value.');
  if (unique.length > MAX_STATES_PER_RUN) throw new Error(`Source expansion is bounded to ${MAX_STATES_PER_RUN} states per run.`);
  if (unique.some((state) => !STATE_PATTERN.test(state))) throw new Error('States must be two-letter codes or MD-MONTGOMERY.');
  return unique;
}

function nonNegative(value) { return Math.max(0, Math.min(1_000_000, Math.floor(Number(value) || 0))); }

export function resolveScheduledStates(registry, at = new Date().toISOString(), rotationHours = 0) {
  const candidates = (Array.isArray(registry?.states) ? registry.states : [])
    .filter((state) => state?.automationPaused !== true)
    .filter((state) => !['active', 'alert_grade'].includes(state?.lifecycleStage));
  const eligible = selectRotatingStateCohort(candidates, { now: at, cohortSize: candidates.length });
  if (!eligible.length || !rotationHours) return eligible.slice(0, MAX_STATES_PER_RUN).map((state) => state.state);
  const slot = Math.floor(Date.parse(at) / (rotationHours * 60 * 60 * 1000));
  const start = (((slot * MAX_STATES_PER_RUN) % eligible.length) + eligible.length) % eligible.length;
  return Array.from({ length: Math.min(MAX_STATES_PER_RUN, eligible.length) }, (_, index) => eligible[(start + index) % eligible.length].state);
}

export function stagesForCollectionMode(mode = 'broad') {
  if (mode === 'broad') return ['discovery', 'probe'];
  if (mode === 'probe') return ['probe'];
  throw new Error(`Unknown source-expansion mode ${mode}.`);
}

export function summarizeStageOutput(result) {
  if (Array.isArray(result)) {
    return {
      candidates: result.reduce((total, row) => total + nonNegative(row?.candidateCount ?? row?.summary?.candidates), 0),
      probeable: result.reduce((total, row) => total + nonNegative(row?.summary?.probeable), 0),
      blocked: result.reduce((total, row) => total + nonNegative(row?.summary?.blocked), 0),
    };
  }
  const summary = result?.summary && typeof result.summary === 'object' ? result.summary : {};
  return { candidates: nonNegative(summary.candidates), probeable: nonNegative(summary.probeable), blocked: nonNegative(summary.blocked) };
}

function positiveNumber(value, maximum = 1_000_000) { return Math.min(maximum, Math.max(0, Number(value) || 0)); }

function expansionCandidate(raw, fallbackState) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const state = String(item.state || item.stateId || fallbackState || '').trim().toUpperCase();
  const source = String(item.source || item.sourceName || item.domain || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!STATE_PATTERN.test(state) || !source) return null;
  const authority = ['official', 'first_party', 'verified', 'unknown'].includes(item.sourceAuthority) ? item.sourceAuthority : 'unknown';
  return {
    state,
    source,
    aggregateDemand: positiveNumber(item.aggregateDemand ?? item.demandScore),
    paidMemberOverlap: positiveNumber(item.paidMemberOverlap),
    canonicalBottleDemand: positiveNumber(item.canonicalBottleDemand),
    coverageTier: String(item.coverageTier || 'research_only').slice(0, 80),
    exactStoreGap: positiveNumber(item.exactStoreGap, 100),
    alertGradeGap: positiveNumber(item.alertGradeGap, 100),
    sourceAuthority: authority,
    runnerReachability: Math.min(1, positiveNumber(item.runnerReachability, 1)),
    expectedRequestBudget: positiveNumber(item.expectedRequestBudget, 10_000),
    sourceStability: Math.min(1, positiveNumber(item.sourceStability, 1)),
    implementationEffort: Math.min(5, Math.max(1, Number.isFinite(Number(item.implementationEffort)) ? positiveNumber(item.implementationEffort, 5) : 5)),
    reversibility: Math.min(5, Math.max(1, Number.isFinite(Number(item.reversibility)) ? positiveNumber(item.reversibility, 5) : 5)),
    strategicAdjacency: Math.min(10, positiveNumber(item.strategicAdjacency, 10)),
  };
}

function collectExpansionCandidates(stages) {
  const candidates = new Map();
  for (const stage of stages) {
    const rawCandidates = Array.isArray(stage?.expansionCandidates) ? stage.expansionCandidates : [];
    for (const raw of rawCandidates) {
      const candidate = expansionCandidate(raw, stage.states?.[0]);
      if (!candidate) continue;
      const key = `${candidate.state}|${candidate.source.toLowerCase()}`;
      const previous = candidates.get(key);
      candidates.set(key, previous ? { ...previous, ...candidate, runnerReachability: Math.max(previous.runnerReachability, candidate.runnerReachability), sourceStability: Math.max(previous.sourceStability, candidate.sourceStability) } : candidate);
    }
  }
  return [...candidates.values()].sort((left, right) => left.state.localeCompare(right.state) || left.source.localeCompare(right.source)).slice(0, 100);
}

export function engineStageInvocation(stage, { maxRequests = 60, officialOnly = false } = {}) {
  const relative = stage === 'discovery'
    ? 'src/discovery/state-source-discovery.mjs'
    : stage === 'probe'
      ? 'src/discovery/state-source-probe.mjs'
      : null;
  if (!relative) throw new Error(`Unknown source-expansion stage ${stage}.`);
  return {
    executable: process.execPath,
    script: path.join(ROOT, 'engine', relative),
    extraArgs: stage === 'probe'
      ? [`--max-requests=${Math.max(1, Math.min(60, Number(maxRequests) || 60))}`, ...(officialOnly ? ['--official-only'] : [])]
      : [],
  };
}

async function runEngineStage({ stage, states, mode }) {
  const invocation = engineStageInvocation(stage, { maxRequests: mode === 'probe' ? 40 : 60, officialOnly: mode === 'probe' });
  const args = [invocation.script, `--states=${states.join(',')}`, ...invocation.extraArgs];
  if (stage === 'discovery') args.push(`--max-queries=${MAX_STATES_PER_RUN * 4}`);
  const { stdout = '' } = await execFile(invocation.executable, args, { cwd: path.join(ROOT, 'engine'), maxBuffer: 200_000 });
  let parsed = {};
  try { parsed = JSON.parse(stdout); } catch { /* Engine artifacts are the authority; console output is optional. */ }
  const candidateRows = Array.isArray(parsed?.expansionCandidates) ? parsed.expansionCandidates : Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  return {
    stage,
    states,
    ok: true,
    artifact: stage === 'discovery' ? 'engine/out/discovery/<STATE>.json' : 'engine/out/probes/<STATE>.json',
    summary: summarizeStageOutput(parsed),
    expansionCandidates: candidateRows,
  };
}

/** Runs only bounded deterministic engine stages. It never updates lifecycle, promotions, alerts, or public site data. */
export async function buildSourceExpansionCollection({ states, mode = 'broad', execute = false, run = runEngineStage, generatedAt = new Date().toISOString() } = {}) {
  const normalizedStates = Array.isArray(states) ? normalizeStates(states.join(',')) : normalizeStates(states);
  const stages = [];
  for (const stage of stagesForCollectionMode(mode)) {
    stages.push(execute
      ? await run({ stage, states: normalizedStates, mode })
      : { stage, states: normalizedStates, ok: null, planned: true, artifact: stage === 'discovery' ? 'engine/out/discovery/<STATE>.json' : 'engine/out/probes/<STATE>.json', summary: { candidates: 0, probeable: 0, blocked: 0 } });
  }
  const summary = stages.reduce((total, stage) => ({
    candidates: total.candidates + nonNegative(stage.summary?.candidates),
    probeable: total.probeable + nonNegative(stage.summary?.probeable),
    blocked: total.blocked + nonNegative(stage.summary?.blocked),
  }), { candidates: 0, probeable: 0, blocked: 0 });
  const expansionCandidates = collectExpansionCandidates(stages);
  return {
    contractVersion: 'bourbon-signal/source-expansion-collector@2',
    generatedAt,
    mode: execute ? 'deterministic_collection' : 'planned_collection',
    collectionMode: mode,
    states: normalizedStates,
    maxStatesPerRun: MAX_STATES_PER_RUN,
    canPromote: false,
    canPublish: false,
    customerMutation: 'none',
    stages,
    summary,
    expansionCandidates,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const at = option(argv, 'at') || new Date().toISOString();
  const mode = option(argv, 'mode') || 'broad';
  stagesForCollectionMode(mode);
  const requestedStates = option(argv, 'states');
  const states = requestedStates || resolveScheduledStates(JSON.parse(await readFile(CANDIDATE_REGISTRY, 'utf8')), at, mode === 'probe' ? 1 : 3).join(',');
  const report = await buildSourceExpansionCollection({
    states,
    mode,
    execute: argv.includes('--execute'),
    generatedAt: at,
  });
  if (argv.includes('--apply')) {
    const output = path.resolve(option(argv, 'output') || (mode === 'probe' ? DEFAULT_PROBE_OUTPUT : DEFAULT_OUTPUT));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (argv.includes('--print')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Source expansion collection failed'}\n`); process.exitCode = 1; });
}
