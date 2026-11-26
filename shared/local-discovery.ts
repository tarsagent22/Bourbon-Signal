import { COVERAGE_STATES } from './coverage-states';

export type DiscoveryRegion = { state: string; city: string };
export type LocalReport = {
  bottle: string;
  bottleId: string | null;
  location: string;
  source: string;
  kind: 'inventory' | 'shipment' | 'release';
  reportedAt: string;
  price: number | null;
  alertsAvailable: boolean;
};
export type LocalDiscovery = { region: DiscoveryRegion; report: LocalReport | null };
export type SavedBottle = DiscoveryRegion & { bottleId: string; bottle: string; savedAt: string };

export function readSavedBottle(input: unknown): SavedBottle | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  const region = discoveryRegion(row.state, row.city);
  if (!region || typeof row.bottleId !== 'string' || !/^[a-zA-Z0-9._:-]{1,180}$/.test(row.bottleId)
    || typeof row.bottle !== 'string' || !row.bottle.trim() || row.bottle.length > 150
    || typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt))) return null;
  return { ...region, bottleId: row.bottleId, bottle: row.bottle, savedAt: row.savedAt };
}

export function discoveryRegion(state: unknown, city: unknown = ''): DiscoveryRegion | null {
  const code = typeof state === 'string' ? state.trim().toUpperCase() : '';
  if (!COVERAGE_STATES.some(entry => entry.code === code)) return null;
  const area = typeof city === 'string' ? city.trim().replace(/\s+/g, ' ') : '';
  if (area.length > 72 || (area && !/^[\p{L}\p{M}0-9 .’'-]+$/u.test(area))) return null;
  return { state: code, city: area };
}

export function discoveryStateName(state: string) {
  return COVERAGE_STATES.find(entry => entry.code === state)?.name || state;
}
