import stores from './sighting-preview-stores.json';

// Static onboarding illustrations only. These never enter feeds or trigger alerts.
// Store sources establish identity and location, not bottle availability.
export function sightingPreviewForState(state: string) {
  const code = state.trim().toUpperCase();
  const key = Object.hasOwn(stores, code) ? code as keyof typeof stores : 'NC';
  return { ...stores[key], state: key, bottleId: 'eagle-rare-12', bottleName: 'Eagle Rare 12 Year' };
}
