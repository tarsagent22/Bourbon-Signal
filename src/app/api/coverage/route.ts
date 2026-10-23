import { NextRequest, NextResponse } from "next/server";
import { readCurrentCoverageContract, searchCurrentCoverageTargets, readCoveragePilotReceipt } from "@/lib/coverage-server";
import { authorizePilotReceipt, PILOT_RECEIPT_HEADER } from '@/lib/nationwide-pilot-receipt';

// Current source failures, disablement and expiry must be evaluated on each
// request, just as they are for the normal Drop Feed.
const PUBLIC_CACHE = "private, no-store";

export async function GET(request:Request) {
  if(request) {
    const url=new URL(request.url);const header=request.headers.get(PILOT_RECEIPT_HEADER);
    if(header || url.searchParams.has('source_receipt')) {
      if(!authorizePilotReceipt(url,header,process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || '')) return NextResponse.json({error:'Unauthorized engine verification.'},{status:401,headers:{'Cache-Control':'private, no-store'}});
      return NextResponse.json(await readCoveragePilotReceipt(url.searchParams.get('source_receipt') || ''),{headers:{'Cache-Control':'private, no-store',Vary:'X-Bourbon-Signal-Pilot-Verification'}});
    }
  }
  const contract = await readCurrentCoverageContract();
  return NextResponse.json(contract, {
    headers: { "Cache-Control": PUBLIC_CACHE },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { state?: unknown; query?: unknown } | null;
  const state = typeof body?.state === "string" ? body.state.trim().toUpperCase() : "";
  const query = typeof body?.query === "string" ? body.query.replace(/\s+/g, " ").trim() : "";
  if (!/^[A-Z]{2}$/.test(state) || !query || query.length > 120) {
    return NextResponse.json({ error: "Choose a valid state and enter a city or store." }, { status: 400 });
  }
  const results = await searchCurrentCoverageTargets(state, query);
  return NextResponse.json(
    { contractVersion: "bourbon-signal/coverage-search@1", state, results },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
