import { readFileSync } from 'node:fs';
import { cleanRetailerBottleName, createStandardBottleIndex, retailerBottleIdentityKey } from '../../../shared/retailer-bottle-name.mjs';

const registry = JSON.parse(readFileSync(new URL('../../../shared/labeled-bottle-artwork-registry.json', import.meta.url), 'utf8'));
const index = createStandardBottleIndex(registry.entries);
export function standardInventoryBottleIdentity(name) {
  const row = index.get(retailerBottleIdentityKey(name));
  return row ? { id: row.catalogId, name: row.displayName } : null;
}
export function standardInventoryBottleName(name) {
  return index.get(retailerBottleIdentityKey(name))?.displayName || cleanRetailerBottleName(name);
}
