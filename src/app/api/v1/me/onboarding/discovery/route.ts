import { auth, clerkClient } from '@clerk/nextjs/server';
import { normalizeOnboardingDraft } from '../../../../../../../shared/mobile-onboarding';
import { getBourbonBible } from '@/lib/bourbonBible';
import { lookupBourbonKnowledge } from '@/lib/bourbon-dna-library';
import { STARTER_BOTTLE_IDS, starterSuggestions } from '@/lib/onboarding-discovery';
import { readSiteExportResults, normalizeDropForSite } from '@/lib/site-engine-contract';
import { isPublicDropFeedEligible, isFreshPublicDrop } from '@/lib/public-drop-evidence';
import { normalizeDropSignal } from '@/lib/signals/signal-contract';
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from '@/lib/signals/signal-api-route';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { userId } = await auth(); if (!userId) return signalApiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const setup = user.privateMetadata.mobileOnboarding as { draft?: unknown; completedAt?: unknown } | undefined;
    const draft = normalizeOnboardingDraft(setup?.draft);
    if (!draft || !draft.homeState || setup?.completedAt) return signalApiError(403, 'FORBIDDEN', 'Starting suggestions are available during account setup.');
    const bible = await getBourbonBible();
    const candidates = bible.filter(bottle => STARTER_BOTTLE_IDS.includes(bottle.id) || bottle.id === draft.likedBottleId).map(bottle => {
      const knowledge = lookupBourbonKnowledge({ name: bottle.canonicalName, ...bottle });
      return { id: bottle.id, name: bottle.canonicalName, proof: bottle.proof, msrp: bottle.msrp,
        tags: Object.keys(knowledge?.tags || {}), family: knowledge?.family };
    });
    const suggestions = starterSuggestions(candidates, draft);
    let signals: ReturnType<typeof normalizeDropSignal>[] = []; let signalsUnavailable = false;
    try {
      const [snapshot] = await readSiteExportResults(['drops']);
      if (!snapshot.payload || snapshot.source === 'empty-fallback') throw new Error('Signals unavailable');
      const raw = Array.isArray(snapshot.payload.drops) ? snapshot.payload.drops : [];
      const names = new Set(suggestions.map(bottle => bottle.name.toLowerCase()));
      signals = raw.map(drop => normalizeDropForSite(drop as Record<string, unknown>))
        .filter(drop => isPublicDropFeedEligible(drop) && isFreshPublicDrop(drop))
        .map(drop => normalizeDropSignal(drop as unknown as Record<string, unknown>))
        .filter(signal => signal.location.state === draft.homeState && names.has(signal.bottle.name.toLowerCase()))
        .sort((a, b) => Date.parse(b.timing.displayAt) - Date.parse(a.timing.displayAt)).slice(0, 3);
    } catch { signalsUnavailable = true; }
    return Response.json({ suggestions, signals, signalsUnavailable }, { headers: PRIVATE_SIGNAL_API_HEADERS });
  } catch { return signalApiError(503, 'UPSTREAM_UNAVAILABLE', 'Starting suggestions could not load. Try again.', true); }
}
