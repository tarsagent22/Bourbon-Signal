#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPORTS = path.join(DIR, 'reports');
const DEFAULT_RUN = path.join(REPORTS, 'operator-run-latest.json');
const DEFAULT_HISTORY = path.join(REPORTS, 'operator-run-history.json');
const DEFAULT_OUTPUT = path.join(REPORTS, 'operator-outcomes-latest.json');
const SCHEMA = path.join(DIR, 'operator-run.schema.json');

function option(args, name, fallback) {
  const prefix = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

async function json(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

export function summarizeOperatorOutcomes(runs, generatedAt = new Date().toISOString()) {
  const rows = Array.isArray(runs) ? runs.slice(-200) : [];
  const objectiveIds = new Set(rows.map((run) => run.objectiveId).filter(Boolean));
  const completionByObjective = new Map();
  for (const run of rows) {
    if (run.outcome === 'completed' && run.objectiveId) completionByObjective.set(run.objectiveId, run);
  }
  const completionRows = [...completionByObjective.values()];
  const completedIds = new Set(completionByObjective.keys());
  const started = rows.filter((run) => run.startedObjective).length;
  const completed = completionRows.length;
  const objectiveHours = completionRows.map((run) => run.discoveryToCompletionHours).filter(Number.isFinite);
  return {
    contractVersion: 'bourbon-signal/operator-outcomes@1',
    generatedAt,
    runCount: rows.length,
    latestRunId: rows.at(-1)?.runId || null,
    metrics: {
      qualifiedFindings: rows.reduce((sum, run) => sum + run.findingsQualified, 0),
      objectivesStarted: started,
      objectivesCompleted: completed,
      uniqueObjectivesObserved: objectiveIds.size,
      objectiveCompletionRate: objectiveIds.size ? Number((completedIds.size / objectiveIds.size).toFixed(3)) : null,
      pullRequestsMerged: completionRows.filter((run) => run.merged).length,
      productionReleases: completionRows.filter((run) => run.productionVerified).length,
      engineExpansionsCompleted: completionRows.reduce((sum, run) => sum + run.engineExpansionsCompleted, 0),
      coverageDelta: completionRows.reduce((sum, run) => sum + run.coverageDelta, 0),
      continuedRuns: rows.filter((run) => run.outcome === 'continued').length,
      blockedRuns: rows.filter((run) => run.outcome === 'blocked').length,
      failedRuns: rows.filter((run) => run.outcome === 'failed').length,
      medianDiscoveryToCompletionHours: median(objectiveHours),
    },
  };
}

export async function recordOperatorOutcome(argv = process.argv.slice(2)) {
  const runFile = path.resolve(option(argv, 'run', DEFAULT_RUN));
  const historyFile = path.resolve(option(argv, 'history', DEFAULT_HISTORY));
  const outputFile = path.resolve(option(argv, 'output', DEFAULT_OUTPUT));
  const schema = await json(SCHEMA);
  const run = await json(runFile);
  if (!run) throw new Error(`Operator run artifact is missing: ${runFile}`);
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(schema);
  if (!validate(run)) throw new Error(`Operator run artifact is invalid: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
  const expectedRunId = option(argv, 'expected-run-id', null);
  const expectedStartedAt = option(argv, 'expected-started-at', null);
  const expectedObjectiveId = option(argv, 'expected-objective-id', null);
  if (expectedRunId && run.runId !== expectedRunId) throw new Error('Operator run ID does not match the wrapper-issued run ID.');
  if (expectedStartedAt && run.startedAt !== expectedStartedAt) throw new Error('Operator startedAt does not match the wrapper-issued timestamp.');
  if (expectedObjectiveId && run.objectiveId !== expectedObjectiveId) throw new Error('Operator changed the active objective instead of continuing it.');
  const started = Date.parse(run.startedAt);
  const completed = Date.parse(run.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started || completed > Date.now() + 300_000) {
    throw new Error('Operator run timestamps are invalid or inconsistent.');
  }
  if (run.outcome !== 'completed' && run.discoveryToCompletionHours !== null) throw new Error('Only completed objectives may report discovery-to-completion time.');
  if (run.outcome === 'no_qualified_work' && run.objectiveId !== null) throw new Error('A no-work run cannot claim an objective.');
  if (run.engineExpansionsCompleted > 0 && run.lane !== 'engine_expansion') throw new Error('Engine expansions require the engine_expansion lane.');
  const history = await json(historyFile, { contractVersion: 'bourbon-signal/operator-run-history@1', runs: [] });
  if (history.contractVersion !== 'bourbon-signal/operator-run-history@1' || !Array.isArray(history.runs)) throw new Error('Operator run history is invalid.');
  const runs = history.runs.filter((row) => row.runId !== run.runId).concat(run).slice(-200);
  const summary = summarizeOperatorOutcomes(runs);
  if (argv.includes('--apply')) {
    await mkdir(path.dirname(historyFile), { recursive: true });
    await writeFile(historyFile, `${JSON.stringify({ ...history, runs }, null, 2)}\n`);
    await writeFile(outputFile, `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (argv.includes('--print')) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  recordOperatorOutcome().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Operator outcome aggregation failed'}\n`);
    process.exitCode = 1;
  });
}
