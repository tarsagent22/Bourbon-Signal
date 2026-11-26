import { auth, clerkClient } from '@clerk/nextjs/server';
import { withMemberAlertLease } from '@/lib/alert-queue/member-lease';
import { isMobileConversionEnabled, saveMobileConversion } from '@/lib/mobile-conversion-repository';
import { parseMobileConversion } from '../../../../../shared/mobile-conversion';

const headers = { 'Cache-Control': 'private, no-store' };
const guestBuckets = new Map<string, { expiresAt: number; count: number }>();
export function GET(request: Request) {
  const platform = new URL(request.url).searchParams.get('platform');
  return Response.json({ enabled: isMobileConversionEnabled(platform) }, { headers });
}
function guestBudget(request: Request) {
  // This IP is set by the production deployment edge. It is used only for a
  // short-lived in-memory abuse guard and is never stored in analytics.
  const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  for (const [key, bucket] of guestBuckets) if (bucket.expiresAt <= now) guestBuckets.delete(key);
  const bucket = guestBuckets.get(ip);
  if (bucket) return ++bucket.count <= 90;
  if (guestBuckets.size >= 512) return false;
  guestBuckets.set(ip, { expiresAt: now + 60_000, count: 1 });
  return true;
}
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 2_048) return Response.json({ ok: false }, { status: 413, headers });
  const raw = await request.text().catch(() => '');
  if (raw.length > 2_048) return Response.json({ ok: false }, { status: 413, headers });
  const { userId } = await auth();
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return Response.json({ ok: false }, { status: 400, headers }); }
  const event = parseMobileConversion(data, Boolean(userId));
  if (!event) return Response.json({ ok: false }, { status: 400, headers });
  if (!isMobileConversionEnabled(event.platform)) return Response.json({ ok: true }, { headers });
  if (!userId && !guestBudget(request)) return Response.json({ ok: false }, { status: 429, headers });
  try {
    if (userId) {
      const result = await withMemberAlertLease(userId, async assertHeld => {
        await (await clerkClient()).users.getUser(userId);
        await assertHeld();
        await saveMobileConversion(event, userId);
      }, { requireDurable: true });
      if (!result.acquired) return Response.json({ ok: false }, { status: 503, headers });
    } else await saveMobileConversion(event, null);
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ ok: false }, { status: 503, headers }); }
}
