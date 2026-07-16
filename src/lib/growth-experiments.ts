export type ExperimentStatus = "draft" | "active" | "stopped";
export type ExperimentSurface = "homepage" | "drop_feed" | "release_radar" | "bottle_check" | "welcome" | "alerts" | "dashboard";
export type ExperimentVariantResult = "winner" | "loser" | "inconclusive";

export interface ExperimentDefinition {
  id: string;
  status: ExperimentStatus;
  owner: string;
  surface: ExperimentSurface;
  baseline: string;
  hypothesis: string;
  variants: ReadonlyArray<{ key: string; weight: number }>;
  primaryMetric: string;
  allowedMetrics: readonly string[];
  minSampleSizePerVariant: number;
  minRelativeLift: number;
  stopRule: string;
  rollbackRule: string;
}

export interface ExperimentAssignment {
  experimentId: string;
  variant: string;
  bucket: number;
}

export interface ExperimentTelemetryEvent {
  name: "experiment_exposure" | "experiment_metric";
  occurredAt?: string;
  properties: {
    experiment: string;
    variant: string;
    surface: string;
    metric?: string;
  };
}

export const EXPERIMENT_KILL_SWITCH_ENV = "GROWTH_EXPERIMENTS_KILL_SWITCH";
export const RELEASE_RADAR_FOLLOW_EXPERIMENT_ID = "release-radar-follow-cta-copy";
export const RELEASE_RADAR_FOLLOW_CTA_LABELS = {
  control: "Follow release",
  this_release: "Follow this release",
} as const;

export const EXPERIMENT_REGISTRY: readonly ExperimentDefinition[] = [{
  id: RELEASE_RADAR_FOLLOW_EXPERIMENT_ID,
  status: "active",
  owner: "growth",
  surface: "release_radar",
  baseline: "Current authenticated-member CTA: Follow release; the control cohort establishes the baseline completion rate.",
  hypothesis: "For authenticated members who can follow a release, naming the object as Follow this release will increase completed release follows without changing product behavior.",
  variants: [
    { key: "control", weight: 1 },
    { key: "this_release", weight: 1 },
  ],
  primaryMetric: "release_follow_completed",
  allowedMetrics: ["release_follow_completed"],
  minSampleSizePerVariant: 100,
  minRelativeLift: 0.05,
  stopRule: "Stop after both variants reach 100 unique exposures and the primary metric reaches 95% confidence, or after 28 days as inconclusive.",
  rollbackRule: "Enable the kill switch and restore the control wording if follow-save failures increase, the CTA is misleading, or any privacy invariant fails.",
}];

const PRODUCTION_HOSTS = new Set(["bourbonsignal.com", "www.bourbonsignal.com"]);
const ALLOWED_SURFACES = new Set<ExperimentSurface>(["homepage", "drop_feed", "release_radar", "bottle_check", "welcome", "alerts", "dashboard"]);
const SAFE_KEY = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const FORBIDDEN_SCOPE = /(?:^|[^a-z0-9])(?:email|sms|pricing|entitlements?|legal)(?=$|[^a-z0-9])/i;

function killSwitchValue(value: unknown) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function isExperimentKillSwitchEnabled(value?: unknown) {
  if (value !== undefined) return killSwitchValue(value);
  return typeof process !== "undefined"
    && (killSwitchValue(process.env.NEXT_PUBLIC_GROWTH_EXPERIMENTS_KILL_SWITCH) || killSwitchValue(process.env[EXPERIMENT_KILL_SWITCH_ENV]));
}

