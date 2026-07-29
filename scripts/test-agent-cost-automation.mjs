import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildAutomationCostReport, sanitizeAutomationRun } from '../automation/bourbon-signal/automation-cost-report.mjs';
import { summarizeOperatorOutcomes } from '../automation/bourbon-signal/operator-outcomes.mjs';
import { classifyBottleQueueItem, processBottleQueue } from '../automation/bourbon-signal/bottle-queue-autoprocess.mjs';
import { buildSourceExpansionCollection, engineStageInvocation, resolveScheduledStates, stagesForCollectionMode, summarizeStageOutput } from '../automation/bourbon-signal/source-expansion-collector.mjs';
import { collectReleaseRadarLeads, queryPlan } from '../automation/bourbon-signal/release-radar-lead-collector.mjs';
import { buildNcRadarSourceRegistry, monitorNcRadarSources } from '../automation/bourbon-signal/nc-release-radar-monitor.mts';
import { classifyExpansionAutonomy } from '../automation/bourbon-signal/autonomy-threshold.mjs';
import { expansionPromotionGate, rankSourceInvestments } from '../automation/bourbon-signal/source-roi-core.mjs';
import { buildDailyCompanyBrief, buildWeeklyStrategyReview } from './lib/operator-briefs.mjs';
import { buildFinding } from './lib/operator-findings.mjs';
import { renderStateLifecycleTypes, verifyStateLifecycleDrift } from './generate-state-lifecycle-types.mjs';
import { buildCompanyScorecard } from '../src/lib/company-control-room.ts';

const root = resolve('.');

function cronFieldCount(field, span) {
  if (field === '*') return span;
  if (/^\*\/\d+$/.test(field)) return Math.ceil(span / Number(field.slice(2)));
  return field.split(',').length;
}

function cronRunsPerDay(schedule) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.trim().split(/\s+/);
  assert.equal(dayOfMonth, '*');
  assert.equal(month, '*');
  assert.equal(dayOfWeek, '*');
  return cronFieldCount(minute, 60) * cronFieldCount(hour, 24);
}

function cronHour(schedule) {
  return Number(schedule.trim().split(/\s+/)[1].split(',')[0]);
}

function frequencyRunsPerDay(frequency) {
  if (/^every (\d+) minutes/.test(frequency)) return 1440 / Number(frequency.match(/\d+/)[0]);
  if (/^every (\d+) hours/.test(frequency)) return 24 / Number(frequency.match(/\d+/)[0]);
  if (frequency.startsWith('hourly')) return 24;
  if (frequency.startsWith('daily')) return 1;
  if (frequency.startsWith('twice daily')) return 2;
  if (frequency.startsWith('Friday')) return 1 / 7;
  if (frequency === 'monthly') return 1 / 30;
  if (frequency.startsWith('manual') || frequency.startsWith('on every') || frequency === 'push and pull request') return 0;
  throw new Error(`Unhandled automation frequency: ${frequency}`);
}

