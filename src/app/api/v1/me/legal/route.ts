import { auth, clerkClient } from '@clerk/nextjs/server';
import { COMMUNITY_TERMS_VERSION, validLegalAgreement } from '../../../../../../shared/legal-acceptance';
import { readLegalAcceptance, saveLegalAcceptance } from '@/lib/legal-acceptance';
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from '@/lib/signals/signal-api-route';

export const dynamic = 'force-dynamic';

async function handle(request?: Request) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  if (request && !validLegalAgreement(await request.json().catch(() => null))) {
    return signalApiError(400, 'INVALID_REQUEST', 'Accept the current Terms of Use to continue.');
  }
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const save = client.users.updateUserMetadata.bind(client.users);
    const acceptance = request ? await saveLegalAcceptance(user, save, 'community') : await readLegalAcceptance(user, save);
    return Response.json({ termsVersion: COMMUNITY_TERMS_VERSION, acceptance }, { headers: PRIVATE_SIGNAL_API_HEADERS });
  } catch {
    return signalApiError(503, 'UPSTREAM_UNAVAILABLE', 'Your agreement could not be saved or checked. Try again.', true);
  }
}

export async function GET() { return handle(); }
export async function POST(request: Request) { return handle(request); }
