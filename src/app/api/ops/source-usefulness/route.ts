import { NextResponse } from 'next/server';
import { authorizeOpsBearer, getDedicatedScorecardReadSecret } from '@/lib/ops-auth';
import { readRuntimeSourceUsefulness } from '@/lib/source-lane-runtime';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!authorizeOpsBearer(request.headers.get('authorization'), getDedicatedScorecardReadSecret())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await readRuntimeSourceUsefulness(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Source usefulness unavailable' }, { status: 503 }); }
}
