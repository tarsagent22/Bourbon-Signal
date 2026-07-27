export type RewardAvailability = "common" | "regional" | "seasonal" | "limited" | "allocated" | "highly_allocated" | "unicorn";
export type RewardRarityTier = "limited" | "allocated" | "unicorn";

export type RewardCatalogBottle = {
  id: string;
  canonicalName: string;
  aliases: string[];
  availability: RewardAvailability;
};

type RewardSighting = {
  bottleId?: string;
  bottleName: string;
  rarityTier?: RewardRarityTier;
  reviewState?: {
    needsBottleReview?: boolean;
    manualBottleName?: string;
  };
};

function normalizeBottleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function memberSightingTierForAvailability(availability?: RewardAvailability): RewardRarityTier {
  if (availability === "unicorn") return "unicorn";
  if (availability === "allocated" || availability === "highly_allocated") return "allocated";
  return "limited";
}

function bottleNameMatches(sighting: Pick<RewardSighting, "bottleName">, bottle: RewardCatalogBottle) {
  const normalizedName = normalizeBottleKey(sighting.bottleName);
  return normalizeBottleKey(bottle.canonicalName) === normalizedName
    || bottle.aliases.some((alias) => normalizeBottleKey(alias) === normalizedName);
}

export function normalizeSightingsForRewards<T extends RewardSighting>(sightings: T[], catalog: RewardCatalogBottle[]): T[] {
  const catalogById = new Map(catalog.map((bottle) => [bottle.id, bottle]));
  const catalogByName = new Map<string, RewardCatalogBottle>();
  for (const bottle of catalog) {
    catalogByName.set(normalizeBottleKey(bottle.canonicalName), bottle);
    for (const alias of bottle.aliases) {
      const key = normalizeBottleKey(alias);
      if (!catalogByName.has(key)) catalogByName.set(key, bottle);
    }
  }

  return sightings.map((sighting) => {
    const manualBottle = Boolean(sighting.reviewState?.needsBottleReview || sighting.reviewState?.manualBottleName);
    const idMatch = sighting.bottleId ? catalogById.get(sighting.bottleId) : undefined;
    const exactBottle = !manualBottle && idMatch && bottleNameMatches(sighting, idMatch)
      ? idMatch
      : !manualBottle
        ? catalogByName.get(normalizeBottleKey(sighting.bottleName))
        : undefined;
    const rarityTier = memberSightingTierForAvailability(exactBottle?.availability);
    return sighting.rarityTier === rarityTier ? sighting : { ...sighting, rarityTier };
  });
}
