export interface AutomationCostTotals {
  deterministicRuns: number;
  agentRuns: number;
  failedRuns: number;
  braveQueries: number;
  directHttpProbes: number;
  headlessBrowserPages: number;
  statesDiscovered: number;
  sourcesDiscovered: number;
  statesPromoted: number;
  sourcesPromoted: number;
  tokens: number;
  usefulFindings: number;
  objectivesCompleted: number;
  customerCoverageDelta: number;
  averageTokensPerUsefulFinding: number;
  averageTokensPerObjective: number;
}

export interface AutomationCostAggregate {
  contractVersion: "bourbon-signal/automation-cost@1";
  generatedAt: string;
  privacy: { aggregateOnly: true; containsPrompts: false; containsPii: false; containsRawSearches: false; containsToolLogs: false };
  totals: AutomationCostTotals;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100_000_000, Math.max(0, Math.floor(parsed))) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function sanitizeAutomationCostAggregate(value: unknown): AutomationCostAggregate | null {
  const candidate = record(value);
  const privacy = record(candidate.privacy);
  if (candidate.contractVersion !== "bourbon-signal/automation-cost@1"
    || typeof candidate.generatedAt !== "string"
    || privacy.aggregateOnly !== true
    || privacy.containsPrompts !== false
    || privacy.containsPii !== false
    || privacy.containsRawSearches !== false
    || privacy.containsToolLogs !== false) return null;
  const sourceTotals = record(candidate.totals);
  const totals: AutomationCostTotals = {
    deterministicRuns: number(sourceTotals.deterministicRuns),
    agentRuns: number(sourceTotals.agentRuns),
    failedRuns: number(sourceTotals.failedRuns),
    braveQueries: number(sourceTotals.braveQueries),
    directHttpProbes: number(sourceTotals.directHttpProbes),
    headlessBrowserPages: number(sourceTotals.headlessBrowserPages),
    statesDiscovered: number(sourceTotals.statesDiscovered),
    sourcesDiscovered: number(sourceTotals.sourcesDiscovered),
    statesPromoted: number(sourceTotals.statesPromoted),
    sourcesPromoted: number(sourceTotals.sourcesPromoted),
    tokens: number(sourceTotals.tokens),
    usefulFindings: number(sourceTotals.usefulFindings),
    objectivesCompleted: number(sourceTotals.objectivesCompleted),
    customerCoverageDelta: number(sourceTotals.customerCoverageDelta),
    averageTokensPerUsefulFinding: number(sourceTotals.averageTokensPerUsefulFinding),
    averageTokensPerObjective: number(sourceTotals.averageTokensPerObjective),
  };
  return {
    contractVersion: "bourbon-signal/automation-cost@1",
    generatedAt: candidate.generatedAt,
    privacy: { aggregateOnly: true, containsPrompts: false, containsPii: false, containsRawSearches: false, containsToolLogs: false },
    totals,
  };
}

export function readAutomationCostAggregateFromEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.BOURBON_SIGNAL_AUTOMATION_COST_REPORT;
  if (!raw || raw.length > 50_000) return null;
  try { return sanitizeAutomationCostAggregate(JSON.parse(raw)); } catch { return null; }
}
