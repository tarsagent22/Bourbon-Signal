import type { BibleBottle } from './bourbonBible';
import { getPublicScarcityLabel, resolveBottleScarcity } from './bottle-scarcity.ts';
import { BOTTLE_SCARCITY_SOURCE_REGISTRY } from '../data/bottle-scarcity-overrides.ts';
import { COVERAGE_STATES } from '../../shared/coverage-states.ts';
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from './signals/signal-api-route.ts';
import type { BottleProfile } from '../../shared/bottle-profile';

export function createBottleProfileHandler({ authenticate, readBottle }: {
  authenticate: () => Promise<string | null>; readBottle: (id: string) => Promise<BibleBottle | null>;
}) {
  return async function getProfile(id: string, state = '') {
    try {
      if (!await authenticate()) return signalApiError(401, 'UNAUTHORIZED', 'Sign in to view this bottle.');
      if (state && !COVERAGE_STATES.some(entry => entry.code === state)) return signalApiError(400, 'INVALID_REQUEST', 'Choose a supported reference state.');
      if (!id || id.length > 160) return signalApiError(400, 'INVALID_REQUEST', 'Choose a bottle from the catalog.');
      const bottle = await readBottle(id);
      if (!bottle) return signalApiError(404, 'BOTTLE_NOT_FOUND', 'This bottle is not in the catalog yet.');
      const positive = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
      const resolved = state ? resolveBottleScarcity(bottle, state) : null;
      const override = resolved?.override;
      const profile: BottleProfile = {
        id: bottle.id, name: bottle.canonicalName, producer: bottle.producer || bottle.brand || null,
        category: bottle.category.replace(/_/g, ' '), proof: positive(bottle.proof), age: bottle.ageStatement || null, msrp: positive(bottle.msrp),
        rarity: { label: getPublicScarcityLabel(bottle), tier: bottle.nationalTier,
          pending: bottle.rarityPending === true || bottle.nationalConfidence === 'low', reviewedAt: bottle.scarcityLastReviewedAt },
        marketRarity: override ? { state, tier: override.tier, label: resolved!.marketLabel, reason: override.reason, reviewedAt: override.lastReviewedAt,
          sources: override.sourceIds.flatMap(id => { const source = BOTTLE_SCARCITY_SOURCE_REGISTRY[id as keyof typeof BOTTLE_SCARCITY_SOURCE_REGISTRY]; return source ? [{ label: source.label, url: source.url }] : []; }) } : null,
      };
      return Response.json({ bottle: profile }, { headers: PRIVATE_SIGNAL_API_HEADERS });
    } catch { return signalApiError(503, 'UPSTREAM_UNAVAILABLE', 'Bottle details couldn’t load. Please retry.', true); }
  };
}
