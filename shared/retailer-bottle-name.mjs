// Only presentation noise is discarded. Ages, proofs, finishes, picks and
// release/edition numbers must survive identity matching.
export function cleanRetailerBottleName(value) {
  return String(value || '').normalize('NFKC')
    .replace(/\(\s*limited quantities may be (?:available|avaliable) in store\s*\)/gi, ' ')
    .replace(/\b(?:\d+(?:\.\d+)?|\.\d+)\s*(?:ml|lt|liters?|litres?|l)\b/gi, ' ')
    .replace(/\s+/g, ' ').replace(/(?:\s*[-–—·,]\s*)+$/g, '').trim();
}

export function retailerBottleIdentityKey(value) {
  return cleanRetailerBottleName(value).toLowerCase()
    .replace(/\b(\d{1,2})\s*(?:years? old|years?|yrs?|y)\b/g, '$1 year')
    .replace(/\bbib\b/g, 'bottled in bond')
    .replace(/&/g, ' and ').replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** @param {readonly {catalogId:string, displayName:string, exactNames:readonly string[]}[]} entries */
export function createStandardBottleIndex(entries) {
  /** @type {Map<string, (typeof entries)[number] | null>} */
  const byName = new Map();
  for (const entry of entries) for (const name of entry.exactNames) {
    const key = retailerBottleIdentityKey(name);
    const previous = byName.get(key);
    if (!byName.has(key)) byName.set(key, entry);
    else if (previous?.catalogId !== entry.catalogId) byName.set(key, null);
  }
  return byName;
}
