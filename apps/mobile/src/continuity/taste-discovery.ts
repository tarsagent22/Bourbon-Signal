import { ONBOARDING_BOTTLES } from '../../../../shared/onboarding-bottles';
import type { OnboardingDraft } from '../../../../shared/mobile-onboarding';
import type { MemberPreferences, RadarBottleOption, Signal } from '../api/types';
import { buildBourbonDna } from '../cellar/bourbon-dna';
import { starterSuggestions } from '../../../../shared/starter-suggestions';
import { collectionBottleForIdentity } from '../signals/bottle-profile';

export function personalTasteNote(identity: Pick<Signal['bottle'], 'id' | 'name'>, preferences: MemberPreferences | null) {
  const saved = preferences && collectionBottleForIdentity(identity, preferences.collectionPreferences.bottles);
  if (!saved) return '';
  return [saved.isRated && Number.isFinite(saved.rating) ? `You rated this ${(saved.rating / 10).toFixed(1)}/10` : '',
    saved.wouldBuyAgain ? 'You’d buy again' : ''].filter(Boolean).join(' · ');
}

export interface TastePick { bottle: RadarBottleOption; reason: string; source: 'saved' | 'ratings' | 'preferences' }
export function tasteDiscovery(catalog: RadarBottleOption[], preferences: MemberPreferences, draft?: OnboardingDraft | null): TastePick[] {
  const saved = (draft?.savedBottleIds || []).flatMap(id => {
    const bottle = catalog.find(row => row.id === id);
    return bottle ? [{ bottle, reason: 'Saved during setup', source: 'saved' as const }] : [];
  });
  if (!preferences.entitlements?.canUseRecommendations) return saved.slice(0, 3);
  const traits = buildBourbonDna(preferences.collectionPreferences.bottles).supportedTraits;
  if (!traits.length) {
    if (!draft || (!draft.flavors.length && !draft.likedBottleId)) return saved.slice(0, 3);
    const suggestions = starterSuggestions(catalog.map(bottle => ({ ...bottle, tags: ONBOARDING_BOTTLES[bottle.id]?.notes || [] })), { ...draft, budget: 'No preference' });
    return [...saved, ...suggestions.filter(bottle => !saved.some(pick => pick.bottle.id === bottle.id) && !collectionBottleForIdentity(bottle, preferences.collectionPreferences.bottles)).flatMap(bottle => {
      const option = catalog.find(row => row.id === bottle.id); return option ? [{ bottle: option, reason: bottle.reason, source: 'preferences' as const }] : [];
    })].slice(0, 3);
  }
  const picks = catalog.flatMap(bottle => {
    const notes = ONBOARDING_BOTTLES[bottle.id]?.notes;
    if (!notes || saved.some(row => row.bottle.id === bottle.id) || collectionBottleForIdentity(bottle, preferences.collectionPreferences.bottles)) return [];
    const matched = traits.filter(trait => notes.some(note => note.toLowerCase() === trait.name.toLowerCase()));
    if (!matched.length) return [];
    return [{ bottle, reason: `${matched.slice(0, 2).map(trait => trait.name).join(' and ')} cues recur in your favorite ratings.`,
      source: 'ratings' as const, score: matched.reduce((sum, trait) => sum + trait.ratingCount, 0) }];
  }).sort((a, b) => b.score - a.score || a.bottle.name.localeCompare(b.bottle.name));
  return [...saved, ...picks].slice(0, 3);
}
