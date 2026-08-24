export const SCARCITY_TIERS = ["regular", "limited", "allocated", "highly_allocated", "unicorn"] as const;
export type ScarcityTier = (typeof SCARCITY_TIERS)[number];
export type ScarcityConfidence = "low" | "medium" | "high";
export type ReleaseCadence = "core" | "batch" | "seasonal" | "annual" | "one_off" | "unknown";
export type DistributionScope = "national" | "regional" | "state_specific" | "distillery_only" | "unknown";
export type OfficialAllocationStatus = "none" | "supplier_allocated" | "state_allocated" | "lottery" | "special_release" | "unknown";

export interface EvidenceWindow {
  start: string;
  end: string;
}

export interface StateScarcityOverride {
  jurisdiction: string;
  tier: ScarcityTier;
  confidence: ScarcityConfidence;
  reason: string;
  officialAllocationStatus: OfficialAllocationStatus;
  verifiedOpportunityCount: number;
  coverageDenominator: number;
  evidenceWindow: EvidenceWindow;
  sourceIds: string[];
  lastReviewedAt: string;
}

export interface BottleScarcityMetadata {
  nationalTier: ScarcityTier;
  nationalConfidence: ScarcityConfidence;
  releaseCadence: ReleaseCadence;
  distributionScope: DistributionScope;
  scarcitySourceIds: string[];
  scarcityLastReviewedAt: string | null;
  stateOverrides: StateScarcityOverride[];
}

export type BottleScarcity = BottleScarcityMetadata;

export interface BottleScarcityInput extends Partial<BottleScarcityMetadata> {
  availability?: unknown;
  source?: unknown;
  [key: string]: unknown;
}

export interface ResolvedBottleScarcity extends BottleScarcityMetadata {
  nationalLabel: string;
  marketTier: ScarcityTier;
  marketLabel: string;
  localLabel: string;
  classificationSource: "national_baseline" | "state_override";
  localClassificationEstablished: boolean;
  confidence: ScarcityConfidence;
  localConfidence: ScarcityConfidence | null;
  localReason: string | null;
  reason: string;
  jurisdiction: string;
  override: StateScarcityOverride | null;
}

const TIER_PRESENTATION: Record<ScarcityTier, { label: string; description: string; score: number }> = {
  regular: {
    label: "Regular availability",
    description: "Generally obtainable in markets where it is distributed.",
    score: 20,
  },
  limited: {
    label: "Limited availability",
    description: "Uneven, periodic, regional, or batch availability; notable but not necessarily heavily allocated.",
    score: 58,
  },
  allocated: {
    label: "Allocated",
    description: "Orders are constrained and releases sell quickly, but retail opportunities recur.",
    score: 72,
  },
  highly_allocated: {
    label: "Unicorn",
    description: "Extremely difficult to find and commonly released through very small allotments or controlled events.",
    score: 86,
  },
  unicorn: {
    label: "Unicorn",
    description: "An extraordinary retail find that is exceptionally infrequent or nearly unobtainable near MSRP.",
    score: 100,
  },
};

const CONFIDENCE_VALUES = new Set<ScarcityConfidence>(["low", "medium", "high"]);
const RELEASE_CADENCE_VALUES = new Set<ReleaseCadence>(["core", "batch", "seasonal", "annual", "one_off", "unknown"]);
const DISTRIBUTION_SCOPE_VALUES = new Set<DistributionScope>(["national", "regional", "state_specific", "distillery_only", "unknown"]);
const OFFICIAL_STATUS_VALUES = new Set<OfficialAllocationStatus>(["none", "supplier_allocated", "state_allocated", "lottery", "special_release", "unknown"]);

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean)));
}

