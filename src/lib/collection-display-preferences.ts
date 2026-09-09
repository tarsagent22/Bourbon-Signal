export type ShelfStyle = 'amber' | 'walnut' | 'black';
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function valid(value: unknown): value is ShelfStyle { return value === 'amber' || value === 'walnut' || value === 'black'; }
export function readShelfStyle(value: unknown): ShelfStyle { return record(value) && valid(value.shelfStyle) ? value.shelfStyle : 'amber'; }
// A style-only request must never enter inventory replacement or alert normalization.
// Old clients keep sending bottles/version and cannot erase this separate metadata leaf.
export function collectionDisplayWrite(payload: unknown): { shelfStyle: ShelfStyle } | null {
  if (!record(payload) || !record(payload.collectionPreferences) || !Object.hasOwn(payload.collectionPreferences, 'shelfStyle')) return null;
  const collection = payload.collectionPreferences;
  // Inventory editors round-trip the GET object. Its style is read-only here;
  // the existing versioned inventory path and stored finish remain authoritative.
  if (Array.isArray(collection.bottles) && Number.isInteger(collection.version) && valid(collection.shelfStyle)) return null;
  if (Object.keys(payload).length !== 1 || Object.keys(collection).length !== 1 || !valid(collection.shelfStyle)) throw new Error('Save a valid shelf style separately from other preferences.');
  return { shelfStyle: collection.shelfStyle };
}
