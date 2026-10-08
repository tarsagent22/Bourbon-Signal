export interface SightingStoreDirectoryEntry {
  id: string;
  state: string;
  name: string;
  address: string;
  city: string;
  zip?: string;
  county?: string;
  board?: string;
  boardId?: string;
  aliases?: string[];
  source?: string;
  sourceUrl?: string;
}

function text(value: unknown) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }
export function storeSearchText(value: unknown) {
  return text(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
export function physicalStoreAddress(value: unknown) {
  const address = text(value);
  return Boolean(address && !/^p\.?\s*o\.?\s*box\b/i.test(address)
    && (/\d/.test(address) || /\b(?:street|st|road|rd|highway|hwy|route|avenue|ave|drive|dr|boulevard|blvd|lane|ln)\b/i.test(address))
    && !/^(?:[a-z .'-]+,?\s+)?[A-Z]{2}\s*(?:\d{5}(?:-\d{4})?)?$/i.test(address));
}
export function sightingStoreAddressKey(row: { state: string; address: string; city: string }) {
  const escapedCity = row.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const trimmed = row.address.replace(new RegExp(`\\s+${escapedCity}\\s+${row.state}\\s+\\d{5}(?:-\\d{4})?\\s*$`, "i"), "");
  const parts = trimmed.split(",");
  // Keep unit numbers, remove the repeated city/state suffix of full addresses.
  const street = [parts[0], ...parts.slice(1).filter(p => /^\s*(?:suite|ste|unit|#)\s*[a-z0-9-]+\s*$/i.test(p))].join(" ");
  const replacements: Record<string,string> = { street:"st", road:"rd", avenue:"ave", drive:"dr", boulevard:"blvd", highway:"hwy", lane:"ln", court:"ct", place:"pl", parkway:"pkwy", north:"n", south:"s", east:"e", west:"w", northeast:"ne", northwest:"nw", southeast:"se", southwest:"sw", suite:"unit", ste:"unit", mount:"mt" };
  const normalized = storeSearchText(street.replace(/#(?=\s*\w)/g,"unit ")).split(" ").map(p => replacements[p] || p).join(" ");
  const city = storeSearchText(row.city).replace(/\bmount\b/g,"mt").replace(/\bsaint\b/g,"st");
  return `${row.state}:${normalized}:${city}`;
}
export function normalizeSightingStore(row: Record<string, unknown>): SightingStoreDirectoryEntry | null {
  const id = text(row.id || row.sourceStoreId || row.storeId);
  const rawState = text(row.state || row.state_code).toUpperCase();
  const state = rawState === "MD-MONTGOMERY" ? "MD" : rawState;
  const name = text(row.name || row.displayLabel || row.dba);
  const address = text(row.address);
  const city = text(row.city || row.storeCity);
  const locationType = text(row.locationType || row.type);
  if (!id || !/^[A-Z]{2}$/.test(state) || !name || !physicalStoreAddress(address) || !city
    || row.searchable === false || /closed|inactive|revoked|surrendered/i.test(text(row.status))
    || /\blicensee service center\b/i.test(name)
    || ["area", "state_board", "county_board", "county_watch_area", "warehouse"].includes(locationType)) return null;
  const aliases = Array.isArray(row.aliases) ? row.aliases.map(text).filter(Boolean) : [];
  for (const alias of [row.sourceStoreId, row.storeId]) if (text(alias) && text(alias) !== id) aliases.push(text(alias));
  return { id, state, name, address, city,
    ...(text(row.zip || row.postalCode || row.postal_code) ? { zip: text(row.zip || row.postalCode || row.postal_code) } : {}),
    ...(text(row.county) ? { county: text(row.county) } : {}),
    ...(text(row.board) ? { board: text(row.board) } : {}),
    ...(text(row.boardId) ? { boardId: text(row.boardId) } : {}),
    ...(aliases.length ? { aliases: [...new Set(aliases)].slice(0,30) } : {}),
    ...(text(row.source) ? { source: text(row.source) } : {}),
    ...(text(row.sourceUrl) ? { sourceUrl: text(row.sourceUrl) } : {}) };
}
export function mergeSightingStoreRows(rows: readonly Record<string, unknown>[]) {
  const directory = new Map<string, SightingStoreDirectoryEntry>();
  for (const raw of rows) {
    const row = normalizeSightingStore(raw);
    if (!row) continue;
    const key = sightingStoreAddressKey(row);
    const previous = directory.get(key);
    if (!previous) { directory.set(key, row); continue; }
    // Earlier authoritative rows keep identity and corrected address; later
    // source identities remain searchable for old drafts and store-number input.
    const aliases = [...new Set([...(previous.aliases || []), row.id, row.name, ...(row.aliases || [])])]
      .filter(value => value !== previous.id && value !== previous.name).slice(0,30);
    directory.set(key, { ...previous, zip: previous.zip || row.zip, county: previous.county || row.county, ...(aliases.length ? { aliases } : {}) });
  }
  return [...directory.values()].sort((a,b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function searchSightingStoreDirectory(stores: readonly SightingStoreDirectoryEntry[], query: string, state = "") {
  const normalized = storeSearchText(query);
  const tokens = normalized.split(" ").filter(Boolean);
  return stores.flatMap(store => {
    if (state && store.state !== state) return [];
    const name = storeSearchText(store.name);
    const city = storeSearchText(store.city);
    const zip = storeSearchText(store.zip);
    const id = storeSearchText(store.id);
    const fields = [name, city, zip, id, storeSearchText(store.address), storeSearchText(store.county), storeSearchText(store.board), store.state.toLowerCase(), ...(store.aliases || []).map(storeSearchText)];
    const words = fields.join(" ").split(" ");
    if (tokens.some(token => !words.some(word => word.startsWith(token)))) return [];
    const contextualScore = (tokens.some(token => city.split(" ").some(word => word.startsWith(token))) ? 100 : 0)
      + (tokens.some(token => name.split(" ").some(word => word.startsWith(token))) ? 20 : 0);
    const score = !normalized ? 0 : id === normalized ? 1000 : name === normalized ? 900 : city === normalized ? 800 : zip === normalized ? 750 : name.startsWith(normalized) ? 700 : fields.some(field => field.includes(normalized)) ? 600 : 400 + contextualScore;
    return [{ store, score }];
  }).sort((a,b) => b.score - a.score || a.store.state.localeCompare(b.store.state) || a.store.city.localeCompare(b.store.city) || a.store.name.localeCompare(b.store.name) || a.store.address.localeCompare(b.store.address) || a.store.id.localeCompare(b.store.id)).map(entry => entry.store);
}