export function normalizeJurisdiction(value: string) {
  return value.trim().toUpperCase().replace(/_/g, "-");
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function isScarcityTier(value: unknown): value is ScarcityTier {
  return typeof value === "string" && SCARCITY_TIERS.includes(value as ScarcityTier);
}

function legacyNationalTier(value: unknown): ScarcityTier {
  const tier = String(value || "").trim().toLowerCase();
  if (tier === "unicorn") return "unicorn";
  if (tier === "highly_allocated") return "unicorn";
  if (tier === "allocated") return "allocated";
  if (tier === "limited" || tier === "seasonal") return "limited";
  return "regular";
}

export function getScarcityTierPresentation(tier: ScarcityTier) {
  return TIER_PRESENTATION[tier] || TIER_PRESENTATION.regular;
}

export function getPublicScarcityLabel(metadata: Pick<BottleScarcityMetadata, "nationalTier" | "nationalConfidence">) {
  if (metadata.nationalConfidence === "low" && metadata.nationalTier !== "regular") return "Scarcity under review";
  return getScarcityTierPresentation(metadata.nationalTier).label;
}

export function validateStateScarcityOverrides(overrides: StateScarcityOverride[] = []): StateScarcityOverride[] {
  const seen = new Set<string>();
  return overrides.map((raw) => {
    const jurisdiction = normalizeJurisdiction(raw.jurisdiction || "");
    if (!/^[A-Z]{2}(?:-[A-Z0-9]+(?:-[A-Z0-9]+)*)?$/.test(jurisdiction)) {
      throw new Error(`Invalid state scarcity jurisdiction: ${raw.jurisdiction || "(empty)"}`);
    }
    if (seen.has(jurisdiction)) throw new Error(`Duplicate state scarcity override for ${jurisdiction}`);
    seen.add(jurisdiction);
    if (!isScarcityTier(raw.tier)) throw new Error(`Invalid scarcity tier for ${jurisdiction}`);
    if (!CONFIDENCE_VALUES.has(raw.confidence)) throw new Error(`Invalid scarcity confidence for ${jurisdiction}`);
    if (!OFFICIAL_STATUS_VALUES.has(raw.officialAllocationStatus)) throw new Error(`Invalid official allocation status for ${jurisdiction}`);
    if (!raw.reason?.trim()) throw new Error(`Missing state scarcity reason for ${jurisdiction}`);
    const sourceIds = uniqueStrings(raw.sourceIds);
    if (sourceIds.length === 0) throw new Error(`Missing state scarcity evidence sources for ${jurisdiction}`);
    if (!Number.isInteger(raw.verifiedOpportunityCount) || raw.verifiedOpportunityCount < 0) {
      throw new Error(`Invalid verified opportunity count for ${jurisdiction}`);
    }
    if (!Number.isInteger(raw.coverageDenominator) || raw.coverageDenominator < 0) {
      throw new Error(`Invalid coverage denominator for ${jurisdiction}`);
    }
    if (raw.verifiedOpportunityCount > raw.coverageDenominator && raw.coverageDenominator > 0) {
      throw new Error(`Verified opportunities exceed the coverage denominator for ${jurisdiction}`);
    }
    const officialEvidence = raw.officialAllocationStatus === "supplier_allocated"
      || raw.officialAllocationStatus === "state_allocated"
      || raw.officialAllocationStatus === "lottery"
      || raw.officialAllocationStatus === "special_release";
    if (!officialEvidence && raw.coverageDenominator <= 0) {
      throw new Error(`A positive coverage denominator is required for observational state scarcity in ${jurisdiction}`);
    }
    if (!raw.evidenceWindow || !validDate(raw.evidenceWindow.start) || !validDate(raw.evidenceWindow.end)) {
      throw new Error(`Invalid evidence window for ${jurisdiction}`);
    }
    if (Date.parse(raw.evidenceWindow.start) > Date.parse(raw.evidenceWindow.end)) {
      throw new Error(`Evidence window starts after it ends for ${jurisdiction}`);
    }
    if (!validDate(raw.lastReviewedAt)) throw new Error(`Invalid state scarcity review date for ${jurisdiction}`);
    return {
      ...raw,
      tier: raw.tier === "highly_allocated" ? "unicorn" : raw.tier,
      jurisdiction,
      reason: raw.reason.trim(),
      sourceIds,
    };
  });
}

/** Sources are ordered lowest to highest authority; later data owns a same-jurisdiction conflict. */
export function mergeStateScarcityOverrides(...sources: StateScarcityOverride[][]): StateScarcityOverride[] {
  const byJurisdiction = new Map<string, StateScarcityOverride>();
  for (const source of sources) {
    for (const override of validateStateScarcityOverrides(source || [])) {
      byJurisdiction.set(override.jurisdiction, override);
    }
  }
  return validateStateScarcityOverrides(Array.from(byJurisdiction.values()).sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction)));
}

