import { auth, clerkClient } from '@clerk/nextjs/server';
import { verifiedPrimaryClerkEmail } from '@/lib/owner-auth';
import { isAdminEmail } from '../../../../../shared/admin-access';
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ allowed: false }, { status: 401 });
  const user = await (await clerkClient()).users.getUser(userId);
  return Response.json({ allowed: isAdminEmail(verifiedPrimaryClerkEmail(user)) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
