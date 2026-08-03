const scarcityModule = await import("../src/lib/bottle-scarcity.ts");
const { SCARCITY_TIERS, validateStateScarcityOverrides } = scarcityModule;
const scarcityData = await import("../src/data/bottle-scarcity-overrides.ts");
const {
  ALABAMA_ALLOCATED_PRODUCT_MATCHES,
  BOTTLE_SCARCITY_SOURCE_REGISTRY,
  BOTTLE_STATE_SCARCITY_OVERRIDES,
} = scarcityData;
const { getBourbonBible } = await import("../src/lib/bourbonBible.ts");

const bottles = await getBourbonBible();
const sourceIds = new Set(Object.keys(BOTTLE_SCARCITY_SOURCE_REGISTRY));
const bottleIds = new Set<string>();
const errors: string[] = [];
const tierCounts: Record<string, number> = {};
const confidenceCounts: Record<string, number> = {};
const stateOverrideCounts: Record<string, number> = {};
const reviewQueue: { id: string; name: string; tier: string; reason: string }[] = [];

for (const bottle of bottles) {
  if (bottleIds.has(bottle.id)) errors.push(`Duplicate canonical bottle id: ${bottle.id}`);
  bottleIds.add(bottle.id);
  if (!SCARCITY_TIERS.includes(bottle.nationalTier)) errors.push(`Invalid national tier: ${bottle.id}/${bottle.nationalTier}`);
  tierCounts[bottle.nationalTier] = (tierCounts[bottle.nationalTier] || 0) + 1;
  confidenceCounts[bottle.nationalConfidence] = (confidenceCounts[bottle.nationalConfidence] || 0) + 1;

  for (const sourceId of bottle.scarcitySourceIds) {
    if (!sourceIds.has(sourceId)) errors.push(`Unknown national evidence source: ${bottle.id}/${sourceId}`);
  }
  if (bottle.nationalConfidence !== "low" && bottle.scarcitySourceIds.length === 0) {
    errors.push(`Supported national confidence has no evidence source: ${bottle.id}`);
  }

  let validated = [];
  try {
    validated = validateStateScarcityOverrides(bottle.stateOverrides);
  } catch (error) {
    errors.push(`${bottle.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const scopes = new Set<string>();
  for (const override of validated) {
    if (scopes.has(override.jurisdiction)) errors.push(`Duplicate state scope: ${bottle.id}/${override.jurisdiction}`);
    scopes.add(override.jurisdiction);
    stateOverrideCounts[override.jurisdiction] = (stateOverrideCounts[override.jurisdiction] || 0) + 1;
    for (const sourceId of override.sourceIds) {
      if (!sourceIds.has(sourceId)) errors.push(`Unknown state evidence source: ${bottle.id}/${override.jurisdiction}/${sourceId}`);
    }
  }

  if (bottle.nationalConfidence === "low" && bottle.nationalTier !== "regular") {
    reviewQueue.push({
      id: bottle.id,
      name: bottle.canonicalName,
      tier: bottle.nationalTier,
      reason: bottle.scarcitySourceIds.length ? "single-source or uncorroborated classification" : "classification has no recorded national evidence source",
    });
  }
}

for (const bottleId of Object.keys(ALABAMA_ALLOCATED_PRODUCT_MATCHES)) {
  if (!bottleIds.has(bottleId)) errors.push(`Alabama evidence references missing canonical bottle: ${bottleId}`);
}
for (const bottleId of Object.keys(BOTTLE_STATE_SCARCITY_OVERRIDES)) {
  if (!bottleIds.has(bottleId)) errors.push(`Curated state evidence references missing canonical bottle: ${bottleId}`);
}

const includeQueue = process.argv.includes("--queue");
const report = {
  generatedAt: new Date().toISOString(),
  catalogCount: bottles.length,
  tierCounts,
  confidenceCounts,
  stateOverrideCounts,
  unresolvedHuntBottleCount: reviewQueue.length,
  ...(includeQueue ? { reviewQueue } : {}),
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exitCode = 1;