export function normalizeBottleScarcity(input: BottleScarcityInput | Record<string, unknown>): BottleScarcityMetadata {
  const source = input as BottleScarcityInput;
  const legacyAvailability = String(source.availability || "").toLowerCase();
  if (source.nationalTier !== undefined && !isScarcityTier(source.nationalTier)) {
    throw new Error(`Invalid national scarcity tier: ${String(source.nationalTier)}`);
  }
  const nationalConfidence = source.nationalConfidence && CONFIDENCE_VALUES.has(source.nationalConfidence)
    ? source.nationalConfidence
    : "low";
  const releaseCadence = source.releaseCadence && RELEASE_CADENCE_VALUES.has(source.releaseCadence)
    ? source.releaseCadence
    : legacyAvailability === "seasonal" ? "seasonal" : "unknown";
  const distributionScope = source.distributionScope && DISTRIBUTION_SCOPE_VALUES.has(source.distributionScope)
    ? source.distributionScope
    : legacyAvailability === "regional" ? "regional" : "unknown";
  const reviewedAt = typeof source.scarcityLastReviewedAt === "string" && validDate(source.scarcityLastReviewedAt)
    ? source.scarcityLastReviewedAt
    : null;

  return {
    nationalTier: source.nationalTier === "highly_allocated" ? "unicorn" : source.nationalTier || legacyNationalTier(legacyAvailability),
    nationalConfidence,
    releaseCadence,
    distributionScope,
    scarcitySourceIds: uniqueStrings(source.scarcitySourceIds),
    scarcityLastReviewedAt: reviewedAt,
    stateOverrides: validateStateScarcityOverrides(source.stateOverrides || []),
  };
}

export function getScarcityBadges(metadata: Pick<BottleScarcityMetadata, "releaseCadence" | "distributionScope">): string[] {
  const badges: string[] = [];
  const cadenceLabels: Partial<Record<ReleaseCadence, string>> = {
    batch: "Batch release",
    seasonal: "Seasonal release",
    annual: "Annual release",
    one_off: "One-time release",
  };
  const distributionLabels: Partial<Record<DistributionScope, string>> = {
    regional: "Regional distribution",
    state_specific: "State-specific release",
    distillery_only: "Distillery-only",
  };
  const cadence = cadenceLabels[metadata.releaseCadence];
  const distribution = distributionLabels[metadata.distributionScope];
  if (cadence) badges.push(cadence);
  if (distribution) badges.push(distribution);
  return badges;
}

function publishableOverride(override: StateScarcityOverride) {
  if (override.confidence === "low") return false;
  const officialEvidence = override.officialAllocationStatus === "supplier_allocated"
    || override.officialAllocationStatus === "state_allocated"
    || override.officialAllocationStatus === "lottery"
    || override.officialAllocationStatus === "special_release";
  return override.sourceIds.length > 0 && (officialEvidence || override.coverageDenominator > 0);
}

export function resolveBottleScarcity(metadataInput: BottleScarcityMetadata | Record<string, unknown>, jurisdiction = ""): ResolvedBottleScarcity {
  const metadata = normalizeBottleScarcity(metadataInput as BottleScarcityInput);
  const normalized = normalizeJurisdiction(jurisdiction);
  const state = normalized.split("-")[0];
  const exact = metadata.stateOverrides.find((entry) => entry.jurisdiction === normalized);
  const stateFallback = normalized !== state ? metadata.stateOverrides.find((entry) => entry.jurisdiction === state) : undefined;
  const override = [exact, stateFallback].find((entry) => entry && publishableOverride(entry)) || null;
  const publicNationalLabel = getPublicScarcityLabel(metadata);
  const marketTier = override?.tier || metadata.nationalTier;
  const marketPresentation = getScarcityTierPresentation(marketTier);

  return {
    ...metadata,
    nationalLabel: publicNationalLabel,
    marketTier,
    marketLabel: override ? marketPresentation.label : publicNationalLabel,
    localLabel: override ? `${marketPresentation.label} in ${override.jurisdiction}` : "Local classification not established",
    classificationSource: override ? "state_override" : "national_baseline",
    localClassificationEstablished: Boolean(override),
    confidence: override?.confidence || metadata.nationalConfidence,
    localConfidence: override?.confidence || (exact || stateFallback)?.confidence || null,
    localReason: override?.reason || (exact || stateFallback)?.reason || null,
    reason: override?.reason || "The national scarcity baseline applies because a sufficiently supported local classification is not established.",
    jurisdiction: normalized,
    override,
  };
}

export function scarcityTierToAvailability(tier: ScarcityTier) {
  return tier === "regular" ? "common" : tier;
}
