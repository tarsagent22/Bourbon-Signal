import type { MemberCollectionBottle } from '../api/types';
import { collectionDisplayKind } from '../interactions/member-interactions';

export const SHELF_STYLES = [
  { id: 'amber', label: 'Amber Wood', wood: '#72502d', edge: '#af7b40', back: '#30241a', dark: '#160f09' },
  { id: 'walnut', label: 'Dark Walnut', wood: '#3d2b24', edge: '#805b42', back: '#231b17', dark: '#0e0b09' },
  { id: 'black', label: 'Black Modern', wood: '#292b2b', edge: '#555953', back: '#1d2020', dark: '#0a0c0c' },
] as const;
export type ShelfStyle = typeof SHELF_STYLES[number]['id'];
export function shelfBottleKey(bottle: Pick<MemberCollectionBottle, 'bottleId' | 'canonicalKey' | 'bottleName'>) {
  return bottle.bottleId || `${bottle.canonicalKey}\n${bottle.bottleName}`;
}
export function rankedShelfBottles(bottles: readonly MemberCollectionBottle[]) {
  const seen = new Set<string>();
  return bottles.map((bottle, index) => ({ bottle, index }))
    .filter(({ bottle }) => collectionDisplayKind(bottle) === 'owned' && bottle.isRated === true && Number.isFinite(bottle.rating) && bottle.rating >= 0 && bottle.rating <= 100)
    .sort((a, b) => b.bottle.rating - a.bottle.rating || a.index - b.index)
    .filter(({ bottle }) => {
      // Canonical keys can lose edition/age (both 1792 editions have key "1792").
      const identity = shelfBottleKey(bottle);
      if (seen.has(identity)) return false;
      seen.add(identity); return true;
    }).slice(0, 20).map(({ bottle }) => bottle);
}
export function cabinetRows<T>(items: readonly T[]): T[][] {
  const bounded = items.slice(0, 20);
  if (!bounded.length) return [];
  if (bounded.length <= 10) return [bounded];
  const half = Math.ceil(bounded.length / 2);
  return [bounded.slice(0, half), bounded.slice(half)];
}
export type ShowcaseMode = 'rated' | 'recent' | 'again';
export function showcaseBottles(bottles: readonly MemberCollectionBottle[], mode: ShowcaseMode) {
  if (mode === 'rated') return rankedShelfBottles(bottles).slice(0, 3);
  const seen = new Set<string>();
  const addedTime = (bottle: MemberCollectionBottle) => {
    const time = Date.parse(bottle.addedAt);
    return Number.isFinite(time) ? time : 0;
  };
  return bottles.map((bottle, index) => ({ bottle, index }))
    .filter(({ bottle }) => collectionDisplayKind(bottle) === 'owned' && (mode !== 'again' || bottle.wouldBuyAgain === true))
    .sort((a, b) => addedTime(b.bottle) - addedTime(a.bottle) || a.index - b.index)
    .filter(({ bottle }) => {
      const key = shelfBottleKey(bottle);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 3).map(({ bottle }) => bottle);
}
export function shelfGridLayout(width: number, mode: 'grid' | 'list', fontScale = 1) {
  const columns = mode === 'list' ? 1 : width < 350 || fontScale > 1.15 ? 2 : 3;
  return { columns, tileWidth: (width - 20 - (columns - 1) * 8) / columns };
}
