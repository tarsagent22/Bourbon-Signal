import {
  releaseRadarFollowCtaLabel,
  type ExperimentAssignment,
  type ExperimentDefinition,
} from "./growth-experiments.ts";

export const EXPERIMENT_PARTICIPATION_METADATA_KEY = "productExperiments";

export interface ExperimentParticipationRecord {
  variant: string;
  exposed: true;
  converted: boolean;
}

type PrivateMetadata = Record<string, unknown>;
type ParticipationAction = "exposure" | "conversion";

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
  return { variant, exposed: true, converted: value.converted === true };
}

export function recordExperimentParticipation(
  privateMetadata: PrivateMetadata,
  experiment: ExperimentDefinition,
  assignment: ExperimentAssignment,
  action: ParticipationAction,
) {
  if (assignment.experimentId !== experiment.id || !experiment.variants.some((variant) => variant.key === assignment.variant)) {
    throw new Error("Experiment assignment does not match the active definition");
  }

  const existing = readExperimentParticipation(privateMetadata, experiment);
  const record: ExperimentParticipationRecord = {
    variant: assignment.variant,
    exposed: true,
    converted: action === "conversion" || existing?.converted === true,
  };
  const changed = existing?.variant !== record.variant
    || existing.exposed !== true
    || existing.converted !== record.converted;
  if (!changed) return { changed: false, privateMetadata, record };

  const store = objectValue(privateMetadata[EXPERIMENT_PARTICIPATION_METADATA_KEY]);
  return {
    changed: true,
    privateMetadata: {
      ...privateMetadata,
      [EXPERIMENT_PARTICIPATION_METADATA_KEY]: {
        ...store,
        [experiment.id]: record,
      },
    },
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
