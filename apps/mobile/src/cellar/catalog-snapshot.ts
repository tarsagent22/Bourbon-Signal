import discovery from '../../../../shared/library-discovery-bottles.json';
import seed from './bottle-catalog-seed.json';
import type { RadarBottleOption } from '../api/types';

const snapshots = new WeakMap<RadarBottleOption[], RadarBottleOption[]>();
/** A partial/older API must not remove expressions already available offline. */
export function withBundledDiscovery(catalog: RadarBottleOption[]): RadarBottleOption[] {
  const hit = snapshots.get(catalog);
  if (hit) return hit;
  const ids = new Set(catalog.map(b => b.id));
  const names = new Set(catalog.map(b => b.name.toLowerCase()));
  const additions = [...seed, ...discovery].filter(b => {
    if (ids.has(b.id) || names.has(b.name.toLowerCase())) return false;
    ids.add(b.id); names.add(b.name.toLowerCase()); return true;
  }).map(b => ({ ...b, rarityPending: true }));
  const merged = additions.length ? [...catalog, ...additions].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : catalog;
  snapshots.set(catalog, merged);
  return merged;
}
