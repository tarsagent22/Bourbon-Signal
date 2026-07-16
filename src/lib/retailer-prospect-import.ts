import { isRetailerAdminEmail } from "./retailer-admin.ts";
import {
  buildProspectDedupeKeys,
  normalizeRetailerProspect,
  scoreRetailerProspect,
  type RetailerProspectInput,
  type RetailerProspectScore,
  type RetailerProspectScoreInput,
} from "./retailer-acquisition.ts";

export interface RetailerProspectImportRepository {
  upsertProspect(input: {
    prospect: RetailerProspectInput;
    score: RetailerProspectScore;
    discoverySource: string;
    sourceUrl?: string;
  }): Promise<{
    prospect: { id: string; identityKey: string };
    deduplicated: boolean;
  }>;
}

interface ValidatedImportRecord {
  index: number;
  prospect: NonNullable<ReturnType<typeof normalizeRetailerProspect>["value"]>;
  identityKey: string;
  discoverySource: string;
  sourceUrl: string;
  score: RetailerProspectScore;
}

export interface RetailerProspectImportAudit {
  schemaVersion: 1;
  operation: "retailer_prospect_import";
  mode: "dry-run" | "apply";
  generatedAt: string;
  actor: string;
  sourceFile: string | null;
  artifactKind: "discovery" | "ranking";
  summary: {
    validated: number;
    wouldUpsert: number;
    inserted: number;
    deduplicated: number;
  };
  records: Array<{
    index: number;
    identityKey: string;
    prospectId: string | null;
    action: "would_upsert" | "inserted" | "deduplicated";
    score: number;
  }>;
  guardrail: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredCount(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
}

function requiredBoolean(value: unknown, field: string) {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean.`);
  return value;
}

function scoreInputs(value: unknown, index: number): RetailerProspectScoreInput {
  const inputs = record(value);
  const demand = record(inputs.demand);
  const coverage = record(inputs.coverage);
  const fit = record(inputs.fit);
  const evidence = record(inputs.evidence);
  const prefix = `Prospect ${index}`;
  return {
    demand: {
      searches30d: requiredCount(demand.searches30d, `${prefix} score.inputs.demand.searches30d`),
      savedAlerts: requiredCount(demand.savedAlerts, `${prefix} score.inputs.demand.savedAlerts`),
      watchlistMatches: requiredCount(demand.watchlistMatches, `${prefix} score.inputs.demand.watchlistMatches`),
    },
    coverage: {
      marketStores: requiredCount(coverage.marketStores, `${prefix} score.inputs.coverage.marketStores`),
      coveredStores: requiredCount(coverage.coveredStores, `${prefix} score.inputs.coverage.coveredStores`),
      citySignals30d: requiredCount(coverage.citySignals30d, `${prefix} score.inputs.coverage.citySignals30d`),
    },
    fit: {
      independent: requiredBoolean(fit.independent, `${prefix} score.inputs.fit.independent`),
      bourbonSpecialist: requiredBoolean(fit.bourbonSpecialist, `${prefix} score.inputs.fit.bourbonSpecialist`),
      liveInventoryGap: requiredBoolean(fit.liveInventoryGap, `${prefix} score.inputs.fit.liveInventoryGap`),
    },
    evidence: {
      officialContact: requiredBoolean(evidence.officialContact, `${prefix} score.inputs.evidence.officialContact`),
      officialWebsite: requiredBoolean(evidence.officialWebsite, `${prefix} score.inputs.evidence.officialWebsite`),
      physicalLocation: requiredBoolean(evidence.physicalLocation, `${prefix} score.inputs.evidence.physicalLocation`),
    },
  };
}

function emptyScore() {
  return scoreRetailerProspect({
    demand: { searches30d: 0, savedAlerts: 0, watchlistMatches: 0 },
    coverage: { marketStores: 0, coveredStores: 0, citySignals30d: 0 },
    fit: { independent: false, bourbonSpecialist: false, liveInventoryGap: false },
    evidence: { officialContact: false, officialWebsite: false, physicalLocation: false },
  });
}

function validatedSourceUrl(value: unknown, index: number) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > 500) throw new Error(`Prospect ${index} discovery.sourceUrl is invalid.`);
  try {
    const url = new URL(value.trim());
    if (!(["http:", "https:"] as string[]).includes(url.protocol)) throw new Error("unsupported protocol");
    return url.toString().slice(0, 500);
  } catch {
    throw new Error(`Prospect ${index} discovery.sourceUrl must be an HTTP or HTTPS URL.`);
  }
}

function validateArtifact(artifact: unknown) {
  const document = record(artifact);
  const artifactKind = Array.isArray(document.ranked) ? "ranking" as const : "discovery" as const;
  const candidates = artifactKind === "ranking" ? document.ranked : document.prospects;
  if (!Array.isArray(candidates)) throw new Error("Artifact must contain a prospects or ranked array.");
  const defaultSource = typeof document.source === "string" ? document.source.trim() : "";
  const seen = new Set<string>();

  const validated = candidates.map((value, index): ValidatedImportRecord => {
    const candidate = record(value);
    if (candidate.prospectState !== "discovered") throw new Error(`Prospect ${index} must be in discovered state.`);
    const normalized = normalizeRetailerProspect(candidate);
    if (!normalized.ok || !normalized.value) throw new Error(`Prospect ${index}: ${normalized.error || "invalid retailer prospect"}`);
    const keys = buildProspectDedupeKeys(normalized.value);
    if (seen.has(keys.identityKey)) throw new Error(`Prospect ${index} duplicates another artifact identity.`);
    seen.add(keys.identityKey);

    const discovery = record(candidate.discovery);
    const discoverySource = (typeof discovery.source === "string" ? discovery.source : defaultSource).trim().slice(0, 120);
    if (!discoverySource) throw new Error(`Prospect ${index} discovery.source is required.`);
    const rawScore = candidate.score;
    const score = rawScore === undefined
      ? emptyScore()
      : scoreRetailerProspect(scoreInputs(record(rawScore).inputs, index));

    return {
      index,
      prospect: normalized.value,
      identityKey: keys.identityKey,
      discoverySource,
      sourceUrl: validatedSourceUrl(discovery.sourceUrl, index),
      score,
    };
  });
  return { artifactKind, validated };
}

export async function importRetailerProspectArtifact(input: {
  artifact: unknown;
  actorEmail: string;
  apply?: boolean;
  sourceFile?: string;
  repository?: RetailerProspectImportRepository;
  now?: () => Date;
}): Promise<RetailerProspectImportAudit> {
  const actor = input.actorEmail.trim().toLowerCase();
  if (!isRetailerAdminEmail(actor)) throw new Error("Retailer prospect import is owner-only.");
  const { artifactKind, validated } = validateArtifact(input.artifact);
  const apply = input.apply === true;
  if (apply && !input.repository) throw new Error("Apply mode requires a retailer prospect repository.");

  const records: RetailerProspectImportAudit["records"] = [];
  let inserted = 0;
  let deduplicated = 0;
  for (const candidate of validated) {
    if (!apply) {
      records.push({
        index: candidate.index,
        identityKey: candidate.identityKey,
        prospectId: null,
        action: "would_upsert",
        score: candidate.score.total,
      });
      continue;
    }
    const result = await input.repository!.upsertProspect({
      prospect: candidate.prospect,
      score: candidate.score,
      discoverySource: candidate.discoverySource,
      sourceUrl: candidate.sourceUrl,
    });
    if (result.deduplicated) deduplicated += 1;
    else inserted += 1;
    records.push({
      index: candidate.index,
      identityKey: result.prospect.identityKey || candidate.identityKey,
      prospectId: result.prospect.id,
      action: result.deduplicated ? "deduplicated" : "inserted",
      score: candidate.score.total,
    });
  }

  return {
    schemaVersion: 1,
    operation: "retailer_prospect_import",
    mode: apply ? "apply" : "dry-run",
    generatedAt: (input.now?.() || new Date()).toISOString(),
    actor,
    sourceFile: input.sourceFile || null,
    artifactKind,
    summary: {
      validated: validated.length,
      wouldUpsert: apply ? 0 : validated.length,
      inserted,
      deduplicated,
    },
    records,
    guardrail: "This import only upserts prospect rows. It cannot draft, approve, send, or record outreach.",
  };
}
