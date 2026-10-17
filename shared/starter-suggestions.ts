import { ONBOARDING_BOTTLES } from './onboarding-bottles';
import type { OnboardingDraft } from './mobile-onboarding';
export const STARTER_BOTTLE_IDS = ['makers-mark', 'woodford-reserve', 'woodford-double-oaked', 'knob-creek-9', 'wild-turkey-101', 'wild-turkey-rare-breed', 'four-roses-single-barrel', 'old-forester-100', 'old-forester-1910', 'elijah-craig-small-batch', '1792-small-batch', 'redwood-empire-pipe-dream'];
export interface StarterCandidate { id: string; name: string; proof?: number; msrp?: number | null; tags: string[]; family?: string; brand?: string; tagWeights?: Partial<Record<string, number>> }
const flavorTags: Record<string, string[]> = { 'Caramel': ['Caramel', 'Sweet', 'Dessert'], 'Vanilla': ['Vanilla'], 'Fruit': ['Fruit', 'Cherry', 'Dark fruit', 'Grape', 'Apple', 'Citrus'], 'Oak': ['Oak', 'Leather'], 'Spice': ['Spice'], 'Honey': ['Honey'], 'Sweet & caramel': ['Sweet', 'Caramel', 'Honey', 'Dessert'], 'Fruit & vanilla': ['Cherry', 'Dark fruit', 'Vanilla', 'Grape'], 'Oak & spice': ['Oak', 'Spice', 'Leather'] };
const NOTE_TAGS = new Set(['Fruit', 'Vanilla', 'Caramel', 'Honey', 'Oak', 'Spice', 'Cherry', 'Dark fruit', 'Grape', 'Citrus', 'Apple', 'Chocolate', 'Cocoa', 'Nutty', 'Peanut', 'Toffee', 'Tobacco', 'Leather', 'Smoke']);
export function starterSuggestions(candidates: StarterCandidate[], draft: OnboardingDraft) {
  candidates = candidates.map(bottle => { const curated = ONBOARDING_BOTTLES[bottle.id]; return curated ? { ...bottle, tags: curated.notes, tagWeights: bottle.tagWeights } : bottle; });
  const desired = draft.flavors.flatMap(flavor => flavorTags[flavor] || []);
  const liked = candidates.find(bottle => bottle.id === draft.likedBottleId);
  const ranked = candidates.filter(bottle => STARTER_BOTTLE_IDS.includes(bottle.id) && bottle.id !== liked?.id)
    .filter(bottle => draft.proof === 'any' || (typeof bottle.proof === 'number' && (draft.proof === 'gentle' ? bottle.proof < 100 : bottle.proof >= 100)))
    .filter(bottle => draft.budget === 'No preference' || (typeof bottle.msrp === 'number' && bottle.msrp > 0 && (draft.budget === 'Under $40' ? bottle.msrp < 40 : bottle.msrp >= 40 && bottle.msrp <= 70)))
    .map(bottle => {
      const matched = bottle.tags.filter(tag => desired.includes(tag));
      const shared = liked ? bottle.tags.filter(tag => liked.tags.includes(tag)) : [];
      const weight = (tag: string) => Math.max(0, Math.min(1, bottle.tagWeights?.[tag] ?? 1));
      const score = matched.reduce((sum, tag) => sum + weight(tag) * 10, 0) + shared.reduce((sum, tag) => sum + Math.min(weight(tag), liked?.tagWeights?.[tag] ?? 1) * 4, 0) + (liked?.family && liked.family === bottle.family ? 2 : 0);
      const preferred = (matched.length ? matched : shared).filter(tag => NOTE_TAGS.has(tag)).sort((a, b) => weight(b) - weight(a));
      const supporting = bottle.tags.filter(tag => NOTE_TAGS.has(tag)).sort((a, b) => weight(b) - weight(a));
      const cues = [...new Set([...preferred, ...supporting])];
      const list = (items: string[]) => items.length < 2 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
      const selectedFlavors = draft.flavors.filter(flavor => (flavorTags[flavor] || []).some(tag => bottle.tags.includes(tag))).map(flavor => flavor.toLowerCase());
      const reason = selectedFlavors.length ? `For the ${list(selectedFlavors)} flavors you chose.`
        : liked && shared.some(tag => NOTE_TAGS.has(tag)) ? `Shares ${list(shared.filter(tag => NOTE_TAGS.has(tag)).slice(0, 2).map(tag => tag.toLowerCase()))} notes with ${liked.name}.`
        : draft.flavors.length || liked ? 'A different style to compare.' : '';
      const curated = ONBOARDING_BOTTLES[bottle.id];
      const notes = cues.slice(0, 3);
      const description = curated?.description || (notes.length ? `${list(notes)}.` : '');
      return { ...bottle, reason, description, notes, score };
    }).sort((a, b) => b.score - a.score || STARTER_BOTTLE_IDS.indexOf(a.id) - STARTER_BOTTLE_IDS.indexOf(b.id));
  const picks: typeof ranked = [];
  while (picks.length < 3 && ranked.length) {
    const best = ranked.reduce((chosen, bottle) => {
      const value = (item: typeof bottle) => item.score - (item.brand && picks.some(pick => pick.brand === item.brand) ? 12 : 0);
      return value(bottle) > value(chosen) ? bottle : chosen;
    });
    picks.push(best); ranked.splice(ranked.indexOf(best), 1);
  }
  return picks;
}
