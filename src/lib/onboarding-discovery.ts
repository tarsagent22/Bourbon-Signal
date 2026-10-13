import type { OnboardingDraft } from '../../shared/mobile-onboarding.ts';
export const STARTER_BOTTLE_IDS = ['makers-mark', 'woodford-reserve', 'woodford-double-oaked', 'knob-creek-9', 'wild-turkey-101', 'wild-turkey-rare-breed', 'four-roses-single-barrel', 'old-forester-100', 'old-forester-1910', 'elijah-craig-small-batch', '1792-small-batch', 'redwood-empire-pipe-dream'];
export interface StarterCandidate { id: string; name: string; proof?: number; msrp?: number | null; tags: string[]; family?: string }
const flavorTags: Record<string, string[]> = { 'Sweet & caramel': ['Sweet', 'Caramel', 'Honey', 'Dessert'], 'Fruit & vanilla': ['Cherry', 'Dark fruit', 'Vanilla', 'Grape'], 'Oak & spice': ['Oak', 'Spice', 'Leather'] };
export function starterSuggestions(candidates: StarterCandidate[], draft: OnboardingDraft) {
  const desired = draft.flavors.flatMap(flavor => flavorTags[flavor] || []);
  const liked = candidates.find(bottle => bottle.id === draft.likedBottleId);
  return candidates.filter(bottle => STARTER_BOTTLE_IDS.includes(bottle.id) && bottle.id !== liked?.id)
    .filter(bottle => draft.proof === 'any' || (typeof bottle.proof === 'number' && (draft.proof === 'gentle' ? bottle.proof < 100 : bottle.proof >= 100)))
    .filter(bottle => draft.budget === 'No preference' || (typeof bottle.msrp === 'number' && bottle.msrp > 0 && (draft.budget === 'Under $40' ? bottle.msrp < 40 : bottle.msrp >= 40 && bottle.msrp <= 70)))
    .map(bottle => {
      const matched = bottle.tags.filter(tag => desired.includes(tag));
      const shared = liked ? bottle.tags.filter(tag => liked.tags.includes(tag)) : [];
      const score = matched.length * 3 + shared.length + (liked?.family && liked.family === bottle.family ? 2 : 0);
      const cues = matched.length ? matched : shared;
      const reason = cues.length ? `A starting suggestion for ${cues.slice(0, 2).map(tag => tag.toLowerCase()).join(' and ')} flavors.` : 'An approachable shelf bourbon to explore.';
      return { ...bottle, reason, score };
    }).sort((a, b) => b.score - a.score || STARTER_BOTTLE_IDS.indexOf(a.id) - STARTER_BOTTLE_IDS.indexOf(b.id)).slice(0, 3);
}
