import { auth, clerkClient } from '@clerk/nextjs/server';
import { createMobileActivityHandler } from '@/lib/mobile-activity';

const recordActivity = createMobileActivityHandler({
  read: async userId => (await (await clerkClient()).users.getUser(userId)).privateMetadata.mobileActivity,
  // Update only the owned platform key; never replay membership or other metadata.
  save: async (userId, platform, record) => (await clerkClient()).users.updateUserMetadata(userId, {
    privateMetadata: { mobileActivity: { [platform]: record } },
  }),
});

export async function POST(request: Request) {
  const { userId } = await auth();
  return recordActivity(request, userId);
}
