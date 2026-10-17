import discovery from '../../../../shared/library-discovery-bottles.json';
import type { RadarBottleOption } from '../api/types';

const snapshots = new WeakMap<RadarBottleOption[], RadarBottleOption[]>();
/** Retain reviewed bundled additions while an installed app reaches an older API. */
export function withBundledDiscovery(catalog: RadarBottleOption[]): RadarBottleOption[] {
  const hit = snapshots.get(catalog);
  if (hit) return hit;
  const ids = new Set(catalog.map(b => b.id));
  const names = new Set(catalog.map(b => b.name.toLowerCase()));
  const additions = discovery.filter(b => !ids.has(b.id) && !names.has(b.name.toLowerCase()))
    .map(({ id, name, brand }) => ({ id, name, brand, rarityPending: true }));
  const merged = additions.length ? [...catalog, ...additions].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) : catalog;
  snapshots.set(catalog, merged);
  return merged;
}
