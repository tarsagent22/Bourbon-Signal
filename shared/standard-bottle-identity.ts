import registry from './labeled-bottle-artwork-registry.json' with { type: 'json' };
import library from '../apps/mobile/src/cellar/bottle-catalog-seed.json' with { type: 'json' };
import { cleanRetailerBottleName, createStandardBottleIndex, retailerBottleIdentityKey } from './retailer-bottle-name.mjs';

const illustratedIds = new Set(registry.entries.map(row => row.catalogId));
const entries = [...registry.entries, ...library.filter(row => !illustratedIds.has(row.id))
  .map(row => ({catalogId:row.id, displayName:row.name, exactNames:[row.name]}))];
const index = createStandardBottleIndex(entries);
const knownIds = new Set(entries.map(row => row.catalogId));

// Reviewed expression names only: search nicknames and token containment cannot
// distinguish editions reliably. Unknown engine IDs may resolve by exact name.
export function standardBottleIdentity(name: string, id?: string): { id: string; name: string } | undefined {
  const row = index.get(retailerBottleIdentityKey(name));
  const catalogId = id?.replace(/^bible-/, '');
  if (!row || (catalogId && knownIds.has(catalogId) && catalogId !== row.catalogId)) return undefined;
  return { id: row.catalogId, name: row.displayName };
}

export function standardBottleName(name: string): string {
  return standardBottleIdentity(name)?.name || cleanRetailerBottleName(name);
}
