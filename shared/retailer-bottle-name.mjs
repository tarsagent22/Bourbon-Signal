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
    .replace(/\be[\s.]+h[\s.]+(?=taylor\b)/g, 'eh ')
    .replace(/\bbbn\b/g, 'bourbon').replace(/\bbrl\b/g, 'barrel')
    .replace(/\bstraightrye\b/g, 'straight rye')
    .replace(/\b(\d{1,2})\s*(?:years? old|years?|yrs?|y)\b/g, '$1 year')
    .replace(/\bbib\b/g, 'bottled in bond')
    .replace(/&/g, ' and ').replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {readonly {catalogId:string, displayName:string, exactNames:readonly string[], sha256?:string}[]} entries
 * @param {Record<string,string>} redirects Explicitly reviewed duplicate identities only.
 */
export function createStandardBottleIndex(entries, redirects = {}) {
  /** @type {Map<string, (typeof entries)[number] | null>} */
  const byName = new Map();
  const byId = new Map(entries.map(row => [row.catalogId, row]));
  for (const [from, to] of Object.entries(redirects)) {
    const source = byId.get(from), target = byId.get(to);
    if (!source || !target || !source.sha256 || source.sha256 !== target.sha256) throw new Error(`Unverified standard bottle redirect: ${from}`);
  }
  for (const original of entries) for (const name of original.exactNames) {
    const entry = byId.get(redirects[original.catalogId]) || original;
    const key = retailerBottleIdentityKey(name);
    const previous = byName.get(key);
    if (!byName.has(key)) byName.set(key, entry);
    else if (previous?.catalogId !== entry.catalogId) byName.set(key, null);
  }
  return byName;
}