export function validateExperimentRegistry(registry: readonly ExperimentDefinition[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  let activeCount = 0;
  for (const experiment of registry) {
    if (!SAFE_KEY.test(experiment.id)) errors.push(`Invalid experiment id: ${experiment.id}`);
    if (ids.has(experiment.id)) errors.push(`Duplicate experiment id: ${experiment.id}`);
    ids.add(experiment.id);
    if (experiment.status === "active") activeCount += 1;
    if (!["draft", "active", "stopped"].includes(experiment.status)) errors.push(`${experiment.id}: invalid status`);
    if (!ALLOWED_SURFACES.has(experiment.surface)) errors.push(`${experiment.id}: surface is outside the on-site product allowlist`);
    const scopeText = [experiment.id, experiment.surface, experiment.baseline, experiment.hypothesis, experiment.primaryMetric, experiment.stopRule, experiment.rollbackRule, ...experiment.allowedMetrics].join(" ");
    if (FORBIDDEN_SCOPE.test(scopeText)) errors.push(`${experiment.id}: excluded channel or decision domain`);
    if (!SAFE_KEY.test(experiment.owner)) errors.push(`${experiment.id}: owner must be a non-PII team key`);
    if (experiment.variants.length !== 2) errors.push(`${experiment.id}: exactly two variants are required`);
    const variantKeys = new Set<string>();
    for (const variant of experiment.variants) {
      if (!SAFE_KEY.test(variant.key) || variantKeys.has(variant.key)) errors.push(`${experiment.id}: invalid or duplicate variant`);
      if (!Number.isFinite(variant.weight) || variant.weight <= 0) errors.push(`${experiment.id}: variant weights must be positive`);
      variantKeys.add(variant.key);
    }
    if (!SAFE_KEY.test(experiment.primaryMetric) || !experiment.allowedMetrics.includes(experiment.primaryMetric)) errors.push(`${experiment.id}: primary metric must be allowed`);
    if (experiment.allowedMetrics.some((metric) => !SAFE_KEY.test(metric))) errors.push(`${experiment.id}: invalid metric key`);
    if (!Number.isInteger(experiment.minSampleSizePerVariant) || experiment.minSampleSizePerVariant < 1) errors.push(`${experiment.id}: invalid sample floor`);
    if (!Number.isFinite(experiment.minRelativeLift) || experiment.minRelativeLift < 0) errors.push(`${experiment.id}: invalid lift floor`);
    if (!experiment.baseline.trim()) errors.push(`${experiment.id}: baseline is required`);
    if (!experiment.hypothesis.trim()) errors.push(`${experiment.id}: hypothesis is required`);
    if (!experiment.stopRule.trim()) errors.push(`${experiment.id}: stop rule is required`);
    if (!experiment.rollbackRule.trim()) errors.push(`${experiment.id}: rollback rule is required`);
  }
  if (activeCount > 1) errors.push("Only one experiment may be active");
  return { ok: errors.length === 0, errors };
}

export function getActiveExperiment(registry: readonly ExperimentDefinition[] = EXPERIMENT_REGISTRY) {
  const validation = validateExperimentRegistry(registry);
  if (!validation.ok) throw new Error(`Invalid experiment registry: ${validation.errors.join("; ")}`);
  return registry.find((experiment) => experiment.status === "active") || null;
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function assignExperiment(experiment: ExperimentDefinition, subjectKey: string): ExperimentAssignment {
  const validation = validateExperimentRegistry([experiment]);
  if (!validation.ok) throw new Error(`Invalid experiment: ${validation.errors.join("; ")}`);
  if (!subjectKey || subjectKey.length > 256 || /@|https?:\/\/|(?:\+?\d[\s().-]*){7,}/i.test(subjectKey)) throw new Error("A bounded non-PII stable subject key is required");
  const bucket = stableHash(`${experiment.id}:${subjectKey}`) % 10_000;
  const totalWeight = experiment.variants.reduce((total, variant) => total + variant.weight, 0);
  let cursor = 0;
  const target = (bucket / 10_000) * totalWeight;
  let selected = experiment.variants.at(-1);
  for (const variant of experiment.variants) {
    cursor += variant.weight;
    if (target < cursor) {
      selected = variant;
      break;
    }
  }
  if (!selected) throw new Error("Experiment has no variants");
  return { experimentId: experiment.id, variant: selected.key, bucket };
}

export function assignActiveExperiment(
  subjectKey: string,
  registry: readonly ExperimentDefinition[] = EXPERIMENT_REGISTRY,
  killSwitch = isExperimentKillSwitchEnabled(),
) {
  if (killSwitch) return null;
  const experiment = getActiveExperiment(registry);
  return experiment ? assignExperiment(experiment, subjectKey) : null;
}

export function releaseRadarFollowCtaLabel(variant: string) {
  return variant === "this_release"
    ? RELEASE_RADAR_FOLLOW_CTA_LABELS.this_release
    : RELEASE_RADAR_FOLLOW_CTA_LABELS.control;
}

export function isExperimentProductionHost(hostname: string) {
  return PRODUCTION_HOSTS.has(hostname.trim().toLowerCase());
}

function canEmit(experiment: ExperimentDefinition, assignment: ExperimentAssignment, hostname: string, killSwitch: boolean) {
  return validateExperimentRegistry([experiment]).ok
    && experiment.status === "active"
    && isExperimentProductionHost(hostname)
    && !killSwitch
    && assignment.experimentId === experiment.id
    && experiment.variants.some((variant) => variant.key === assignment.variant);
}

export function buildExperimentExposure(input: {
  experiment: ExperimentDefinition;
  assignment: ExperimentAssignment;
  hostname: string;
  occurredAt?: string;
  killSwitch?: boolean;
}): ExperimentTelemetryEvent | null {
  const killed = input.killSwitch === true || isExperimentKillSwitchEnabled();
  if (!canEmit(input.experiment, input.assignment, input.hostname, killed)) return null;
  return {
    name: "experiment_exposure",
    occurredAt: input.occurredAt || new Date().toISOString(),
    properties: {
      experiment: input.experiment.id,
      variant: input.assignment.variant,
      surface: input.experiment.surface,
    },
  };
}

export function buildExperimentMetric(input: {
  experiment: ExperimentDefinition;
  assignment: ExperimentAssignment;
  metric: string;
  hostname: string;
  occurredAt?: string;
  killSwitch?: boolean;
}): ExperimentTelemetryEvent | null {
  const killed = input.killSwitch === true || isExperimentKillSwitchEnabled();
  if (!canEmit(input.experiment, input.assignment, input.hostname, killed) || !input.experiment.allowedMetrics.includes(input.metric)) return null;
  return {
    name: "experiment_metric",
    occurredAt: input.occurredAt || new Date().toISOString(),
    properties: {
      experiment: input.experiment.id,
      variant: input.assignment.variant,
      metric: input.metric,
      surface: input.experiment.surface,
    },
  };
}

function twoProportionZ(firstSuccesses: number, firstTotal: number, secondSuccesses: number, secondTotal: number) {
  const pooled = (firstSuccesses + secondSuccesses) / (firstTotal + secondTotal);
  const standardError = Math.sqrt(pooled * (1 - pooled) * ((1 / firstTotal) + (1 / secondTotal)));
  if (standardError === 0) return 0;
  return ((firstSuccesses / firstTotal) - (secondSuccesses / secondTotal)) / standardError;
}

export function aggregateExperimentTelemetry(
  events: readonly ExperimentTelemetryEvent[],
  registry: readonly ExperimentDefinition[] = EXPERIMENT_REGISTRY,
  minCohortSize = 5,
) {
  const validation = validateExperimentRegistry(registry);
  if (!validation.ok) throw new Error(`Invalid experiment registry: ${validation.errors.join("; ")}`);
  const cohortFloor = Math.max(5, Number.isFinite(minCohortSize) ? Math.floor(minCohortSize) : 5);
  const definitions = new Map(registry.map((experiment) => [experiment.id, experiment]));
  const counts = new Map<string, Map<string, { exposures: number; metrics: Record<string, number> }>>();
  for (const experiment of registry) {
    counts.set(experiment.id, new Map(experiment.variants.map((variant) => [variant.key, { exposures: 0, metrics: {} }])));
  }
  for (const event of events.slice(0, 1_000_000)) {
    const experiment = definitions.get(event.properties.experiment);
    if (!experiment || event.properties.surface !== experiment.surface) continue;
    const variant = counts.get(experiment.id)?.get(event.properties.variant);
    if (!variant) continue;
    if (event.name === "experiment_exposure") variant.exposures += 1;
    if (event.name === "experiment_metric" && event.properties.metric && experiment.allowedMetrics.includes(event.properties.metric)) {
      variant.metrics[event.properties.metric] = (variant.metrics[event.properties.metric] || 0) + 1;
    }
  }

  return {
    privacy: { minCohortSize: cohortFloor, containsPii: false, containsRawHistory: false },
    experiments: registry.map((experiment) => {
      const rawVariants = experiment.variants.map((variant) => {
        const count = counts.get(experiment.id)?.get(variant.key) || { exposures: 0, metrics: {} };
        const primaryMetrics = Math.min(count.exposures, count.metrics[experiment.primaryMetric] || 0);
        return { variant: variant.key, exposures: count.exposures, primaryMetrics, metrics: count.metrics };
      });
      const sampleReady = rawVariants.every((variant) => variant.exposures >= Math.max(cohortFloor, experiment.minSampleSizePerVariant));
      let winner: string | null = null;
      let loser: string | null = null;
      if (sampleReady && rawVariants.length === 2) {
        const [first, second] = rawVariants;
        const firstRate = first.primaryMetrics / first.exposures;
        const secondRate = second.primaryMetrics / second.exposures;
        const high = firstRate >= secondRate ? first : second;
        const low = high === first ? second : first;
        const highRate = high.primaryMetrics / high.exposures;
        const lowRate = low.primaryMetrics / low.exposures;
        const relativeLift = lowRate === 0 ? (highRate > 0 ? Number.POSITIVE_INFINITY : 0) : (highRate - lowRate) / lowRate;
        const z = Math.abs(twoProportionZ(first.primaryMetrics, first.exposures, second.primaryMetrics, second.exposures));
        if (highRate > lowRate && relativeLift >= experiment.minRelativeLift && z >= 1.96) {
          winner = high.variant;
          loser = low.variant;
        }
      }
      return {
        experiment: experiment.id,
        primaryMetric: experiment.primaryMetric,
        outcome: winner ? "winner_loser" as const : "inconclusive" as const,
        variants: rawVariants.map((variant) => {
          if (variant.exposures < cohortFloor) {
            return { variant: variant.variant, suppressed: true as const, exposures: null, metrics: null, conversionRate: null, result: "inconclusive" as const };
          }
          const result: ExperimentVariantResult = variant.variant === winner ? "winner" : variant.variant === loser ? "loser" : "inconclusive";
          return {
            variant: variant.variant,
            suppressed: false as const,
            exposures: variant.exposures,
            metrics: { ...variant.metrics },
            conversionRate: variant.exposures ? variant.primaryMetrics / variant.exposures : 0,
            result,
          };
        }),
      };
    }),
  };
}
