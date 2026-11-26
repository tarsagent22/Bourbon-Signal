import { auth, clerkClient } from '@clerk/nextjs/server';
import { getBottleById } from '@/lib/bourbonBible';
import { withMemberAlertLease } from '@/lib/alert-queue/member-lease';
import { loadSavedHunt, saveHunt } from '@/lib/mobile-saved-hunt';
import { discoveryRegion } from '../../../../../../shared/local-discovery';

const headers = { 'Cache-Control': 'private, no-store' };
function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return error('Sign in to see your saved bottle.', 401);
  try {
    return Response.json({ saved: (await loadSavedHunt(userId)).saved }, { headers });
  } catch { return error('Your saved bottle could not load.', 503); }
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return error('Sign in to save a bottle.', 401);
  const input = await request.json().catch(() => null);
  const removing = input?.remove === true;
  const region = discoveryRegion(input?.state, input?.city);
  const bottleId = typeof input?.bottleId === 'string' && /^[a-zA-Z0-9._:-]{1,180}$/.test(input.bottleId) ? input.bottleId : '';
  if (!removing && (!region || !bottleId)) return error('Choose a bottle and shopping area.', 400);
  try {
    const client = await clerkClient();
    const bottle = removing ? null : await getBottleById(bottleId);
    if (!removing && !bottle) return error('That bottle is unavailable in the catalog.', 404);
    const leased = await withMemberAlertLease(userId, async assertHeld => {
      await client.users.getUser(userId);
      const saved = bottle && region ? {
        ...region, bottleId: bottle.id, bottle: bottle.canonicalName.slice(0, 150),
        savedAt: new Date().toISOString(),
      } : null;
      await assertHeld();
      return saveHunt(userId, saved);
    }, { requireDurable: true });
    if (leased.acquired) return Response.json({ saved: leased.result }, { headers });
  } catch { /* Retry without exposing account or storage details. */ }
  return error('Your saved bottle could not update. Try again.', 503);
}
