import {
  releaseRadarFollowCtaLabel,
  type ExperimentAssignment,
  type ExperimentDefinition,
} from "./growth-experiments.ts";

export const EXPERIMENT_PARTICIPATION_METADATA_KEY = "productExperiments";
export const EXPERIMENT_CONVERSION_METADATA_KEY = "productExperimentConversions";

export interface ExperimentParticipationRecord {
  variant: string;
  exposed: true;
  converted: boolean;
}

type PrivateMetadata = Record<string, unknown>;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function readExperimentParticipation(
  privateMetadata: PrivateMetadata,
  experiment: ExperimentDefinition,
): ExperimentParticipationRecord | null {
  const store = objectValue(privateMetadata[EXPERIMENT_PARTICIPATION_METADATA_KEY]);
  const value = objectValue(store[experiment.id]);
  const variant = typeof value.variant === "string" ? value.variant : "";
  if (!experiment.variants.some((candidate) => candidate.key === variant) || value.exposed !== true) return null;
  const conversions = objectValue(privateMetadata[EXPERIMENT_CONVERSION_METADATA_KEY]);
  const conversion = objectValue(conversions[experiment.id]);
  const hasMonotonicConversion = conversion.variant === variant && conversion.converted === true;
  return { variant, exposed: true, converted: value.converted === true || hasMonotonicConversion };
}

function assertAssignment(
  experiment: ExperimentDefinition,
  assignment: ExperimentAssignment,
) {
  if (assignment.experimentId !== experiment.id || !experiment.variants.some((variant) => variant.key === assignment.variant)) {
    throw new Error("Experiment assignment does not match the active definition");
  }
}

export function recordExperimentExposure(
  privateMetadata: PrivateMetadata,
  experiment: ExperimentDefinition,
  assignment: ExperimentAssignment,
) {
  assertAssignment(experiment, assignment);

  const existing = readExperimentParticipation(privateMetadata, experiment);
  const record: ExperimentParticipationRecord = {
    variant: assignment.variant,
    exposed: true,
    converted: existing?.converted === true,
  };
  const changed = existing?.variant !== record.variant
    || existing.exposed !== true
    || existing.converted !== record.converted;
  if (!changed) return { changed: false, privateMetadata, privateMetadataPatch: {}, record };

  const store = objectValue(privateMetadata[EXPERIMENT_PARTICIPATION_METADATA_KEY]);
  const participationStore = {
    ...store,
    [experiment.id]: record,
  };
  const privateMetadataPatch = {
    [EXPERIMENT_PARTICIPATION_METADATA_KEY]: participationStore,
  };
  return {
    changed: true,
    privateMetadata: {
      ...privateMetadata,
      ...privateMetadataPatch,
    },
    privateMetadataPatch,
    record,
  };
}

export function recordExperimentConversion(
  privateMetadata: PrivateMetadata,
  experiment: ExperimentDefinition,
  assignment: ExperimentAssignment,
) {
  assertAssignment(experiment, assignment);
  const store = objectValue(privateMetadata[EXPERIMENT_PARTICIPATION_METADATA_KEY]);
  const conversions = objectValue(privateMetadata[EXPERIMENT_CONVERSION_METADATA_KEY]);
  const existing = readExperimentParticipation(privateMetadata, experiment);
  const existingConversion = objectValue(conversions[experiment.id]);
  const record: ExperimentParticipationRecord = {
    variant: assignment.variant,
    exposed: true,
    converted: true,
  };
  const hasMarker = existingConversion.variant === assignment.variant && existingConversion.converted === true;
  const changed = existing?.variant !== record.variant || existing.converted !== true || !hasMarker;
  if (!changed) return { changed: false, privateMetadata, privateMetadataPatch: {}, record };

  const privateMetadataPatch = {
    [EXPERIMENT_PARTICIPATION_METADATA_KEY]: {
      ...store,
      [experiment.id]: record,
    },
    [EXPERIMENT_CONVERSION_METADATA_KEY]: {
      ...conversions,
      [experiment.id]: { variant: assignment.variant, converted: true },
    },
  };
  return {
    changed: true,
    privateMetadata: { ...privateMetadata, ...privateMetadataPatch },
    privateMetadataPatch,
    record,
  };
}

export function buildExperimentApiResponse(experiment: ExperimentDefinition, assignment: ExperimentAssignment) {
  if (assignment.experimentId !== experiment.id) throw new Error("Experiment assignment does not match the active definition");
  return {
    enabled: true as const,
    variant: assignment.variant,
    ctaLabel: releaseRadarFollowCtaLabel(assignment.variant),
  };
}
