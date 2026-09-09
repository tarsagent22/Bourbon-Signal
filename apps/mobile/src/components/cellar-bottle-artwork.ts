export type CellarBottleArtworkId = "eh-taylor-small-batch" | "russells-reserve-10";

export type CellarBottleIdentity = Readonly<{
  bottleId?: string;
  bottleName?: string;
  canonicalKey?: string;
}>;

function normalized(value: string | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CONFLICTING_VARIANT = /\b(?:single barrel|barrel proof|rr ?13|russell s? reserve 13)\b/;

const EXACT_NAMES: Readonly<Record<CellarBottleArtworkId, ReadonlySet<string>>> = {
  "eh-taylor-small-batch": new Set([
    "eh taylor small batch",
    "e h taylor small batch",
    "colonel e h taylor small batch",
    "e h taylor jr small batch",
    "e h taylor jr small batch 75l",
    "colonel e h taylor small batch bottled in bond",
    "colonel e h taylor small batch bottled in bond bourbon",
  ]),
  "russells-reserve-10": new Set([
    "russell s reserve 10",
    "russell s reserve 10 year",
    "russells reserve 10",
    "russells reserve 10 year",
    "russell reserve 10",
    "russell reserve 10 year",
  ]),
};

/**
 * Matches only the two artworks explicitly cleared for this pilot. Catalog aliases
 * are intentionally not consulted: the E.H. Taylor record contains Single Barrel
 * aliases that must never receive the Small Batch artwork.
 */
export function resolveCellarBottleArtwork(identity: CellarBottleIdentity): CellarBottleArtworkId | undefined {
  const identifiers = [identity.bottleId, identity.bottleName, identity.canonicalKey].map(normalized).filter(Boolean);
  if (identifiers.some((value) => CONFLICTING_VARIANT.test(value))) return undefined;

  for (const artworkId of Object.keys(EXACT_NAMES) as CellarBottleArtworkId[]) {
    // A present display name must explicitly agree; a stale catalog ID must not
    // override a different age, rye, or special edition entered by the member.
    const displayName = normalized(identity.bottleName);
    if (displayName && !EXACT_NAMES[artworkId].has(displayName)) continue;
    if (identifiers.includes(normalized(artworkId)) || identifiers.some((value) => EXACT_NAMES[artworkId].has(value))) {
      return artworkId;
    }
  }
  return undefined;
}
