export type CellarBottleArtworkId =
  | "henry-mckenna-10"
  | "eh-taylor-small-batch"
  | "1792-small-batch"
  | "penelope-riviera"
  | "buffalo-trace"
  | "russells-reserve-10";

export type CellarBottleIdentity = Readonly<{
  bottleId?: string;
  bottleName?: string;
  canonicalKey?: string;
}>;

function normalized(value: string | undefined) {
  return (value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

const EXACT_NAMES: Readonly<Record<CellarBottleArtworkId, ReadonlySet<string>>> = {
  "henry-mckenna-10": new Set([
    "henry mckenna 10", "henry mckenna 10 year", "henry mckenna 10 year single barrel",
    "henry mckenna single barrel 10 year", "henry mckenna 10 year bottled in bond",
  ]),
  "eh-taylor-small-batch": new Set([
    "eh taylor small batch", "e h taylor small batch", "colonel e h taylor small batch",
    "e h taylor jr small batch", "e h taylor jr small batch 75l",
    "colonel e h taylor small batch bottled in bond", "colonel e h taylor small batch bottled in bond bourbon",
  ]),
  "1792-small-batch": new Set(["1792 small batch", "1792 small batch bourbon", "1792 bourbon small batch", "barton 1792 small batch"]),
  "penelope-riviera": new Set(["penelope riviera", "penelope riviera cask finish", "penelope cooper series riviera"]),
  "buffalo-trace": new Set(["buffalo trace", "buffalo trace bourbon", "buffalo trace kentucky straight bourbon", "buffalo trace ky straight bourbon"]),
  "russells-reserve-10": new Set([
    "russell s reserve 10", "russell s reserve 10 year", "russell s reserve 10 year bourbon",
    "russells reserve 10", "russells reserve 10 year", "russell reserve 10", "russell reserve 10 year",
  ]),
};

/** Only the six owner-selected products. Never expand from catalog alias arrays:
 * the Taylor catalog has known Single Barrel collisions. A present display name
 * must agree with the exact product; stale IDs cannot relabel another edition.
 */
export function resolveCellarBottleArtwork(identity: CellarBottleIdentity): CellarBottleArtworkId | undefined {
  const identifiers = [identity.bottleId, identity.bottleName, identity.canonicalKey].map(normalized).filter(Boolean);
  const displayName = normalized(identity.bottleName);
  for (const artworkId of Object.keys(EXACT_NAMES) as CellarBottleArtworkId[]) {
    const names = EXACT_NAMES[artworkId];
    if (displayName && !names.has(displayName)) continue;
    const canonicalName = normalized(identity.canonicalKey);
    if (canonicalName && canonicalName !== normalized(artworkId) && !names.has(canonicalName)) continue;
    if (identifiers.some((value) => /\b(?:barrel proof|full proof|rr ?13|russell s? reserve 13)\b/.test(value))) continue;
    // Henry McKenna 10 IS a single barrel; the other five selected products are not.
    if (artworkId !== "henry-mckenna-10" && identifiers.some((value) => /\bsingle barrel\b/.test(value))) continue;
    if (identifiers.includes(normalized(artworkId)) || identifiers.some((value) => names.has(value))) return artworkId;
  }
  return undefined;
}
