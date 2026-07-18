import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildAutomationCostReport, sanitizeAutomationRun } from '../automation/bourbon-signal/automation-cost-report.mjs';
import { classifyBottleQueueItem, processBottleQueue } from '../automation/bourbon-signal/bottle-queue-autoprocess.mjs';
import { buildSourceExpansionCollection, engineStageInvocation, resolveScheduledStates, stagesForCollectionMode, summarizeStageOutput } from '../automation/bourbon-signal/source-expansion-collector.mjs';
import { collectReleaseRadarLeads } from '../automation/bourbon-signal/release-radar-lead-collector.mjs';
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

function frequencyRunsPerDay(frequency) {
  if (/^every (\d+) minutes/.test(frequency)) return 1440 / Number(frequency.match(/\d+/)[0]);
  if (/^every (\d+) hours/.test(frequency)) return 24 / Number(frequency.match(/\d+/)[0]);
  if (frequency.startsWith('hourly')) return 24;
  if (frequency.startsWith('daily')) return 1;
  if (frequency.startsWith('twice daily')) return 2;
  if (frequency.startsWith('Friday')) return 1 / 7;
  if (frequency === 'monthly') return 1 / 30;
  if (frequency.startsWith('manual') || frequency === 'push and pull request') return 0;
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
assert.deepEqual(cadence.agentPolicy, { provider: 'openai-codex', model: 'gpt-5.6-luna', reasoning: 'xhigh' });
assert.equal(hermesSnapshot.timezone, 'America/New_York');
assert.equal(hermesByName.get('Bourbon Signal hourly known-source probe')?.schedule, '40 * * * *');
assert.equal(hermesByName.get('Bourbon Signal deterministic state source collector')?.schedule, '15 */3 * * *');
assert.equal(hermesByName.get('Bourbon Signal silent demand and source scout')?.schedule, '0 2,14 * * *');
assert.equal(hermesByName.get('Bourbon Signal autonomous company operator')?.schedule, '45 2,14 * * *');
assert.equal(hermesByName.get('Bourbon Signal silent Release Radar scout')?.schedule, '15 4 * * *');
assert.equal(hermesByName.get('Bourbon Signal morning scorecard aggregation')?.schedule, '0 5 * * *');
assert.equal(hermesByName.get('Bourbon Signal daily company brief')?.schedule, '30 5 * * *');
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

const leadCollection = await collectReleaseRadarLeads({
  results: [
    { title: 'Official new release', url: 'https://distillery.example/releases?utm_source=brave', description: 'A release announcement.' },
    { title: 'Official new release duplicate', url: 'https://distillery.example/releases', description: 'Duplicate.' },
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
assert.equal(leadCollection.summary.new, 1);
const repeatedLeadCollection = await collectReleaseRadarLeads({
  results: [
    { title: 'Official new release', url: 'https://distillery.example/releases', description: 'Seen again.' },
  ],
  existingLedger: leadCollection,
  generatedAt: '2026-07-17T12:00:00.000Z',
});
assert.equal(repeatedLeadCollection.summary.new, 0, 'repeat observations must not be reported as newly discovered leads');

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
