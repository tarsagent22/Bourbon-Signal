import { NextRequest, NextResponse } from "next/server";
import { readCurrentCoverageContract, searchCurrentCoverageTargets } from "@/lib/coverage-server";

const PUBLIC_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

export async function GET() {
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