const registryPath = resolve('automation/bourbon-signal/automation-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const cadence = JSON.parse(readFileSync(resolve('automation/bourbon-signal/automation-cadence-contract.json'), 'utf8'));
const hermesSnapshot = JSON.parse(readFileSync(resolve('automation/bourbon-signal/hermes-jobs.json'), 'utf8'));
const hermesByName = new Map(hermesSnapshot.jobs.map((job) => [job.name, job]));
assert.equal(registry.schemaVersion, 1);
assert.equal(registry.timezone, 'America/New_York');
assert.equal(cadence.timezone, 'America/New_York');
const shadowCron = readFileSync(resolve('.github/workflows/state-expansion-shadow.yml'), 'utf8').match(/cron:\s*["']([^"']+)["']/)?.[1];
const browserCron = readFileSync(resolve('.github/workflows/state-source-browser-probe.yml'), 'utf8').match(/cron:\s*["']([^"']+)["']/)?.[1];
assert.equal(cadence.dailyCadence.knownSourceProbe, cronRunsPerDay(hermesByName.get('Bourbon Signal hourly known-source probe').schedule));
assert.equal(cadence.dailyCadence.broadDiscoveryAndScoring, cronRunsPerDay(hermesByName.get('Bourbon Signal deterministic state source collector').schedule));
assert.equal(cadence.dailyCadence.shadowEvidence, cronRunsPerDay(shadowCron));
assert.equal(cadence.dailyCadence.browserProbe, cronRunsPerDay(browserCron));
const deterministicRunsPerDay = registry.automations.filter((entry) => entry.executionClass === 'script_only').reduce((sum, entry) => sum + frequencyRunsPerDay(entry.frequency), 0);
const agentRunsPerWeek = registry.automations.filter((entry) => entry.executionClass !== 'script_only').reduce((sum, entry) => sum + (frequencyRunsPerDay(entry.frequency) * 7), 0);
assert.ok(Math.abs(cadence.expectedTotals.deterministicRunsPerDay - deterministicRunsPerDay) < 1e-6);
assert.ok(Math.abs(cadence.expectedTotals.agenticRunsPerWeek - agentRunsPerWeek) < 1e-6);
assert.deepEqual(cadence.codingAgentPolicy, { profile: 'bourbonbot', provider: 'openai-codex', model: 'gpt-5.6-sol', reasoning: 'low', approvalCronMode: 'approve' });
assert.deepEqual(cadence.analysisAgentPolicy, { provider: 'openai-codex', model: 'gpt-5.6-luna', reasoning: 'xhigh' });
assert.equal(hermesSnapshot.timezone, 'America/New_York');
assert.equal(hermesByName.get('Bourbon Signal hourly known-source probe')?.schedule, '40 * * * *');
assert.equal(hermesByName.get('Bourbon Signal deterministic state source collector')?.schedule, '15 */3 * * *');
assert.equal(hermesByName.get('Bourbon Signal silent demand and source scout')?.schedule, '0 2,14 * * *');
assert.equal(hermesByName.get('Bourbon Signal autonomous company operator')?.schedule, '45 2,14 * * *');
assert.equal(hermesByName.get('Bourbon Signal silent Release Radar scout')?.schedule, '15 1 * * *');
assert.ok(cronRunsPerDay(hermesByName.get('Bourbon Signal silent Release Radar scout')?.schedule) > 0);
assert.ok(
  cronHour(hermesByName.get('Bourbon Signal silent Release Radar scout')?.schedule) < cronHour(hermesByName.get('Bourbon Signal autonomous company operator')?.schedule),
  'the fresh Radar ledger must exist before the overnight operator selects an objective',
);
assert.equal(hermesByName.get('Bourbon Signal morning scorecard aggregation')?.schedule, '0 5 * * *');
assert.equal(hermesByName.get('Bourbon Signal daily company brief')?.schedule, '30 5 * * *');
const codingOperator = hermesByName.get('Bourbon Signal autonomous company operator');
assert.deepEqual([codingOperator.noAgent, codingOperator.script, codingOperator.provider, codingOperator.model, codingOperator.reasoning], [true, 'bourbon_signal_autonomous_operator.py', 'openai-codex', 'gpt-5.6-sol', 'low']);
assert.match(codingOperator.profileSafetyHash || '', /^[a-f0-9]{64}$/);
assert.ok(hermesSnapshot.jobs.every((job) => job.workdir === 'C:\\c\\Users\\chand\\projects\\Bourbon-Signal-autonomous'), 'Every scheduled Bourbon Signal job must use the isolated clone.');
for (const job of hermesSnapshot.jobs.filter((row) => !row.noAgent)) {
  assert.deepEqual([job.provider, job.model, job.reasoning], ['openai-codex', 'gpt-5.6-luna', 'xhigh']);
  assert.match(job.safetyHash || '', /^[a-f0-9]{64}$/, `${job.name} must bind prompt, skills, and toolsets`);
}
const minimalLifecycle = { activeStates: [], states: {} };
const renderedLifecycle = renderStateLifecycleTypes(minimalLifecycle);
const windowsLifecycle = renderedLifecycle.split('\n').join(`${String.fromCharCode(13)}\n`);
assert.equal((await verifyStateLifecycleDrift({ config: minimalLifecycle, actual: windowsLifecycle })).ok, true, 'generated lifecycle verification must ignore host newline style');
assert.ok(registry.automations.some((entry) => entry.id === 'github-engine-watchdog' && entry.executionClass === 'script_only'));
assert.ok(registry.automations.some((entry) => entry.id === 'hermes-bottle-queue' && entry.executionClass === 'script_only'));
assert.equal(engineStageInvocation('discovery').executable, process.execPath);
assert.ok(engineStageInvocation('discovery').script.endsWith(join('engine', 'src', 'discovery', 'state-source-discovery.mjs')));
assert.ok(engineStageInvocation('probe').script.endsWith(join('engine', 'src', 'discovery', 'state-source-probe.mjs')));
assert.deepEqual(engineStageInvocation('probe', { maxRequests: 40, officialOnly: true }).extraArgs, ['--max-requests=40', '--official-only']);
assert.throws(() => engineStageInvocation('publish'), /Unknown source-expansion stage/);
assert.deepEqual(stagesForCollectionMode('broad'), ['discovery', 'probe']);
assert.deepEqual(stagesForCollectionMode('probe'), ['probe']);
assert.throws(() => stagesForCollectionMode('publish'), /Unknown source-expansion mode/);
const pausedStateRegistry = {
  states: [
    { state: 'MS', lifecycleStage: 'research', automationPaused: true },
    { state: 'AR', lifecycleStage: 'research' },
  ],
};
assert.deepEqual(
  resolveScheduledStates(pausedStateRegistry, '2026-07-29T12:00:00.000Z'),
  ['AR'],
  'scheduled source expansion must exclude explicitly paused states',
);
const checkedInExpansionRegistry = JSON.parse(readFileSync(resolve('engine/data/state-expansion-candidates.json'), 'utf8'));
assert.equal(
  checkedInExpansionRegistry.states.find((row) => row.state === 'MS')?.automationPaused,
  true,
  'Mississippi must remain paused from scheduled source automation',
);
assert.match(
  readFileSync(resolve('automation/bourbon-signal/hermes-scripts/bourbon_signal_known_source_probe.py'), 'utf8'),
  /automationPaused/,
  'the hourly known-source cron must honor the shared state pause',
);
assert.deepEqual(summarizeStageOutput([{ candidateCount: 3 }, { candidateCount: 4 }]), { candidates: 7, probeable: 0, blocked: 0 });
assert.deepEqual(resolveScheduledStates({ states: [
  { state: 'AA', lifecycleStage: 'active', lastDiscoveryAt: null },
  { state: 'BB', lifecycleStage: 'discovery', lastDiscoveryAt: null },
  { state: 'CC', lifecycleStage: 'probeable', lastDiscoveryAt: '2026-07-15T00:00:00Z' },
] }, '2026-07-16T00:00:00Z'), ['BB', 'CC']);
const rotatingRegistry = { states: ['AA','BB','CC','DD','EE','FF','GG','HH','II','JJ'].map((state) => ({ state, lifecycleStage: 'discovery', lastDiscoveryAt: null })) };
const firstCohort = resolveScheduledStates(rotatingRegistry, '1970-01-01T00:00:00Z', 1);
const secondCohort = resolveScheduledStates(rotatingRegistry, '1970-01-01T01:00:00Z', 1);
assert.equal(firstCohort.filter((state) => secondCohort.includes(state)).length, 0, 'adjacent windows should advance by one full cohort');
execFileSync(process.execPath, ['scripts/verify-automation-registry.mjs'], { cwd: root, stdio: 'pipe' });

const cost = buildAutomationCostReport({
  generatedAt: '2026-07-16T12:00:00.000Z',
  registry,
  runs: [
    { jobId: 'github-refresh-feed', status: 'success', braveQueries: 2, httpProbes: 9, browserPages: 1, statesDiscovered: 2, sourcesDiscovered: 7, sourcesPromoted: 1, coverageDelta: 1 },
    { jobId: 'hermes-daily-operator', status: 'failed', tokens: 1200, usefulFindings: 3, objectivesCompleted: 1 },
    { jobId: 'hermes-bottle-queue', status: 'success', tokens: 999999, prompt: 'must not survive', memberEmail: 'must not survive' },
  ],
});
assert.equal(cost.contractVersion, 'bourbon-signal/automation-cost@1');
assert.equal(cost.totals.deterministicRuns, 2);
assert.equal(cost.totals.agentRuns, 1);
assert.equal(cost.totals.failedRuns, 1);
assert.equal(cost.totals.braveQueries, 2);
assert.equal(cost.totals.directHttpProbes, 9);
assert.equal(cost.totals.headlessBrowserPages, 1);
assert.equal(cost.totals.sourcesDiscovered, 7);
assert.equal(cost.totals.sourcesPromoted, 1);
assert.equal(cost.totals.tokens, 1200, 'script-only jobs cannot contribute LLM token totals');
assert.equal(cost.totals.averageTokensPerUsefulFinding, 400);
assert.equal(JSON.stringify(cost).includes('must not survive'), false);
assert.equal(Object.keys(cost.byJob).includes('hermes-bottle-queue'), true);
assert.deepEqual(sanitizeAutomationRun({ jobId: 'hermes-daily-operator', status: 'success', tokens: 11, prompt: 'secret prompt', userId: 'private' }, registry), {
  jobId: 'hermes-daily-operator', executionClass: 'agent', failed: false, tokens: 11,
  braveQueries: 0, httpProbes: 0, browserPages: 0, statesDiscovered: 0, sourcesDiscovered: 0, statesPromoted: 0, sourcesPromoted: 0, usefulFindings: 0, objectivesCompleted: 0, coverageDelta: 0,
});

const outcome = summarizeOperatorOutcomes([
  {
    runId: '2026-07-18T10:00:00Z-aaaaaaaa', objectiveId: 'radar-alabama', outcome: 'completed', startedObjective: true,
    findingsQualified: 3, merged: true, deployed: true, productionVerified: true,
    releaseRadarPublished: 1, engineExpansionsCompleted: 0, coverageDelta: 0,
    discoveryToCompletionHours: 4,
  },
  {
    runId: '2026-07-19T10:00:00Z-bbbbbbbb', objectiveId: 'engine-va', outcome: 'continued', startedObjective: true,
    findingsQualified: 2, merged: false, deployed: false, productionVerified: false,
    releaseRadarPublished: 0, engineExpansionsCompleted: 0, coverageDelta: 0,
    discoveryToCompletionHours: null,
  },
  {
    runId: '2026-07-20T10:00:00Z-cccccccc', objectiveId: 'engine-va', outcome: 'completed', startedObjective: false,
    findingsQualified: 1, merged: true, deployed: true, productionVerified: true,
    releaseRadarPublished: 0, engineExpansionsCompleted: 1, coverageDelta: 12,
    discoveryToCompletionHours: 8,
  },
], '2026-07-20T11:00:00Z');
assert.equal(outcome.metrics.qualifiedFindings, 6);
assert.equal(outcome.metrics.objectivesCompleted, 2);
assert.equal(outcome.metrics.objectiveCompletionRate, 1);
assert.equal(outcome.metrics.productionReleases, 2);
assert.equal(outcome.metrics.releaseRadarPublications, 1);
assert.equal(outcome.metrics.engineExpansionsCompleted, 1);
assert.equal(outcome.metrics.coverageDelta, 12);
assert.equal(outcome.metrics.continuedRuns, 1);
assert.equal(outcome.metrics.medianDiscoveryToCompletionHours, 6);

assert.equal(classifyBottleQueueItem({ confidence: 'high', candidateBottleId: 'weller-12', candidateBottleName: 'Weller 12' }).safe, true);
assert.equal(classifyBottleQueueItem({ confidence: 'medium', duplicateCount: 3, candidateBottleId: 'weller-12', candidateBottleName: 'Weller 12' }).safe, false);
const bottleCalls = [];
const bottleResult = await processBottleQueue({
  digest: [
    { id: 'safe', rawName: 'Weller 12', confidence: 'high', candidateBottleId: 'weller-12', candidateBottleName: 'Weller 12' },
    { id: 'ambiguous', rawName: 'Old mystery', duplicateCount: 3 },
  ],
  apply: true,
  update: async (body) => { bottleCalls.push(body); return { ok: true }; },
});
assert.equal(bottleCalls.length, 1, 'only deterministic actions may be applied');
assert.deepEqual(bottleResult.ambiguity, {
  type: 'bottle_queue_ambiguity',
  count: 1,
  items: [{ id: 'ambiguous', action: 'needs_human_priority', reason: 'Repeated unknown bottle request.' }],
});

const sourceCollection = await buildSourceExpansionCollection({
  states: ['CO', 'MA'],
  execute: true,
  run: async ({ stage, states }) => ({ stage, states, ok: true, artifact: `engine/out/${stage}.json`, summary: { candidates: 2, probeable: 1 }, expansionCandidates: stage === 'discovery' ? [{ state: 'CO', source: 'Official CO inventory', aggregateDemand: 8, sourceAuthority: 'official', runnerReachability: 0.9, sourceStability: 0.9, implementationEffort: 2, reversibility: 1 }] : [] }),
  generatedAt: '2026-07-16T12:00:00.000Z',
});
assert.equal(sourceCollection.canPromote, false);
assert.equal(sourceCollection.canPublish, false);
assert.deepEqual(sourceCollection.states, ['CO', 'MA']);
assert.equal(sourceCollection.stages.length, 2);
assert.equal(sourceCollection.summary.candidates, 4);
assert.equal(sourceCollection.expansionCandidates.length, 1);
assert.equal(sourceCollection.expansionCandidates[0].source, 'Official CO inventory');
const probeOnlyCollection = await buildSourceExpansionCollection({
  states: ['CO'], mode: 'probe', execute: true,
  run: async ({ stage, states }) => ({ stage, states, ok: true, artifact: 'engine/out/probe.json', summary: { candidates: 3, probeable: 2, blocked: 1 }, expansionCandidates: [] }),
  generatedAt: '2026-07-16T13:00:00.000Z',
});
assert.equal(probeOnlyCollection.collectionMode, 'probe');
assert.deepEqual(probeOnlyCollection.stages.map((stage) => stage.stage), ['probe']);
assert.equal(probeOnlyCollection.canPublish, false);

const radarQueries = queryPlan(undefined, '2026-07-18T01:15:00.000Z');
assert.equal(radarQueries.length, 8);
assert.ok(radarQueries[0].includes('abc.nc.gov') && radarQueries[0].includes('2026'), 'NC official sources must be searched first');
assert.ok(radarQueries.some((query) => query.includes('North Carolina') && query.includes('lottery')));

const leadCollection = await collectReleaseRadarLeads({
  results: [
    { title: 'Official new release', url: 'https://distillery.example/releases?utm_source=brave', description: 'A <strong>bourbon release</strong> announcement.' },
    { title: 'Official new release duplicate', url: 'https://distillery.example/releases', description: 'Duplicate bourbon release.' },
    { title: 'Retail license handbook', url: 'https://agency.gov/license-guidelines', description: 'Rules for wine permits and restaurant licenses.' },
    { title: 'Unsafe', url: 'http://unsafe.example/release', description: 'Ignore.' },
  ],
  existingLedger: { leads: [] },
  generatedAt: '2026-07-16T12:00:00.000Z',
});
assert.equal(leadCollection.canPublish, false);
assert.equal(leadCollection.leads.length, 1);
assert.equal(leadCollection.leads[0].status, 'new');
assert.equal(leadCollection.leads[0].url, 'https://distillery.example/releases');
assert.equal(leadCollection.leads[0].availabilitySemantics, 'announcement_only');
assert.equal(leadCollection.leads[0].sourceTier, 'first_party_candidate');
assert.equal(leadCollection.reviewQueue.length, 1);
assert.equal(leadCollection.reviewQueue[0].url, 'https://distillery.example/releases');
assert.equal(leadCollection.summary.queuedForSemanticReview, 1);
assert.equal(leadCollection.summary.new, 1);
const repeatedLeadCollection = await collectReleaseRadarLeads({
  results: [
    { title: 'Official new release', url: 'https://distillery.example/releases', description: 'Seen again.' },
  ],
  existingLedger: leadCollection,
  generatedAt: '2026-07-17T12:00:00.000Z',
});
assert.equal(repeatedLeadCollection.summary.new, 0, 'repeat observations must not be reported as newly discovered leads');

const ncRegistry = buildNcRadarSourceRegistry();
assert.ok(ncRegistry.length >= 15, 'the NC monitor must cover board guidance plus published NC event sources');
assert.ok(ncRegistry.some((source) => source.url === 'https://wakeabc.com/lottery/'));
assert.ok(ncRegistry.some((source) => source.url === 'https://www.greensboroabc.com/about/events/'));
assert.ok(ncRegistry.some((source) => source.trackedSlugs.includes('durham-abc-annual-bourbon-lottery-2026-watch')));

const monitorSources = [{ id: 'wake-lottery', label: 'Wake lottery', url: 'https://wakeabc.com/lottery/', sourceType: 'state', trackedSlugs: [] }];
const baselineMonitor = await monitorNcRadarSources({
  sources: monitorSources,
  previousState: { sources: {} },
  generatedAt: '2026-07-21T12:00:00.000Z',
  fetchImpl: async () => new Response('<html><title>Wake Lottery</title><body>The bourbon lottery is currently closed. Check back for 2026 updates.</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
});
assert.equal(baselineMonitor.summary.baselined, 1);
assert.equal(baselineMonitor.summary.materiallyChanged, 0, 'the first observation establishes a quiet baseline');
assert.equal(baselineMonitor.canPublish, false);
assert.equal(baselineMonitor.canCreateAlerts, false);
const changedMonitor = await monitorNcRadarSources({
  sources: monitorSources,
  previousState: baselineMonitor.state,
  generatedAt: '2026-07-22T12:00:00.000Z',
  fetchImpl: async () => new Response('<html><title>Wake Lottery</title><body>Registration is now open July 22 through July 26, 2026 for the bourbon lottery.</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
});
assert.equal(changedMonitor.summary.materiallyChanged, 1);
assert.equal(changedMonitor.reviewQueue[0].kind, 'material_change');
assert.match(changedMonitor.reviewQueue[0].summary, /semantic review/i);
assert.equal(changedMonitor.findings.length, 1, 'material official-source changes must flow into the canonical review backlog');
const firstFailure = await monitorNcRadarSources({
  sources: monitorSources,
  previousState: baselineMonitor.state,
  generatedAt: '2026-07-22T12:00:00.000Z',
  fetchImpl: async () => new Response('unavailable', { status: 503 }),
});
assert.equal(firstFailure.summary.reviewFailures, 0, 'one transient source failure must not page the operator');
const repeatedFailure = await monitorNcRadarSources({
  sources: monitorSources,
  previousState: firstFailure.state,
  generatedAt: '2026-07-23T12:00:00.000Z',
  fetchImpl: async () => new Response('unavailable', { status: 503 }),
});
assert.equal(repeatedFailure.summary.reviewFailures, 1, 'two consecutive failures must enter review');
assert.equal(repeatedFailure.reviewQueue[0].kind, 'source_failure');

let redirectFetches = 0;
const offHostRedirect = await monitorNcRadarSources({
  sources: monitorSources,
  previousState: { sources: {} },
  generatedAt: '2026-07-21T12:00:00.000Z',
  fetchImpl: async () => {
    redirectFetches += 1;
    return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
  },
});
assert.equal(offHostRedirect.summary.failed, 1);
assert.equal(redirectFetches, 1, 'off-host redirect destinations must be rejected before a second request');
let literalIpFetches = 0;
const literalIpSource = [{ id: 'literal-ip', label: 'Invalid literal IP', url: 'https://[fc00::1]/lottery', sourceType: 'state', trackedSlugs: [] }];
const literalIpMonitor = await monitorNcRadarSources({
  sources: literalIpSource,
  previousState: { sources: {} },
  generatedAt: '2026-07-21T12:00:00.000Z',
  fetchImpl: async () => {
    literalIpFetches += 1;
    return new Response('unexpected', { status: 200 });
  },
});
assert.equal(literalIpMonitor.summary.failed, 1);
assert.equal(literalIpFetches, 0, 'literal IP sources, including IPv6 private ranges, must be rejected before fetch');
const oversizedBody = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(2_000_001));
    controller.close();
  },
});
const oversizedMonitor = await monitorNcRadarSources({
  sources: monitorSources,
  previousState: { sources: {} },
  generatedAt: '2026-07-21T12:00:00.000Z',
  fetchImpl: async () => new Response(oversizedBody, { status: 200, headers: { 'content-type': 'text/html' } }),
});
assert.equal(oversizedMonitor.summary.failed, 1, 'chunked responses must be bounded even without Content-Length');
const expiredNcEntry = {
  slug: 'already-closed-nc-event', title: 'Already closed event', states: ['North Carolina'], kind: 'event', calendar: true,
  startDate: '2026-07-01', endDate: '2026-07-01', sources: [{ label: 'Official', url: 'https://wakeabc.com/lottery/', type: 'state' }],
};
const quietExpiryBaseline = await monitorNcRadarSources({
  sources: monitorSources,
  previousState: { sources: {} },
  generatedAt: '2026-07-21T12:00:00.000Z',
  entries: [expiredNcEntry],
  fetchImpl: async () => new Response('<html><body>Lottery status</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
});
assert.equal(quietExpiryBaseline.summary.newlyExpired, 0, 'preexisting closed opportunities must be absorbed by the quiet first baseline');
assert.deepEqual(quietExpiryBaseline.state.expiredSlugs, ['already-closed-nc-event']);
const overflowSources = Array.from({ length: 10 }, (_, index) => ({
  id: `source-${index}`, label: `Official source ${index}`, url: `https://example.com/source-${index}`, sourceType: 'state', trackedSlugs: [],
}));
const overflowBaseline = await monitorNcRadarSources({
  sources: overflowSources,
  previousState: { sources: {} },
  generatedAt: '2026-07-21T12:00:00.000Z',
  entries: [],
  fetchImpl: async () => new Response('<html><body>Lottery registration is closed for 2026.</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
});
const overflowChanged = await monitorNcRadarSources({
  sources: overflowSources,
  previousState: overflowBaseline.state,
  generatedAt: '2026-07-22T12:00:00.000Z',
  entries: [],
  fetchImpl: async () => new Response('<html><body>Lottery registration is now open for 2026.</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
});
assert.equal(overflowChanged.findings.length, 8);
assert.equal(overflowChanged.summary.deferredForSemanticReview, 2);
const overflowDrained = await monitorNcRadarSources({
  sources: overflowSources,
  previousState: overflowChanged.state,
  generatedAt: '2026-07-23T12:00:00.000Z',
  entries: [],
  fetchImpl: async () => new Response('<html><body>Lottery registration is now open for 2026.</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
});
assert.equal(overflowDrained.findings.length, 2, 'deferred material changes must remain observable on the next run');
assert.equal(overflowDrained.summary.deferredForSemanticReview, 0);
const failureOne = await monitorNcRadarSources({
  sources: overflowSources, previousState: overflowBaseline.state, generatedAt: '2026-07-22T12:00:00.000Z', entries: [],
  fetchImpl: async () => new Response('unavailable', { status: 503 }),
});
const failureTwo = await monitorNcRadarSources({
  sources: overflowSources, previousState: failureOne.state, generatedAt: '2026-07-23T12:00:00.000Z', entries: [],
  fetchImpl: async () => new Response('unavailable', { status: 503 }),
});
const failureThree = await monitorNcRadarSources({
  sources: overflowSources, previousState: failureTwo.state, generatedAt: '2026-07-24T12:00:00.000Z', entries: [],
  fetchImpl: async () => new Response('unavailable', { status: 503 }),
});
const reviewedFailureSources = new Set([...failureTwo.findings, ...failureThree.findings].map((finding) => finding.sourceKey.split(':')[1]));
assert.equal(reviewedFailureSources.size, 10, 'persistent source-failure overflow must rotate so no official source is starved');

const refreshedAnnualLead = await collectReleaseRadarLeads({
  results: [{
    title: 'Official annual lottery',
    url: 'https://agency.gov/annual-lottery',
    description: 'Registration for the bourbon lottery runs August 3-23, 2026.',
  }],
  existingLedger: { leads: [{
    id: 'old-annual', title: 'Official annual lottery', source: 'agency.gov', url: 'https://agency.gov/annual-lottery',
    summary: 'Registration for the bourbon lottery ran August 3-23, 2025.', status: 'dismissed', reviewedAt: '2025-08-24T00:00:00Z',
    firstSeenAt: '2025-01-01T00:00:00Z', lastSeenAt: '2025-01-01T00:00:00Z', observations: 1,
  }] },
  generatedAt: '2026-07-18T12:00:00.000Z',
});
assert.equal(refreshedAnnualLead.leads[0].status, 'changed', 'material date changes on reused official URLs must reopen review');
assert.equal(refreshedAnnualLead.leads[0].publicationStatus, 'not_published');
assert.equal(refreshedAnnualLead.leads[0].reviewedAt, undefined);
assert.equal(refreshedAnnualLead.reviewQueue[0].url, 'https://agency.gov/annual-lottery');
assert.equal(refreshedAnnualLead.summary.materiallyChanged, 1);

const unchangedReopenedLead = await collectReleaseRadarLeads({
  results: [{ title: 'Official annual lottery', url: 'https://agency.gov/annual-lottery', description: 'Registration for the bourbon lottery runs August 3-23, 2026.' }],
  existingLedger: { leads: [{ ...refreshedAnnualLead.leads[0], publicationStatus: 'draft' }] },
  generatedAt: '2026-07-19T12:00:00.000Z',
});
assert.equal(unchangedReopenedLead.leads[0].publicationStatus, 'not_published', 'every retained lead must preserve an explicit non-publication state');
const explicitlyPublishedLead = await collectReleaseRadarLeads({
  existingLedger: { leads: [{ ...refreshedAnnualLead.leads[0], publicationStatus: 'published' }] },
  generatedAt: '2026-07-19T12:00:00.000Z',
});
assert.equal(explicitlyPublishedLead.leads.length, 0, 'only the explicit published state may leave the research ledger');

const retainedAnnualLead = await collectReleaseRadarLeads({
  existingLedger: { leads: [{
    id: 'retained-annual', title: 'Official annual bourbon lottery', source: 'agency.gov', url: 'https://agency.gov/annual-lottery-retained',
    summary: 'The 2025 bourbon lottery is closed.', status: 'retain_unverified', publicationStatus: 'not_published', reviewedAt: '2026-07-18T00:00:00Z',
    recheckAfter: '2026-08-01T00:00:00Z', firstSeenAt: '2025-01-01T00:00:00Z', lastSeenAt: '2026-07-18T00:00:00Z', observations: 2,
  }] },
  generatedAt: '2026-07-19T12:00:00.000Z',
});
assert.equal(retainedAnnualLead.leads[0].id, 'retained-annual', 'scheduled reusable annual sources must survive until recheck');
assert.equal(retainedAnnualLead.reviewQueue.length, 0);
const dueAnnualLead = await collectReleaseRadarLeads({
  existingLedger: retainedAnnualLead,
  generatedAt: '2026-08-01T00:00:00.000Z',
});
assert.equal(dueAnnualLead.leads[0].id, 'retained-annual');
assert.equal(dueAnnualLead.reviewQueue[0].id, 'retained-annual', 'a reusable annual source must enter review when its recheck becomes due');

const saturatedLedger = await collectReleaseRadarLeads({
  results: [{ title: 'New bourbon lottery', url: 'https://distillery.example/new-lottery', description: 'New bourbon lottery opens in 2026.' }],
  existingLedger: { leads: Array.from({ length: 120 }, (_, index) => ({
    id: `dismissed-${index}`, title: `Dismissed bourbon lottery ${index}`, source: `agency${index}.gov`, url: `https://agency${index}.gov/lottery`,
    summary: 'Past bourbon lottery from 2026.', status: 'dismissed', reviewedAt: '2026-01-01T00:00:00Z', firstSeenAt: '2026-01-01T00:00:00Z', lastSeenAt: '2026-01-01T00:00:00Z', observations: 1,
  })) },
  generatedAt: '2026-07-18T12:00:00.000Z',
});
assert.ok(saturatedLedger.leads.some((lead) => lead.url === 'https://distillery.example/new-lottery'), 'terminal records cannot evict a fresh candidate');
assert.equal(saturatedLedger.reviewQueue[0].url, 'https://distillery.example/new-lottery');

const safeAutonomy = classifyExpansionAutonomy({
  sourceAuthority: 'official', termsStatus: 'clear', authentication: 'none', identity: 'exact_store', availabilitySemantics: 'honest', verticalSlice: 'complete', shadowRuns: 3, canaryRuns: 2, withinBudget: true, reversible: true, outboundChange: false, pricingOrEntitlementChange: false, legalUncertainty: false,
});
assert.deepEqual(safeAutonomy, { lane: 'safe_autonomous', reasons: [] });
const approvalRequired = classifyExpansionAutonomy({ ...safeAutonomy, sourceAuthority: 'private', termsStatus: 'ambiguous', authentication: 'login', identity: 'ambiguous', availabilitySemantics: 'honest', verticalSlice: 'complete', shadowRuns: 3, canaryRuns: 2, withinBudget: true, reversible: true, outboundChange: true, pricingOrEntitlementChange: false, legalUncertainty: true });
assert.equal(approvalRequired.lane, 'approval_required');
assert.ok(approvalRequired.reasons.includes('authenticated_source'));
assert.ok(approvalRequired.reasons.includes('legal_or_terms_uncertainty'));

const ranked = rankSourceInvestments({
  expansionCandidates: [
    { state: 'SMALL', source: 'Official inventory', aggregateDemand: 24, paidMemberOverlap: 7, canonicalBottleDemand: 9, coverageTier: 'research_only', exactStoreGap: 5, alertGradeGap: 2, sourceAuthority: 'official', runnerReachability: 0.95, expectedRequestBudget: 4, sourceStability: 0.9, implementationEffort: 2, reversibility: 1, strategicAdjacency: 3 },
    { state: 'LARGE', source: 'Unclear catalog', aggregateDemand: 100, paidMemberOverlap: 0, canonicalBottleDemand: 0, coverageTier: 'research_only', exactStoreGap: 0, alertGradeGap: 0, sourceAuthority: 'unknown', runnerReachability: 0.2, expectedRequestBudget: 80, sourceStability: 0.1, implementationEffort: 5, reversibility: 5, strategicAdjacency: 0 },
  ],
  generatedAt: '2026-07-16T12:00:00.000Z',
});
assert.equal(ranked.expansionTop[0].state, 'SMALL', 'high-confidence member value can outrank population-style demand alone');
assert.equal(ranked.expansionTop[0].recommendation, 'expand_state_vertical_slice');
assert.deepEqual(expansionPromotionGate({ sourceAuthority: 'official', runnerReachability: 0.7 }), { eligible: true, blockers: [], authority: 'official', reachability: 0.7 });
assert.deepEqual(expansionPromotionGate({ sourceAuthority: 'unknown', runnerReachability: 0.2 }), { eligible: false, blockers: ['source_authority_not_official_or_first_party', 'production_runner_evidence_missing'], authority: 'unknown', reachability: 0.2 });
const gatedCandidate = ranked.expansionTop.find((row) => row.state === 'LARGE');
assert.equal(gatedCandidate.promotionEligible, false, 'unknown sources without runner evidence must be promotion-gated');
assert.deepEqual(gatedCandidate.promotionBlockers, ['source_authority_not_official_or_first_party', 'production_runner_evidence_missing']);

const scorecard = buildCompanyScorecard({
  checkedAt: '2026-07-16T12:00:00.000Z',
  memberships: { counts: {} }, revenue: {}, audience: {}, growth: {}, lifecycle: {}, retailer: {}, engine: {}, alerts: {}, release: {},
  automation: cost,
}, '2026-07-16T12:00:00.000Z');
assert.equal(scorecard.sections.data.metrics.automationDeterministicRuns, 2);
assert.equal(scorecard.sections.data.metrics.automationAgentRuns, 1);
assert.equal(scorecard.sections.data.metrics.automationTokens, 1200);
assert.equal(JSON.stringify(scorecard).includes('must not survive'), false);

const finding = buildFinding({ source: 'source-roi', sourceKey: 'small-official', area: 'data', severity: 'medium', title: 'Expand SMALL', summary: 'Safe value.', evidence: [], recommendedAction: 'Expand it.', impact: 3, urgency: 3, confidence: 0.9, effort: 2, observedAt: '2026-07-16T12:00:00.000Z' });
const daily = buildDailyCompanyBrief({ scorecard, findings: [finding], generatedAt: '2026-07-16T12:00:00.000Z' });
assert.equal(daily.context.maxFindings, 8);
assert.equal(daily.context.objectiveId, finding.id);
assert.equal(JSON.stringify(daily.context).includes('Safe value.'), false, 'brief context is a compact index, not finding bodies');
const weekly = buildWeeklyStrategyReview({ scorecard, findings: [finding], generatedAt: '2026-07-16T12:00:00.000Z' });
assert.equal(weekly.context.objectiveId, finding.id);
assert.equal(weekly.context.autonomyContract, 'bourbon-signal/autonomy-threshold@1');

const temp = mkdtempSync(join(tmpdir(), 'automation-cost-'));
try {
  const runs = join(temp, 'runs.json');
  const output = join(temp, 'cost.json');
  writeFileSync(runs, JSON.stringify({ runs: [{ jobId: 'hermes-bottle-queue', status: 'success' }] }));
  const run = execFileSync(process.execPath, [resolve('automation/bourbon-signal/automation-cost-report.mjs'), `--input=${runs}`, `--output=${output}`, '--apply'], { encoding: 'utf8' });
  assert.equal(run.trim(), '', 'healthy script-only cost aggregation should be quiet unless explicitly printed');
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).totals.deterministicRuns, 1);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('Agent-cost automation contracts passed.');
