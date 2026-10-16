import { auth, clerkClient } from '@clerk/nextjs/server';
import { getServerEntitlements } from '@/lib/server-entitlements';
import { getMemberCollectionRepository } from '@/lib/member-collection-repository';
import { getCollectionHistoryRepository } from '@/lib/collection-history-repository';
import { reviewedCollectionValue } from '@/lib/collection-price-repository';
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from '@/lib/signals/signal-api-route';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, 'UNAUTHORIZED', 'Sign in to view collection history.');
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    const entitlements = await getServerEntitlements(user.publicMetadata);
    if (!entitlements.canUseRecommendations) return signalApiError(403, 'FORBIDDEN', 'Collection value history is included with Barrel Proof.');
    const collection = await getMemberCollectionRepository().getForUser(userId);
    const value = await reviewedCollectionValue(true, collection.bottles);
    if (!value) return signalApiError(503, 'UPSTREAM_UNAVAILABLE', 'Pricing is temporarily unavailable. Pull to refresh My Shelf.', true);
    const history = getCollectionHistoryRepository();
    if (!await history.observe(userId, collection.version, value)) return signalApiError(409, 'IDEMPOTENCY_CONFLICT', 'Your shelf changed while prices were loading. Refresh My Shelf to see the latest value.', true);
    return Response.json({ collectionVersion: collection.version, value, history: await history.list(userId) }, { headers: PRIVATE_SIGNAL_API_HEADERS });
  } catch { return signalApiError(503, 'UPSTREAM_UNAVAILABLE', 'Value history couldn’t load. Your shelf is still available.', true); }
}
