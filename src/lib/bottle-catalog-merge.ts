export interface BottleCatalogEntry {
  id: string;
  canonicalName: string;
  availability: string;
  aliases: string[];
  isSignalTracked?: boolean;
  isAlertEligible?: boolean;
}

function normalizeIdentity(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(\d+)\s*y\b/g, "$1 year")
    .replace(/\btwelve\b/g, "12")
    .replace(/\bten\b/g, "10")
    .replace(/^wl weller\b/, "weller")
    .replace(/^e h taylor\b/, "eh taylor")
    .replace(/\s+/g, " ")
    .trim();
}

function identityKeys(bottle: BottleCatalogEntry) {
  return new Set(
    [bottle.id, bottle.canonicalName]
      .map(normalizeIdentity)
      .filter(Boolean),
  );
}

function variantNumbers(value: string) {
  return Array.from(new Set(normalizeIdentity(value).match(/\b\d+\b/g) || [])).sort();
}

function variantsAreCompatible(left: BottleCatalogEntry, right: BottleCatalogEntry) {
  const leftNumbers = variantNumbers(left.canonicalName);
  const rightNumbers = variantNumbers(right.canonicalName);
  return leftNumbers.length === 0 || rightNumbers.length === 0 || leftNumbers.join(",") === rightNumbers.join(",");
}

function intersects(left: Set<string>, right: Set<string>) {
  for (const key of Array.from(left)) {
    if (right.has(key)) return true;
  }
  return false;
}

/**
 * Merge catalog sources from lowest to highest authority.
 *
 * IDs are source-specific, so normalized canonical names also participate in
 * identity matching. Free-form aliases are retained but never used as merge keys:
 * nicknames are frequently shared by distinct editions. Later sources retain
 * editorial fields such as rarity tier, while signal/alert flags and aliases are
 * accumulated from every source.
 */
export function mergeBottleCatalogSources<T extends BottleCatalogEntry>(sources: T[][]): T[] {
  const merged: T[] = [];

  for (const source of sources) {
    for (const bottle of source) {
      const bottleKeys = identityKeys(bottle);
      const matchingIndexes: number[] = [];
      for (let index = 0; index < merged.length; index += 1) {
        if (variantsAreCompatible(bottle, merged[index]) && intersects(bottleKeys, identityKeys(merged[index]))) matchingIndexes.push(index);
      }

      const existing = matchingIndexes.map((index) => merged[index]);
      const aliases = Array.from(new Set([
        ...existing.flatMap((entry) => [...(entry.aliases || []), entry.canonicalName]),
        ...(bottle.aliases || []),
        bottle.canonicalName,
      ]));
      const isSignalTracked = existing.some((entry) => entry.isSignalTracked) || Boolean(bottle.isSignalTracked);
      const isAlertEligible = existing.some((entry) => entry.isAlertEligible) || Boolean(bottle.isAlertEligible);
      const combined = Object.assign({}, ...existing, bottle, {
        aliases,
        isSignalTracked,
        isAlertEligible,
      }) as T;

      for (const index of matchingIndexes.reverse()) merged.splice(index, 1);
      merged.push(combined);
    }
  }

  return merged.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}
