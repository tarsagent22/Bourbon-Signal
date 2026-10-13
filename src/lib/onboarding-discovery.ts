import type { OnboardingDraft } from '../../shared/mobile-onboarding.ts';
export const STARTER_BOTTLE_IDS = ['makers-mark', 'woodford-reserve', 'woodford-double-oaked', 'knob-creek-9', 'wild-turkey-101', 'wild-turkey-rare-breed', 'four-roses-single-barrel', 'old-forester-100', 'old-forester-1910', 'elijah-craig-small-batch', '1792-small-batch', 'redwood-empire-pipe-dream'];
export interface StarterCandidate { id: string; name: string; proof?: number; msrp?: number | null; tags: string[]; family?: string; brand?: string }
const flavorTags: Record<string, string[]> = { 'Caramel': ['Caramel', 'Sweet', 'Dessert'], 'Vanilla': ['Vanilla'], 'Fruit': ['Cherry', 'Dark fruit', 'Grape'], 'Oak': ['Oak', 'Leather'], 'Spice': ['Spice'], 'Honey': ['Honey'], 'Sweet & caramel': ['Sweet', 'Caramel', 'Honey', 'Dessert'], 'Fruit & vanilla': ['Cherry', 'Dark fruit', 'Vanilla', 'Grape'], 'Oak & spice': ['Oak', 'Spice', 'Leather'] };
export function starterSuggestions(candidates: StarterCandidate[], draft: OnboardingDraft) {
  const desired = draft.flavors.flatMap(flavor => flavorTags[flavor] || []);
  const liked = candidates.find(bottle => bottle.id === draft.likedBottleId);
  const ranked = candidates.filter(bottle => STARTER_BOTTLE_IDS.includes(bottle.id) && bottle.id !== liked?.id)
    .filter(bottle => draft.proof === 'any' || (typeof bottle.proof === 'number' && (draft.proof === 'gentle' ? bottle.proof < 100 : bottle.proof >= 100)))
    .filter(bottle => draft.budget === 'No preference' || (typeof bottle.msrp === 'number' && bottle.msrp > 0 && (draft.budget === 'Under $40' ? bottle.msrp < 40 : bottle.msrp >= 40 && bottle.msrp <= 70)))
    .map(bottle => {
      const matched = bottle.tags.filter(tag => desired.includes(tag));
      const shared = liked ? bottle.tags.filter(tag => liked.tags.includes(tag)) : [];
      const score = matched.length * 3 + shared.length + (liked?.family && liked.family === bottle.family ? 2 : 0);
      const cues = [...new Set([...(matched.length ? matched : shared), ...bottle.tags])];
      const reason = cues.length ? `Notes of ${cues.slice(0, 3).map(tag => tag.toLowerCase()).join(', ')}.` : 'A classic bourbon to explore.';
      return { ...bottle, reason, score };
    }).sort((a, b) => b.score - a.score || STARTER_BOTTLE_IDS.indexOf(a.id) - STARTER_BOTTLE_IDS.indexOf(b.id));
  const picks: typeof ranked = [];
  while (picks.length < 3 && ranked.length) {
    const best = ranked.reduce((chosen, bottle) => {
      const value = (item: typeof bottle) => item.score - (item.brand && picks.some(pick => pick.brand === item.brand) ? 6 : 0);
      return value(bottle) > value(chosen) ? bottle : chosen;
    });
    picks.push(best); ranked.splice(ranked.indexOf(best), 1);
  }
  return picks;
}
