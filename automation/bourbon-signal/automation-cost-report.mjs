#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_INPUT = path.join(SCRIPT_DIR, 'reports', 'automation-run-events.json');
const DEFAULT_OUTPUT = path.join(SCRIPT_DIR, 'reports', 'automation-cost-latest.json');
const REGISTRY_PATH = path.join(SCRIPT_DIR, 'automation-registry.json');
const COUNTERS = ['braveQueries', 'httpProbes', 'browserPages', 'statesDiscovered', 'sourcesDiscovered', 'statesPromoted', 'sourcesPromoted', 'usefulFindings', 'objectivesCompleted', 'coverageDelta'];

function option(args, name) {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

function boundedInteger(value, maximum = 1_000_000) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(0, Math.floor(number))) : 0;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function readAutomationRegistry(file = REGISTRY_PATH) {
  const registry = await readJson(file, null);
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.automations)) throw new Error('Canonical automation registry is required.');
  return registry;
}

function blankTotals() {
  return {
    deterministicRuns: 0,
    agentRuns: 0,
    failedRuns: 0,
    braveQueries: 0,
    directHttpProbes: 0,
    headlessBrowserPages: 0,
    statesDiscovered: 0,
    sourcesDiscovered: 0,
    statesPromoted: 0,
    sourcesPromoted: 0,
    tokens: 0,
    usefulFindings: 0,
    objectivesCompleted: 0,
    customerCoverageDelta: 0,
    averageTokensPerUsefulFinding: 0,
    averageTokensPerObjective: 0,
  };
}

function publicRun(raw, automation) {
  const counters = Object.fromEntries(COUNTERS.map((key) => [key, boundedInteger(raw?.[key])])) ;
  const agentic = automation.executionClass !== 'script_only';
  return {
    jobId: automation.id,
    executionClass: automation.executionClass,
    failed: raw?.status !== 'success',
    tokens: agentic ? boundedInteger(raw?.tokens, 100_000_000) : 0,
    ...counters,
  };
}

/** Selects the only fields allowed in a persisted per-run telemetry event. */
export function sanitizeAutomationRun(raw, registry) {
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.automations)) throw new Error('Canonical automation registry is required.');
  const jobId = typeof raw?.jobId === 'string' ? raw.jobId : '';
  const automation = registry.automations.find((entry) => entry?.id === jobId);
  if (!automation) throw new Error(`Unknown automation job: ${jobId || 'missing'}.`);
  return publicRun(raw, automation);
}

/**
 * Reduces supplied run events to aggregate counters only. Event labels, prompts,
 * user identifiers, URLs, timestamps, and raw tool output are deliberately not
 * copied into the returned report.
 */
export function buildAutomationCostReport({ runs = [], registry, generatedAt = new Date().toISOString() } = {}) {
  if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.automations)) throw new Error('Canonical automation registry is required.');
  const byId = new Map(registry.automations.map((automation) => [automation.id, automation]));
  const totals = blankTotals();
  const byJob = {};
  for (const raw of Array.isArray(runs) ? runs.slice(0, 10_000) : []) {
    const jobId = typeof raw?.jobId === 'string' ? raw.jobId : '';
    const automation = byId.get(jobId);
    if (!automation) continue;
    const run = sanitizeAutomationRun(raw, registry);
    if (!byJob[jobId]) byJob[jobId] = { executionClass: automation.executionClass, runs: 0, failedRuns: 0, tokens: 0, braveQueries: 0, directHttpProbes: 0, headlessBrowserPages: 0, statesDiscovered: 0, sourcesDiscovered: 0, statesPromoted: 0, sourcesPromoted: 0, usefulFindings: 0, objectivesCompleted: 0, customerCoverageDelta: 0 };
    const job = byJob[jobId];
    job.runs += 1;
    if (automation.executionClass === 'script_only') totals.deterministicRuns += 1;
    else totals.agentRuns += 1;
    if (run.failed) { totals.failedRuns += 1; job.failedRuns += 1; }
    for (const [key, target] of [
      ['tokens', 'tokens'], ['braveQueries', 'braveQueries'], ['httpProbes', 'directHttpProbes'], ['browserPages', 'headlessBrowserPages'], ['statesDiscovered', 'statesDiscovered'], ['sourcesDiscovered', 'sourcesDiscovered'], ['statesPromoted', 'statesPromoted'], ['sourcesPromoted', 'sourcesPromoted'], ['usefulFindings', 'usefulFindings'], ['objectivesCompleted', 'objectivesCompleted'], ['coverageDelta', 'customerCoverageDelta'],
    ]) {
      totals[target] += run[key];
      job[target] += run[key];
    }
  }
  totals.averageTokensPerUsefulFinding = totals.usefulFindings ? Math.round(totals.tokens / totals.usefulFindings) : 0;
  totals.averageTokensPerObjective = totals.objectivesCompleted ? Math.round(totals.tokens / totals.objectivesCompleted) : 0;
  return {
    contractVersion: 'bourbon-signal/automation-cost@1',
    generatedAt,
    privacy: {
      aggregateOnly: true,
      containsPrompts: false,
      containsPii: false,
      containsRawSearches: false,
      containsToolLogs: false,
    },
    totals,
    byJob,
  };
}

export async function generateAutomationCostReport(argv = process.argv.slice(2)) {
  const input = path.resolve(option(argv, 'input') || DEFAULT_INPUT);
  const output = path.resolve(option(argv, 'output') || DEFAULT_OUTPUT);
  const source = await readJson(input, { runs: [] });
  const registry = await readAutomationRegistry();
  const report = buildAutomationCostReport({ runs: Array.isArray(source) ? source : source.runs, registry, generatedAt: option(argv, 'at') || new Date().toISOString() });
  if (argv.includes('--apply')) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (argv.includes('--print')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  generateAutomationCostReport().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Automation cost report failed'}\n`);
    process.exitCode = 1;
  });
}
