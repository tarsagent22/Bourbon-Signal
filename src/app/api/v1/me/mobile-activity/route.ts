import { auth, clerkClient } from '@clerk/nextjs/server';
import { createMobileActivityHandler } from '@/lib/mobile-activity';
import { MobileActivityRepository } from '@/lib/mobile-activity-repository';
import { withMemberAlertLease } from '@/lib/alert-queue/member-lease';

export async function POST(request: Request) {
  const { userId } = await auth();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!userId) return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers });
  try {
    const leased = await withMemberAlertLease(userId, async assertHeld => {
      await assertHeld();
      // Reject still-unexpired JWTs for a deleted identity. No metadata writes.
      await (await clerkClient()).users.getUser(userId);
      const repository = new MobileActivityRepository();
      return createMobileActivityHandler({
        read: id => repository.read(id),
        save: async (id, _platform, record) => { await assertHeld(); await repository.save(id, record); },
      })(request, userId);
    }, { requireDurable: true });
    if (leased.acquired) return leased.result;
  } catch { /* Retry quietly; account data and provider errors stay private. */ }
  return Response.json({ error: 'Activity could not be saved.' }, { status: 503, headers });
}
