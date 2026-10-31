import registry from '../../../shared/labeled-bottle-artwork-registry.json' with { type: 'json' };
import redirects from '../../../shared/standard-bottle-identity-redirects.json' with { type: 'json' };
import { cleanRetailerBottleName, createStandardBottleIndex, retailerBottleIdentityKey } from '../../../shared/retailer-bottle-name.mjs';

const index = createStandardBottleIndex(registry.entries, redirects);
export function standardInventoryBottleIdentity(name) {
  const row = index.get(retailerBottleIdentityKey(name));
  return row ? { id: row.catalogId, name: row.displayName } : null;
}
export function standardInventoryBottleName(name) {
  return index.get(retailerBottleIdentityKey(name))?.displayName || cleanRetailerBottleName(name);
}
